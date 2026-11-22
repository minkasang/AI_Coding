"""Build and independently verify the C-04 rim datum and its signed wheel center."""

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from build123d import Location

from rim import ASSET_ID, GRADE, design, make_solid, measure, near, require

HERE = Path(__file__).resolve().parent
C03 = HERE.parent / "wheel-end-ball-joint-demo-v1"
sys.path.insert(0, str(C03))
from build_ball_joints import C02, C02_SHA, read_pinned_json  # noqa: E402
from assembly import read_json, sha256  # noqa: E402
from pipeline import publish_stage, step_write, write_json  # noqa: E402
from verify import common_volume, occ_location, single_solid, step_read  # noqa: E402

SCHEMA = "carlab.c04DemoWheelCenter/1"
C03_PACKAGE_ID = "c03-3f4bf8c599df28679b86"
C03_MANIFEST_SHA = "bfe27ea9f2ae6a3283a463389950373c5338287f6200b1179a6ed46b7d337e91"
SNAPSHOT_COMMIT = "3524e32116019cca2a2decd91d6dfad4b180a2b2"
REPO = HERE.parents[2]
HUB = "PI-30-006-FL"
C02_MOUNT_ID = f"{HUB}/wheelMatingFace"
STEP_NAME = "rim-datum.step"
OUTPUT = HERE / "out"
DEFAULT_CONFIG = HERE / "parameters.json"
CLASH_MM3 = 0.01


def rigid(matrix):
    rotation = matrix[:3, :3]
    return (near(matrix[3], [0, 0, 0, 1]) and near(rotation.T @ rotation, np.eye(3))
            and near(np.linalg.det(rotation), 1))


def load_inputs(snapshot_file=None):
    datums = read_pinned_json(C02, C02_SHA)
    approved = datums["sources"]["c01"]
    c01_package = HERE.parent / "vehicle-cad-pipeline-v1" / "out" / approved["packageId"]
    c01 = read_pinned_json(c01_package / "manifest.json", approved["manifestSha256"])
    snap = datums["sources"]["snapshot"]
    # The approved CAD release binds exact bytes, not just snapshotId/revision.
    # An explicit working-tree snapshot must pass that same digest check.
    snapshot_ref = f"{SNAPSHOT_COMMIT}:{snap['path']}"
    raw_snapshot = (snapshot_file.read_bytes() if snapshot_file is not None else subprocess.check_output(
        ["git", "show", snapshot_ref], cwd=REPO, stderr=subprocess.PIPE, timeout=20
    ))
    require(hashlib.sha256(raw_snapshot).hexdigest() == snap["sha256"], "Approved R-27 snapshot SHA-256 mismatch")
    snapshot = json.loads(raw_snapshot)
    require(c01["sourceGrade"] == datums["sourceGrade"] == GRADE
            and c01["snapshotBinding"]["snapshotSha256"] == snap["sha256"]
            and snapshot["snapshotId"] == snap["snapshotId"] == c01["snapshotBinding"]["snapshotId"]
            and snapshot["revision"] == snap["revision"] == c01["snapshotBinding"]["revision"]
            and snapshot["variant"]["variantId"] == c01["snapshotBinding"]["variantId"],
            "C-01 or C-02 does not match the approved static snapshot")
    base_instances = {row["partInstanceId"]: row for row in c01["instances"]}
    canonical = {row["partInstanceId"]: row for row in snapshot["tree"]["partInstances"]}
    require(all(all(row[field] == canonical[key][field] for field in ("partId", "assemblyInstanceId"))
                for key, row in base_instances.items()), "Approved C-01 instance identity drift")
    assembly_name = c01["assets"]["step"]
    path = c01_package / assembly_name
    require(sha256(path) == c01["sha256"][assembly_name] == approved["assetsSha256"][assembly_name],
            "C-01 assembly STEP hash drift")
    assembly = step_read(path)
    fixed = {part.label: part for group in assembly.children for part in group.children}
    require(set(fixed) == set(base_instances) and assembly.label == datums["frames"]["workholding"]["frameId"],
            "C-01 STEP assembly identity drift")
    c03_package = C03 / "out" / C03_PACKAGE_ID
    c03 = read_pinned_json(c03_package / "manifest.json", C03_MANIFEST_SHA)
    require(c03["packageId"] == C03_PACKAGE_ID and c03["sourceGrade"] == GRADE
            and c03["sources"]["c02"]["datumsSha256"] == C02_SHA
            and c03["sources"]["c01"]["packageId"] == c01["packageId"]
            and c03["sources"]["snapshot"] == c01["snapshotBinding"]
            and c03["motionInput"]["playbackAllowed"] is False, "C-03 provenance or static scope drift")
    ball_centers = {}
    for side, row in c03["studs"].items():
        file = c03_package / row["step"]
        require(sha256(file) == c03["sha256"][row["step"]], f"C-03 ball stud hash drift: {side}")
        solid = step_read(file)
        single_solid(solid, row["artifactId"])
        transform = np.array(row["seat"]["rootFromStudCad"])
        require(solid.label == row["artifactId"] and row["partInstanceId"] is None and rigid(transform),
                f"C-03 {side} geometry or transform drift")
        fixed[row["artifactId"]] = solid.moved(occ_location(transform))
        ball_centers[side] = {"artifactId": row["artifactId"], **row["ballCenter"]}
    mount = next(row for row in datums["datums"] if row["datumId"] == C02_MOUNT_ID)
    hub_mounts = c01["partDefinitions"][mount["partId"]]["mounts"]
    mount_from_hub = np.linalg.inv(np.array(mount["partFromMountCad"]))
    stud_locations = []
    for name, row in hub_mounts.items():
        if name.startswith("studSeat"):
            position = mount_from_hub @ np.array(row["partFromMountCad"])[:, 3]
            stud_locations.append(tuple(position[:2]))
    require(len(stud_locations) == 5 and len(set(stud_locations)) == 5, "C-01 requires a five-stud pattern")
    source = {"c01": datums["sources"]["c01"], "c02": c03["sources"]["c02"],
              "c03": {"packageId": C03_PACKAGE_ID, "manifestSha256": C03_MANIFEST_SHA, "stepSha256": c03["sha256"]},
              "snapshot": c01["snapshotBinding"], "snapshotArchive": {"gitCommit": SNAPSHOT_COMMIT,
                                                                      "path": snap["path"], "sha256": snap["sha256"]},
              "referenceMotion": datums["sources"]["referenceMotion"]}
    return datums, mount, c01["parameters"], tuple(stud_locations), source, ball_centers, fixed


def clean(values):
    rounded = np.round(values, 10)
    return np.where(rounded == 0, 0, rounded).tolist()


def profile(config, inputs):
    _, _, params, studs, _, _, _ = inputs
    return design(config, params["hub"]["pilotOD"], params["stud"]["bodyOD"], studs)


def package_id(config, inputs):
    files = [HERE / name for name in ("rim.py", "build_wheel_center.py")]
    reused = [C03 / "build_ball_joints.py", C03 / "ball_stud.py"]
    c01 = HERE.parent / "vehicle-cad-pipeline-v1"
    reused.extend(c01 / name for name in ("model.py", "assembly.py", "pipeline.py", "verify.py"))
    fingerprints = {"schema": SCHEMA, "source": inputs[4], "config": config,
                    "toolchain": {"build123d": importlib.metadata.version("build123d"), "python": sys.version.split()[0]},
                    "scripts": {path.name: sha256(path) for path in files + reused}}
    return "c04-" + hashlib.sha256(json.dumps(fingerprints, sort_keys=True).encode()).hexdigest()[:20]


def check_fit(posed, axis, parameters, fixed):
    projection = parameters["stud"]["beyondFlange"]
    offsets = [projection + 2, projection / 2, 2, 0]
    maximum = 0
    for offset in offsets:
        shifted = posed.moved(Location(tuple(axis * offset)))
        for label, other in fixed.items():
            overlap = common_volume(shifted, other)
            require(overlap <= CLASH_MM3, f"Rim interferes with {label} at approach offset {offset:g} mm")
            maximum = max(maximum, overlap)
    hub = fixed[HUB]
    contact = posed.intersect(hub, include_touched=True)
    area = sum(face.area for face in contact.faces() if face.geom_type.name == "PLANE") if contact else 0
    require(area > 0 and near(posed.distance_to(hub), 0), "Rim mounting web does not contact the hub plane")
    overtravel = common_volume(posed.moved(Location(tuple(-axis * 0.1))), hub)
    require(overtravel > CLASH_MM3, "Rim mounting stop did not reject overtravel")
    return {"approachOffsetsFromSeatedMm": offsets, "pairChecks": len(offsets) * len(fixed),
            "maximumVolumetricOverlapMm3": round(maximum, 10), "clashToleranceMm3": CLASH_MM3,
            "hubPlaneContactAreaMm2": round(area, 8), "overtravel0p1MmOverlapMm3": round(overtravel, 8)}


def assess(folder, config, inputs):
    datums, mount, c01, studs, source, ball_centers, fixed = inputs
    step_path = folder / STEP_NAME
    shape = step_read(step_path)
    single_solid(shape, ASSET_ID)
    require(shape.label == ASSET_ID, "Unexpected STEP label")
    measured = measure(shape, profile(config, inputs))

    root_from_rim = np.array(mount["rootFromMountCad"])
    y_up = np.array(datums["frames"]["display"]["glbFromCadDirections"])
    scale = datums["frames"]["display"]["positionScale"]
    require(rigid(root_from_rim) and near(y_up.T @ y_up, np.eye(3))
            and near(np.linalg.det(y_up), 1) and scale == 0.001, "Expected right-handed mm / Y-up m frames")
    rotation = root_from_rim[:3, :3]
    root_axis = rotation @ measured["outboardAxis"]
    require(near(root_axis, datums["frames"]["spindle"]["outboardDirection"]), "Rim spindle misaligned with C-02")

    def point(local):
        root = rotation @ local + root_from_rim[:3, 3]
        return {"localMm": clean(local), "workholdingMm": clean(root), "workholdingYUpM": clean(y_up @ root * scale)}

    center = point(measured["center"])
    mount_point = point(measured["mount"])
    require(near(mount_point["workholdingYUpM"], mount["glbOriginM"]), "STEP mounting plane does not seat at C-02")
    root_delta = np.array(mount_point["workholdingMm"]) - center["workholdingMm"]
    metre_delta = np.array(mount_point["workholdingYUpM"]) - center["workholdingYUpM"]
    offset = measured["signedOffsetMm"]
    require(near(root_delta @ root_axis, offset) and near(metre_delta @ (y_up @ root_axis), offset * scale),
            "Signed offset does not survive CAD to metre conversion")
    inboard = point(measured["inboard"])
    outboard = point(measured["outboard"])
    mount_fit = check_fit(shape.moved(occ_location(root_from_rim)), root_axis, c01, fixed)
    manifest = {
        "schemaVersion": SCHEMA, "packageId": package_id(config, inputs), "sourceGrade": GRADE,
        "asset": {"artifactId": ASSET_ID, "partInstanceId": None, "geometryRole": "RIM_DATUM_ARTIFACT", "step": STEP_NAME},
        "sha256": {STEP_NAME: sha256(step_path)}, "sources": source, "effectiveParameters": config,
        "frames": {"workholding": datums["frames"]["workholding"], "rootFromRimCad": clean(root_from_rim),
                   "matrixConvention": datums["frames"]["matrixConvention"],
                   "workholdingYUpM": {"axisConversion": clean(y_up), "positionScale": scale, "handedness": "RIGHT", "unit": "m"}},
        "hubMountingFace": {"c02DatumId": C02_MOUNT_ID, "hubPartInstanceId": HUB, **mount_point},
        "referenceSections": {"inboard": inboard, "outboard": outboard,
                              "outerDiameterMm": round(measured["referenceOuterDiameterMm"], 8),
                              "innerDiameterMm": round(measured["referenceInnerDiameterMm"], 8),
                              "separationMm": round(measured["referenceWidthMm"], 8)},
        "spindle": {"outboardDirectionLocal": clean(measured["outboardAxis"]),
                    "outboardDirectionWorkholding": clean(root_axis), "outboardDirectionYUp": clean(y_up @ root_axis)},
        "wheelCenter": {**center, "feature": "MIDPLANE_OF_TWO_RIM_REFERENCE_SECTIONS_ON_SPINDLE"},
        "signedOffset": {"definition": "DOT(HUB_MOUNT_CENTER_MINUS_WHEEL_CENTER, OUTBOARD_UNIT_AXIS)",
                         "positiveMeans": "HUB_MOUNTING_FACE_OUTBOARD_OF_WHEEL_CENTER", "mm": round(offset, 8),
                         "m": round(offset * scale, 10), "valueBasis": GRADE},
        "boltPattern": {"studHoleCentersLocalMm": clean(studs), "pilotBoreDiameterMm": round(measured["pilotBoreDiameterMm"], 8),
                        "source": "C-01 hub stud-seat frames and pilot, with C-04 demo radial clearances"},
        "motionInput": {"status": "CAD_DATUMS_ONLY", "ballCentersFromC03": ball_centers,
                        "outerTieRodInterface": None, "vehicleFromWorkholding": None,
                        "existingR28Registration": "REGISTRATION_BLOCKED", "playbackAllowed": False},
    }
    evidence = {"status": "PASS", "independentStepSolids": 1,
                "sourceFixedInstances": len(fixed), "measuredWheelCenter": center,
                "measuredSignedOffset": manifest["signedOffset"],
                "frameChecks": {"rootFromRimDeterminant": round(float(np.linalg.det(rotation)), 10),
                                "workholdingToYUpDeterminant": round(float(np.linalg.det(y_up)), 10),
                                "millimetresToMetres": scale},
                "mountFit": mount_fit}
    return manifest, evidence


def verify(folder, inputs):
    stored = read_json(folder / "manifest.json")
    require(stored["sha256"] == {STEP_NAME: sha256(folder / STEP_NAME)}, "Rim STEP hash drift")
    manifest, evidence = assess(folder, stored["effectiveParameters"], inputs)
    require(manifest == stored, "Stored C-04 manifest differs from STEP recomputation")
    require(evidence == read_json(folder / "validation.json"), "Stored C-04 validation differs from recomputation")
    return manifest, evidence


def build(config, output, inputs):
    rim_profile = profile(config, inputs)
    output = output.resolve()
    destination = output / package_id(config, inputs)
    if destination.exists():
        return destination, verify(destination, inputs)[1]
    output.mkdir(parents=True, exist_ok=True)
    with publish_stage(output) as stage:
        step_write(make_solid(rim_profile), stage / STEP_NAME)
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
        command.add_argument("--snapshot", type=Path, help="read a byte-identical copy of the approved R-27 snapshot")
    args = cli.parse_args()
    inputs = load_inputs(args.snapshot)
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
        sys.exit(f"C-04 wheel center validation failed: {exc}")
