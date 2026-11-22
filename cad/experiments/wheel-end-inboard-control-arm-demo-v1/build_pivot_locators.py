"""Build and verify same-source upper/lower inboard pivot locator STEP assets."""

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys

import numpy as np

from pivot_locator import GRADE, asset_id, checked, make_locator, measure_bores, near, nominal_transform, require, step_name

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
C06 = HERE.parent / "wheel-end-inner-tie-rod-demo-v1"
sys.path.insert(0, str(C06))
from build_inner_datum import (  # noqa: E402
    LOCATOR_ID, PIN_ID, clean, load_inputs as load_c06_inputs, read_json, read_pinned_json, read_sphere,
    rigid, sha256, transform_point, write_json,
)
from pipeline import publish_stage, step_write  # noqa: E402
from verify import common_volume, occ_location, single_solid, step_read  # noqa: E402

SCHEMA = "carlab.c07DemoInboardPivotDatums/1"
FIXTURE_ID = "FIX-C07-FL-SLA-INBOARD"
C06_PACKAGE = "c06-2df2c4ba3bd882bab8f5"
C06_SHA = "b4e0674c54370912c88130bfffd0bae13a269b627f78e05f4f8a5abee9ffe0a8"
UPSTREAM = C06 / "out" / C06_PACKAGE
OUTPUT = HERE / "out"
DEFAULT_CONFIG = HERE / "parameters.json"
SIDES = ("upper", "lower")
ARM_IDS = {"upper": ("PI-20-001-FL", "PART-20-001"), "lower": ("PI-20-008-FL", "PART-20-008")}
CLEARANCE_NUMERICAL_FLOOR_MM = 0.00001
CLASH_MM3 = 0.01


def reference_arms(archive):
    ref = f"{archive['gitCommit']}:{archive['path']}"
    raw = subprocess.check_output(["git", "show", ref], cwd=REPO, stderr=subprocess.PIPE, timeout=20)
    require(hashlib.sha256(raw).hexdigest() == archive["sha256"], "Approved R-27 archive hash drift")
    tree = json.loads(raw)["tree"]["partInstances"]
    canonical = {row["partInstanceId"]: row for row in tree}
    references = {}
    for side, (instance, definition) in ARM_IDS.items():
        row = canonical[instance]
        require(row["partId"] == definition and row["corner"] == "FL", f"C-07 source arm identity drift: {side}")
        references[side] = {key: row[key] for key in ("partInstanceId", "partId", "assemblyInstanceId", "frameId")}
    return references


def load_inputs(folder=UPSTREAM):
    c06 = read_pinned_json(folder / "manifest.json", C06_SHA)
    fixed, frames, c04, sources, identities, _, outer_root = load_c06_inputs()
    require(c06["schemaVersion"] == "carlab.c06DemoTieRodNeutralDatum/1" and c06["packageId"] == C06_PACKAGE
            and c06["sourceGrade"] == GRADE and c06["sources"] == sources and c06["neutral"]["corner"] == "FL"
            and c06["motionInput"]["identities"] == identities and c06["motionInput"]["playbackAllowed"] is False,
            "C-06 source identity, corner or static scope drift")
    for name, label, matrix_name in (("locator", LOCATOR_ID, "rootFromLocatorCad"), ("pin", PIN_ID, "rootFromPinCad")):
        row = c06["assets"][name]
        path = folder / row["step"]
        require(row["partInstanceId"] is None and row["artifactId"] == label
                and sha256(path) == c06["sha256"][row["step"]], f"C-06 asset hash or identity drift: {label}")
        shape = step_read(path)
        single_solid(shape, label)
        transform = np.array(c06["frames"][matrix_name])
        require(rigid(transform) and shape.label == label, f"C-06 STEP or frame drift: {label}")
        if name == "pin":
            sphere, _ = read_sphere(shape)
            inner_root = transform_point(transform, sphere)
        fixed[label] = shape.moved(occ_location(transform))
    neutral = c06["neutral"]
    require(near(inner_root, neutral["innerBallCenter"]["workholdingMm"])
            and near(outer_root, neutral["outerBallCenter"]["workholdingMm"])
            and near(np.linalg.norm(inner_root - outer_root), neutral["nominalCenterDistanceMm"]),
            "Current C-06 neutral does not match STEP")

    outer_balls = {}
    for side, row in c04["motionInput"]["ballCentersFromC03"].items():
        ball, _ = read_sphere(fixed[row["artifactId"]])
        require(near(ball, row["workholdingMm"]), f"C-03 {side} outer ball does not match actual posed STEP")
        outer_balls[side] = {"artifactId": row["artifactId"], "center": ball}
    upstream = {**sources, "c06": {"packageId": C06_PACKAGE, "manifestSha256": C06_SHA, "stepSha256": c06["sha256"]}}
    return fixed, frames, upstream, outer_balls, neutral, reference_arms(sources["snapshotArchive"]), identities, c04["wheelCenter"]


def identity(config, sources):
    scripts = {HERE: ("pivot_locator.py", "build_pivot_locators.py"), C06: ("build_inner_datum.py", "inner_datum.py")}
    dependencies = {"vehicle-cad-pipeline-v1": ("model.py", "assembly.py", "pipeline.py", "verify.py"),
                    "wheel-end-ball-joint-demo-v1": ("ball_stud.py", "build_ball_joints.py"),
                    "wheel-end-wheel-center-demo-v1": ("rim.py", "build_wheel_center.py"),
                    "wheel-end-steering-datum-v1": ("steering.py", "build_steering.py")}
    scripts.update({HERE.parent / folder: names for folder, names in dependencies.items()})
    stamp = {"schema": SCHEMA, "config": config, "sources": sources,
             "toolchain": {"python": sys.version.split()[0], "build123d": importlib.metadata.version("build123d")},
             "scripts": {name: sha256(folder / name) for folder, names in scripts.items() for name in names}}
    return "c07-" + hashlib.sha256(json.dumps(stamp, sort_keys=True).encode()).hexdigest()[:20]


def clearance(shape, neighbors, label):
    minimum, closest, maximum = float("inf"), None, 0
    for other_label, other in neighbors.items():
        overlap = common_volume(shape, other)
        distance = shape.distance_to(other)
        require(overlap <= CLASH_MM3 and distance > CLEARANCE_NUMERICAL_FLOOR_MM,
                f"{label}: no static clearance to {other_label}")
        if distance < minimum:
            minimum, closest = distance, other_label
        maximum = max(maximum, overlap)
    return {"checkedPairs": len(neighbors), "minimumClearanceMm": round(minimum, 8),
            "nearestAssetId": closest, "maximumOverlapMm3": round(maximum, 10)}


def assess(folder, config, loaded):
    fixed, frames, sources, outer_balls, neutral, references, identities, wheel_center = loaded
    checked(config)
    y_up = np.array(frames["display"]["glbFromCadDirections"])
    scale = frames["display"]["positionScale"]
    require(near(y_up.T @ y_up, np.eye(3)) and near(np.linalg.det(y_up), 1) and scale == 0.001,
            "Expected a right-handed Y-up metre conversion")
    locators, posed, proofs, hashes, lines = {}, {}, {}, {}, {}
    for side in SIDES:
        path = folder / step_name(side)
        shape = step_read(path)
        label = asset_id(side)
        single_solid(shape, label)
        require(shape.label == label, f"Wrong STEP label for {side}")
        outer = outer_balls[side]["center"]
        transform = nominal_transform(config[side], outer)
        require(rigid(transform), f"{side}: non-rigid or reflected locator frame")
        bores, local_axis, span = measure_bores(shape, config[side])
        positions = [transform_point(transform, bore[0]) for bore in bores]
        front, rear = positions
        axis = (rear - front) / np.linalg.norm(rear - front)
        middle = (front + rear) / 2
        require(near(axis, transform[:3, :3] @ local_axis) and axis[1] > 0
                and near(np.linalg.norm(y_up @ (rear - front) * scale), span * scale),
                f"{side}: wrong rearward polarity or metre conversion")
        nearest = middle + axis * float((outer - middle) @ axis)
        radial = float(np.linalg.norm(outer - nearest))
        require(radial > CLEARANCE_NUMERICAL_FLOOR_MM, f"{side}: outer ball lies on degenerate pivot axis")

        def point(local, root):
            return {"partLocalMm": clean(local), "workholdingMm": clean(root), "workholdingYUpM": clean(y_up @ root * scale)}

        locators[side] = {
            "artifactId": label, "step": path.name, "partInstanceId": None, "sourceArmReference": references[side],
            "rootFromLocatorCad": clean(transform), "supportDatumType": "TWO_BORE_MIDPLANES",
            "supports": {end: {**point(bore[0], root), "boreDiameterMm": round(bore[1], 8),
                               "stepTrimCentersLocalMm": clean(bore[2])}
                         for end, bore, root in zip(("front", "rear"), bores, positions, strict=True)},
            "axis": {"positiveDirection": "FRONT_TO_REAR", "workholding": clean(axis), "workholdingYUp": clean(y_up @ axis),
                     "supportSpanMm": round(span, 8), "supportSpanM": round(span * scale, 10)},
            "sameSourceOuterBall": {"artifactId": outer_balls[side]["artifactId"], "workholdingMm": clean(outer),
                                    "workholdingYUpM": clean(y_up @ outer * scale),
                                    "radialDistanceToPivotAxisMm": round(radial, 8), "radialDistanceToPivotAxisM": round(radial * scale, 12)},
        }
        posed[side] = shape.moved(occ_location(transform))
        proofs[side] = clearance(posed[side], fixed, label)
        hashes[path.name] = sha256(path)
        lines[side] = (middle, axis)

    up, up_axis = lines["upper"]
    low, low_axis = lines["lower"]
    cross = np.cross(up_axis, low_axis)
    cross_length = float(np.linalg.norm(cross))
    separation = (abs(float((up - low) @ cross)) / cross_length if cross_length > CLEARANCE_NUMERICAL_FLOOR_MM
                  else float(np.linalg.norm(np.cross(up - low, low_axis))))
    require(cross_length > CLEARANCE_NUMERICAL_FLOOR_MM or separation > CLEARANCE_NUMERICAL_FLOOR_MM,
            "Upper/lower pivot axes coincide")
    pair = clearance(posed["upper"], {asset_id("lower"): posed["lower"]}, asset_id("upper"))
    manifest = {
        "schemaVersion": SCHEMA, "packageId": identity(config, sources), "fixtureId": FIXTURE_ID, "sourceGrade": GRADE,
        "sources": sources, "effectiveParameters": config, "sha256": hashes, "locators": locators,
        "frames": {"workholding": frames["workholding"], "matrixConvention": frames["matrixConvention"],
                   "workholdingYUpM": {"axisConversion": clean(y_up), "positionScale": scale, "handedness": "RIGHT", "unit": "m"}},
        "motionInput": {"status": "STATIC_CAD_REFERENCE_ONLY", "playbackAllowed": False, "vehicleFromWorkholding": None,
                        "existingR28Registration": "REGISTRATION_BLOCKED", "finiteTravelValidated": False,
                        "steeringNeutral": neutral, "steeringIdentities": identities, "wheelCenter": wheel_center},
    }
    evidence = {"status": "PASS", "independentStepSolids": len(locators), "sameSourceFixedSolids": len(fixed),
                "locatorVsUpstream": proofs, "locatorPair": pair, "axisAngleDegrees": round(float(np.degrees(np.arctan2(
                    cross_length, float(up_axis @ low_axis)))), 8), "shortestAxisDistanceMm": round(separation, 8),
                "basisDeterminant": round(float(np.linalg.det(y_up)), 9)}
    return manifest, evidence


def verify(folder, inputs):
    saved = read_json(folder / "manifest.json")
    require(saved["sha256"] == {step_name(side): sha256(folder / step_name(side)) for side in SIDES}, "C-07 STEP hash drift")
    observed, evidence = assess(folder, saved["effectiveParameters"], inputs)
    require(saved == observed, "Stored C-07 manifest differs from STEP recomputation")
    require(read_json(folder / "validation.json") == evidence, "Stored C-07 validation differs from recomputation")
    return saved, evidence


def build(config, output, inputs):
    checked(config)
    output = output.resolve()
    destination = output / identity(config, inputs[2])
    if destination.is_dir():
        return destination, verify(destination, inputs)[1]
    output.mkdir(parents=True, exist_ok=True)
    with publish_stage(output) as stage:
        for side in SIDES:
            step_write(make_locator(side, config[side]), stage / step_name(side))
        result, evidence = assess(stage, config, inputs)
        write_json(stage / "manifest.json", result)
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
        command.add_argument("--inner-package", type=Path, default=UPSTREAM, help="approved C-06 package or its byte-identical copy")
    args = cli.parse_args()
    inputs = load_inputs(args.inner_package)
    if args.command == "build":
        folder, evidence = build(read_json(args.config), args.out, inputs)
    else:
        folder = args.package.resolve()
        _, evidence = verify(folder, inputs)
    print(json.dumps({"package": str(folder), **evidence}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, OverflowError, RuntimeError, TypeError, ValueError, StopIteration,
            subprocess.SubprocessError) as exc:
        sys.exit(f"C-07 inboard pivot validation failed: {exc}")
