"""Check STEP reread, parameter propagation, and C-03 rejection cases."""

import json
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from build_ball_joints import DEFAULT_CONFIG, OUTPUT, build, checked_input, read_json, verify, write_json
from ball_stud import near, require


def rejects(operation, reason):
    try:
        operation()
    except ValueError as exc:
        require(reason in str(exc), f"Unexpected rejection: {exc}")
    else:
        raise ValueError(f"Expected rejection: {reason}")


def main():
    inputs = checked_input()
    config = read_json(DEFAULT_CONFIG)
    baseline_path, build_checks = build(config, OUTPUT, inputs)
    baseline, report = verify(baseline_path, inputs)
    require(build_checks == report, "Standalone verification drift")
    for side, local, root, metre in (
        ("upper", [0, 0, 24], [-21, 9, 134], [-0.021, 0.134, -0.009]),
        ("lower", [0, 0, 27], [-21, -8, -127], [-0.021, -0.127, 0.008]),
    ):
        row = baseline["studs"][side]["ballCenter"]
        require(near(row["localMm"], local) and near(row["workholdingMm"], root)
                and near(row["workholdingYUpM"], metre), f"{side}: ball center differs from independent reference")
    cases = ["default-build", "independent-package-verification", "ball-centers-in-three-coordinate-representations"]

    with TemporaryDirectory(prefix=".c03-regression-", dir=OUTPUT) as temporary:
        temp = Path(temporary)
        variant = deepcopy(config)
        variant["upper"].update(ballCenterOffset=26, radialGap=0.12)
        variant_path, _ = build(variant, temp / "variant", inputs)
        variant_manifest = read_json(variant_path / "manifest.json")
        upper = variant_manifest["studs"]["upper"]
        require(near(upper["ballCenter"]["workholdingMm"], [-21, 9, 136])
                and near(upper["ballCenter"]["workholdingYUpM"], [-0.021, 0.136, -0.009])
                and near(upper["fit"]["radialGapAtTipMm"], 0.12), "Variant did not update STEP-based evidence")
        require(variant_manifest["sha256"]["upper-ball-stud.step"] != baseline["sha256"]["upper-ball-stud.step"]
                and variant_manifest["sha256"]["lower-ball-stud.step"] == baseline["sha256"]["lower-ball-stud.step"],
                "Changed upper stud must not alter the lower STEP")
        cases.append("adjustable-stem-clearance-and-ball-center")

        bad = deepcopy(config)
        bad["upper"]["radialGap"] = 0.001
        rejected = temp / "rejected"
        rejects(lambda: build(bad, rejected, inputs), "demo radius gap")
        bad["upper"] = deepcopy(config["upper"])
        bad["upper"]["collarDiameter"] = 19
        rejects(lambda: build(bad, rejected, inputs), "collar contact ring")
        require(not rejected.exists(), "Invalid config published a package")
        cases.extend(["reject-insufficient-radial-clearance", "reject-collar-without-stop-area"])

        manifest_path = variant_path / "manifest.json"
        changed = deepcopy(variant_manifest)
        changed["studs"]["upper"]["candidateAssembly"], changed["studs"]["lower"]["candidateAssembly"] = (
            changed["studs"]["lower"]["candidateAssembly"], changed["studs"]["upper"]["candidateAssembly"],
        )
        write_json(manifest_path, changed)
        rejects(lambda: verify(variant_path, inputs), "Stored C-03 manifest differs")
        changed = deepcopy(variant_manifest)
        changed["motionInput"]["playbackAllowed"] = True
        write_json(manifest_path, changed)
        rejects(lambda: verify(variant_path, inputs), "Stored C-03 manifest differs")
        write_json(manifest_path, variant_manifest)
        with (variant_path / "upper-ball-stud.step").open("ab") as file:
            file.write(b"!")
        rejects(lambda: verify(variant_path, inputs), "C-03 STEP hash drift")
        cases.extend(["reject-swapped-candidate-associations", "reject-premature-playback", "reject-edited-step"])

    print(json.dumps({"status": "PASS", "packageId": baseline["packageId"], "cases": cases, "validation": report}, indent=2))


if __name__ == "__main__":
    main()
