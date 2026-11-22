"""Build and verify a same-source inner/outer tie-rod neutral datum."""

import argparse
import hashlib
import importlib.metadata
import json
from math import pi
from pathlib import Path
import subprocess
import sys

import numpy as np
from build123d import Location

from inner_datum import GRADE, LOCATOR_ID, PIN_ID, checked, make_locator, make_pin, near, read_contact_geometry, read_sphere, require

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
C05 = HERE.parent / "wheel-end-steering-datum-v1"
sys.path.insert(0, str(C05))
from build_steering import (  # noqa: E402
    ARM_ID, KNUCKLE, STUD_ID, clean, load_inputs as load_c05_inputs, read_json, read_pinned_json, rigid, sha256, write_json,
)
from pipeline import publish_stage, step_write  # noqa: E402
from verify import common_volume, occ_location, single_solid, step_read  # noqa: E402

SCHEMA = "carlab.c06DemoTieRodNeutralDatum/1"
FIXTURE_ID = "FIX-C06-FL-TIE-ROD-NEUTRAL"
OUTER_PACKAGE = "c05-ee1e461fecf00faa8151"
OUTER_MANIFEST_SHA = "e2030af04969982174baa3275b7c19507df4f64d992b65140cc044b5afd1adfc"
STEERING_FOLDER = C05 / "out" / OUTER_PACKAGE
LOCATOR_STEP = "inner-pivot-fixture.step"
PIN_STEP = "inner-ball-datum-pin.step"
DEFAULT_CONFIG = HERE / "parameters.json"
OUTPUT = HERE / "out"
CLASH_MM3 = 0.01


def deferred_identities(archive):
    ref = f"{archive['gitCommit']}:{archive['path']}"
    raw = subprocess.check_output(["git", "show", ref], cwd=REPO, stderr=subprocess.PIPE, timeout=20)
    require(hashlib.sha256(raw).hexdigest() == archive["sha256"], "Approved R-27 archive hash drift")
    tree = json.loads(raw)["tree"]
    rows = {row["partDefinitionId"]: row for row in tree["partDefinitions"]}
    result = {}
    for side, part_id in (("inner", "PART-20-074"), ("outer", "PART-20-075")):
        row = rows[part_id]
        count = sum(p["partId"] == part_id for p in tree["partInstances"])
        marker = row["requiredButDeferred"]
        status = marker["status"] if marker is not None else row["instancePolicy"]
        expected = "DEFERRED" if side == "inner" else "REQUIRED_BUT_DEFERRED"
        require(row["instancePolicy"] == "DEFERRED" and row["optionality"] == "required"
                and status == expected and count == 0, f"Unexpected approved identity for {part_id}")
        result[side] = {"partId": part_id, "parentDefinitionId": row["parentNodeId"], "partInstanceId": None,
                        "snapshotInstanceCount": count, "status": status}
    return result


def transform_point(transform, point):
    return transform[:3, :3] @ point + transform[:3, 3]


def load_inputs(folder=STEERING_FOLDER):
    outer = read_pinned_json(folder / "manifest.json", OUTER_MANIFEST_SHA)
    _, fixed, root_from_knuckle, frames, c04, sources, deferred_outer = load_c05_inputs()
    require(outer["schemaVersion"] == "carlab.c05DemoSteeringDatum/1" and outer["packageId"] == OUTER_PACKAGE
            and outer["sources"] == sources and outer["sourceGrade"] == GRADE
            and outer["outerBallCenter"]["role"] == "REFERENCE_POINT" and outer["motionInput"]["playbackAllowed"] is False
            and outer["motionInput"]["outerTieRodEndIdentity"] == deferred_outer,
            "C-05 reference is not the approved same-source neutral geometry")
    arm_meta, stud_meta = (outer["assets"][name] for name in ("derivedKnuckle", "outerBallStud"))
    shapes = {}
    for row, expected in ((arm_meta, ARM_ID), (stud_meta, STUD_ID)):
        asset = folder / row["step"]
        require(row["artifactId"] == expected and row["partInstanceId"] is None
                and sha256(asset) == outer["sha256"][row["step"]], f"C-05 STEP identity or digest drift: {expected}")
        shape = step_read(asset)
        single_solid(shape, expected)
        require(shape.label == expected, f"C-05 STEP label drift: {expected}")
        shapes[expected] = shape
    root_from_outer = np.array(outer["seat"]["rootFromSeatCad"])
    axis_map = np.array(frames["display"]["glbFromCadDirections"])
    axis_scale = frames["display"]["positionScale"]
    require(rigid(root_from_outer) and near(axis_map.T @ axis_map, np.eye(3))
            and near(np.linalg.det(axis_map), 1) and axis_scale == 0.001
            and near(root_from_knuckle, outer["frames"]["rootFromDerivedKnuckleCad"]),
            "Upstream neutral transforms must preserve handedness and units")
    outer_local, _ = read_sphere(shapes[STUD_ID])
    outer_center = transform_point(root_from_outer, outer_local)
    require(near(outer_local, outer["outerBallCenter"]["studLocalMm"])
            and near(outer_center, outer["outerBallCenter"]["workholdingMm"])
            and near(axis_map @ outer_center * axis_scale, outer["outerBallCenter"]["workholdingYUpM"]),
            "C-05 outer center does not match actual STEP sphere")
    fixed[KNUCKLE] = shapes[ARM_ID].moved(occ_location(root_from_knuckle))
    fixed[STUD_ID] = shapes[STUD_ID].moved(occ_location(root_from_outer))
    deferred = deferred_identities(sources["snapshotArchive"])
    require(deferred["outer"] == deferred_outer, "C-05 and approved R-27 outer identity drift")
    inputs = {**sources, "c05": {"packageId": OUTER_PACKAGE, "manifestSha256": OUTER_MANIFEST_SHA,
                                "stepSha256": outer["sha256"]}}
    return fixed, frames, c04, inputs, deferred, outer_local, outer_center


def fingerprint(config, inputs):
    module_paths = [HERE / name for name in ("inner_datum.py", "build_inner_datum.py")]
    module_paths.extend(C05 / name for name in ("steering.py", "build_steering.py"))
    siblings = {"vehicle-cad-pipeline-v1": ("model.py", "assembly.py", "pipeline.py", "verify.py"),
                "wheel-end-ball-joint-demo-v1": ("ball_stud.py", "build_ball_joints.py"),
                "wheel-end-wheel-center-demo-v1": ("rim.py", "build_wheel_center.py")}
    module_paths.extend(HERE.parent / folder / name for folder, names in siblings.items() for name in names)
    identity = {"schema": SCHEMA, "inputs": inputs, "parameters": config,
                "toolchain": {"python": sys.version.split()[0], "build123d": importlib.metadata.version("build123d")},
                "modules": {path.name: sha256(path) for path in module_paths}}
    digest = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    return "c06-" + digest[:20]


def fit_in_fixture(locator, pin, axis, params, fit, fixed):
    maximum_overlap = 0
    for label, other in fixed.items():
        overlap = common_volume(locator, other)
        require(overlap <= CLASH_MM3, f"Inner locator interferes with {label}")
        maximum_overlap = max(maximum_overlap, overlap)
    all_others = {**fixed, LOCATOR_ID: locator}
    stem_length = params["stemDepthMm"]
    samples = [stem_length + 2, stem_length, stem_length / 2, 2, 0]
    insertion_maximum = 0

    def shifted(distance):
        return pin.moved(Location(tuple(axis * distance)))

    for offset in samples:
        moved = shifted(offset)
        for label, other in all_others.items():
            overlap = common_volume(moved, other)
            require(overlap <= CLASH_MM3, f"Inner datum pin interferes with {label} at {offset:g} mm approach")
            insertion_maximum = max(insertion_maximum, overlap)
    contact = pin.intersect(locator, include_touched=True)
    area = sum(face.area for face in contact.faces() if face.geom_type.name == "PLANE") if contact else 0
    expected = pi * (params["collarDiameterMm"] ** 2 - fit["boreDiameterMm"] ** 2) / 4
    require(near(area, expected) and near(pin.distance_to(locator), 0), "Inner pin collar does not seat at the locator plane")
    offset_gap = shifted(0.05).distance_to(locator)
    require(near(offset_gap, min(0.05, fit["radialGapMm"])), "Inner pin short-seat clearance probe failed")
    overrun = common_volume(shifted(-0.1), locator)
    require(overrun > CLASH_MM3, "Inner pin failed to detect overtravel")
    return {"seatedLocatorVsUpstreamPairs": len(fixed), "maximumLocatorOverlapMm3": round(maximum_overlap, 10),
            "approachSamplesMm": samples, "pinInsertionPairChecks": len(all_others) * len(samples),
            "maximumPinOverlapMm3": round(insertion_maximum, 10), "clashToleranceMm3": CLASH_MM3,
            "stopContactAreaMm2": round(area, 8), "shortSeatMinimumClearanceMm": round(offset_gap, 8),
            "overrunMm": 0.1, "overrunOverlapMm3": round(overrun, 8)}


def assess(folder, config, loaded):
    fixed, frames, c04, sources, deferred, outer_local, outer_root = loaded
    offset, locator_params, pin_params = checked(config)
    locator = step_read(folder / LOCATOR_STEP)
    pin = step_read(folder / PIN_STEP)
    for shape, label in ((locator, LOCATOR_ID), (pin, PIN_ID)):
        single_solid(shape, label)
        require(shape.label == label, f"C-06 STEP label drift: {label}")
    inner_local, fit = read_contact_geometry(locator, pin, locator_params, pin_params)
    root_from_fixture = np.array(frames["anchor"]["rootFromAnchorCad"])
    expected_delta = np.array([-offset["inboardMm"], offset["rearwardMm"], offset["upwardMm"]])
    rotation = root_from_fixture[:3, :3]
    axis = rotation[:, 2].copy()
    require(near(axis, c04["spindle"]["outboardDirectionWorkholding"]), "Inner locator +Z does not face outboard")
    desired_inner = outer_root + expected_delta
    root_from_fixture[:3, 3] = desired_inner - pin_params["ballOffsetMm"] * axis
    require(rigid(root_from_fixture), "Invalid right-handed inner locator frame")
    inner_root = transform_point(root_from_fixture, inner_local)
    neutral_delta = inner_root - outer_root
    nominal_mm = float(np.linalg.norm(neutral_delta))
    signed_projection = float(neutral_delta @ axis)
    y_up = np.array(frames["display"]["glbFromCadDirections"])
    scale = frames["display"]["positionScale"]
    require(near(neutral_delta, expected_delta) and near(signed_projection, -offset["inboardMm"])
            and near(np.linalg.norm(y_up @ neutral_delta * scale), nominal_mm * scale),
            "STEP centers fail neutral offset, sign or unit checks")

    def point(local, root):
        return {"partLocalMm": clean(local), "workholdingMm": clean(root), "workholdingYUpM": clean(y_up @ root * scale)}

    neutral = {"poseId": "C06-FL-NOMINAL-STATIC", "corner": "FL", "valueBasis": GRADE,
               "innerBallCenter": {"role": "REFERENCE_POINT", "artifactId": PIN_ID, **point(inner_local, inner_root)},
               "outerBallCenter": {"role": "REFERENCE_POINT", "artifactId": STUD_ID, **point(outer_local, outer_root)},
               "innerMinusOuterWorkholdingMm": clean(neutral_delta),
               "innerMinusOuterWorkholdingYUpM": clean(y_up @ neutral_delta * scale),
               "signedInnerFromOuterAlongOutboardAxisMm": round(signed_projection, 9),
               "innerToOuterDirectionWorkholding": clean(-neutral_delta / nominal_mm),
               "innerToOuterDirectionYUp": clean(y_up @ (-neutral_delta / nominal_mm)),
               "nominalCenterDistanceMm": round(nominal_mm, 9), "nominalCenterDistanceM": round(nominal_mm * scale, 12)}
    pose = occ_location(root_from_fixture)
    assembly = fit_in_fixture(locator.moved(pose), pin.moved(pose), axis, pin_params, fit, fixed)
    manifest = {
        "schemaVersion": SCHEMA, "packageId": fingerprint(config, sources), "fixtureId": FIXTURE_ID, "sourceGrade": GRADE,
        "sources": sources, "effectiveParameters": config,
        "assets": {"locator": {"artifactId": LOCATOR_ID, "step": LOCATOR_STEP, "partInstanceId": None},
                   "pin": {"artifactId": PIN_ID, "step": PIN_STEP, "partInstanceId": None}},
        "sha256": {name: sha256(folder / name) for name in (LOCATOR_STEP, PIN_STEP)},
        "frames": {"workholding": frames["workholding"], "matrixConvention": frames["matrixConvention"],
                   "rootFromLocatorCad": clean(root_from_fixture), "rootFromPinCad": clean(root_from_fixture),
                   "seatedOrigin": "BLIND_BORE_MOUTH_AND_COLLAR_SEATING_PLANE_CENTER",
                   "pinInsertionDirectionWorkholding": clean(-axis),
                   "workholdingYUpM": {"axisConversion": clean(y_up), "positionScale": scale, "handedness": "RIGHT", "unit": "m"}},
        "fit": {"type": "BLIND_CYLINDRICAL_CLEARANCE_WITH_PLANAR_STOP", **fit,
                "fixtureSupport": "ASSUMED_FIXED_PLATE_ON_DEMO_WORKHOLDING"},
        "neutral": neutral,
        "motionInput": {"status": "NEUTRAL_CAD_REFERENCE_ONLY", "vehicleFromWorkholding": None,
                        "playbackAllowed": False, "existingR28Registration": "REGISTRATION_BLOCKED",
                        "steeringGearMotion": None, "dynamicTieRodClosure": None, "identities": deferred,
                        "wheelCenter": c04["wheelCenter"], "wheelSignedOffset": c04["signedOffset"],
                        "ballCentersFromC03": c04["motionInput"]["ballCentersFromC03"]},
    }
    report = {"status": "PASS", "independentStepSolids": 2, "neutral": neutral, "fit": fit, "assembly": assembly}
    return manifest, report


def verify(folder, inputs):
    stored = read_json(folder / "manifest.json")
    require(stored["sha256"] == {name: sha256(folder / name) for name in (LOCATOR_STEP, PIN_STEP)}, "C-06 STEP hash drift")
    recomputed, checks = assess(folder, stored["effectiveParameters"], inputs)
    require(stored == recomputed, "Stored C-06 manifest differs from STEP recomputation")
    require(checks == read_json(folder / "validation.json"), "Stored C-06 validation differs from recomputation")
    return stored, checks


def build(config, output, inputs):
    _, locator, pin = checked(config)
    output = output.resolve()
    destination = output / fingerprint(config, inputs[3])
    if destination.exists():
        return destination, verify(destination, inputs)[1]
    output.mkdir(parents=True, exist_ok=True)
    with publish_stage(output) as stage:
        step_write(make_locator(locator, pin), stage / LOCATOR_STEP)
        step_write(make_pin(pin), stage / PIN_STEP)
        manifest, evidence = assess(stage, config, inputs)
        write_json(stage / "manifest.json", manifest)
        write_json(stage / "validation.json", evidence)
        try:
            stage.rename(destination)
        except OSError:
            if not destination.is_dir():
                raise
            evidence = verify(destination, inputs)[1]
    return destination, evidence


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest="command", required=True)
    creation = commands.add_parser("build")
    creation.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    creation.add_argument("--out", type=Path, default=OUTPUT)
    validation = commands.add_parser("verify")
    validation.add_argument("package", type=Path)
    for command in (creation, validation):
        command.add_argument("--steering-package", type=Path, default=STEERING_FOLDER,
                             help="approved C-05 package or its byte-identical copy")
    args = cli.parse_args()
    inputs = load_inputs(args.steering_package)
    if args.command == "build":
        folder, checks = build(read_json(args.config), args.out, inputs)
    else:
        folder = args.package.resolve()
        _, checks = verify(folder, inputs)
    print(json.dumps({"package": str(folder), **checks}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, OverflowError, RuntimeError, TypeError, ValueError, StopIteration,
            subprocess.SubprocessError) as exc:
        sys.exit(f"C-06 inner tie-rod datum validation failed: {exc}")
