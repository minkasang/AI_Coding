"""Rebuild both reaches and test geometry, identity and release rejections."""

from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from build_steering import ARM_STEP, DEFAULT_CONFIG, OUTPUT, STUD_STEP, build, load_inputs, read_json, verify, write_json
from rim import near
from steering import require


def rejects(operation, reason):
    try:
        operation()
    except ValueError as exc:
        require(reason in str(exc), f"Unexpected rejection: {exc}")
    else:
        raise ValueError(f"Expected rejection: {reason}")


def expect_center(manifest, reach):
    ball = manifest["outerBallCenter"]
    require(near(ball["studLocalMm"], [0, 0, 20])
            and near(ball["knuckleLocalMm"], [reach, 24, -27])
            and near(ball["workholdingMm"], [-27, reach, 24])
            and near(ball["workholdingYUpM"], [-0.027, 0.024, -reach / 1000]),
            "Independent steering outer ball center mismatch")


def main():
    inputs = load_inputs()
    config = read_json(DEFAULT_CONFIG)
    baseline_folder, built = build(config, OUTPUT, inputs)
    baseline, verified = verify(baseline_folder, inputs)
    require(built == verified, "C-05 independent verification drift")
    expect_center(baseline, 112)
    motion = baseline["motionInput"]
    require(motion["outerTieRodEndIdentity"]["partId"] == "PART-20-075"
            and motion["outerTieRodEndIdentity"]["partInstanceId"] is None
            and motion["outerTieRodEndIdentity"]["status"] == "REQUIRED_BUT_DEFERRED"
            and motion["innerTieRodInterface"] is None and motion["playbackAllowed"] is False,
            "R-27 outer end or playback scope drift")
    cases = ["independent-step-build-and-verify", "outer-ball-center-in-four-coordinate-representations",
             "deferred-identity-and-playback-boundary"]

    with TemporaryDirectory(prefix=".c05-regression-", dir=OUTPUT) as temp:
        scratch = Path(temp)
        variant_config = deepcopy(config)
        variant_config["arm"]["reachMm"] = 124
        variant_folder, _ = build(variant_config, scratch / "variant", inputs)
        variant, variant_checks = verify(variant_folder, inputs)
        expect_center(variant, 124)
        require(variant["motionInput"] == motion and variant["frames"] == baseline["frames"]
                and variant["fit"] == baseline["fit"] and variant["sources"] == baseline["sources"],
                "Reach variant changed unchanged wheel, ball, parent frame, source or fit")
        require(variant["sha256"][ARM_STEP] != baseline["sha256"][ARM_STEP]
                and variant["sha256"][STUD_STEP] == baseline["sha256"][STUD_STEP],
                "Reach variant must change the knuckle derivative and leave the local stud geometry intact")
        cases.append("reach-variant-propagates-only-related-geometry-and-datum")

        bad_taper = deepcopy(config)
        bad_taper["arm"]["smallDiameterMm"] = 17
        invalid = scratch / "invalid"
        rejects(lambda: build(bad_taper, invalid, inputs), "taper diameter is invalid")
        require(not invalid.exists(), "Invalid arm preflight published an output")
        cases.append("reject-reversed-taper")
        detached = deepcopy(config)
        detached["arm"]["webAttachXMm"] = 75
        rejects(lambda: build(detached, invalid, inputs), "Expected one valid positive-volume B-rep solid")
        require(not any(invalid.iterdir()), "Disconnected steering arm published")
        cases.append("reject-disconnected-arm")

        path = variant_folder / "manifest.json"
        injected = deepcopy(variant)
        injected["motionInput"]["outerTieRodEndIdentity"]["partInstanceId"] = "PI-20-075-FL"
        write_json(path, injected)
        rejects(lambda: verify(variant_folder, inputs), "Stored C-05 manifest differs")
        cases.append("reject-invented-outer-tie-rod-instance")
        playback = deepcopy(variant)
        playback["motionInput"]["playbackAllowed"] = True
        write_json(path, playback)
        rejects(lambda: verify(variant_folder, inputs), "Stored C-05 manifest differs")
        cases.append("reject-premature-motion-playback")
        write_json(path, variant)
        with (variant_folder / STUD_STEP).open("ab") as handle:
            handle.write(b"!")
        rejects(lambda: verify(variant_folder, inputs), "C-05 STEP hash drift")
        cases.append("reject-edited-step")

    print(json.dumps({"status": "PASS", "packageId": baseline["packageId"], "variantPackageId": variant["packageId"],
                      "cases": cases, "default": verified, "variant": variant_checks}, indent=2))


if __name__ == "__main__":
    main()
