"""
CARLAB R-47 (03.49) C-05 Steering Release Lineage Verification Test Suite
Author: Gemini 3.8 Flash (gemini-3-8-flash)

Executes 24 rigorous test cases verifying:
1. Positive Full-Package-Release of authentic C-05 steering outboard package
2. Positive Metadata-Only mode
3. Negative injection testing for missing STEPs, tampered hashes, broken upstream lineage (C-01..C-04, snapshot)
4. Negative injection testing for identity violations (partInstanceId assignment, altered deferred status)
5. Negative injection testing for motion boundaries (playbackAllowed, tie rod closure)
"""

from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

# Setup paths
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]

sys.path.insert(0, str(SCRIPT_DIR))
from steering_release_lineage_checker import (
    SteeringReleaseLineageChecker,
    LineageCheckResult,
)

C05_PACKAGE_DIR = REPO_ROOT / "cad/experiments/wheel-end-steering-datum-v1/out/c05-ee1e461fecf00faa8151"
C04_PACKAGE_DIR = REPO_ROOT / "cad/experiments/wheel-end-wheel-center-demo-v1/out/c04-bae128570c76aec59353"
C03_PACKAGE_DIR = REPO_ROOT / "cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86"
C02_DATUMS_FILE = REPO_ROOT / "cad/experiments/wheel-end-datum-interface-v1/datums.json"
C01_PACKAGE_DIR = REPO_ROOT / "cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f"
SNAPSHOT_FILE = REPO_ROOT / "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json"
EVIDENCE_FILE = REPO_ROOT / "docs/planning/evidence/R-47-lineage-evidence.json"


def load_c05_manifest() -> dict:
    manifest_path = C05_PACKAGE_DIR / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"C-05 manifest not found at: {manifest_path}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def run_tests() -> int:
    print("=================================================================")
    print("CARLAB R-47 (03.49) C-05 Steering Release Lineage Verification")
    print("=================================================================\n")

    c05_manifest = load_c05_manifest()
    all_results = []
    failures = 0

    # Helper runner
    def record(name: str, res: LineageCheckResult, expect_pass: bool, expected_err: str = None):
        nonlocal failures
        is_ok = (res.passed == expect_pass)
        if expected_err and res.error_code != expected_err:
            is_ok = False

        status_str = "PASS" if is_ok else "FAIL"
        if not is_ok:
            failures += 1

        print(f"=== [{len(all_results) + 1}/24] {name} ===")
        if res.passed:
            print(f"  -> Result: passed=True, message={res.message}\n")
        else:
            print(f"  -> Result: passed=False, errorCode={res.error_code}\n")

        all_results.append({
            "testName": name,
            "status": status_str,
            "expectPass": expect_pass,
            "expectedErrorCode": expected_err,
            "actualResult": res.to_dict(),
        })

    # Test 1: Positive Baseline Full Release Mode
    res_1 = SteeringReleaseLineageChecker.evaluate(
        manifest=c05_manifest,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_FILE,
        c01_dir=C01_PACKAGE_DIR,
        c02_file=C02_DATUMS_FILE,
        c03_dir=C03_PACKAGE_DIR,
        c04_dir=C04_PACKAGE_DIR,
        metadata_only=False,
        strict_mode=True,
    )
    record("Positive: C-05 Authentic Full Release Validation", res_1, True)

    # Test 2: Positive Metadata-Only Mode
    res_2 = SteeringReleaseLineageChecker.evaluate(
        manifest=c05_manifest,
        metadata_only=True,
        strict_mode=True,
    )
    record("Positive: C-05 Metadata-Only Mode Validation", res_2, True)

    # Test 3: Negative - Missing knuckle-steering-demo.step in sha256
    bad_3 = copy.deepcopy(c05_manifest)
    del bad_3["sha256"]["knuckle-steering-demo.step"]
    res_3 = SteeringReleaseLineageChecker.evaluate(manifest=bad_3, metadata_only=True)
    record("Negative: C-05 Missing knuckle-steering-demo.step in sha256", res_3, False, "ERR_INPUT_MISSING_ASSET_HASH")

    # Test 4: Negative - Missing steering-outer-ball-stud.step in sha256
    bad_4 = copy.deepcopy(c05_manifest)
    del bad_4["sha256"]["steering-outer-ball-stud.step"]
    res_4 = SteeringReleaseLineageChecker.evaluate(manifest=bad_4, metadata_only=True)
    record("Negative: C-05 Missing steering-outer-ball-stud.step in sha256", res_4, False, "ERR_INPUT_MISSING_ASSET_HASH")

    # Test 5: Negative - Empty sha256 dictionary
    bad_5 = copy.deepcopy(c05_manifest)
    bad_5["sha256"] = {}
    res_5 = SteeringReleaseLineageChecker.evaluate(manifest=bad_5, metadata_only=True)
    record("Negative: C-05 Empty sha256 dictionary", res_5, False, "ERR_INPUT_EMPTY_ASSET_HASHES")

    # Test 6: Negative - Tampered knuckle STEP hash
    bad_6 = copy.deepcopy(c05_manifest)
    bad_6["sha256"]["knuckle-steering-demo.step"] = "0000000000000000000000000000000000000000000000000000000000000000"
    res_6 = SteeringReleaseLineageChecker.evaluate(
        manifest=bad_6,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_FILE,
        metadata_only=False,
    )
    record("Negative: C-05 Tampered knuckle-steering-demo.step hash", res_6, False, "ERR_ASSET_HASH_MISMATCH")

    # Test 7: Negative - Tampered outer ball stud STEP hash
    bad_7 = copy.deepcopy(c05_manifest)
    bad_7["sha256"]["steering-outer-ball-stud.step"] = "1111111111111111111111111111111111111111111111111111111111111111"
    res_7 = SteeringReleaseLineageChecker.evaluate(
        manifest=bad_7,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_FILE,
        metadata_only=False,
    )
    record("Negative: C-05 Tampered steering-outer-ball-stud.step hash", res_7, False, "ERR_ASSET_HASH_MISMATCH")

    # Test 8: Negative - Wrong C-01 manifest hash
    bad_8 = copy.deepcopy(c05_manifest)
    bad_8["sources"]["c01"]["manifestSha256"] = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    res_8 = SteeringReleaseLineageChecker.evaluate(
        manifest=bad_8,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_FILE,
        c01_dir=C01_PACKAGE_DIR,
        metadata_only=False,
    )
    record("Negative: C-05 Wrong C-01 manifest hash", res_8, False, "ERR_DEPENDENCY_HASH_MISMATCH")

    # Test 9: Negative - Wrong C-02 datums hash
    bad_9 = copy.deepcopy(c05_manifest)
    bad_9["sources"]["c02"]["datumsSha256"] = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    res_9 = SteeringReleaseLineageChecker.evaluate(
        manifest=bad_9,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_FILE,
        c02_file=C02_DATUMS_FILE,
        metadata_only=False,
    )
    record("Negative: C-05 Wrong C-02 datums hash", res_9, False, "ERR_DEPENDENCY_HASH_MISMATCH")

    # Test 10: Negative - Wrong C-03 manifest hash
    bad_10 = copy.deepcopy(c05_manifest)
    bad_10["sources"]["c03"]["manifestSha256"] = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    res_10 = SteeringReleaseLineageChecker.evaluate(
        manifest=bad_10,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_FILE,
        c03_dir=C03_PACKAGE_DIR,
        metadata_only=False,
    )
    record("Negative: C-05 Wrong C-03 manifest hash", res_10, False, "ERR_DEPENDENCY_HASH_MISMATCH")

    # Test 11: Negative - Wrong C-04 manifest hash
    bad_11 = copy.deepcopy(c05_manifest)
    bad_11["sources"]["c04"]["manifestSha256"] = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    res_11 = SteeringReleaseLineageChecker.evaluate(
        manifest=bad_11,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_FILE,
        c04_dir=C04_PACKAGE_DIR,
        metadata_only=False,
    )
    record("Negative: C-05 Wrong C-04 manifest hash", res_11, False, "ERR_DEPENDENCY_HASH_MISMATCH")

    # Test 12: Negative - Snapshot hash mismatch
    bad_12 = copy.deepcopy(c05_manifest)
    bad_12["sources"]["snapshot"]["snapshotSha256"] = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    res_12 = SteeringReleaseLineageChecker.evaluate(
        manifest=bad_12,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_FILE,
        metadata_only=False,
    )
    record("Negative: C-05 Snapshot hash mismatch", res_12, False, "ERR_SNAPSHOT_BINDING_MISMATCH")

    # Test 13: Negative - Omitted snapshot file
    res_13 = SteeringReleaseLineageChecker.evaluate(
        manifest=c05_manifest,
        package_dir=C05_PACKAGE_DIR,
        snapshot_file=None,
        metadata_only=False,
    )
    record("Negative: C-05 Omitted snapshot file", res_13, False, "ERR_SNAPSHOT_FILE_REQUIRED")

    # Test 14: Negative - Omitted package directory
    res_14 = SteeringReleaseLineageChecker.evaluate(
        manifest=c05_manifest,
        package_dir=None,
        snapshot_file=SNAPSHOT_FILE,
        metadata_only=False,
    )
    record("Negative: C-05 Omitted package directory", res_14, False, "ERR_PACKAGE_DIRECTORY_REQUIRED")

    # Test 15: Negative - Non-existent package directory
    res_15 = SteeringReleaseLineageChecker.evaluate(
        manifest=c05_manifest,
        package_dir=REPO_ROOT / "cad/experiments/non_existent_pkg_dir_12345",
        snapshot_file=SNAPSHOT_FILE,
        metadata_only=False,
    )
    record("Negative: C-05 Non-existent package directory", res_15, False, "ERR_PACKAGE_DIRECTORY_NOT_FOUND")

    # Test 16: Negative - False OEM upgrade claim
    bad_16 = copy.deepcopy(c05_manifest)
    bad_16["sourceGrade"] = "OEM_SPEC"
    res_16 = SteeringReleaseLineageChecker.evaluate(manifest=bad_16, metadata_only=True)
    record("Negative: C-05 False OEM upgrade claim", res_16, False, "ERR_UNVERIFIED_SOURCE_UPGRADE")

    # Test 17: Negative - False sameVehicleClaim=true
    bad_17 = copy.deepcopy(c05_manifest)
    bad_17["sources"]["snapshot"]["sameVehicleClaim"] = True
    res_17 = SteeringReleaseLineageChecker.evaluate(manifest=bad_17, metadata_only=True)
    record("Negative: C-05 False sameVehicleClaim=true", res_17, False, "ERR_UNVERIFIED_VEHICLE_CLAIM")

    # Test 18: Negative - Illegal playbackAllowed=true
    bad_18 = copy.deepcopy(c05_manifest)
    bad_18["motionInput"]["playbackAllowed"] = True
    res_18 = SteeringReleaseLineageChecker.evaluate(manifest=bad_18, metadata_only=True)
    record("Negative: C-05 Illegal playbackAllowed=true", res_18, False, "ERR_ILLEGAL_PLAYBACK_ENABLED")

    # Test 19: Negative - Illegal formal partInstanceId on derivedKnuckle
    bad_19 = copy.deepcopy(c05_manifest)
    bad_19["assets"]["derivedKnuckle"]["partInstanceId"] = "PI-20-016-STEER"
    res_19 = SteeringReleaseLineageChecker.evaluate(manifest=bad_19, metadata_only=True)
    record("Negative: C-05 Illegal partInstanceId on derivedKnuckle", res_19, False, "ERR_ILLEGAL_PART_INSTANCE_ASSIGNMENT")

    # Test 20: Negative - Illegal formal partInstanceId on outerBallStud
    bad_20 = copy.deepcopy(c05_manifest)
    bad_20["assets"]["outerBallStud"]["partInstanceId"] = "PI-20-075-FL"
    res_20 = SteeringReleaseLineageChecker.evaluate(manifest=bad_20, metadata_only=True)
    record("Negative: C-05 Illegal partInstanceId on outerBallStud", res_20, False, "ERR_ILLEGAL_PART_INSTANCE_ASSIGNMENT")

    # Test 21: Negative - Illegal status on outerTieRodEndIdentity
    bad_21 = copy.deepcopy(c05_manifest)
    bad_21["motionInput"]["outerTieRodEndIdentity"]["status"] = "INSTANTIATED"
    bad_21["motionInput"]["outerTieRodEndIdentity"]["snapshotInstanceCount"] = 2
    res_21 = SteeringReleaseLineageChecker.evaluate(manifest=bad_21, metadata_only=True)
    record("Negative: C-05 Illegal status on outerTieRodEndIdentity", res_21, False, "ERR_ILLEGAL_DEFERRED_STATUS_ALTERATION")

    # Test 22: Negative - Illegal vehicleFromWorkholding non-null
    bad_22 = copy.deepcopy(c05_manifest)
    bad_22["motionInput"]["vehicleFromWorkholding"] = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    res_22 = SteeringReleaseLineageChecker.evaluate(manifest=bad_22, metadata_only=True)
    record("Negative: C-05 Illegal vehicleFromWorkholding non-null", res_22, False, "ERR_ILLEGAL_MOTION_CLOSURE_CLAIM")

    # Test 23: Negative - Illegal innerTieRodInterface non-null
    bad_23 = copy.deepcopy(c05_manifest)
    bad_23["motionInput"]["innerTieRodInterface"] = {"innerBallCenter": [-0.287, 0.054, -0.100]}
    res_23 = SteeringReleaseLineageChecker.evaluate(manifest=bad_23, metadata_only=True)
    record("Negative: C-05 Illegal innerTieRodInterface non-null", res_23, False, "ERR_ILLEGAL_MOTION_CLOSURE_CLAIM")

    # Test 24: Negative - Illegal tieRodLengthMm non-null
    bad_24 = copy.deepcopy(c05_manifest)
    bad_24["motionInput"]["tieRodLengthMm"] = 340.0
    res_24 = SteeringReleaseLineageChecker.evaluate(manifest=bad_24, metadata_only=True)
    record("Negative: C-05 Illegal tieRodLengthMm non-null", res_24, False, "ERR_ILLEGAL_MOTION_CLOSURE_CLAIM")

    # Summary
    print("=================================================================")
    if failures == 0:
        print("ALL 24 STEERING RELEASE LINEAGE TESTS PASSED!")
    else:
        print(f"FAILED: {failures} / 24 tests failed.")
    print("=================================================================")

    # Write evidence
    evidence = {
        "taskId": "R-47",
        "displayCode": "03.49",
        "suite": "verify_steering_release_lineage.py",
        "totalTests": len(all_results),
        "passedTests": len(all_results) - failures,
        "failedTests": failures,
        "verdict": "PASS" if failures == 0 else "FAIL",
        "packageEvaluated": "c05-ee1e461fecf00faa8151",
        "schemaVersion": "carlab.c05DemoSteeringDatum/1",
        "sourceGrade": "DEMO_ASSUMPTION",
        "playbackAllowed": False,
        "testCases": all_results,
    }

    EVIDENCE_FILE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_FILE.write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Evidence written to: {EVIDENCE_FILE}")

    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(run_tests())
