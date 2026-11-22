"""Rebuild the neutral datum at both inboard offsets and exercise release gates."""

from copy import deepcopy
import json
from math import sqrt
from pathlib import Path
from tempfile import TemporaryDirectory

from build_inner_datum import (
    DEFAULT_CONFIG, OUTER_PACKAGE, OUTPUT, PIN_STEP, build, load_inputs, read_json, verify, write_json,
)
from inner_datum import near, require


def rejects(operation, reason):
    try:
        operation()
    except ValueError as exc:
        require(reason in str(exc), f"Unexpected rejection: {exc}")
    else:
        raise ValueError(f"Expected rejection: {reason}")


def check_neutral(manifest, x, distance, inboard):
    neutral = manifest["neutral"]
    require(near(neutral["innerBallCenter"]["partLocalMm"], [0, 0, 22])
            and near(neutral["innerBallCenter"]["workholdingMm"], [x, 142, 36])
            and near(neutral["innerBallCenter"]["workholdingYUpM"], [x / 1000, 0.036, -0.142])
            and near(neutral["outerBallCenter"]["workholdingMm"], [-27, 112, 24])
            and near(neutral["outerBallCenter"]["workholdingYUpM"], [-0.027, 0.024, -0.112]),
            "Independent neutral STEP centers disagree")
    require(near(neutral["nominalCenterDistanceMm"], distance)
            and near(neutral["nominalCenterDistanceM"], distance / 1000)
            and near(neutral["innerMinusOuterWorkholdingMm"], [-inboard, 30, 12])
            and near(neutral["signedInnerFromOuterAlongOutboardAxisMm"], -inboard),
            "Nominal distance or inboard sign mismatch")
    require(near(manifest["frames"]["rootFromLocatorCad"][0][3], x - 22)
            and near(manifest["motionInput"]["wheelSignedOffset"]["mm"], 24),
            "Local fixture origin or inherited wheel offset drift")


def main():
    inputs = load_inputs()
    config = read_json(DEFAULT_CONFIG)
    folder, built = build(config, OUTPUT, inputs)
    baseline, evidence = verify(folder, inputs)
    require(built == evidence, "Independent C-06 validation drift")
    check_neutral(baseline, -287, 262, 260)
    motion = baseline["motionInput"]
    identities = motion["identities"]
    require([identities[side]["partId"] for side in ("inner", "outer")] == ["PART-20-074", "PART-20-075"]
            and identities["inner"]["status"] == "DEFERRED" and identities["outer"]["status"] == "REQUIRED_BUT_DEFERRED"
            and all(row["partInstanceId"] is None and row["snapshotInstanceCount"] == 0 for row in identities.values())
            and motion["vehicleFromWorkholding"] is None and motion["playbackAllowed"] is False,
            "Deferred parts or motion boundary drift")
    cases = ["default-build-and-independent-verify", "step-neutral-centers-signed-offset-and-units",
             "inner-outer-deferred-and-playback-boundary"]
    with TemporaryDirectory(prefix=".c06-regression-", dir=OUTPUT) as temporary:
        temp = Path(temporary)
        config_variant = deepcopy(config)
        config_variant["neutralOffset"]["inboardMm"] = 280
        alternate_folder, _ = build(config_variant, temp / "variant", inputs)
        alternate, alternate_checks = verify(alternate_folder, inputs)
        check_neutral(alternate, -307, sqrt(79444), 280)
        require(alternate["sha256"] == baseline["sha256"] and alternate["sources"] == baseline["sources"]
                and alternate["motionInput"] == motion
                and alternate["neutral"]["outerBallCenter"] == baseline["neutral"]["outerBallCenter"],
                "Placement variant changed local geometry or unrelated source reference")
        cases.append("twenty-millimetre-inboard-placement-variant")

        rejected = temp / "rejected"
        rejects(lambda: build({**config, "unit": "m"}, rejected, inputs), "Expected mm")
        rejects(lambda: build({**config, "corner": "FR"}, rejected, inputs), "approved C-05 FL outer end")
        backwards = deepcopy(config)
        backwards["neutralOffset"]["inboardMm"] = -30
        rejects(lambda: build(backwards, rejected, inputs), "positive inboard displacement")
        require(not rejected.exists(), "Invalid config published an output")
        cases.extend(["reject-mixed-unit-config", "reject-wrong-corner-pair", "reject-wrong-inboard-sign"])

        fake = temp / "different-source"
        fake.mkdir()
        write_json(fake / "manifest.json", {"packageId": OUTER_PACKAGE, "sourceGrade": "DEMO_ASSUMPTION"})
        rejects(lambda: load_inputs(fake), "SHA-256 mismatch: manifest.json")
        cases.append("reject-same-id-different-c05-manifest")

        path = alternate_folder / "manifest.json"
        substituted = deepcopy(alternate)
        substituted["neutral"]["outerBallCenter"] = deepcopy(substituted["neutral"]["innerBallCenter"])
        write_json(path, substituted)
        rejects(lambda: verify(alternate_folder, inputs), "Stored C-06 manifest differs")
        cases.append("reject-substituted-outer-end")
        premature = deepcopy(alternate)
        premature["motionInput"]["playbackAllowed"] = True
        write_json(path, premature)
        rejects(lambda: verify(alternate_folder, inputs), "Stored C-06 manifest differs")
        cases.append("reject-premature-playback")
        write_json(path, alternate)
        with (alternate_folder / PIN_STEP).open("ab") as file:
            file.write(b"!")
        rejects(lambda: verify(alternate_folder, inputs), "C-06 STEP hash drift")
        cases.append("reject-edited-step")

    print(json.dumps({"status": "PASS", "packageId": baseline["packageId"], "variantPackageId": alternate["packageId"],
                      "cases": cases, "default": evidence, "variant": alternate_checks}, indent=2))


if __name__ == "__main__":
    main()
