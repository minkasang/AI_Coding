"""Checks for named mating features, exact static clashes, and STEP exchange."""

import math
from itertools import combinations

import numpy as np
from build123d import Location, import_step
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cone, GeomAbs_Cylinder
from OCP.TopLoc import TopLoc_Location
from OCP.gp import gp_Trsf

from model import require

LINEAR_TOL_MM = 1e-5
CLASH_TOL_MM3 = 0.01


def bounds(solid):
    box = solid.bounding_box(optimal=True)
    return [list(box.min), list(box.max)]


def step_read(path):
    require("SI_UNIT(.MILLI.,.METRE.)" in path.read_text(encoding="ascii", errors="replace"),
            f"{path.name}: missing STEP mm unit")
    return import_step(path)


def occ_location(values):
    trsf = gp_Trsf()
    trsf.SetValues(*(number for row in values[:3] for number in row))
    return Location(TopLoc_Location(trsf))


def single_solid(obj, name):
    require(len(obj.solids()) == 1 and obj.is_valid and obj.volume > 0, f"{name}: invalid or multiple STEP solids")


def check_pose_geometry(expected, actual, name):
    require(math.isclose(expected.volume, actual.volume, abs_tol=0.001, rel_tol=1e-7), f"{name}: STEP volume drift")
    require(np.allclose(bounds(expected), bounds(actual), rtol=0, atol=LINEAR_TOL_MM), f"{name}: STEP bounds drift")
    require(np.allclose(tuple(expected.center()), tuple(actual.center()), rtol=0, atol=LINEAR_TOL_MM),
            f"{name}: STEP centroid drift")


def check_step(package, manifest):
    defs = manifest["partDefinitions"]
    locals_by_id = {}
    for part_id, spec in defs.items():
        shape = step_read(package / spec["step"])
        require(shape.label == part_id, f"STEP part label mismatch for {part_id}: {shape.label}")
        single_solid(shape, part_id)
        require(np.allclose(spec["boundsMm"], bounds(shape), rtol=0, atol=LINEAR_TOL_MM)
                and math.isclose(spec["volumeMm3"], shape.volume, abs_tol=0.001, rel_tol=1e-7),
                f"{part_id}: STEP differs from the manifest")
        locals_by_id[part_id] = shape

    assembled = step_read(package / manifest["assets"]["step"])
    require(assembled.label == manifest["root"]["frameId"], f"STEP assembly root label mismatch: {assembled.label}")
    groups = {group.label: group for group in assembled.children}
    require(len(groups) == len(assembled.children) and set(groups) == {
        row["assemblyInstanceId"] for row in manifest["instances"]
    }, "STEP assembly group mismatch")
    occurrences = {}
    for group_id, group in groups.items():
        for child in group.children:
            require(child.label not in occurrences, f"Duplicate STEP instance: {child.label}")
            occurrences[child.label] = (group_id, child)
    require(set(occurrences) == {row["partInstanceId"] for row in manifest["instances"]}, "STEP occurrence identity mismatch")
    for row in manifest["instances"]:
        instance = row["partInstanceId"]
        group_id, actual = occurrences[instance]
        require(row["assemblyInstanceId"] == group_id, f"{instance}: STEP parent mismatch")
        single_solid(actual, instance)
        expected = locals_by_id[row["partId"]].moved(occ_location(row["rootFromPartCad"]))
        check_pose_geometry(expected, actual, instance)
        require(np.allclose(row["rootBoundsMm"], bounds(actual), rtol=0, atol=LINEAR_TOL_MM),
                f"{instance}: STEP assembly differs from the manifest")
    return {"independentParts": len(locals_by_id), "reassembledInstances": len(occurrences), "groups": len(groups)}


def common_volume(left, right):
    common = left & right
    return sum(solid.volume for solid in common.solids()) if common is not None else 0.0


def check_clashes(solids):
    max_overlap = 0.0
    pairs = 0
    for (left_id, left), (right_id, right) in combinations(solids.items(), 2):
        pairs += 1
        overlap = common_volume(left, right)
        require(overlap <= CLASH_TOL_MM3, f"CAD clash {left_id} / {right_id}: {overlap:.6f} mm³")
        max_overlap = max(max_overlap, overlap)
    return {"pairs": pairs, "maxOverlapMm3": max_overlap, "thresholdMm3": CLASH_TOL_MM3}


def check_insertion(posed, p, spindle_direction):
    carrier, outer, inner, hub = (posed[instance] for instance in (
        "PI-20-016-FL", "PI-30-001-FL", "PI-30-002-FL", "PI-30-006-FL"
    ))
    stud_set = [solid for instance, solid in posed.items() if instance.startswith("PI-30-009-FL-")]
    close_faces = [
        ("outerRingShoulder", outer, carrier), ("hubJournalShoulder", hub, inner),
        *((f"studHeadSeat{index}", stud, hub) for index, stud in enumerate(stud_set, 1)),
    ]
    contacts = {}
    for name, left, right in close_faces:
        distance = left.distance_to(right)
        require(distance < LINEAR_TOL_MM, f"CAD stopped-mate faces separated: {name} ({distance:g} mm)")
        contacts[name] = distance
    checks = 0
    width = p["bearing"]["width"]
    stud_length = p["hub"]["flangeThickness"] + p["stud"]["beyondFlange"]
    sequences = [
        ([outer], [carrier], [1, width / 2, width + 2]),
        ([inner], [carrier, outer], [1, width / 2, width + 2]),
        (stud_set, [hub], [-1, -stud_length / 2, -stud_length - 2]),
        ([hub, *stud_set], [carrier, outer, inner], [1, width / 2, width + 2]),
    ]
    maximum = 0.0
    for movers, fixed, offsets in sequences:
        for offset in offsets:
            for moving in movers:
                shifted = moving.moved(Location(tuple(offset * component for component in spindle_direction)))
                for other in fixed:
                    overlap = common_volume(shifted, other)
                    require(overlap <= CLASH_TOL_MM3, f"CAD insertion sample at {offset:g} mm overlaps by {overlap:g} mm³")
                    maximum = max(maximum, overlap)
                    checks += 1
    return {"pairChecks": checks, "maxOverlapMm3": maximum, "seatedMinDistancesMm": contacts}


def cylinder_radius(solid, x, y, diameter):
    for face in solid.faces():
        surface = BRepAdaptor_Surface(face.wrapped)
        if surface.GetType() == GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            origin = cylinder.Location()
            if (abs(cylinder.Axis().Direction().Z()) > 1 - LINEAR_TOL_MM
                    and math.hypot(origin.X() - x, origin.Y() - y) < LINEAR_TOL_MM
                    and abs(2 * cylinder.Radius() - diameter) < LINEAR_TOL_MM):
                return cylinder.Radius()
    raise ValueError(f"CAD fit: expected Ø{diameter:g} machined cylindrical surface at ({x:g}, {y:g})")


def check_radial_fits(parts, p):
    b, h, s, k = (p[name] for name in ("bearing", "hub", "stud", "knuckle"))
    outer = parts["PART-30-001"].solid
    inner = parts["PART-30-002"].solid
    carrier = parts["PART-20-016"].solid
    hub = parts["PART-30-006"]
    stud = parts["PART-30-009"].solid
    gap = {
        "bearingSeat": cylinder_radius(carrier, 0, 0, b["outerOD"] + 2 * k["seatRadialGap"])
        - cylinder_radius(outer, 0, 0, b["outerOD"]),
        "journal": cylinder_radius(inner, 0, 0, b["bore"])
        - cylinder_radius(hub.solid, 0, 0, b["bore"] - 2 * h["journalRadialGap"]),
        "bearingRingSeparation": cylinder_radius(outer, 0, 0, b["outerID"])
        - cylinder_radius(inner, 0, 0, b["innerOD"]),
    }
    stud_radius = cylinder_radius(stud, 0, 0, s["bodyOD"])
    for name, location in hub.mounts.items():
        if name.startswith("studSeat"):
            x, y, _ = location.position
            gap[name] = cylinder_radius(hub.solid, x, y, s["bodyOD"] + 2 * s["radialGap"]) - stud_radius
    return gap


def check_taper_seats(part, config):
    results = {}
    for name, sign in (("upper", 1), ("lower", -1)):
        spec = config["knuckle"][name]
        mount = part.mounts[f"{name}BallJointSeat"]
        seat_length = spec["bossDepth"]
        expected_angle = math.atan2((spec["seatLargeOD"] - spec["seatSmallOD"]) / 2, seat_length)
        for face in part.solid.faces():
            surface = BRepAdaptor_Surface(face.wrapped)
            if surface.GetType() != GeomAbs_Cone:
                continue
            cone = surface.Cone()
            origin = cone.Location()
            axis = cone.Axis().Direction()
            if (abs(origin.X() - mount.position.X) < LINEAR_TOL_MM
                    and abs(origin.Z() - mount.position.Z) < LINEAR_TOL_MM
                    and abs(axis.Y() - sign) < LINEAR_TOL_MM):
                entry_radius = cone.RefRadius() + sign * (mount.position.Y - origin.Y()) * math.tan(cone.SemiAngle())
                require(abs(entry_radius * 2 - spec["seatLargeOD"]) < LINEAR_TOL_MM
                        and abs(cone.SemiAngle() - expected_angle) < LINEAR_TOL_MM, f"{name}: taper diameter/angle mismatch")
                results[name] = {"entryDiameterMm": entry_radius * 2, "halfAngleDeg": math.degrees(expected_angle)}
                break
        require(name in results, f"{name}: no conical ball-joint seat in B-rep")
    return results
