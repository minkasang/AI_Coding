"""Build and verify a steering arm derivative and matching outer ball stud."""

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys

import numpy as np

from steering import ARM_ID, STUD_ID, GRADE, checked_arm, make_knuckle, measured_seat, require

HERE = Path(__file__).resolve().parent
C01 = HERE.parent / "vehicle-cad-pipeline-v1"
C03 = HERE.parent / "wheel-end-ball-joint-demo-v1"
C04 = HERE.parent / "wheel-end-wheel-center-demo-v1"
REPO = HERE.parents[2]
sys.path[:0] = [str(C04), str(C03)]
from assembly import read_json, sha256  # noqa: E402
from ball_stud import make_solid, measured_features, profile  # noqa: E402
from build_ball_joints import verify_insertion  # noqa: E402
from build_wheel_center import clean, load_inputs as load_wheel_inputs, read_pinned_json, rigid  # noqa: E402
from pipeline import publish_stage, step_write, write_json  # noqa: E402
from rim import full_circles, near  # noqa: E402
from verify import common_volume, occ_location, single_solid, step_read  # noqa: E402

SCHEMA = "carlab.c05DemoSteeringDatum/1"
KNUCKLE = "PI-20-016-FL"
DEFERRED = "PART-20-075"
C04_PACKAGE = "c04-bae128570c76aec59353"
C04_MANIFEST_HASH = "a29d64a876dbfde97e4442ecd3cf513a9109be8455fa31a2b5fb1a5fc1f37369"
ARM_STEP = "knuckle-steering-demo.step"
STUD_STEP = "steering-outer-ball-stud.step"
DEFAULT_CONFIG = HERE / "parameters.json"
OUTPUT = HERE / "out"
CLASH_MM3 = 0.01


def load_inputs():
    datums, _, _, _, sources, balls, fixed = load_wheel_inputs()
    folder = C04 / "out" / C04_PACKAGE
    c04 = read_pinned_json(folder / "manifest.json", C04_MANIFEST_HASH)
    require(c04["packageId"] == C04_PACKAGE and c04["sourceGrade"] == GRADE and c04["sources"] == sources
            and c04["motionInput"]["ballCentersFromC03"] == balls and c04["motionInput"]["playbackAllowed"] is False,
            "C-04 release identity or scope drift")
    rim_file = folder / c04["asset"]["step"]
    require(sha256(rim_file) == c04["sha256"][rim_file.name], "C-04 rim STEP hash drift")
    rim = step_read(rim_file)
    rim_transform = np.array(c04["frames"]["rootFromRimCad"])
    single_solid(rim, c04["asset"]["artifactId"])
    require(rim.label == c04["asset"]["artifactId"] and rigid(rim_transform), "C-04 rim label or transform drift")
    fixed[c04["asset"]["artifactId"]] = rim.moved(occ_location(rim_transform))

    c01 = sources["c01"]
    original_path = C01 / "out" / c01["packageId"] / "parts" / "PART-20-016.step"
    require(sha256(original_path) == c01["assetsSha256"]["parts/PART-20-016.step"], "C-01 original knuckle hash drift")
    original = step_read(original_path)
    single_solid(original, "PART-20-016")
    front = next(row for row in datums["datums"] if row["datumId"] == f"{KNUCKLE}/bearingSeatFront")
    require(near(front["partFromMountCad"], np.eye(4)), "C-02 front datum no longer equals the knuckle local origin")
    root_from_knuckle = np.array(front["rootFromMountCad"])
    require(rigid(root_from_knuckle), "Original knuckle requires a right-handed workholding transform")

    archive = sources["snapshotArchive"]
    snapshot_bytes = subprocess.check_output(["git", "show", f"{archive['gitCommit']}:{archive['path']}"],
                                             cwd=REPO, stderr=subprocess.PIPE, timeout=20)
    require(hashlib.sha256(snapshot_bytes).hexdigest() == archive["sha256"], "R-27 archive hash drift")
    snapshot = json.loads(snapshot_bytes)["tree"]
    definition = next(row for row in snapshot["partDefinitions"] if row["partDefinitionId"] == DEFERRED)
    quantity = sum(row["partId"] == DEFERRED for row in snapshot["partInstances"])
    status = definition["requiredButDeferred"]["status"]
    require(quantity == 0 and status == "REQUIRED_BUT_DEFERRED" and definition["instancePolicy"] == "DEFERRED",
            "R-27 outer tie rod is no longer the approved deferred definition")
    deferred = {"partId": DEFERRED, "parentDefinitionId": definition["parentNodeId"], "partInstanceId": None,
                "status": status, "snapshotInstanceCount": quantity}
    release_sources = {**sources, "c04": {"packageId": C04_PACKAGE, "manifestSha256": C04_MANIFEST_HASH,
                                          "stepSha256": c04["sha256"]}}
    return original, fixed, root_from_knuckle, datums["frames"], c04, release_sources, deferred


def package_id(config, sources):
    files = {HERE: ("steering.py", "build_steering.py"),
             C04: ("build_wheel_center.py", "rim.py"), C03: ("build_ball_joints.py", "ball_stud.py"),
             C01: ("model.py", "assembly.py", "pipeline.py", "verify.py")}
    stamp = {"schema": SCHEMA, "sources": sources, "config": config,
             "toolchain": {"python": sys.version.split()[0], "build123d": importlib.metadata.version("build123d")},
             "scripts": {name: sha256(folder / name) for folder, names in files.items() for name in names}}
    return "c05-" + hashlib.sha256(json.dumps(stamp, sort_keys=True).encode()).hexdigest()[:20]


def ball_profile(arm, seat, config):
    return profile("steering", seat, config["stud"], arm["bossDiameterMm"])


def assess(folder, config, inputs):
    original, fixed, root_from_knuckle, frames, c04, sources, deferred = inputs
    arm = checked_arm(config)
    knuckle = step_read(folder / ARM_STEP)
    stud = step_read(folder / STUD_STEP)
    for shape, label in ((knuckle, ARM_ID), (stud, STUD_ID)):
        single_solid(shape, label)
        require(shape.label == label, f"Wrong STEP label for {label}")
    knuckle_from_seat, seat = measured_seat(knuckle, arm, full_circles, near)
    root_from_seat = root_from_knuckle @ knuckle_from_seat
    require(rigid(knuckle_from_seat) and rigid(root_from_seat), "Steering seat frame must be right-handed")
    p = ball_profile(arm, seat, config)
    point, axis, gaps = measured_features(stud, p)
    root_axis = root_from_seat[:3, :3] @ axis

    retained = common_volume(original, knuckle)
    lost = abs(original.volume - retained)
    added = knuckle.volume - retained
    require(lost <= CLASH_MM3 and added > CLASH_MM3, "Steering feature must add volume and preserve the original knuckle")
    posed_knuckle = knuckle.moved(occ_location(root_from_knuckle))
    posed_stud = stud.moved(occ_location(root_from_seat))
    clearance = 0
    others = {key: solid for key, solid in fixed.items() if key != KNUCKLE}
    for label, solid in others.items():
        overlap = common_volume(posed_knuckle, solid)
        require(overlap <= CLASH_MM3, f"Steering knuckle derivative interferes with {label}")
        clearance = max(clearance, overlap)
    original_overlap = common_volume(posed_stud, fixed[KNUCKLE])
    require(original_overlap <= CLASH_MM3, "Outer stud interferes with original knuckle volume")
    checks = verify_insertion(posed_stud, p, root_axis, {**others, KNUCKLE: posed_knuckle})

    y_up = np.array(frames["display"]["glbFromCadDirections"])
    scale = frames["display"]["positionScale"]
    require(near(y_up.T @ y_up, np.eye(3)) and near(np.linalg.det(y_up), 1) and scale == 0.001,
            "Expected right-handed Y-up metre representation")
    knuckle_center = knuckle_from_seat[:3, :3] @ point + knuckle_from_seat[:3, 3]
    center = root_from_seat[:3, :3] @ point + root_from_seat[:3, 3]
    outer_center = {"studLocalMm": clean(point), "knuckleLocalMm": clean(knuckle_center),
                    "workholdingMm": clean(center), "workholdingYUpM": clean(y_up @ center * scale)}
    manifest = {
        "schemaVersion": SCHEMA, "packageId": package_id(config, sources), "sourceGrade": GRADE,
        "sources": sources, "effectiveParameters": config,
        "assets": {"derivedKnuckle": {"artifactId": ARM_ID, "partInstanceId": None, "step": ARM_STEP,
                                      "referencePartInstanceId": KNUCKLE, "role": "EXPERIMENTAL_DERIVATIVE"},
                   "outerBallStud": {"artifactId": STUD_ID, "partInstanceId": None, "step": STUD_STEP,
                                     "role": "BALL_STUD_ONLY"}},
        "sha256": {path: sha256(folder / path) for path in (ARM_STEP, STUD_STEP)},
        "frames": {"workholding": frames["workholding"], "matrixConvention": frames["matrixConvention"],
                   "rootFromDerivedKnuckleCad": clean(root_from_knuckle),
                   "workholdingYUpM": {"axisConversion": clean(y_up), "positionScale": scale, "unit": "m"}},
        "seat": {"frameId": f"{ARM_ID}/steeringOuterTaper", "feature": "INTEGRAL_ARM_TAPER_LARGE_END",
                 "knuckleFromSeatCad": clean(knuckle_from_seat), "rootFromSeatCad": clean(root_from_seat),
                 "studLocalOrigin": "COINCIDENT_WITH_SEAT_MOUTH_WHEN_SEATED",
                 "outwardDirectionRoot": clean(root_axis), "insertionDirectionRoot": clean(-root_axis),
                 "stepEvidence": seat},
        "fit": {"type": "SAME_TAPER_CLEARANCE_WITH_PLANAR_STOP", "stemEngagementMm": round(p.stem_depth, 10),
                "radialClearanceAtMouthMm": round(gaps[0], 10), "radialClearanceAtTipMm": round(gaps[1], 10),
                "tipAxialAllowanceMm": p.tip_allowance},
        "outerBallCenter": {"role": "REFERENCE_POINT", **outer_center},
        "motionInput": {"status": "CAD_DATUMS_ONLY", "playbackAllowed": False, "vehicleFromWorkholding": None,
                        "outerTieRodEndIdentity": deferred, "innerTieRodInterface": None, "tieRodLengthMm": None,
                        "spindle": c04["spindle"], "wheelCenter": c04["wheelCenter"],
                        "ballCentersFromC03": c04["motionInput"]["ballCentersFromC03"],
                        "existingR28Registration": "REGISTRATION_BLOCKED"},
    }
    result = {"status": "PASS", "independentStepSolids": 2, "outerBallCenter": outer_center,
              "retainedKnuckleDeviationMm3": round(lost, 8), "addedArmVolumeMm3": round(added, 8),
              "derivedKnuckleStaticPairs": len(others), "derivedKnuckleMaximumOverlapMm3": round(clearance, 10),
              "outerStudOverlapWithOriginalKnuckleMm3": round(original_overlap, 10),
              "outerStudInsertionAndSeat": checks}
    return manifest, result


def verify(folder, inputs):
    manifest = read_json(folder / "manifest.json")
    require(manifest["sha256"] == {name: sha256(folder / name) for name in (ARM_STEP, STUD_STEP)}, "C-05 STEP hash drift")
    derived, checks = assess(folder, manifest["effectiveParameters"], inputs)
    require(derived == manifest, "Stored C-05 manifest differs from STEP recomputation")
    require(checks == read_json(folder / "validation.json"), "Stored C-05 validation differs from recomputation")
    return manifest, checks


def build(config, output, inputs):
    arm = checked_arm(config)
    output = output.resolve()
    destination = output / package_id(config, inputs[5])
    if destination.exists():
        return destination, verify(destination, inputs)[1]
    output.mkdir(parents=True, exist_ok=True)
    with publish_stage(output) as stage:
        step_write(make_knuckle(inputs[0], arm), stage / ARM_STEP)
        _, seat = measured_seat(step_read(stage / ARM_STEP), arm, full_circles, near)
        stud = make_solid(ball_profile(arm, seat, config))
        stud.label = STUD_ID
        step_write(stud, stage / STUD_STEP)
        manifest, checks = assess(stage, config, inputs)
        write_json(stage / "manifest.json", manifest)
        write_json(stage / "validation.json", checks)
        try:
            stage.rename(destination)
        except OSError:
            if not destination.is_dir():
                raise
            checks = verify(destination, inputs)[1]
    return destination, checks


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest="command", required=True)
    creation = commands.add_parser("build")
    creation.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    creation.add_argument("--out", type=Path, default=OUTPUT)
    commands.add_parser("verify").add_argument("package", type=Path)
    args = cli.parse_args()
    inputs = load_inputs()
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
        sys.exit(f"C-05 steering datum validation failed: {exc}")
