"""Generate and verify a complete C-01 wheel-end asset package."""

import argparse
from contextlib import contextmanager
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from uuid import uuid4

import numpy as np
from build123d import Unit, export_step, export_stl

from assembly import HERE, load_assembly, read_json, sha256, solve
from model import GRADE, make_part, matrix, require, validate_parameters
from verify import bounds, check_clashes, check_insertion, check_radial_fits, check_step, check_taper_seats

DEFAULT_BLENDER = Path("F:/software/blender/blender.exe") if os.name == "nt" else Path("blender")
OUTPUT = HERE / "out"
DEFAULT_CONFIG = HERE / "parameters.json"
SOURCE_FILES = ("model.py", "assembly.py", "assembly.json", "pipeline.py", "verify.py", "blender_export.py", "check-glb.mjs")
SCHEMA = "carlab.c01WheelEndAsset/1"
STEP_TIMESTAMP = "2000-01-01T00:00:00"  # constant metadata for reproducible STEP exchange files


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def write_json(path, value):
    path.write_bytes(encode(value))


def run(command, env=None):
    result = subprocess.run(command, cwd=HERE, capture_output=True, encoding="utf-8", errors="replace",
                            env=env, timeout=180)
    if result.returncode:
        raise RuntimeError(f"{command[0]} exited {result.returncode}\n{result.stdout}\n{result.stderr}")
    return result.stdout


def safe_blender_env(scratch):
    return {
        **os.environ,
        "TMP": str(scratch), "TEMP": str(scratch), "TMPDIR": str(scratch),
        "BLENDER_USER_CONFIG": str(scratch / "blender-config"),
        "BLENDER_USER_SCRIPTS": str(scratch / "blender-scripts"),
        "BLENDER_USER_DATAFILES": str(scratch / "blender-datafiles"),
    }


@contextmanager
def publish_stage(output):
    # Python 3.13's TemporaryDirectory is owner-only on Windows. Create the
    # publishable tree directly beneath output so it inherits the server's ACL.
    stage = output / f".c01-package-{uuid4().hex}"
    stage.mkdir()
    try:
        yield stage
    finally:
        if stage.exists():
            require(stage.resolve().parent == output, "Refusing to remove staging directory outside output")
            shutil.rmtree(stage)


def build_identity(parameters, binding, versions):
    fingerprint = {
        "schema": SCHEMA, "parameters": parameters, "snapshot": binding, "toolchain": versions,
        "sources": {name: sha256(HERE / name) for name in SOURCE_FILES},
    }
    return "c01-" + hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest()[:20]


def step_write(solid, path):
    export_step(solid, path, unit=Unit.MM, timestamp=STEP_TIMESTAMP)


def get_inputs(config_path):
    spec, rules, binding = load_assembly()
    parameters = read_json(config_path)
    count = len(spec["repeatedPlacement"]["partInstanceIds"])
    validate_parameters(parameters, read_json(DEFAULT_CONFIG), count)
    return spec, rules, binding, parameters, count


def part_metadata(part_id, part):
    return {
        "description": part.description,
        "step": f"parts/{part_id}.step",
        "material": {"sourceGrade": GRADE, "assumption": part.material, "densityKgM3": None},
        "massKg": None,
        "displayColor": part.color,
        "boundsMm": bounds(part.solid),
        "volumeMm3": part.solid.volume,
        "mounts": {name: {"partFromMountCad": matrix(location), "sourceGrade": GRADE}
                   for name, location in part.mounts.items()},
    }


def create_manifest(package_id, spec, parts, instances, posed, binding, parameters, versions):
    return {
        "schemaVersion": SCHEMA,
        "packageId": package_id,
        "sourceGrade": GRADE,
        "parameters": parameters,
        "toolchain": versions,
        "snapshotBinding": binding,
        "basis": {
            "cadUnit": "mm", "cadUp": "+Z", "glbUnit": "m", "glbUp": "+Y",
            "cadToGlbScale": 0.001, "cadToGlbAxes": ["+X", "+Z", "-Y"],
            "matrixConvention": "row-major arrays acting on column vectors",
        },
        "root": {
            "frameId": spec["root"]["frameId"], "description": spec["root"]["description"],
            "vehiclePlacement": None, "motionBinding": None,
        },
        "assets": {"step": "wheel-end.step", "glb": "wheel-end.glb"},
        "partDefinitions": {part_id: part_metadata(part_id, part) for part_id, part in parts.items()},
        "instances": [{**row, "rootBoundsMm": bounds(posed[row["partInstanceId"]])} for row in instances],
        "externalMounts": [
            {"partInstanceId": "PI-20-016-FL", "mount": "upperBallJointSeat",
             "mateCandidatePartInstanceId": "PI-20-003-FL", "status": "COUNTERPART_NOT_MODELED"},
            {"partInstanceId": "PI-20-016-FL", "mount": "lowerBallJointSeat",
             "mateCandidatePartInstanceId": "PI-20-010-FL", "status": "COUNTERPART_NOT_MODELED"},
        ],
    }


def check_files(package, manifest):
    require(manifest["schemaVersion"] == SCHEMA and manifest["sourceGrade"] == GRADE, "Invalid asset schema or source grade")
    paths = set(manifest["assets"].values()) | {row["step"] for row in manifest["partDefinitions"].values()}
    require(set(manifest["sha256"]) == paths, "Manifest file/hash set mismatch")
    root = package.resolve()
    for relative, digest in manifest["sha256"].items():
        path = (root / relative).resolve()
        require(path.is_relative_to(root) and sha256(path) == digest, f"Asset hash mismatch: {relative}")


def verify_package(package, node):
    manifest = read_json(package / "manifest.json")
    check_files(package, manifest)
    spec, rules, binding = load_assembly()
    config = manifest["parameters"]
    count = len(spec["repeatedPlacement"]["partInstanceIds"])
    validate_parameters(config, read_json(DEFAULT_CONFIG), count)
    require(manifest["packageId"] == build_identity(config, binding, manifest["toolchain"]),
            "Package fingerprint differs from current source, configuration, or snapshot")
    parts, instances, posed, _ = solve(spec, rules, config)
    expected = create_manifest(manifest["packageId"], spec, parts, instances, posed, binding, config, manifest["toolchain"])
    expected_instances = expected.pop("instances")
    actual_instances = manifest["instances"]
    require(len(expected_instances) == len(actual_instances), "Manifest instance count drift")
    for expected_row, actual_row in zip(expected_instances, actual_instances, strict=True):
        require(np.allclose(expected_row["rootBoundsMm"], actual_row["rootBoundsMm"], rtol=0, atol=1e-6),
                "Manifest posed bounds drift")
        require({k: v for k, v in expected_row.items() if k != "rootBoundsMm"}
                == {k: v for k, v in actual_row.items() if k != "rootBoundsMm"}, "Manifest identity or solved mate drift")
    require(json.loads(encode(expected)) == {k: v for k, v in manifest.items() if k not in ("instances", "sha256")},
            "Manifest metadata drift")
    return {
        "status": "PASS", "packageId": manifest["packageId"],
        "radialClearancesMm": check_radial_fits(parts, config),
        "ballJointSeats": check_taper_seats(parts["PART-20-016"], config),
        "axialStudHeadToCarrierFaceMm": config["hub"]["standOff"] - config["stud"]["headThickness"],
        "interference": check_clashes(posed),
        "sampledAssembly": check_insertion(posed, config, spec["root"]["zAxis"]),
        "step": check_step(package, manifest),
        "glb": json.loads(run([node, str(HERE / "check-glb.mjs"), str(package / "manifest.json")])),
    }


def build_package(config, output, blender, node):
    spec, rules, binding, parameters, _ = get_inputs(config)
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".c01-stage-", dir=output) as temporary, publish_stage(output) as package:
        scratch = Path(temporary)
        env = safe_blender_env(scratch)
        versions = {
            "python": sys.version.split()[0],
            "build123d": importlib.metadata.version("build123d"),
            "blender": run([str(blender), "--version"], env=env).splitlines()[0],
        }
        package_id = build_identity(parameters, binding, versions)
        destination = output / package_id
        if destination.exists():
            return destination, verify_package(destination, node)
        local_meshes = scratch / "mesh-source"
        local_meshes.mkdir()
        (package / "parts").mkdir(parents=True)
        parts, instances, posed, compound = solve(spec, rules, parameters)
        manifest = create_manifest(package_id, spec, parts, instances, posed, binding, parameters, versions)
        check_clashes(posed)
        for part_id, part in parts.items():
            part.solid.label = part_id
            step_write(part.solid, package / manifest["partDefinitions"][part_id]["step"])
            require(export_stl(part.solid, local_meshes / f"{part_id}.stl", tolerance=0.055, angular_tolerance=0.16),
                    f"STL tessellation failed for {part_id}")
        step_write(compound, package / manifest["assets"]["step"])
        manifest_path = package / "manifest.json"
        write_json(manifest_path, manifest)
        run([str(blender), "--background", "--factory-startup", "--python-exit-code", "1",
             "--python", str(HERE / "blender_export.py"), "--", str(manifest_path), str(local_meshes)], env=env)
        paths = list(manifest["assets"].values()) + [row["step"] for row in manifest["partDefinitions"].values()]
        manifest["sha256"] = {path: sha256(package / path) for path in paths}
        write_json(manifest_path, manifest)
        report = verify_package(package, node)
        write_json(package / "validation.json", report)
        try:
            package.rename(destination)
        except OSError:
            if not destination.is_dir():
                raise
            report = verify_package(destination, node)
        return destination, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build", help="generate, validate, and atomically publish the complete package")
    build.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    build.add_argument("--out", type=Path, default=OUTPUT)
    build.add_argument("--blender", type=Path, default=DEFAULT_BLENDER)
    build.add_argument("--node", default="node")
    verify = sub.add_parser("verify", help="rebuild geometry and validate a package already on disk")
    verify.add_argument("package", type=Path)
    verify.add_argument("--node", default="node")
    part = sub.add_parser("part", help="regenerate a single definition in its local frame")
    part.add_argument("part_id")
    part.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    part.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "build":
        destination, report = build_package(args.config, args.out, args.blender, args.node)
        print(json.dumps({"package": str(destination), **report}, indent=2))
    elif args.command == "verify":
        print(encode(verify_package(args.package.resolve(), args.node)).decode(), end="")
    else:
        _, _, _, config, count = get_inputs(args.config)
        shape = make_part(args.part_id, config, count).solid
        shape.label = args.part_id
        args.out.parent.mkdir(parents=True, exist_ok=True)
        step_write(shape, args.out)
        print(args.out.resolve())


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, KeyError, subprocess.TimeoutExpired) as exc:
        sys.exit(f"C-01 validation failed: {exc}")
