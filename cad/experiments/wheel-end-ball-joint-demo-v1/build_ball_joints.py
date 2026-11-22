"""Build and independently verify a pair of C-03 STEP ball-stud samples."""

import argparse
import hashlib
import importlib.metadata
import json
from math import pi
from pathlib import Path
import sys

import numpy as np
from build123d import Location

from ball_stud import make_solid, measured_features, near, profile, require
from assembly import read_json, sha256
from pipeline import publish_stage, step_write, write_json
from verify import common_volume, occ_location, single_solid, step_read

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
C01 = HERE.parent / "vehicle-cad-pipeline-v1"
C02 = HERE.parent / "wheel-end-datum-interface-v1" / "datums.json"
C02_SHA = "071eb3019dceeec74a53dc446f99413fadeaffc0a796358f61bb515a86e5f146"
OUTPUT = HERE / "out"
DEFAULT_CONFIG = HERE / "parameters.json"
GRADE = "DEMO_ASSUMPTION"
SCHEMA = "carlab.c03DemoBallStuds/1"
KNUCKLE = "PI-20-016-FL"
CANDIDATES = {"upper": ("PI-20-003-FL", "PART-20-003", "AI-20-002-FL", "FR-20-002-FL"),
              "lower": ("PI-20-010-FL", "PART-20-010", "AI-20-003-FL", "FR-20-003-FL")}
CLASH_MM3 = 0.01


def read_pinned_json(path, expected):
    raw = path.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == expected, f"SHA-256 mismatch: {path.name}")
    return json.loads(raw)


def checked_input():
    datums = read_pinned_json(C02, C02_SHA)
    approved = datums["sources"]["c01"]
    c01_package = C01 / "out" / approved["packageId"]
    manifest = read_pinned_json(c01_package / "manifest.json", approved["manifestSha256"])
    snap = datums["sources"]["snapshot"]
    snapshot = read_pinned_json(REPO / snap["path"], snap["sha256"])
    require(datums["schemaVersion"] == "carlab.c02WheelEndDatums/1"
            and datums["sourceGrade"] == manifest["sourceGrade"] == GRADE
            and datums["registration"]["playbackAllowed"] is False, "Expected approved static C-01/C-02 inputs")
    require(snapshot["snapshotId"] == snap["snapshotId"] == manifest["snapshotBinding"]["snapshotId"]
            and snapshot["revision"] == snap["revision"] == manifest["snapshotBinding"]["revision"],
            "C-01/C-02 snapshot revision drift")
    tree = {row["partInstanceId"]: row for row in snapshot["tree"]["partInstances"]}
    mounts = {row["mount"]: row for row in manifest["externalMounts"] if row["partInstanceId"] == KNUCKLE}
    datum_by_id = {row["datumId"]: row for row in datums["datums"]}
    joints = {}
    for side, (instance, part, group, frame) in CANDIDATES.items():
        mount = f"{side}BallJointSeat"
        candidate = tree[instance]
        require((candidate["partId"], candidate["assemblyInstanceId"], candidate["frameId"], candidate["corner"])
                == (part, group, frame, "FL") and candidate["quantity"]["perAssembly"] == 1
                and candidate["geometryStatus"] == "NO_GEOMETRY"
                and mounts[mount]["mateCandidatePartInstanceId"] == instance
                and mounts[mount]["status"] == "COUNTERPART_NOT_MODELED", f"{side}: candidate identity drift")
        candidate_data = {
            "partInstanceId": instance, "partId": part, "assemblyInstanceId": group, "snapshotFrameId": frame,
            "role": f"{side.upper()}_BALL_JOINT_ASSEMBLY", "status": "CANDIDATE_PARTIAL_GEOMETRY",
            "snapshotGeometryStatus": "NO_GEOMETRY",
        }
        joints[side] = (datum_by_id[f"{KNUCKLE}/{mount}"], candidate_data)

    assembly_name = manifest["assets"]["step"]
    asset_path = c01_package / assembly_name
    assembly_hash = manifest["sha256"][assembly_name]
    require(sha256(asset_path) == approved["assetsSha256"][assembly_name] == assembly_hash, "C-01 assembly STEP hash drift")
    assembly = step_read(asset_path)
    parts = {part.label: part for group in assembly.children for part in group.children}
    require(set(parts) == {row["partInstanceId"] for row in manifest["instances"]}, "C-01 STEP identity drift")
    return datums, manifest, joints, parts


def source_metadata(datums, manifest):
    return {
        "c01": {"packageId": manifest["packageId"], "manifestSha256": datums["sources"]["c01"]["manifestSha256"],
                "assemblyStepSha256": manifest["sha256"][manifest["assets"]["step"]]},
        "c02": {"schemaVersion": datums["schemaVersion"], "datumsSha256": C02_SHA},
        "snapshot": manifest["snapshotBinding"],
        "referenceMotion": datums["sources"]["referenceMotion"],
    }


def package_id(config, sources):
    reused = [C01 / name for name in ("assembly.py", "model.py", "pipeline.py", "verify.py")]
    own = [HERE / name for name in ("ball_stud.py", "build_ball_joints.py")]
    fingerprint = {"schema": SCHEMA, "parameters": config, "sources": sources,
                   "sourceSha256": {path.name: sha256(path) for path in reused + own},
                   "toolchain": {"python": sys.version.split()[0], "build123d": importlib.metadata.version("build123d")}}
    return "c03-" + hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest()[:20]


def plans(config, manifest, joint_inputs):
    require(set(config) == {"unit", "sourceGrade", *joint_inputs} and config["unit"] == "mm"
            and config["sourceGrade"] == GRADE, "Expected mm / DEMO_ASSUMPTION C-03 parameters")
    return {
        side: profile(side, datum["stepEvidence"]["part"], config[side], manifest["parameters"]["knuckle"][side]["bossOD"])
        for side, (datum, _) in joint_inputs.items()
    }


def clean(values):
    rounded = np.round(values, 10)
    return np.where(rounded == 0, 0, rounded).tolist()


def pose_transform(datum):
    transform = np.array(datum["rootFromMountCad"])
    rotation = transform[:3, :3]
    require(near(transform[3], [0, 0, 0, 1]) and near(rotation.T @ rotation, np.eye(3))
            and near(np.linalg.det(rotation), 1), "Expected right-handed mount transform")
    return transform


def translated(shape, direction, distance):
    return shape.moved(Location(tuple(direction * distance)))


def verify_insertion(posed, p, axis, fixed):
    distances = [p.stem_depth + 2, p.stem_depth, p.stem_depth / 2, 2, 0]
    max_overlap = 0
    for distance in distances:
        shift = translated(posed, axis, distance)
        for key, other in fixed.items():
            overlap = common_volume(shift, other)
            require(overlap <= CLASH_MM3, f"{p.side}: interference with {key} during insertion at {distance:g} mm")
            max_overlap = max(max_overlap, overlap)
    knuckle = fixed[KNUCKLE]
    contact = posed.intersect(knuckle, include_touched=True)
    planar_area = sum(face.area for face in contact.faces() if face.geom_type.name == "PLANE") if contact else 0
    expected_area = pi * (p.collar_diameter ** 2 - p.bore_entrance_diameter ** 2) / 4
    require(abs(planar_area - expected_area) < 0.001, f"{p.side}: incorrect planar seating area")
    short_stop = translated(posed, axis, 0.05).distance_to(knuckle)
    require(near(posed.distance_to(knuckle), 0) and near(short_stop, 0.05), f"{p.side}: axial contact mismatch")
    overtravel = common_volume(translated(posed, axis, -0.1), knuckle)
    require(overtravel > CLASH_MM3, f"{p.side}: axial stop did not reject overtravel")
    return {
        "axialApproachSamplesMm": clean(distances), "pairChecks": len(distances) * len(fixed),
        "maximumVolumetricOverlapMm3": round(max_overlap, 10), "stopContactAreaMm2": round(planar_area, 8),
        "shortOfSeatDistanceMm": round(short_stop, 8), "overtravelDistanceMm": 0.1,
        "overtravelOverlapMm3": round(overtravel, 8),
    }


def assess(folder, config, inputs):
    datums, base, joint_inputs, fixed = inputs
    profiles = plans(config, base, joint_inputs)
    sources = source_metadata(datums, base)
    world_basis = np.array(datums["frames"]["display"]["glbFromCadDirections"])
    require(near(world_basis.T @ world_basis, np.eye(3)) and near(np.linalg.det(world_basis), 1),
            "C-02 metre basis is not right-handed")
    observed, posed, checks, hashes = {}, {}, {}, {}
    for side, p in profiles.items():
        file = folder / p.filename
        shape = step_read(file)
        single_solid(shape, p.artifact_id)
        require(shape.label == p.artifact_id, f"STEP label mismatch: {p.filename}")
        center, step_axis, gaps = measured_features(shape, p)
        datum, candidate = joint_inputs[side]
        transform = pose_transform(datum)
        root_axis = transform[:3, :3] @ step_axis
        root_point = transform[:3, :3] @ center + transform[:3, 3]
        posed[side] = shape.moved(occ_location(transform))
        checks[side] = verify_insertion(posed[side], p, root_axis, fixed)
        hashes[p.filename] = sha256(file)
        observed[side] = {
            "artifactId": p.artifact_id, "step": p.filename, "geometryRole": "BALL_STUD_ONLY",
            "partInstanceId": None, "candidateAssembly": candidate,
            "seat": {"knucklePartInstanceId": KNUCKLE, "c02DatumId": datum["datumId"],
                     "rootFromStudCad": clean(transform), "stemAxisLocal": clean(step_axis),
                     "insertionDirectionLocal": clean(-step_axis), "insertionDirectionRoot": clean(-root_axis)},
            "fit": {"type": "SAME_TAPER_CLEARANCE_WITH_PLANAR_STOP",
                    "radialGapAtMouthMm": round(gaps[0], 10), "radialGapAtTipMm": round(gaps[1], 10),
                    "stemEngagementMm": round(p.stem_depth, 10), "tipAxialAllowanceMm": p.tip_allowance},
            "ballCenter": {"localMm": clean(center), "workholdingMm": clean(root_point),
                           "workholdingYUpM": clean(world_basis @ root_point * 0.001)},
        }
    mutual_overlap = common_volume(posed["upper"], posed["lower"])
    require(mutual_overlap <= CLASH_MM3, "Seated ball studs interfere")
    span = np.array(observed["upper"]["ballCenter"]["workholdingMm"]) - observed["lower"]["ballCenter"]["workholdingMm"]
    spindle = datums["frames"]["spindle"]["outboardDirection"]
    manifest = {
        "schemaVersion": SCHEMA, "packageId": package_id(config, sources), "sourceGrade": GRADE,
        "effectiveParameters": config, "sources": sources, "sha256": hashes,
        "frames": {"workholding": datums["frames"]["workholding"],
                   "matrixConvention": datums["frames"]["matrixConvention"],
                   "workholdingYUpM": {"axisConversion": clean(world_basis), "positionScale": 0.001,
                                       "vehicleFromWorkholding": None, "unit": "m"}},
        "studs": observed,
        "motionInput": {
            "status": "CAD_INPUTS_FOR_NEW_DEMO_FIXTURE", "playbackAllowed": False,
            "existingR28Registration": "REGISTRATION_BLOCKED", "wheelMountFaceToWheelCenter": None,
            "outerTieRodInterface": None, "ballSpanProjectionOnSpindleMm": round(float(span @ spindle), 10),
        },
    }
    validation = {"status": "PASS", "independentStepSolids": len(profiles), "clashToleranceMm3": CLASH_MM3,
                  "insertionAndSeat": checks, "seatedStudPairOverlapMm3": round(mutual_overlap, 10)}
    return manifest, validation


def verify(folder, inputs):
    manifest = read_json(folder / "manifest.json")
    names = {f"{side}-ball-stud.step" for side in CANDIDATES}
    require(set(manifest["sha256"]) == names and all(sha256(folder / name) == manifest["sha256"][name] for name in names),
            "C-03 STEP hash drift")
    rebuilt, validation = assess(folder, manifest["effectiveParameters"], inputs)
    require(rebuilt == manifest, "Stored C-03 manifest differs from STEP recomputation")
    require(read_json(folder / "validation.json") == validation, "Stored C-03 validation differs from recomputation")
    return manifest, validation


def build(config, output, inputs):
    datums, base, joint_inputs, _ = inputs
    profiles = plans(config, base, joint_inputs)
    output = output.resolve()
    destination = output / package_id(config, source_metadata(datums, base))
    if destination.exists():
        return destination, verify(destination, inputs)[1]
    output.mkdir(parents=True, exist_ok=True)
    with publish_stage(output) as stage:
        for p in profiles.values():
            step_write(make_solid(p), stage / p.filename)
        manifest, validation = assess(stage, config, inputs)
        write_json(stage / "manifest.json", manifest)
        write_json(stage / "validation.json", validation)
        try:
            stage.rename(destination)
        except OSError:
            if not destination.is_dir():
                raise
            validation = verify(destination, inputs)[1]
    return destination, validation


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    cmds = parser.add_subparsers(dest="command", required=True)
    creation = cmds.add_parser("build")
    creation.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    creation.add_argument("--out", type=Path, default=OUTPUT)
    validation = cmds.add_parser("verify")
    validation.add_argument("package", type=Path)
    args = parser.parse_args()
    inputs = checked_input()
    if args.command == "build":
        folder, report = build(read_json(args.config), args.out, inputs)
    else:
        folder = args.package.resolve()
        _, report = verify(folder, inputs)
    print(json.dumps({"package": str(folder), **report}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as exc:
        sys.exit(f"C-03 ball stud validation failed: {exc}")
