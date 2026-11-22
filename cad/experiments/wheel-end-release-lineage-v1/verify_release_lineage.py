"""
CARLAB R-43 (03.45) Release Lineage & Provenance Automated Verification Suite
Task: R-43
Author: Gemini 3.8 Flash (gemini-3-8-flash)

Executes positive validation on authentic C-03 (ball studs) and C-04 (wheel center) packages
in both FULL_PACKAGE_RELEASE and METADATA_ONLY modes.
Executes 18 comprehensive negative anomaly injection tests covering missing STEPs,
tampered hashes, wrong dependency hashes (C-01, C-02, C-03), invalid playback flags,
false OEM upgrades, and missing package/snapshot paths.
Outputs structured evidence to docs/planning/evidence/R-43-lineage-evidence.json.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[2]

C01_PACKAGE_DIR = PROJECT_ROOT / "cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f"
C02_DATUMS_FILE = PROJECT_ROOT / "cad/experiments/wheel-end-datum-interface-v1/datums.json"
C03_PACKAGE_DIR = PROJECT_ROOT / "cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86"
C04_PACKAGE_DIR = PROJECT_ROOT / "cad/experiments/wheel-end-wheel-center-demo-v1/out/c04-bae128570c76aec59353"
SNAPSHOT_PATH = PROJECT_ROOT / "src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json"
EVIDENCE_OUTPUT_PATH = PROJECT_ROOT / "docs/planning/evidence/R-43-lineage-evidence.json"

sys.path.insert(0, str(HERE))
from wheel_end_lineage_checker import WheelEndLineageChecker, LineageCheckResult


def load_c03_manifest() -> Dict[str, Any]:
    p = C03_PACKAGE_DIR / "manifest.json"
    if not p.exists():
        raise FileNotFoundError(f"C-03 manifest not found at {p}")
    return json.loads(p.read_text(encoding="utf-8"))


def load_c04_manifest() -> Dict[str, Any]:
    p = C04_PACKAGE_DIR / "manifest.json"
    if not p.exists():
        raise FileNotFoundError(f"C-04 manifest not found at {p}")
    return json.loads(p.read_text(encoding="utf-8"))


# =========================================================================
# POSITIVE TESTS (1-4)
# =========================================================================
def test_positive_c03_authentic_full_release() -> Dict[str, Any]:
    print("\n=== [1/22] Positive: C-03 Authentic Full Release Validation ===")
    manifest = load_c03_manifest()

    res = WheelEndLineageChecker.evaluate(
        manifest=manifest,
        package_dir=C03_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_PATH,
        c01_dir=C01_PACKAGE_DIR,
        c02_file=C02_DATUMS_FILE,
        metadata_only=False,
    )

    print(f"  -> Result: passed={res.passed}, message={res.message}")
    assert res.passed, f"Authentic C-03 must pass full release check: {res.message}"
    assert res.package_type == "C03_BALL_STUDS"
    assert res.summary["verificationMode"] == "FULL_PACKAGE_RELEASE"
    assert res.summary["verifiedFilesCount"] == 2
    assert res.summary["playbackAllowed"] is False

    return {
        "testName": "POSITIVE_C03_AUTHENTIC_FULL_RELEASE",
        "packageType": "C03_BALL_STUDS",
        "description": "Authentic C-03 ball studs package verified cleanly with 2 STEP assets, snapshot binding, and C-01/C-02 dependency hashes.",
        "passed": True,
        "result": res.to_dict(),
    }


def test_positive_c03_metadata_only() -> Dict[str, Any]:
    print("\n=== [2/22] Positive: C-03 Metadata-Only Mode Validation ===")
    manifest = load_c03_manifest()

    res = WheelEndLineageChecker.evaluate(
        manifest=manifest,
        metadata_only=True,
    )

    print(f"  -> Result: passed={res.passed}, message={res.message}")
    assert res.passed, f"C-03 metadata-only must pass: {res.message}"
    assert res.package_type == "C03_BALL_STUDS"
    assert res.summary["verificationMode"] == "METADATA_ONLY"
    assert res.summary["verifiedFilesCount"] == 0

    return {
        "testName": "POSITIVE_C03_METADATA_ONLY",
        "packageType": "C03_BALL_STUDS",
        "description": "Explicit metadata-only verification of C-03 successfully validates schema, DEMO grade, and lineage declarations without disk files.",
        "passed": True,
        "result": res.to_dict(),
    }


def test_positive_c04_authentic_full_release() -> Dict[str, Any]:
    print("\n=== [3/22] Positive: C-04 Authentic Full Release Validation ===")
    manifest = load_c04_manifest()

    res = WheelEndLineageChecker.evaluate(
        manifest=manifest,
        package_dir=C04_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_PATH,
        c01_dir=C01_PACKAGE_DIR,
        c02_file=C02_DATUMS_FILE,
        c03_dir=C03_PACKAGE_DIR,
        metadata_only=False,
    )

    print(f"  -> Result: passed={res.passed}, message={res.message}")
    assert res.passed, f"Authentic C-04 must pass full release check: {res.message}"
    assert res.package_type == "C04_WHEEL_CENTER"
    assert res.summary["verificationMode"] == "FULL_PACKAGE_RELEASE"
    assert res.summary["verifiedFilesCount"] == 1
    assert res.summary["playbackAllowed"] is False

    return {
        "testName": "POSITIVE_C04_AUTHENTIC_FULL_RELEASE",
        "packageType": "C04_WHEEL_CENTER",
        "description": "Authentic C-04 wheel center package verified cleanly with 1 STEP asset, snapshot binding, and C-01/C-02/C-03 dependency hashes.",
        "passed": True,
        "result": res.to_dict(),
    }


def test_positive_c04_metadata_only() -> Dict[str, Any]:
    print("\n=== [4/22] Positive: C-04 Metadata-Only Mode Validation ===")
    manifest = load_c04_manifest()

    res = WheelEndLineageChecker.evaluate(
        manifest=manifest,
        metadata_only=True,
    )

    print(f"  -> Result: passed={res.passed}, message={res.message}")
    assert res.passed, f"C-04 metadata-only must pass: {res.message}"
    assert res.package_type == "C04_WHEEL_CENTER"
    assert res.summary["verificationMode"] == "METADATA_ONLY"
    assert res.summary["verifiedFilesCount"] == 0

    return {
        "testName": "POSITIVE_C04_METADATA_ONLY",
        "packageType": "C04_WHEEL_CENTER",
        "description": "Explicit metadata-only verification of C-04 successfully validates schema, DEMO grade, and lineage declarations without disk files.",
        "passed": True,
        "result": res.to_dict(),
    }


# =========================================================================
# NEGATIVE TESTS (5-22)
# =========================================================================
def test_negative_c03_missing_step_hash() -> Dict[str, Any]:
    print("\n=== [5/22] Negative: C-03 Missing upper-ball-stud.step in sha256 ===")
    bad = load_c03_manifest()
    del bad["sha256"]["upper-ball-stud.step"]

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C03_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_INPUT_MISSING_ASSET_HASH"

    return {
        "testName": "INJECTED_C03_MISSING_STEP_HASH",
        "expectedErrorCode": "ERR_INPUT_MISSING_ASSET_HASH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_missing_step_hash() -> Dict[str, Any]:
    print("\n=== [6/22] Negative: C-04 Missing rim-datum.step in sha256 ===")
    bad = load_c04_manifest()
    del bad["sha256"]["rim-datum.step"]
    # Retain a non-empty dictionary so missing asset check triggers rather than empty dictionary check
    bad["sha256"]["placeholder.step"] = "0000000000000000000000000000000000000000000000000000000000000000"

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C04_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_INPUT_MISSING_ASSET_HASH"

    return {
        "testName": "INJECTED_C04_MISSING_STEP_HASH",
        "expectedErrorCode": "ERR_INPUT_MISSING_ASSET_HASH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c03_empty_sha256() -> Dict[str, Any]:
    print("\n=== [7/22] Negative: C-03 Empty sha256 dictionary ===")
    bad = load_c03_manifest()
    bad["sha256"] = {}

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C03_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_INPUT_EMPTY_ASSET_HASHES"

    return {
        "testName": "INJECTED_C03_EMPTY_SHA256",
        "expectedErrorCode": "ERR_INPUT_EMPTY_ASSET_HASHES",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_empty_sha256() -> Dict[str, Any]:
    print("\n=== [8/22] Negative: C-04 Empty sha256 dictionary ===")
    bad = load_c04_manifest()
    bad["sha256"] = {}

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C04_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_INPUT_EMPTY_ASSET_HASHES"

    return {
        "testName": "INJECTED_C04_EMPTY_SHA256",
        "expectedErrorCode": "ERR_INPUT_EMPTY_ASSET_HASHES",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c03_tampered_step_hash() -> Dict[str, Any]:
    print("\n=== [9/22] Negative: C-03 Tampered lower-ball-stud.step hash ===")
    bad = load_c03_manifest()
    bad["sha256"]["lower-ball-stud.step"] = "deadbeef00000000000000000000000000000000000000000000000000000000"

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C03_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_ASSET_HASH_MISMATCH"

    return {
        "testName": "INJECTED_C03_TAMPERED_STEP_HASH",
        "expectedErrorCode": "ERR_ASSET_HASH_MISMATCH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_tampered_step_hash() -> Dict[str, Any]:
    print("\n=== [10/22] Negative: C-04 Tampered rim-datum.step hash ===")
    bad = load_c04_manifest()
    bad["sha256"]["rim-datum.step"] = "deadbeef00000000000000000000000000000000000000000000000000000000"

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C04_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_ASSET_HASH_MISMATCH"

    return {
        "testName": "INJECTED_C04_TAMPERED_STEP_HASH",
        "expectedErrorCode": "ERR_ASSET_HASH_MISMATCH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c03_wrong_c01_dependency() -> Dict[str, Any]:
    print("\n=== [11/22] Negative: C-03 Wrong C-01 manifest hash ===")
    bad = load_c03_manifest()
    bad["sources"]["c01"]["manifestSha256"] = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"

    res = WheelEndLineageChecker.evaluate(
        bad,
        package_dir=C03_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_PATH,
        c01_dir=C01_PACKAGE_DIR,
    )
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_DEPENDENCY_HASH_MISMATCH"

    return {
        "testName": "INJECTED_C03_WRONG_C01_DEPENDENCY",
        "expectedErrorCode": "ERR_DEPENDENCY_HASH_MISMATCH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c03_wrong_c02_dependency() -> Dict[str, Any]:
    print("\n=== [12/22] Negative: C-03 Wrong C-02 datums hash ===")
    bad = load_c03_manifest()
    bad["sources"]["c02"]["datumsSha256"] = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"

    res = WheelEndLineageChecker.evaluate(
        bad,
        package_dir=C03_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_PATH,
        c02_file=C02_DATUMS_FILE,
    )
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_DEPENDENCY_HASH_MISMATCH"

    return {
        "testName": "INJECTED_C03_WRONG_C02_DEPENDENCY",
        "expectedErrorCode": "ERR_DEPENDENCY_HASH_MISMATCH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_wrong_c03_dependency() -> Dict[str, Any]:
    print("\n=== [13/22] Negative: C-04 Wrong C-03 manifest hash ===")
    bad = load_c04_manifest()
    bad["sources"]["c03"]["manifestSha256"] = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"

    res = WheelEndLineageChecker.evaluate(
        bad,
        package_dir=C04_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_PATH,
        c03_dir=C03_PACKAGE_DIR,
    )
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_DEPENDENCY_HASH_MISMATCH"

    return {
        "testName": "INJECTED_C04_WRONG_C03_DEPENDENCY",
        "expectedErrorCode": "ERR_DEPENDENCY_HASH_MISMATCH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_wrong_c03_step_hash() -> Dict[str, Any]:
    print("\n=== [14/22] Negative: C-04 Wrong C-03 upper-ball-stud.step hash in sources ===")
    bad = load_c04_manifest()
    bad["sources"]["c03"]["stepSha256"]["upper-ball-stud.step"] = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"

    res = WheelEndLineageChecker.evaluate(
        bad,
        package_dir=C04_PACKAGE_DIR,
        snapshot_file=SNAPSHOT_PATH,
        c03_dir=C03_PACKAGE_DIR,
    )
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_DEPENDENCY_HASH_MISMATCH"

    return {
        "testName": "INJECTED_C04_WRONG_C03_STEP_HASH",
        "expectedErrorCode": "ERR_DEPENDENCY_HASH_MISMATCH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c03_snapshot_hash_tampered() -> Dict[str, Any]:
    print("\n=== [15/22] Negative: C-03 Snapshot hash mismatch ===")
    bad = load_c03_manifest()
    bad["sources"]["snapshot"]["snapshotSha256"] = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C03_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_SNAPSHOT_BINDING_MISMATCH"

    return {
        "testName": "INJECTED_C03_SNAPSHOT_HASH_TAMPERED",
        "expectedErrorCode": "ERR_SNAPSHOT_BINDING_MISMATCH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_snapshot_hash_tampered() -> Dict[str, Any]:
    print("\n=== [16/22] Negative: C-04 Snapshot hash mismatch ===")
    bad = load_c04_manifest()
    bad["sources"]["snapshot"]["snapshotSha256"] = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C04_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_SNAPSHOT_BINDING_MISMATCH"

    return {
        "testName": "INJECTED_C04_SNAPSHOT_HASH_TAMPERED",
        "expectedErrorCode": "ERR_SNAPSHOT_BINDING_MISMATCH",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c03_omitted_snapshot_file() -> Dict[str, Any]:
    print("\n=== [17/22] Negative: C-03 Omitted snapshot file ===")
    manifest = load_c03_manifest()

    res = WheelEndLineageChecker.evaluate(manifest, package_dir=C03_PACKAGE_DIR, snapshot_file=None)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_SNAPSHOT_FILE_REQUIRED"

    return {
        "testName": "INJECTED_C03_OMITTED_SNAPSHOT_FILE",
        "expectedErrorCode": "ERR_SNAPSHOT_FILE_REQUIRED",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_omitted_package_directory() -> Dict[str, Any]:
    print("\n=== [18/22] Negative: C-04 Omitted package directory ===")
    manifest = load_c04_manifest()

    res = WheelEndLineageChecker.evaluate(manifest, package_dir=None, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_PACKAGE_DIRECTORY_REQUIRED"

    return {
        "testName": "INJECTED_C04_OMITTED_PACKAGE_DIRECTORY",
        "expectedErrorCode": "ERR_PACKAGE_DIRECTORY_REQUIRED",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c03_false_oem_upgrade() -> Dict[str, Any]:
    print("\n=== [19/22] Negative: C-03 False OEM upgrade claim ===")
    bad = load_c03_manifest()
    bad["sourceGrade"] = "OEM_SPEC"

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C03_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_UNVERIFIED_SOURCE_UPGRADE"

    return {
        "testName": "INJECTED_C03_FALSE_OEM_UPGRADE",
        "expectedErrorCode": "ERR_UNVERIFIED_SOURCE_UPGRADE",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_false_same_vehicle_claim() -> Dict[str, Any]:
    print("\n=== [20/22] Negative: C-04 False sameVehicleClaim=true ===")
    bad = load_c04_manifest()
    bad["sources"]["snapshot"]["sameVehicleClaim"] = True

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C04_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_UNVERIFIED_VEHICLE_CLAIM"

    return {
        "testName": "INJECTED_C04_FALSE_SAME_VEHICLE_CLAIM",
        "expectedErrorCode": "ERR_UNVERIFIED_VEHICLE_CLAIM",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c03_illegal_playback_enabled() -> Dict[str, Any]:
    print("\n=== [21/22] Negative: C-03 Illegal playbackAllowed=true ===")
    bad = load_c03_manifest()
    bad["motionInput"]["playbackAllowed"] = True

    res = WheelEndLineageChecker.evaluate(bad, package_dir=C03_PACKAGE_DIR, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_ILLEGAL_PLAYBACK_ENABLED"

    return {
        "testName": "INJECTED_C03_ILLEGAL_PLAYBACK_ENABLED",
        "expectedErrorCode": "ERR_ILLEGAL_PLAYBACK_ENABLED",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def test_negative_c04_nonexistent_package_dir() -> Dict[str, Any]:
    print("\n=== [22/22] Negative: C-04 Non-existent package directory ===")
    manifest = load_c04_manifest()
    bad_dir = Path("F:/tmp/nonexistent_wheel_center_c04_package_xyz")

    res = WheelEndLineageChecker.evaluate(manifest, package_dir=bad_dir, snapshot_file=SNAPSHOT_PATH)
    print(f"  -> Result: passed={res.passed}, errorCode={res.error_code}")
    assert not res.passed
    assert res.error_code == "ERR_PACKAGE_DIRECTORY_NOT_FOUND"

    return {
        "testName": "INJECTED_C04_NONEXISTENT_PACKAGE_DIR",
        "expectedErrorCode": "ERR_PACKAGE_DIRECTORY_NOT_FOUND",
        "actualErrorCode": res.error_code,
        "passed": True,
        "result": res.to_dict(),
    }


def main():
    print("=================================================================")
    print("CARLAB R-43 (03.45) C-03 & C-04 Release Lineage Verification Suite")
    print("=================================================================")

    suite_results: List[Dict[str, Any]] = []

    # Positives
    suite_results.append(test_positive_c03_authentic_full_release())
    suite_results.append(test_positive_c03_metadata_only())
    suite_results.append(test_positive_c04_authentic_full_release())
    suite_results.append(test_positive_c04_metadata_only())

    # Negatives
    suite_results.append(test_negative_c03_missing_step_hash())
    suite_results.append(test_negative_c04_missing_step_hash())
    suite_results.append(test_negative_c03_empty_sha256())
    suite_results.append(test_negative_c04_empty_sha256())
    suite_results.append(test_negative_c03_tampered_step_hash())
    suite_results.append(test_negative_c04_tampered_step_hash())
    suite_results.append(test_negative_c03_wrong_c01_dependency())
    suite_results.append(test_negative_c03_wrong_c02_dependency())
    suite_results.append(test_negative_c04_wrong_c03_dependency())
    suite_results.append(test_negative_c04_wrong_c03_step_hash())
    suite_results.append(test_negative_c03_snapshot_hash_tampered())
    suite_results.append(test_negative_c04_snapshot_hash_tampered())
    suite_results.append(test_negative_c03_omitted_snapshot_file())
    suite_results.append(test_negative_c04_omitted_package_directory())
    suite_results.append(test_negative_c03_false_oem_upgrade())
    suite_results.append(test_negative_c04_false_same_vehicle_claim())
    suite_results.append(test_negative_c03_illegal_playback_enabled())
    suite_results.append(test_negative_c04_nonexistent_package_dir())

    evidence_data = {
        "task": "R-43",
        "displayCode": "03.45",
        "owner": "gemini-3-8-flash",
        "timestamp": "2026-11-22T11:55:00+08:00",
        "packagesVerified": [
            {
                "packageId": "c03-3f4bf8c599df28679b86",
                "role": "C03_DEMO_BALL_STUDS",
                "sourceGrade": "DEMO_ASSUMPTION",
                "stepFiles": ["upper-ball-stud.step", "lower-ball-stud.step"],
            },
            {
                "packageId": "c04-bae128570c76aec59353",
                "role": "C04_DEMO_WHEEL_CENTER",
                "sourceGrade": "DEMO_ASSUMPTION",
                "stepFiles": ["rim-datum.step"],
            },
        ],
        "suiteSummary": {
            "totalTests": len(suite_results),
            "passedTests": sum(1 for r in suite_results if r.get("passed", False)),
            "failedTests": 0,
            "allPassed": True,
        },
        "negativeChecksCovered": [
            "ERR_INPUT_MISSING_ASSET_HASH",
            "ERR_INPUT_EMPTY_ASSET_HASHES",
            "ERR_ASSET_HASH_MISMATCH",
            "ERR_DEPENDENCY_HASH_MISMATCH",
            "ERR_SNAPSHOT_BINDING_MISMATCH",
            "ERR_SNAPSHOT_FILE_REQUIRED",
            "ERR_PACKAGE_DIRECTORY_REQUIRED",
            "ERR_PACKAGE_DIRECTORY_NOT_FOUND",
            "ERR_UNVERIFIED_SOURCE_UPGRADE",
            "ERR_UNVERIFIED_VEHICLE_CLAIM",
            "ERR_ILLEGAL_PLAYBACK_ENABLED",
        ],
        "testCases": suite_results,
    }

    EVIDENCE_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_ev = EVIDENCE_OUTPUT_PATH.with_suffix(".tmp.json")
    temp_ev.write_text(json.dumps(evidence_data, indent=2), encoding="utf-8")
    if EVIDENCE_OUTPUT_PATH.exists():
        try:
            EVIDENCE_OUTPUT_PATH.unlink()
        except Exception:
            pass
    temp_ev.replace(EVIDENCE_OUTPUT_PATH)

    print("\n=================================================================")
    print(f"ALL {len(suite_results)} RELEASE LINEAGE TESTS PASSED!")
    print(f"Evidence written to: {EVIDENCE_OUTPUT_PATH}")
    print("=================================================================")


if __name__ == "__main__":
    main()
