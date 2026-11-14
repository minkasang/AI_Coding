r"""
CARLAB Asset Quality Gates - Comprehensive Verification & Evidence Suite
Model: Gemini 3.8 Flash (gemini-3-8-flash)
Task: R-08 (03.10)

Executes end-to-end positive tests (all 6 gates passing) and 6 injected failure cases,
verifying that the quality gate accurately admits compliant engineering assets
and rejects non-compliant, uncertified, interfering, or corrupt assets.

Outputs evidence JSON to: docs/planning/evidence/R-08-quality-evidence.json
"""

import copy
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

from quality_gate import (
    Gate1_InputProvenance,
    Gate2_CadTopology,
    Gate3_AssemblyClearance,
    Gate4_TransformParity,
    Gate5_WebGLBudget,
    Gate6_AtomicCache,
    GateResult,
    TransactionalStaging,
)

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[2]
PYTHON_EXEC = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
BLENDER_EXEC = Path(r"F:\software\blender\blender.exe")
EVIDENCE_OUTPUT_PATH = PROJECT_ROOT / "docs" / "planning" / "evidence" / "R-08-quality-evidence.json"

TEST_OUT_DIR = HERE / "out"
STAGING_TEST_DIR = HERE / "staging_test"


def run_positive_test() -> Dict[str, Any]:
    print("\n=== [1/7] Running Positive Baseline Quality Test ===")
    config_path = HERE / "config_standard.json"
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    # 1. Run CAD pipeline
    from asset_generator_v2 import run_cad_pipeline
    cad_success, cad_res = run_cad_pipeline(config_path=config_path, out_dir=TEST_OUT_DIR, force_rebuild=True)
    if not cad_success:
        raise RuntimeError(f"Positive CAD pipeline failed unexpectedly: {cad_res}")

    print("  -> CAD Pipeline Success: Gate 1, 2, 3, 6 PASSED.")

    # 2. Run Blender GLB export
    out_glb = TEST_OUT_DIR / "wheel_end_quality_v2.glb"
    blender_script = HERE / "blender_export_v2.py"
    blender_report_json = TEST_OUT_DIR / "blender_report.json"

    cmd = [
        str(BLENDER_EXEC),
        "--background",
        "--factory-startup",
        "--python",
        str(blender_script),
        "--",
        "--config",
        str(config_path),
        "--stl-dir",
        str(TEST_OUT_DIR),
        "--out-glb",
        str(out_glb),
        "--report-json",
        str(blender_report_json),
    ]

    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Blender export failed:\nSTDOUT:\n{p.stdout}\nSTDERR:\n{p.stderr}")

    with open(blender_report_json, "r", encoding="utf-8") as f:
        blender_res = json.load(f)

    print("  -> Blender Export Success: Gate 4, 5 PASSED.")
    return {
        "testName": "POSITIVE_BASELINE_SUITE",
        "cadResults": cad_res,
        "blenderResults": blender_res,
        "glbPath": str(out_glb),
        "glbSizeBytes": out_glb.stat().st_size,
        "passed": True,
    }


def run_negative_gate1_untrusted_provenance() -> Dict[str, Any]:
    print("\n=== [2/7] Testing Gate 1: Rejection of Untrusted Provenance ===")
    config_path = HERE / "config_standard.json"
    with open(config_path, "r", encoding="utf-8") as f:
        bad_config = json.load(f)

    # Inject invalid/untrusted provenance tier
    bad_config["parts"]["hub"]["provenance"] = "REDDIT_RUMOR_THREAD"

    res = Gate1_InputProvenance.evaluate(bad_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 should have rejected invalid provenance!"
    assert res.error_code == "ERR_INPUT_UNTRUSTED_PROVENANCE"

    return {
        "testName": "INJECTED_ERR_INPUT_UNTRUSTED_PROVENANCE",
        "expectedErrorCode": "ERR_INPUT_UNTRUSTED_PROVENANCE",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_poka_yoke() -> Dict[str, Any]:
    print("\n=== [3/7] Testing Gate 1: Rejection of Poka-Yoke Relational Violation ===")
    config_path = HERE / "config_standard.json"
    with open(config_path, "r", encoding="utf-8") as f:
        bad_config = json.load(f)

    # Inject impossible geometry: PCD (50mm) < center bore (67.1mm)
    bad_config["parts"]["hub"]["pcd_mm"] = 50.0

    res = Gate1_InputProvenance.evaluate(bad_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 should have rejected PCD < center bore!"
    assert res.error_code == "ERR_INPUT_POKA_YOKE_FAILED"

    return {
        "testName": "INJECTED_ERR_INPUT_POKA_YOKE_FAILED",
        "expectedErrorCode": "ERR_INPUT_POKA_YOKE_FAILED",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate2_cad_degenerate() -> Dict[str, Any]:
    print("\n=== [4/7] Testing Gate 2: Rejection of Degenerate CAD Solid ===")
    # Evaluate a null/degenerate solid
    res = Gate2_CadTopology.evaluate("faulty_bracket", None)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 2 should have rejected None solid!"
    assert res.error_code == "ERR_GEOM_DEGENERATE"

    return {
        "testName": "INJECTED_ERR_GEOM_DEGENERATE",
        "expectedErrorCode": "ERR_GEOM_DEGENERATE",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate3_clearance_violation() -> Dict[str, Any]:
    print("\n=== [5/7] Testing Gate 3: Rejection of ISO 273 Clearance Violation ===")
    config_path = HERE / "config_standard.json"
    with open(config_path, "r", encoding="utf-8") as f:
        bad_config = json.load(f)

    # Inject clearance hole smaller than M14 Fine clearance (e.g. 13.5mm < 15.0mm)
    bad_config["parts"]["rotor"]["bolt_hole_diameter_mm"] = 13.5

    res = Gate3_AssemblyClearance.evaluate(bad_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 3 should have rejected hole smaller than ISO 273 fine clearance!"
    assert res.error_code == "ERR_ASSEMBLY_CLEARANCE_VIOLATION"

    return {
        "testName": "INJECTED_ERR_ASSEMBLY_CLEARANCE_VIOLATION",
        "expectedErrorCode": "ERR_ASSEMBLY_CLEARANCE_VIOLATION",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate4_transform_chirality() -> Dict[str, Any]:
    print("\n=== [6/7] Testing Gate 4: Rejection of Mirrored Handedness (Negative Determinant) ===")
    # Inject matrix with negative X scale (-0.001), causing reflection and det = -1.0
    bad_matrix = [
        [-0.001, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.001, 0.0],
        [0.0, -0.001, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]

    res = Gate4_TransformParity.evaluate(bad_matrix)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 4 should have rejected negative determinant!"
    assert res.error_code == "ERR_TRANSFORM_CHIRALITY"

    return {
        "testName": "INJECTED_ERR_TRANSFORM_CHIRALITY",
        "expectedErrorCode": "ERR_TRANSFORM_CHIRALITY",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate5_budget_exceeded() -> Dict[str, Any]:
    print("\n=== [7/7] Testing Gate 5: Rejection on WebGL Polygon Budget Exceeded ===")
    glb_path = TEST_OUT_DIR / "wheel_end_quality_v2.glb"
    assert glb_path.exists(), "Base GLB file must exist for budget evaluation."

    # Inject ultra-strict budget (max 500 triangles for an assembly with thousands)
    strict_budgets = {
        "assembly_lod0_max_triangles": 500,
        "assembly_lod0_max_vertices": 500,
        "assembly_max_filesize_bytes": 1048576,
    }

    res = Gate5_WebGLBudget.evaluate(glb_path, strict_budgets)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 5 should have rejected when triangles exceed budget!"
    assert res.error_code == "ERR_BUDGET_TRIANGLES_EXCEEDED"

    return {
        "testName": "INJECTED_ERR_BUDGET_TRIANGLES_EXCEEDED",
        "expectedErrorCode": "ERR_BUDGET_TRIANGLES_EXCEEDED",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_gate6_cache_integrity_and_rollback() -> Dict[str, Any]:
    print("\n=== [Bonus] Testing Gate 6: Deterministic Cache Integrity & Atomic Rollback ===")
    test_file = TEST_OUT_DIR / "hub.step"
    assert test_file.exists(), "hub.step must exist."

    # Compute actual hash
    import hashlib
    hasher = hashlib.sha256()
    with open(test_file, "rb") as f:
        hasher.update(f.read())
    actual_hash = hasher.hexdigest()

    # Pass case
    pass_res = Gate6_AtomicCache.verify_file_checksum(test_file, actual_hash)
    assert pass_res.passed, "Gate 6 should pass on valid checksum!"

    # Fail case with tampered checksum
    tampered_hash = "0000000000000000000000000000000000000000000000000000000000000000"
    fail_res = Gate6_AtomicCache.verify_file_checksum(test_file, tampered_hash)
    assert not fail_res.passed
    assert fail_res.error_code == "ERR_CACHE_CHECKSUM_MISMATCH"

    # Transactional staging rollback test
    dummy_target = HERE / "rollback_test_dir"
    if dummy_target.exists():
        shutil.rmtree(dummy_target)
    dummy_target.mkdir()
    (dummy_target / "existing_valid.txt").write_text("VALID_DATA", encoding="utf-8")

    staging = TransactionalStaging(dummy_target)
    try:
        staging_dir = staging.__enter__()
        (staging_dir / "corrupted_partial.bin").write_bytes(b"\x00\xFF")
        # Simulate fatal failure during build
        raise RuntimeError("Simulated Fatal Build Error")
    except RuntimeError:
        staging.rollback()

    # Ensure existing valid data was NOT touched and corrupted file does NOT exist in target
    assert (dummy_target / "existing_valid.txt").exists(), "Existing valid file must remain untouched!"
    assert not (dummy_target / "corrupted_partial.bin").exists(), "Corrupted partial file must be rolled back!"
    shutil.rmtree(dummy_target)

    print("  -> Gate 6 Atomic Staging and Rollback verified successfully.")
    return {
        "testName": "GATE_06_ATOMIC_TRANSACTION_AND_INTEGRITY",
        "cacheVerificationPass": pass_res.to_dict(),
        "cacheTamperDetection": fail_res.to_dict(),
        "atomicRollbackVerified": True,
        "passed": True,
    }


def main():
    print("=================================================================")
    print("CARLAB R-08 (03.10) Quality Gates Automated Test Suite")
    print("=================================================================")

    suite_results = []

    # 1. Positive baseline
    r1 = run_positive_test()
    suite_results.append(r1)

    # 2. Injected negative tests
    r2 = run_negative_gate1_untrusted_provenance()
    suite_results.append(r2)

    r3 = run_negative_gate1_poka_yoke()
    suite_results.append(r3)

    r4 = run_negative_gate2_cad_degenerate()
    suite_results.append(r4)

    r5 = run_negative_gate3_clearance_violation()
    suite_results.append(r5)

    r6 = run_negative_gate4_transform_chirality()
    suite_results.append(r6)

    r7 = run_negative_gate5_budget_exceeded()
    suite_results.append(r7)

    r8 = run_gate6_cache_integrity_and_rollback()
    suite_results.append(r8)

    evidence_data = {
        "task": "R-08",
        "displayCode": "03.10",
        "owner": "gemini-3-8-flash",
        "timestamp": "2026-11-14T22:35:00+08:00",
        "suiteSummary": {
            "totalTests": len(suite_results),
            "passedTests": sum(1 for r in suite_results if r.get("passed", False)),
            "failedTests": 0,
            "allPassed": True,
        },
        "gatesCovered": [
            "GATE_01_INPUT_PROVENANCE",
            "GATE_02_CAD_TOPOLOGY",
            "GATE_03_ASSEMBLY_CLEARANCE",
            "GATE_04_TRANSFORM_PARITY",
            "GATE_05_WEBGL_BUDGET",
            "GATE_06_ATOMIC_CACHE",
        ],
        "testCases": suite_results,
    }

    EVIDENCE_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(EVIDENCE_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(evidence_data, f, indent=2)

    print("\n=================================================================")
    print(f"ALL {len(suite_results)} QUALITY GATE TESTS PASSED!")
    print(f"Evidence written to: {EVIDENCE_OUTPUT_PATH}")
    print("=================================================================")


if __name__ == "__main__":
    main()
