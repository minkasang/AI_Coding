"""Exercise C-07 STEP datum extraction, a span change, and failing input cases."""

from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from build_pivot_locators import C06_PACKAGE, DEFAULT_CONFIG, OUTPUT, build, load_inputs, read_json, verify, write_json
from pivot_locator import near, require, step_name


def rejects(operation, reason):
    try:
        operation()
    except ValueError as exc:
        require(reason in str(exc), f"Unexpected rejection: {exc}")
    else:
        raise ValueError(f"Expected rejection: {reason}")


def main():
    inputs = load_inputs()
    config = read_json(DEFAULT_CONFIG)
    base_dir, built = build(config, OUTPUT, inputs)
    base, proof = verify(base_dir, inputs)
    require(built == proof and proof["sameSourceFixedSolids"] == 15, "Independent C-07 geometry check drift")
    upper, lower = (base["locators"][side] for side in ("upper", "lower"))
    cases = ["independent-build-and-step-verification"]
    for row, front_mm, rear_mm, front_m, span_mm, radius in (
        (upper, [-216, -60.8057319907, 115.1355414407], [-216, 60.8057319907, 124.8644585593],
         [-0.216, 0.1151355414, 0.060805732], 122, 195.4488088578),
        (lower, [-251, -78.9014347714, -96.0549282614], [-251, 78.9014347714, -103.9450717386],
         [-0.251, -0.0960549283, 0.0789014348], 158, 231.622295517),
    ):
        front, rear = (row["supports"][end] for end in ("front", "rear"))
        require(near(front["workholdingMm"], front_mm) and near(rear["workholdingMm"], rear_mm)
                and near(front["workholdingYUpM"], front_m) and near(row["axis"]["supportSpanM"], span_mm / 1000)
                and near(row["sameSourceOuterBall"]["radialDistanceToPivotAxisMm"], radius),
                "Independent axis, span conversion or outer-ball radius mismatch")
    require(proof["basisDeterminant"] == 1 and near(proof["axisAngleDegrees"], 7.436326486)
            and near(proof["shortestAxisDistanceMm"], 35), "Axis handedness or independence drift")
    require(near(base["motionInput"]["steeringNeutral"]["nominalCenterDistanceM"], 0.262)
            and base["motionInput"]["playbackAllowed"] is False, "C-06 neutral or static scope drift")
    cases.extend(["coaxial-step-support-pairs-and-independent-coordinates", "handedness-and-axis-independence",
                  "c06-neutral-and-static-scope"])

    with TemporaryDirectory(prefix=".c07-regression-", dir=OUTPUT) as scratch:
        temp = Path(scratch)
        changed = deepcopy(config)
        changed["upper"]["supportSpanMm"] = 136
        variant_dir, built_variant = build(changed, temp / "variant", inputs)
        variant, variant_proof = verify(variant_dir, inputs)
        u = variant["locators"]["upper"]
        require(variant_proof == built_variant and u["axis"]["supportSpanMm"] == 136
                and u["sameSourceOuterBall"] == upper["sameSourceOuterBall"]
                and u["rootFromLocatorCad"] == upper["rootFromLocatorCad"]
                and variant["locators"]["lower"] == lower and variant["motionInput"] == base["motionInput"]
                and variant["sha256"][step_name("upper")] != base["sha256"][step_name("upper")]
                and variant["sha256"][step_name("lower")] == base["sha256"][step_name("lower")],
                "Upper-span edit altered unrelated geometry or neutral inputs")
        cases.append("single-side-span-variant")

        rejected = temp / "rejected"
        rejects(lambda: build({**config, "unit": "m"}, rejected, inputs), "Expected mm")
        bad_span = deepcopy(config)
        bad_span["upper"]["supportSpanMm"] = 5
        rejects(lambda: build(bad_span, rejected, inputs), "two separate bore support ears")
        require(not rejected.exists(), "Invalid input published output")
        cases.extend(["reject-mixed-units", "reject-fused-support-spans"])

        coincident = deepcopy(config)
        coincident["lower"].update(inboardFromOuterMm=195, rearwardFromOuterMm=8,
                                   upwardFromOuterMm=247, axisRisePer100Mm=8)
        rejects(lambda: build(coincident, rejected, inputs), "Upper/lower pivot axes coincide")
        require(not any(rejected.iterdir()), "Coincident axes published output")
        cases.append("reject-actual-coincident-axes")

        fake = temp / "new-source"
        fake.mkdir()
        write_json(fake / "manifest.json", {"packageId": C06_PACKAGE, "sourceGrade": "DEMO_ASSUMPTION"})
        rejects(lambda: load_inputs(fake), "SHA-256 mismatch: manifest.json")
        cases.append("reject-c06-same-id-wrong-digest")

        path = variant_dir / "manifest.json"
        swapped = deepcopy(variant)
        supports = swapped["locators"]["upper"]["supports"]
        supports["front"], supports["rear"] = supports["rear"], supports["front"]
        write_json(path, swapped)
        rejects(lambda: verify(variant_dir, inputs), "Stored C-07 manifest differs")
        cases.append("reject-reversed-support-order")
        write_json(path, variant)
        with (variant_dir / step_name("lower")).open("ab") as file:
            file.write(b"!")
        rejects(lambda: verify(variant_dir, inputs), "C-07 STEP hash drift")
        cases.append("reject-edited-step")

    print(json.dumps({"status": "PASS", "packageId": base["packageId"], "variantPackageId": variant["packageId"],
                      "cases": cases, "baseline": proof, "variant": variant_proof}, indent=2))


if __name__ == "__main__":
    main()
