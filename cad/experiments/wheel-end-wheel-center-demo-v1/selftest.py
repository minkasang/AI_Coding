"""Test both offset signs, inheritance, and C-04 publication gates."""

from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from build_wheel_center import DEFAULT_CONFIG, OUTPUT, STEP_NAME, build, load_inputs, read_json, verify, write_json
from rim import near, require


def rejects(operation, reason):
    try:
        operation()
    except ValueError as exc:
        require(reason in str(exc), f"Unexpected rejection: {exc}")
    else:
        raise ValueError(f"Expected rejection: {reason}")


def check_case(manifest, evidence, offset, x_mm, local_section_z):
    require(near(manifest["wheelCenter"]["localMm"], [0, 0, -offset])
            and near(manifest["wheelCenter"]["workholdingMm"], [x_mm, 0, 0])
            and near(manifest["wheelCenter"]["workholdingYUpM"], [x_mm / 1000, 0, 0])
            and near(manifest["hubMountingFace"]["workholdingMm"], [21, 0, 0]),
            "Independent center and mounting plane expectations differ")
    sections = manifest["referenceSections"]
    require(near([sections[side]["localMm"][2] for side in ("inboard", "outboard")], local_section_z)
            and near(sections["separationMm"], 140), "STEP reference sections do not follow the signed shift")
    require(near(manifest["signedOffset"]["mm"], offset) and near(manifest["signedOffset"]["m"], offset / 1000),
            "Signed offset or unit conversion differs")
    require(evidence["frameChecks"] == {"rootFromRimDeterminant": 1.0, "workholdingToYUpDeterminant": 1.0,
                                      "millimetresToMetres": 0.001}, "Unexpected handedness")


def main():
    inputs = load_inputs()
    config = read_json(DEFAULT_CONFIG)
    baseline_path, observed = build(config, OUTPUT, inputs)
    baseline, evidence = verify(baseline_path, inputs)
    require(observed == evidence, "Standalone verification drift")
    check_case(baseline, evidence, 24, -3, [-94, 46])
    balls = baseline["motionInput"]["ballCentersFromC03"]
    require(balls["upper"]["workholdingYUpM"] == [-0.021, 0.134, -0.009]
            and balls["lower"]["workholdingYUpM"] == [-0.021, -0.127, 0.008]
            and baseline["motionInput"]["outerTieRodInterface"] is None
            and baseline["motionInput"]["vehicleFromWorkholding"] is None
            and baseline["motionInput"]["playbackAllowed"] is False, "C-03 inheritance or motion scope drift")
    cases = ["baseline-build-and-verify", "positive-offset-millimetres-to-metres",
             "unchanged-c03-ball-centers-and-motion-boundary"]
    with TemporaryDirectory(prefix=".c04-regression-", dir=OUTPUT) as temporary:
        temp = Path(temporary)
        different_snapshot = temp / "snapshot.json"
        write_json(different_snapshot, {key: baseline["sources"]["snapshot"][key] for key in ("snapshotId", "revision")})
        rejects(lambda: load_inputs(different_snapshot), "Approved R-27 snapshot SHA-256 mismatch")
        cases.append("reject-same-id-and-revision-with-different-snapshot-bytes")
        variant = {**config, "nominalOffsetMm": -8}
        variant_path, variant_evidence = build(variant, temp / "variant", inputs)
        alternate, observed_variant = verify(variant_path, inputs)
        require(observed_variant == variant_evidence and alternate["sha256"] != baseline["sha256"],
                "Offset variant did not alter STEP or independently verify")
        check_case(alternate, observed_variant, -8, 29, [-62, 78])
        require(alternate["motionInput"]["ballCentersFromC03"] == balls, "Rim variant changed C-03 ball centers")
        cases.append("negative-offset-variant-actual-step")

        rejects(lambda: build({**config, "nominalOffsetMm": 100}, temp / "invalid", inputs), "outside the barrel")
        require(not (temp / "invalid").exists(), "Invalid rim was published")
        cases.append("reject-offset-outside-barrel")

        manifest_path = variant_path / "manifest.json"
        for case, change in (
            ("reject-inverted-offset", lambda m: m["signedOffset"].update(mm=8, m=0.008)),
            ("reject-mirrored-frame", lambda m: m["frames"]["rootFromRimCad"][0].__setitem__(2, -1)),
            ("reject-premature-playback", lambda m: m["motionInput"].update(playbackAllowed=True)),
        ):
            tampered = deepcopy(alternate)
            change(tampered)
            write_json(manifest_path, tampered)
            rejects(lambda: verify(variant_path, inputs), "Stored C-04 manifest differs")
            cases.append(case)
        write_json(manifest_path, alternate)
        with (variant_path / STEP_NAME).open("ab") as file:
            file.write(b"!")
        rejects(lambda: verify(variant_path, inputs), "Rim STEP hash drift")
        cases.append("reject-edited-step")

    print(json.dumps({"status": "PASS", "baselinePackageId": baseline["packageId"], "variantPackageId": alternate["packageId"],
                      "cases": cases, "baseline": evidence, "variant": observed_variant}, indent=2))


if __name__ == "__main__":
    main()
