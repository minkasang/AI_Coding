"""Exercise the normal CLI and the regression cases without retaining extra assets."""

from argparse import ArgumentParser
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from unittest.mock import patch

import numpy as np
from build123d import Location

import assembly
from assembly import HERE, load_assembly, read_json, solve
from model import require
from pipeline import DEFAULT_BLENDER, DEFAULT_CONFIG, OUTPUT, verify_package, write_json
from verify import check_clashes, check_pose_geometry, step_read


def run_cli(args, expected_error=None):
    result = subprocess.run([sys.executable, str(HERE / "pipeline.py"), *map(str, args)], cwd=HERE,
                            capture_output=True, encoding="utf-8", errors="replace", timeout=180)
    if expected_error:
        require(result.returncode != 0 and expected_error in result.stderr,
                f"Expected rejection {expected_error!r}: {result.stdout}\n{result.stderr}")
    else:
        require(result.returncode == 0, f"C-01 CLI failed: {result.stdout}\n{result.stderr}")
    return result.stdout


def check_variant(base, variant):
    def parts(manifest):
        return manifest["partDefinitions"]

    def poses(manifest):
        return {row["partInstanceId"]: np.array(row["rootFromPartCad"]) for row in manifest["instances"]}

    for part_id in ("PART-20-016", "PART-30-001", "PART-30-002", "PART-30-006"):
        require(variant["sha256"][parts(variant)[part_id]["step"]] != base["sha256"][parts(base)[part_id]["step"]],
                f"{part_id}: changed dimensions did not propagate to STEP")
    require(variant["sha256"][variant["assets"]["glb"]] != base["sha256"][base["assets"]["glb"]],
            "Variant GLB was not regenerated")
    require(base["snapshotBinding"] == variant["snapshotBinding"], "Variant changed its snapshot binding")
    base_poses, variant_poses = poses(base), poses(variant)
    require(base_poses.keys() == variant_poses.keys(), "Variant changed its canonical instances")
    for instance in base_poses:
        if instance.startswith("PI-30-009-FL-"):
            delta = variant_poses[instance][:3, 3] - base_poses[instance][:3, 3]
            require(np.isclose(delta[0], 3) and np.isclose(np.linalg.norm(delta[1:]), 3),
                    f"{instance}: standoff and PCD must drive stud placement")
    upper = "upperBallJointSeat"
    before, after = (np.array(parts(manifest)["PART-20-016"]["mounts"][upper]["partFromMountCad"])
                     for manifest in (base, variant))
    require(np.isclose(after[1, 3] - before[1, 3], 8) and np.isclose(after[2, 3] - before[2, 3], -2),
            "Upper ball-joint datum did not follow ear offset and bearing width")


def expect_value_error(callback, message):
    try:
        callback()
    except ValueError as exc:
        require(message in str(exc), f"Unexpected error: {exc}")
    else:
        raise ValueError(f"Expected rejection: {message}")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--blender", type=Path, default=DEFAULT_BLENDER)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    common = ["--blender", args.blender, "--node", args.node]
    base = json.loads(run_cli(["build", *common]))
    package = Path(base["package"])
    base_manifest = read_json(package / "manifest.json")
    rerun = json.loads(run_cli(["verify", package, "--node", args.node]))
    require(rerun == read_json(package / "validation.json"), "Independent verification did not match saved evidence")
    config = read_json(DEFAULT_CONFIG)
    spec, rules, _ = load_assembly()
    cases = ["default-build", "independent-artifact-verification"]
    with TemporaryDirectory(prefix=".c01-regression-", dir=OUTPUT) as temporary:
        scratch = Path(temporary)
        independent = scratch / "local-hub.step"
        run_cli(["part", "PART-30-006", "--out", independent])
        local = step_read(independent)
        require(local.label == "PART-30-006", "Standalone STEP label mismatch")
        check_pose_geometry(step_read(package / "parts" / "PART-30-006.step"), local, "standalone hub")
        cases.append("independent-part-generation")

        variant_config = deepcopy(config)
        variant_config["bearing"].update(width=46, bore=48)
        variant_config["hub"].update(lugPCD=122, standOff=11)
        variant_config["knuckle"]["upper"]["offsetY"] += 8
        variant_path = scratch / "variant.json"
        write_json(variant_path, variant_config)
        out = scratch / "variant-output"
        variant = json.loads(run_cli(["build", "--config", variant_path, "--out", out, *common]))
        variant_package = Path(variant["package"])
        check_variant(base_manifest, read_json(variant_package / "manifest.json"))
        cases.append("bearing-width-bore-pcd-axial-and-arm-frame-propagation")

        bad_config = deepcopy(config)
        bad_config["hub"]["lugPCD"] = 146
        bad_path = scratch / "bad.json"
        write_json(bad_path, bad_config)
        rejected = scratch / "rejected"
        run_cli(["build", "--config", bad_path, "--out", rejected, *common], "lug PCD runs outside flange rim")
        bad_config["hub"]["lugPCD"] = config["hub"]["lugPCD"]
        bad_config["hub"]["journalRadialGap"] = -0.01
        write_json(bad_path, bad_config)
        run_cli(["build", "--config", bad_path, "--out", rejected, *common], "journalRadialGap")
        require(not rejected.exists(), "Invalid parameters published an output")
        cases.extend(["reject-impossible-pcd", "reject-negative-clearance"])

        with (variant_package / "wheel-end.glb").open("ab") as file:
            file.write(b"!")
        expect_value_error(lambda: verify_package(variant_package, args.node), "Asset hash mismatch: wheel-end.glb")
        cases.append("reject-tampered-glb")

    _, _, posed, _ = solve(spec, rules, config)
    # Translate the stud along root +X so its head enters the flange.
    posed["PI-30-009-FL-01"] = posed["PI-30-009-FL-01"].moved(Location((2, 0, 0)))
    expect_value_error(lambda: check_clashes(posed), "CAD clash")
    cases.append("reject-injected-solid-interference")

    index = spec["snapshot"]["consumerIndex"]
    original_read_json = assembly.read_json

    def read_stale_index(path):
        data = original_read_json(path)
        return {**data, "snapshotSha256": "0" * 64} if path == assembly.REPO / index else data

    with patch.object(assembly, "read_json", side_effect=read_stale_index):
        expect_value_error(load_assembly, "snapshot ID, revision or SHA-256 mismatch")
    cases.append("reject-stale-snapshot-binding")
    print(json.dumps({"status": "PASS", "cases": cases, "default": rerun,
                      "variant": {key: value for key, value in variant.items() if key != "package"}}, indent=2))


if __name__ == "__main__":
    main()
