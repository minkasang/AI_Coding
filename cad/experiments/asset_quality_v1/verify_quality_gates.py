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


def run_positive_verified_evidence_with_real_file_test() -> Dict[str, Any]:
    print("\n=== [1b] Testing Gate 1: Genuine Substantiated OEM Evidence with Existing File & Hash ===")
    config = {
        "parts": {
            "hub": {
                "part_id": "PART-30-006",
                "name": "Verified OEM Front Hub Flange Sample",
                "provenance": "OEM_SPEC",
                "source": {
                    "sourceId": "SRC-TEST-GENUINE-EVIDENCE-FILE-01",
                    "sourceType": "OEM_ENGINEERING_DRAWING",
                    "drawingNumber": "DWG-TEST-VERIFIED-2026",
                    "revision": "A",
                    "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
                    "citationLocation": "Document header and root JSON metadata"
                },
                "family": "rotational_symmetric",
                "material_class": "aluminum_alloy_A356",
                "pcd_mm": 114.3,
                "bolt_count": 5,
                "bolt_hole_diameter_mm": 15.5,
                "outer_diameter_mm": 152.0,
                "flange_thickness_mm": 14.0,
                "center_bore_mm": 67.1,
                "pilot_diameter_mm": 84.0,
                "pilot_height_mm": 18.0
            }
        }
    }

    res = Gate1_InputProvenance.evaluate(config, allow_test_fixtures=True)
    print(f"  -> Evaluation result: passed={res.passed}, message={res.message}")
    assert res.passed, f"Gate 1 should pass when physical evidence file exists and SHA-256 matches: {res.message}"

    return {
        "testName": "POSITIVE_VERIFIED_OEM_WITH_REAL_FILE_AND_HASH",
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_unverified_fixture_status() -> Dict[str, Any]:
    print("\n=== [1c] Testing Gate 1: Rejection of Unverified Fixture under OEM_SPEC ===")
    sample_path = HERE / "config_verified_spec_sample.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        sample_config = json.load(f)

    # config_verified_spec_sample.json points to SRC-OEM-FIXTURE-GEN3-HUB-01 which is UNVERIFIED_FIXTURE_NO_DRAWING_RELEASE
    res = Gate1_InputProvenance.evaluate(sample_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 MUST reject OEM_SPEC pointing to unverified fixture!"
    assert res.error_code == "ERR_INPUT_UNVERIFIED_SOURCE_EVIDENCE"

    return {
        "testName": "INJECTED_ERR_INPUT_UNVERIFIED_SOURCE_EVIDENCE",
        "expectedErrorCode": "ERR_INPUT_UNVERIFIED_SOURCE_EVIDENCE",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_missing_evidence_file() -> Dict[str, Any]:
    print("\n=== [1d] Testing Gate 1: Rejection of Missing Physical Evidence File ===")
    # Temporarily evaluate config pointing to non-existent evidence file
    from quality_gate import get_provenance_registry
    import quality_gate

    old_registry_fn = quality_gate.get_provenance_registry
    mock_reg = copy.deepcopy(old_registry_fn())
    mock_reg["sources"]["SRC-TEST-MISSING-DOC"] = {
        "sourceId": "SRC-TEST-MISSING-DOC",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TEST-MISSING",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "verificationStatus": "VERIFIED_VALID",
        "registeredParts": ["PART-30-006"],
        "verificationRecord": {
            "evidenceDocPath": "docs/planning/evidence/NON_EXISTENT_FILE_ABC.json",
            "evidenceSha256": "0000000000000000000000000000000000000000000000000000000000000000"
        }
    }
    quality_gate.get_provenance_registry = lambda: mock_reg

    test_cfg = {
        "parts": {
            "hub": {
                "part_id": "PART-30-006",
                "name": "Hub with Missing Evidence File",
                "provenance": "OEM_SPEC",
                "source": {
                    "sourceId": "SRC-TEST-MISSING-DOC",
                    "drawingNumber": "DWG-TEST-MISSING",
                    "applicableScope": "PLATFORM-GEN3-FRONT-CORNER"
                },
                "family": "rotational_symmetric",
                "material_class": "aluminum_alloy_A356",
                "pcd_mm": 114.3,
                "bolt_count": 5,
                "bolt_hole_diameter_mm": 15.5,
                "outer_diameter_mm": 152.0,
                "flange_thickness_mm": 14.0,
                "center_bore_mm": 67.1,
                "pilot_diameter_mm": 84.0,
                "pilot_height_mm": 18.0
            }
        }
    }

    try:
        res = Gate1_InputProvenance.evaluate(test_cfg)
        print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
        assert not res.passed, "Gate 1 MUST reject when evidenceDocPath does not exist on disk!"
        assert res.error_code == "ERR_INPUT_MISSING_EVIDENCE_FILE"
    finally:
        quality_gate.get_provenance_registry = old_registry_fn

    return {
        "testName": "INJECTED_ERR_INPUT_MISSING_EVIDENCE_FILE",
        "expectedErrorCode": "ERR_INPUT_MISSING_EVIDENCE_FILE",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_evidence_hash_mismatch() -> Dict[str, Any]:
    print("\n=== [1e] Testing Gate 1: Rejection of Evidence File SHA-256 Mismatch ===")
    from quality_gate import get_provenance_registry
    import quality_gate

    old_registry_fn = quality_gate.get_provenance_registry
    mock_reg = copy.deepcopy(old_registry_fn())
    # Point to the real file, but tamper with the expected hash!
    mock_reg["sources"]["SRC-TEST-TAMPERED-HASH"] = {
        "sourceId": "SRC-TEST-TAMPERED-HASH",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TEST-TAMPERED",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "verificationStatus": "VERIFIED_VALID",
        "registeredParts": ["PART-30-006"],
        "verificationRecord": {
            "evidenceDocPath": "docs/planning/evidence/TEST_FIXTURE_VERIFIED_OEM.meta.json",
            "evidenceSha256": "bad000000000000000000000000000000000000000000000000000000000dead"
        }
    }
    quality_gate.get_provenance_registry = lambda: mock_reg

    test_cfg = {
        "parts": {
            "hub": {
                "part_id": "PART-30-006",
                "name": "Hub with Tampered Evidence Hash",
                "provenance": "OEM_SPEC",
                "source": {
                    "sourceId": "SRC-TEST-TAMPERED-HASH",
                    "drawingNumber": "DWG-TEST-TAMPERED",
                    "applicableScope": "PLATFORM-GEN3-FRONT-CORNER"
                },
                "family": "rotational_symmetric",
                "material_class": "aluminum_alloy_A356",
                "pcd_mm": 114.3,
                "bolt_count": 5,
                "bolt_hole_diameter_mm": 15.5,
                "outer_diameter_mm": 152.0,
                "flange_thickness_mm": 14.0,
                "center_bore_mm": 67.1,
                "pilot_diameter_mm": 84.0,
                "pilot_height_mm": 18.0
            }
        }
    }

    try:
        res = Gate1_InputProvenance.evaluate(test_cfg)
        print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
        assert not res.passed, "Gate 1 MUST reject when evidenceDocPath SHA-256 does not match registry!"
        assert res.error_code == "ERR_INPUT_EVIDENCE_HASH_MISMATCH"
    finally:
        quality_gate.get_provenance_registry = old_registry_fn

    return {
        "testName": "INJECTED_ERR_INPUT_EVIDENCE_HASH_MISMATCH",
        "expectedErrorCode": "ERR_INPUT_EVIDENCE_HASH_MISMATCH",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_missing_evidence_path() -> Dict[str, Any]:
    print("\n=== [1f] Testing Gate 1: Rejection of Missing evidenceDocPath in Record ===")
    from quality_gate import get_provenance_registry
    import quality_gate

    old_registry_fn = quality_gate.get_provenance_registry
    mock_reg = copy.deepcopy(old_registry_fn())
    mock_reg["sources"]["SRC-TEST-NO-PATH"] = {
        "sourceId": "SRC-TEST-NO-PATH",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TEST-NOPATH",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "verificationStatus": "VERIFIED_VALID",
        "registeredParts": ["PART-30-006"],
        "verificationRecord": {
            "evidenceSha256": "f5dac76e8bff5272485f690f3100c925fb80164b44db8fd1e360892e819ab26e"
            # Missing evidenceDocPath
        }
    }
    quality_gate.get_provenance_registry = lambda: mock_reg

    test_cfg = {
        "parts": {
            "hub": {
                "part_id": "PART-30-006",
                "name": "Hub with Missing Evidence Path",
                "provenance": "OEM_SPEC",
                "source": {
                    "sourceId": "SRC-TEST-NO-PATH",
                    "drawingNumber": "DWG-TEST-NOPATH",
                    "applicableScope": "PLATFORM-GEN3-FRONT-CORNER"
                },
                "family": "rotational_symmetric",
                "material_class": "aluminum_alloy_A356",
                "pcd_mm": 114.3,
                "bolt_count": 5,
                "bolt_hole_diameter_mm": 15.5,
                "outer_diameter_mm": 152.0,
                "flange_thickness_mm": 14.0,
                "center_bore_mm": 67.1,
                "pilot_diameter_mm": 84.0,
                "pilot_height_mm": 18.0
            }
        }
    }

    try:
        res = Gate1_InputProvenance.evaluate(test_cfg, allow_test_fixtures=True)
        print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
        assert not res.passed, "Gate 1 MUST reject when evidenceDocPath is missing!"
        assert res.error_code == "ERR_INPUT_MISSING_EVIDENCE_PATH"
    finally:
        quality_gate.get_provenance_registry = old_registry_fn

    return {
        "testName": "INJECTED_ERR_INPUT_MISSING_EVIDENCE_PATH",
        "expectedErrorCode": "ERR_INPUT_MISSING_EVIDENCE_PATH",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_missing_evidence_hash() -> Dict[str, Any]:
    print("\n=== [1g] Testing Gate 1: Rejection of Missing evidenceSha256 in Record ===")
    from quality_gate import get_provenance_registry
    import quality_gate

    old_registry_fn = quality_gate.get_provenance_registry
    mock_reg = copy.deepcopy(old_registry_fn())
    mock_reg["sources"]["SRC-TEST-NO-HASH"] = {
        "sourceId": "SRC-TEST-NO-HASH",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TEST-NOHASH",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "verificationStatus": "VERIFIED_VALID",
        "registeredParts": ["PART-30-006"],
        "verificationRecord": {
            "evidenceDocPath": "docs/planning/evidence/TEST_FIXTURE_VERIFIED_OEM.meta.json"
            # Missing evidenceSha256
        }
    }
    quality_gate.get_provenance_registry = lambda: mock_reg

    test_cfg = {
        "parts": {
            "hub": {
                "part_id": "PART-30-006",
                "name": "Hub with Missing Evidence Hash",
                "provenance": "OEM_SPEC",
                "source": {
                    "sourceId": "SRC-TEST-NO-HASH",
                    "drawingNumber": "DWG-TEST-NOHASH",
                    "applicableScope": "PLATFORM-GEN3-FRONT-CORNER"
                },
                "family": "rotational_symmetric",
                "material_class": "aluminum_alloy_A356",
                "pcd_mm": 114.3,
                "bolt_count": 5,
                "bolt_hole_diameter_mm": 15.5,
                "outer_diameter_mm": 152.0,
                "flange_thickness_mm": 14.0,
                "center_bore_mm": 67.1,
                "pilot_diameter_mm": 84.0,
                "pilot_height_mm": 18.0
            }
        }
    }

    try:
        res = Gate1_InputProvenance.evaluate(test_cfg, allow_test_fixtures=True)
        print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
        assert not res.passed, "Gate 1 MUST reject when evidenceSha256 is missing!"
        assert res.error_code == "ERR_INPUT_MISSING_EVIDENCE_HASH"
    finally:
        quality_gate.get_provenance_registry = old_registry_fn

    return {
        "testName": "INJECTED_ERR_INPUT_MISSING_EVIDENCE_HASH",
        "expectedErrorCode": "ERR_INPUT_MISSING_EVIDENCE_HASH",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_evidence_path_escape() -> Dict[str, Any]:
    print("\n=== [1h] Testing Gate 1: Rejection of Path Traversal / Escape ===")
    from quality_gate import get_provenance_registry
    import quality_gate

    old_registry_fn = quality_gate.get_provenance_registry
    mock_reg = copy.deepcopy(old_registry_fn())
    mock_reg["sources"]["SRC-TEST-ESCAPE"] = {
        "sourceId": "SRC-TEST-ESCAPE",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TEST-ESCAPE",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "verificationStatus": "VERIFIED_VALID",
        "registeredParts": ["PART-30-006"],
        "verificationRecord": {
            "evidenceDocPath": "../../secret.json",
            "evidenceSha256": "f5dac76e8bff5272485f690f3100c925fb80164b44db8fd1e360892e819ab26e"
        }
    }
    quality_gate.get_provenance_registry = lambda: mock_reg

    test_cfg = {
        "parts": {
            "hub": {
                "part_id": "PART-30-006",
                "name": "Hub with Escaping Evidence Path",
                "provenance": "OEM_SPEC",
                "source": {
                    "sourceId": "SRC-TEST-ESCAPE",
                    "drawingNumber": "DWG-TEST-ESCAPE",
                    "applicableScope": "PLATFORM-GEN3-FRONT-CORNER"
                },
                "family": "rotational_symmetric",
                "material_class": "aluminum_alloy_A356",
                "pcd_mm": 114.3,
                "bolt_count": 5,
                "bolt_hole_diameter_mm": 15.5,
                "outer_diameter_mm": 152.0,
                "flange_thickness_mm": 14.0,
                "center_bore_mm": 67.1,
                "pilot_diameter_mm": 84.0,
                "pilot_height_mm": 18.0
            }
        }
    }

    try:
        res = Gate1_InputProvenance.evaluate(test_cfg, allow_test_fixtures=True)
        print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
        assert not res.passed, "Gate 1 MUST reject path traversal attempts!"
        assert res.error_code == "ERR_INPUT_EVIDENCE_PATH_ESCAPE"
    finally:
        quality_gate.get_provenance_registry = old_registry_fn

    return {
        "testName": "INJECTED_ERR_INPUT_EVIDENCE_PATH_ESCAPE",
        "expectedErrorCode": "ERR_INPUT_EVIDENCE_PATH_ESCAPE",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_untrusted_evidence_location() -> Dict[str, Any]:
    print("\n=== [1i] Testing Gate 1: Rejection of Untrusted Evidence Location ===")
    from quality_gate import get_provenance_registry
    import quality_gate

    old_registry_fn = quality_gate.get_provenance_registry
    mock_reg = copy.deepcopy(old_registry_fn())
    mock_reg["sources"]["SRC-TEST-UNTRUSTED-LOC"] = {
        "sourceId": "SRC-TEST-UNTRUSTED-LOC",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TEST-UNTRUSTED",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "verificationStatus": "VERIFIED_VALID",
        "registeredParts": ["PART-30-006"],
        "verificationRecord": {
            "evidenceDocPath": "scripts/start-carlab.ps1",
            "evidenceSha256": "f5dac76e8bff5272485f690f3100c925fb80164b44db8fd1e360892e819ab26e"
        }
    }
    quality_gate.get_provenance_registry = lambda: mock_reg

    test_cfg = {
        "parts": {
            "hub": {
                "part_id": "PART-30-006",
                "name": "Hub with Untrusted Evidence Location",
                "provenance": "OEM_SPEC",
                "source": {
                    "sourceId": "SRC-TEST-UNTRUSTED-LOC",
                    "drawingNumber": "DWG-TEST-UNTRUSTED",
                    "applicableScope": "PLATFORM-GEN3-FRONT-CORNER"
                },
                "family": "rotational_symmetric",
                "material_class": "aluminum_alloy_A356",
                "pcd_mm": 114.3,
                "bolt_count": 5,
                "bolt_hole_diameter_mm": 15.5,
                "outer_diameter_mm": 152.0,
                "flange_thickness_mm": 14.0,
                "center_bore_mm": 67.1,
                "pilot_diameter_mm": 84.0,
                "pilot_height_mm": 18.0
            }
        }
    }

    try:
        res = Gate1_InputProvenance.evaluate(test_cfg, allow_test_fixtures=True)
        print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
        assert not res.passed, "Gate 1 MUST reject evidence located outside approved repository paths!"
        assert res.error_code == "ERR_INPUT_UNTRUSTED_EVIDENCE_LOCATION"
    finally:
        quality_gate.get_provenance_registry = old_registry_fn

    return {
        "testName": "INJECTED_ERR_INPUT_UNTRUSTED_EVIDENCE_LOCATION",
        "expectedErrorCode": "ERR_INPUT_UNTRUSTED_EVIDENCE_LOCATION",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_test_fixture_in_production() -> Dict[str, Any]:
    print("\n=== [1j] Testing Gate 1: Rejection of Test Fixture in Production OEM_SPEC Mode ===")
    sample_path = HERE / "config_verified_spec_sample.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        prod_config = json.load(f)

    # In strict production mode (allow_test_fixtures=False), using SRC-TEST-GENUINE-EVIDENCE-FILE-01 MUST fail closed
    prod_config["parts"]["hub"]["source"] = {
        "sourceId": "SRC-TEST-GENUINE-EVIDENCE-FILE-01",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TEST-VERIFIED-2026",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "citationLocation": "Document header and root JSON metadata"
    }

    res = Gate1_InputProvenance.evaluate(prod_config, strict_provenance=True, allow_test_fixtures=False)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 MUST reject test fixtures in production OEM_SPEC mode!"
    assert res.error_code == "ERR_INPUT_TEST_FIXTURE_IN_PRODUCTION"

    return {
        "testName": "INJECTED_ERR_INPUT_TEST_FIXTURE_IN_PRODUCTION",
        "expectedErrorCode": "ERR_INPUT_TEST_FIXTURE_IN_PRODUCTION",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_untrusted_provenance() -> Dict[str, Any]:
    print("\n=== [2/10] Testing Gate 1: Rejection of Untrusted Provenance ===")
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


def run_negative_gate1_oem_spec_missing_evidence() -> Dict[str, Any]:
    print("\n=== [3/10] Testing Gate 1: Rejection of Unverified OEM_SPEC (Anti False-Positive) ===")
    config_path = HERE / "config_standard.json"
    with open(config_path, "r", encoding="utf-8") as f:
        bad_config = json.load(f)

    # Reproduce exact audit failure condition:
    # hub claims OEM_SPEC, provenance_notes="NONE", but has no traceable source / drawingNumber
    bad_config["parts"]["hub"]["provenance"] = "OEM_SPEC"
    bad_config["parts"]["hub"]["provenance_notes"] = "NONE"
    bad_config["parts"]["hub"].pop("source", None)

    res = Gate1_InputProvenance.evaluate(bad_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 MUST reject OEM_SPEC without structured source evidence!"
    assert res.error_code == "ERR_INPUT_UNVERIFIED_OEM_PROVENANCE"

    return {
        "testName": "INJECTED_ERR_INPUT_UNVERIFIED_OEM_PROVENANCE",
        "expectedErrorCode": "ERR_INPUT_UNVERIFIED_OEM_PROVENANCE",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_iso_standard_unverified_application() -> Dict[str, Any]:
    print("\n=== [4/10] Testing Gate 1: Rejection of ISO_STANDARD Claiming Vehicle Assembly Without Release ===")
    config_path = HERE / "config_standard.json"
    with open(config_path, "r", encoding="utf-8") as f:
        bad_config = json.load(f)

    # Fastener claims valid registered ISO_STANDARD, but falsely claims vehicle assembly release without OEM document
    bad_config["parts"]["stud"]["provenance"] = "ISO_STANDARD"
    bad_config["parts"]["stud"]["source"] = {
        "sourceId": "SRC-ISO-273-1979-TABLE1",
        "standardCode": "ISO 273:1979",
        "claimsVehicleAssemblyRelease": True,
        # missing oemEngineeringReleaseNumber
    }

    res = Gate1_InputProvenance.evaluate(bad_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 MUST reject ISO_STANDARD claiming vehicle assembly without OEM release!"
    assert res.error_code == "ERR_INPUT_UNVERIFIED_STANDARD_APPLICATION"

    return {
        "testName": "INJECTED_ERR_INPUT_UNVERIFIED_STANDARD_APPLICATION",
        "expectedErrorCode": "ERR_INPUT_UNVERIFIED_STANDARD_APPLICATION",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_unregistered_source_id() -> Dict[str, Any]:
    print("\n=== [5/14] Testing Gate 1: Rejection of Unregistered Source ID ===")
    sample_path = HERE / "config_verified_spec_sample.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        bad_config = json.load(f)

    # Inject unknown source ID not registered in provenance_registry.json
    bad_config["parts"]["hub"]["source"]["sourceId"] = "SRC-UNREGISTERED-ABC-999"

    res = Gate1_InputProvenance.evaluate(bad_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 MUST reject sourceId not found in provenance registry!"
    assert res.error_code == "ERR_INPUT_UNREGISTERED_SOURCE_ID"

    return {
        "testName": "INJECTED_ERR_INPUT_UNREGISTERED_SOURCE_ID",
        "expectedErrorCode": "ERR_INPUT_UNREGISTERED_SOURCE_ID",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_forged_drawing_number() -> Dict[str, Any]:
    print("\n=== [6/14] Testing Gate 1: Rejection of Forged Drawing Number ===")
    sample_path = HERE / "config_verified_spec_sample.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        bad_config = json.load(f)

    # Use valid registered sourceId with verified file & hash, but alter drawingNumber to something not in registry
    bad_config["parts"]["hub"]["source"] = {
        "sourceId": "SRC-TEST-GENUINE-EVIDENCE-FILE-01",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TAMPERED-WRONG-123",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "citationLocation": "Document header and root JSON metadata"
    }

    res = Gate1_InputProvenance.evaluate(bad_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 MUST reject drawingNumber mismatching registry!"
    assert res.error_code == "ERR_INPUT_FORGED_DRAWING_NUMBER"

    return {
        "testName": "INJECTED_ERR_INPUT_FORGED_DRAWING_NUMBER",
        "expectedErrorCode": "ERR_INPUT_FORGED_DRAWING_NUMBER",
        "actualErrorCode": res.error_code,
        "gateResult": res.to_dict(),
        "passed": True,
    }


def run_negative_gate1_part_mismatch() -> Dict[str, Any]:
    print("\n=== [7/14] Testing Gate 1: Rejection of Part ID Mismatch ===")
    sample_path = HERE / "config_verified_spec_sample.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        bad_config = json.load(f)

    # Use valid registered sourceId (registered for PART-30-006 hub), but claim it for an unauthorized part
    bad_config["parts"]["hub"]["part_id"] = "PART-40-001"  # Rotor part ID claiming hub drawing
    bad_config["parts"]["hub"]["source"] = {
        "sourceId": "SRC-TEST-GENUINE-EVIDENCE-FILE-01",
        "sourceType": "OEM_ENGINEERING_DRAWING",
        "drawingNumber": "DWG-TEST-VERIFIED-2026",
        "revision": "A",
        "applicableScope": "PLATFORM-GEN3-FRONT-CORNER",
        "citationLocation": "Document header and root JSON metadata"
    }

    res = Gate1_InputProvenance.evaluate(bad_config)
    print(f"  -> Evaluation result: passed={res.passed}, error_code={res.error_code}")
    assert not res.passed, "Gate 1 MUST reject part claiming drawing authorized for a different part!"
    assert res.error_code == "ERR_INPUT_PART_MISMATCH"

    return {
        "testName": "INJECTED_ERR_INPUT_PART_MISMATCH",
        "expectedErrorCode": "ERR_INPUT_PART_MISMATCH",
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

    # 1. Positive baseline (DEMO_ESTIMATE with honest disclaimers)
    r1 = run_positive_test()
    suite_results.append(r1)

    # 1b. Positive verified sample with real physical evidence file & valid SHA-256
    r1b = run_positive_verified_evidence_with_real_file_test()
    suite_results.append(r1b)

    # 1c. Anti self-certification: Unverified fixture fails closed under OEM_SPEC
    r1c = run_negative_gate1_unverified_fixture_status()
    suite_results.append(r1c)

    # 1d. Anti self-certification: Missing physical evidence file on disk
    r1d = run_negative_gate1_missing_evidence_file()
    suite_results.append(r1d)

    # 1e. Anti self-certification: Evidence file SHA-256 hash mismatch
    r1e = run_negative_gate1_evidence_hash_mismatch()
    suite_results.append(r1e)

    # 1f. Mandatory metadata: Missing evidenceDocPath
    r1f = run_negative_gate1_missing_evidence_path()
    suite_results.append(r1f)

    # 1g. Mandatory metadata: Missing evidenceSha256
    r1g = run_negative_gate1_missing_evidence_hash()
    suite_results.append(r1g)

    # 1h. Path security: Directory traversal escape
    r1h = run_negative_gate1_evidence_path_escape()
    suite_results.append(r1h)

    # 1i. Path security: Untrusted evidence directory
    r1i = run_negative_gate1_untrusted_evidence_location()
    suite_results.append(r1i)

    # 1j. Environment isolation: Test fixture in production OEM_SPEC mode
    r1j = run_negative_gate1_test_fixture_in_production()
    suite_results.append(r1j)

    # 2. Injected negative tests
    r2 = run_negative_gate1_untrusted_provenance()
    suite_results.append(r2)

    # 2b. Anti false-positive: OEM_SPEC without source/drawingNumber
    r2b = run_negative_gate1_oem_spec_missing_evidence()
    suite_results.append(r2b)

    # 2c. Anti false-positive: ISO_STANDARD claiming vehicle assembly release without OEM document
    r2c = run_negative_gate1_iso_standard_unverified_application()
    suite_results.append(r2c)

    # 2d. Anti false-positive: Unregistered source ID
    r2d = run_negative_gate1_unregistered_source_id()
    suite_results.append(r2d)

    # 2e. Anti false-positive: Forged drawing number mismatching registry
    r2e = run_negative_gate1_forged_drawing_number()
    suite_results.append(r2e)

    # 2f. Anti false-positive: Part ID mismatching authorized parts for drawing
    r2f = run_negative_gate1_part_mismatch()
    suite_results.append(r2f)

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
        "timestamp": "2026-11-16T20:45:00+08:00",
        "provenancePolicy": "STRICT_EVIDENCE_GATED",
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
    temp_ev = EVIDENCE_OUTPUT_PATH.with_suffix(".tmp.json")
    temp_ev.write_text(json.dumps(evidence_data, indent=2), encoding="utf-8")
    if EVIDENCE_OUTPUT_PATH.exists():
        try:
            EVIDENCE_OUTPUT_PATH.unlink()
        except Exception:
            pass
    temp_ev.replace(EVIDENCE_OUTPUT_PATH)

    print("\n=================================================================")
    print(f"ALL {len(suite_results)} QUALITY GATE TESTS PASSED!")
    print(f"Evidence written to: {EVIDENCE_OUTPUT_PATH}")
    print("=================================================================")


if __name__ == "__main__":
    main()
