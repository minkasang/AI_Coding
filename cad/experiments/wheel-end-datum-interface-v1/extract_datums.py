"""Extract the audited C-01 wheel-end datums from STEP and the released manifest."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from build123d import import_step
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Circle

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PIPELINE = HERE.parent / "vehicle-cad-pipeline-v1"
PACKAGE_ID = "c01-c5d74da77c293aa5321f"
PACKAGE = PIPELINE / "out" / PACKAGE_ID
MANIFEST_SHA256 = "80e7e060de6b20015a6fdb8d5b81ea60b9e23ac442cebbb96b2bc2a5b5222d6a"
MOTION_PATH = "src-experiments/mechanism-pose-adapter-v1/canonical-motion.json"
FIXTURE_PATH = "src-experiments/kinematics/fixture-demo.json"
KNUCKLE = "PI-20-016-FL"
RACE = "PI-30-001-FL"
HUB = "PI-30-006-FL"
GRADE = "DEMO_ASSUMPTION"
TOL = 1e-5
CAD_TO_GLB = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]])


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def read_json(path, expected_hash=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    require(expected_hash is None or digest == expected_hash, f"SHA-256 mismatch: {path.name}")
    return json.loads(raw), digest


def clean(vector):
    rounded = np.round(vector, 10)
    return np.where(rounded == 0, 0, rounded).tolist()


def matches(left, right):
    return np.allclose(left, right, atol=TOL, rtol=0)


def point(cad_from_mount):
    return cad_from_mount[:3, 3]


def axis(cad_from_mount):
    return cad_from_mount[:3, 2]


def check_rigid(transform, name):
    rotation = transform[:3, :3]
    require(matches(transform[3], [0, 0, 0, 1])
            and matches(rotation.T @ rotation, np.eye(3))
            and matches(np.linalg.det(rotation), 1), f"{name}: expected a right-handed rigid transform")


def check_motion_neutral(motion, hardpoints):
    frame = next(row for row in motion["frames"] if row["travelM"] == 0)
    knuckle = next(row for row in frame["instances"] if row["instanceId"] == KNUCKLE)
    hub = next(row for row in frame["omitted"] if row["role"] == "HUB")
    tie_rod = next(row for row in frame["omitted"] if row["role"] == "TIEROD")
    require(frame["frameBasis"]["frameId"] == motion["simulationRun"]["frameId"]
            and frame["frameBasis"]["units"] == "m", "R-28 neutral frame metadata mismatch")
    require(hub["roleOnly"] and hub["instanceId"] is None and tie_rod["requiredButDeferred"]
            and tie_rod["instanceId"] is None, "R-28 unbound role semantics changed")
    q = np.array(knuckle["quaternion"])
    require(matches(np.linalg.norm(q), 1), "R-28 knuckle quaternion is not unit length")
    lower, upper = (np.array(hardpoints[name]) for name in ("lowerBall", "upperBall"))
    local_span = np.array([np.linalg.norm(upper - lower), 0, 0])
    twice_cross = 2 * np.cross(q[:3], local_span)
    rotated_span = local_span + q[3] * twice_cross + np.cross(q[:3], twice_cross)
    origin = np.array(knuckle["positionMeters"])
    reference_error_m = max(
        np.linalg.norm(origin - lower),
        np.linalg.norm(origin + rotated_span - upper),
        np.linalg.norm(np.array(hub["observedPositionMeters"]) - hardpoints["wheelCenter"]),
    )
    require(reference_error_m <= 1e-8, "R-28 neutral frame deviates from the reference fixture")
    return {"frameIndex": frame["frameIndex"], "maximumFixturePointErrorM": float(reference_error_m)}


def read_step(package, relative, manifest):
    path = package / relative
    raw = path.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == manifest["sha256"][relative], f"STEP hash mismatch: {relative}")
    require(b"SI_UNIT(.MILLI.,.METRE.)" in raw, f"STEP units must be mm: {relative}")
    shape = import_step(path)
    require(shape.is_valid, f"Invalid STEP shape: {relative}")
    return shape


def vector(occ):
    return np.array([occ.X(), occ.Y(), occ.Z()])


def circular_edges(face):
    for edge in face.edges():
        curve = BRepAdaptor_Curve(edge.wrapped)
        if curve.GetType() == GeomAbs_Circle:
            circle = curve.Circle()
            yield vector(circle.Location()), vector(circle.Axis().Direction()), 2 * circle.Radius()


def rim_evidence(shape, transform, diameter, inner_rim=None):
    surface = "CONE" if inner_rim else "PLANE"
    center, direction = point(transform), axis(transform)

    def measured_rim(rim):
        return {"centerMm": clean(rim[0]), "diameterMm": round(rim[2], 10)}

    for face in shape.faces():
        if face.geom_type.name != surface:
            continue
        circles = [r for r in circular_edges(face) if matches(abs(r[1] @ direction), 1)]
        entrance = next((r for r in circles if matches(r[0], center) and matches(r[2], diameter)), None)
        if entrance is None:
            continue
        evidence = {"surface": surface, "rims": [measured_rim(entrance)]}
        if inner_rim is None:
            return evidence
        nominal_depth, nominal_small_diameter = inner_rim
        slope = (diameter - nominal_small_diameter) / (2 * nominal_depth)
        for trimmed in circles:
            span = entrance[0] - trimmed[0]
            depth = float(span @ direction)
            # Verify the signed axis from the two trimmed rims. The cutter has
            # overtravel beyond the nominal boss, so use the measured slope.
            if depth > 0 and matches(span, depth * direction) and matches(entrance[2] - trimmed[2], 2 * depth * slope):
                evidence["rims"].append(measured_rim(trimmed))
                evidence["measuredTrimDepthMm"] = round(depth, 10)
                return evidence
    raise ValueError(f"Missing STEP {surface} rim at {clean(center)}, diameter {diameter:g} mm")


def extract(package):
    manifest, manifest_hash = read_json(package / "manifest.json", MANIFEST_SHA256)
    require(manifest["packageId"] == PACKAGE_ID and manifest["sourceGrade"] == GRADE, "Wrong C-01 package or grade")
    assembly, assembly_hash = read_json(PIPELINE / "assembly.json")
    root = manifest["root"]
    require(root["frameId"] == assembly["root"]["frameId"] and root["vehiclePlacement"] is None
            and root["motionBinding"] is None, "C-01 workholding frame or static scope changed")
    require(manifest["basis"]["cadUnit"] == "mm" and manifest["basis"]["glbUnit"] == "m"
            and manifest["basis"]["cadToGlbScale"] == 0.001
            and manifest["basis"]["cadToGlbAxes"] == ["+X", "+Z", "-Y"], "Unexpected CAD / GLB basis contract")

    binding = manifest["snapshotBinding"]
    snapshot_path = assembly["snapshot"]["path"]
    snapshot, snapshot_hash = read_json(REPO / snapshot_path, binding["snapshotSha256"])
    motion, motion_hash = read_json(REPO / MOTION_PATH)
    fixture, fixture_hash = read_json(REPO / FIXTURE_PATH)
    run = motion["simulationRun"]
    require(snapshot["snapshotId"] == binding["snapshotId"] == motion["snapshotId"]
            and snapshot["revision"] == binding["revision"] == motion["sourceRevision"]
            == run["inputRevision"] == run["sourceRevision"]
            and snapshot["variant"]["variantId"] == binding["variantId"] == motion["variantId"]
            and fixture["valueBasis"] == motion["motionValueBasis"] == GRADE,
            "CAD, snapshot or reference motion identity drift")
    require(motion["frames"] and all(any(i["instanceId"] == KNUCKLE and i["role"] == "KNUCKLE"
                                       for i in frame["instances"]) for frame in motion["frames"]),
            "R-28 knuckle identity unavailable")
    instances = {row["partInstanceId"]: row for row in manifest["instances"]}
    canonical = {row["partInstanceId"]: row for row in snapshot["tree"]["partInstances"]}
    ids = (KNUCKLE, RACE, HUB)
    for instance_id in ids:
        require(all(instances[instance_id][key] == canonical[instance_id][key]
                    for key in ("partId", "assemblyInstanceId")), f"R-27 identity drift: {instance_id}")
    defs = manifest["partDefinitions"]
    assembly_step = read_step(package, manifest["assets"]["step"], manifest)
    occurrences = {child.label: child for group in assembly_step.children for child in group.children}
    require(assembly_step.label == root["frameId"] and set(occurrences) == set(instances), "Unexpected STEP assembly tree")
    parts = {}
    for instance_id in ids:
        part_id = instances[instance_id]["partId"]
        shape = read_step(package, defs[part_id]["step"], manifest)
        require(shape.label == part_id and len(shape.solids()) == 1, f"Bad STEP definition: {part_id}")
        parts[instance_id] = shape

    parameters = manifest["parameters"]
    bearing, hub, knuckle = (parameters[key] for key in ("bearing", "hub", "knuckle"))
    opening = bearing["outerOD"] + 2 * knuckle["seatRadialGap"]
    specs = [
        (KNUCKLE, "bearingSeatFront", "BEARING_SEAT_OUTBOARD_FACE_AXIS_INTERSECTION", opening, None),
        (KNUCKLE, "bearingSeatBack", "BEARING_SEAT_INBOARD_SHOULDER_AXIS_INTERSECTION", opening, None),
        (RACE, "frontFace", "OUTER_BEARING_RING_OUTBOARD_FACE_AXIS_INTERSECTION", bearing["outerOD"], None),
        (RACE, "backFace", "OUTER_BEARING_RING_INBOARD_FACE_AXIS_INTERSECTION", bearing["outerOD"], None),
        (HUB, "wheelMatingFace", "WHEEL_MOUNTING_FACE_AXIS_INTERSECTION", hub["pilotOD"], None),
    ]
    for name in ("upper", "lower"):
        ear = knuckle[name]
        specs.append((KNUCKLE, f"{name}BallJointSeat", f"{name.upper()}_TAPER_LARGE_END_CENTER",
                      ear["seatLargeOD"], (ear["bossDepth"], ear["seatSmallOD"])))

    rows = {}
    for instance_id, name, feature, diameter, taper in specs:
        part_id = instances[instance_id]["partId"]
        local = np.array(defs[part_id]["mounts"][name]["partFromMountCad"])
        root_from_part = np.array(instances[instance_id]["rootFromPartCad"])
        check_rigid(local, name)
        check_rigid(root_from_part, instance_id)
        posed = root_from_part @ local
        datum_id = f"{instance_id}/{name}"
        rows[datum_id] = {
            "partInstanceId": instance_id, "partId": part_id, "mountName": name,
            "feature": feature, "sourceGrade": GRADE, "partFromMountCad": clean(local),
            "rootFromMountCad": clean(posed),
            "glbOriginM": clean(CAD_TO_GLB @ point(posed) / 1000),
            "glbPositiveZDirection": clean(CAD_TO_GLB @ axis(posed)),
            "stepEvidence": {
                "part": rim_evidence(parts[instance_id], local, diameter, taper),
                "assembly": rim_evidence(occurrences[instance_id], posed, diameter, taper),
            },
        }

    anchor = assembly["root"]
    x, z = np.array(anchor["xAxis"]), np.array(anchor["zAxis"])
    root_from_anchor = np.eye(4)
    root_from_anchor[:3, :3] = np.column_stack([x, np.cross(z, x), z])
    root_from_anchor[:3, 3] = anchor["origin"]
    check_rigid(root_from_anchor, "installation anchor")
    knuckle_front = rows[f"{KNUCKLE}/bearingSeatFront"]
    require(matches(root_from_anchor, knuckle_front["rootFromMountCad"]), "Anchor does not locate the bearing-seat front")
    require(matches(np.linalg.det(CAD_TO_GLB), 1), "GLB conversion must preserve handedness")

    def datum(name):
        return np.array(rows[f"{KNUCKLE}/{name}"]["rootFromMountCad"])

    upper, lower, front, back = map(datum, ("upperBallJointSeat", "lowerBallJointSeat", "bearingSeatFront", "bearingSeatBack"))
    spindle = point(front) - point(back)
    spindle /= np.linalg.norm(spindle)
    require(matches(spindle, z), "STEP-backed bearing datums disagree with the signed installation axis")
    seat_span = point(upper) - point(lower)
    require(matches([axis(upper) @ spindle, axis(lower) @ spindle], [0, 0]), "Unexpected taper axis projection")
    hardpoints = fixture["hardpoints"]
    neutral_check = check_motion_neutral(motion, hardpoints)
    motion_span = np.array(hardpoints["upperBall"]) - hardpoints["lowerBall"]
    motion_spindle = np.array(hardpoints["spindleAxis"])
    motion_spindle /= np.linalg.norm(motion_spindle)
    cad_projection = float(seat_span @ spindle)
    motion_projection = float(motion_span @ motion_spindle * 1000)
    report = {
        "schemaVersion": "carlab.c02WheelEndDatums/1",
        "sourceGrade": GRADE,
        "sources": {
            "c01": {"packageId": PACKAGE_ID, "manifestSha256": manifest_hash,
                    "assemblyDefinitionSha256": assembly_hash, "glb": manifest["assets"]["glb"],
                    "assetsSha256": manifest["sha256"]},
            "snapshot": {"path": snapshot_path, "sha256": snapshot_hash, **binding},
            "referenceMotion": {"path": MOTION_PATH, "sha256": motion_hash, "fixturePath": FIXTURE_PATH,
                                "fixtureSha256": fixture_hash, "runId": run["runId"], "resultHash": run["resultHash"],
                                "frameId": run["frameId"], "sourceRevision": run["sourceRevision"],
                                "knuckleOriginFeature": "LOWER_BALL_CENTER", "unit": "m",
                                "neutralFixtureCheck": neutral_check},
        },
        "frames": {
            "matrixConvention": "row-major arrays acting on column vectors; translations in mm",
            "workholding": {"frameId": root["frameId"], "unit": "mm", "handedness": "RIGHT",
                            "originDatumId": f"{KNUCKLE}/bearingSeatFront",
                            "positiveAxes": {"x": "OUTBOARD", "y": "REAR", "z": "UP"}},
            "anchor": {"expressedInFrameId": root["frameId"], "attachedDatumId": f"{KNUCKLE}/bearingSeatFront",
                       "role": "INSTALLATION_ANCHOR_IN_WORKHOLDING", "rootFromAnchorCad": clean(root_from_anchor)},
            "display": {"rootNodeFrameId": root["frameId"], "unit": "m", "handedness": "RIGHT",
                        "glbFromCadDirections": clean(CAD_TO_GLB), "positionScale": 0.001},
            "spindle": {"expressedInFrameId": root["frameId"], "originDatumId": f"{KNUCKLE}/bearingSeatFront",
                        "outboardDirection": clean(spindle)},
        },
        "datums": [{"datumId": datum_id, **row} for datum_id, row in rows.items()],
        "registration": {
            "status": "REGISTRATION_BLOCKED", "playbackAllowed": False, "vehicleFromWorkholding": None,
            "missing": [
                {"key": "upperTaperToBallCenter", "value": None, "owner": "CAD"},
                {"key": "lowerTaperToBallCenter", "value": None, "owner": "CAD"},
                {"key": "bearingOutboardFaceToLowerBallCenter", "value": None, "owner": "CAD"},
                {"key": "wheelMountFaceToWheelCenter", "value": None, "owner": "CAD_AND_MOTION"},
                {"key": "knuckleOuterTieRodInterface", "value": None, "owner": "CAD"},
                {"key": "sharedPhysicalLandmarkCorrespondences", "value": None, "owner": "CAD_AND_MOTION"},
            ],
            "projectionCheck": {
                "pointOrder": "lower-to-upper", "spindleDirection": "outboard",
                "cadTaperEntranceDistanceMm": round(np.linalg.norm(seat_span), 10),
                "referenceBallCenterDistanceMm": round(np.linalg.norm(motion_span) * 1000, 10),
                "cadTaperEntranceProjectionMm": round(cad_projection, 10),
                "referenceBallCenterProjectionMm": round(motion_projection, 10),
                "coaxialTaperOffsetsCanBridgeDifference": bool(matches(cad_projection, motion_projection)),
            },
        },
    }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, default=PACKAGE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--out", type=Path, help="write machine-readable datum JSON")
    mode.add_argument("--check", type=Path, help="recompute and validate existing datum JSON")
    args = parser.parse_args()
    result = extract(args.package)
    encoded = json.dumps(result, indent=2, allow_nan=False) + "\n"
    if args.check:
        stored, _ = read_json(args.check)
        require(stored == result, "Stored datum JSON differs from publish-package recomputation")
        print(f"PASS: {len(result['datums'])} datums checked against independent and assembled STEP")
    elif args.out:
        args.out.write_bytes(encoded.encode("utf-8"))
    else:
        print(encoded, end="")


if __name__ == "__main__":
    try:
        main()
    except StopIteration as exc:
        raise SystemExit("C-02 datum extraction failed: R-28 neutral frame or required role unavailable") from exc
    except (OSError, ValueError, KeyError, RuntimeError) as exc:
        raise SystemExit(f"C-02 datum extraction failed: {exc}") from exc
