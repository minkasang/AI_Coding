"""
Automated Verification Suite for RP-04 Planning Feasibility Prototype (Rework V2).
Covers:
  1. Valid assembly generation (ISO 273 Medium series: M14 bolt with Ø15.5mm hole -> radial clearance 0.75mm)
  2. ISO 273 Fine series regression test (M14 bolt with Ø15.0mm hole -> radial clearance 0.50mm)
  3. Headless Blender GLB conversion with node.extras engineering metadata validation
  4. Poka-yoke test 1: Hole tighter than ISO 273 fine series (Ø14.2mm) -> FIT REJECTION
  5. Poka-yoke test 2: PCD too small (75mm) punches center bore (67.1mm) -> STRUCTURAL REJECTION
  6. Poka-yoke test 3: PCD too large (150mm) exceeds flange outer diameter (152mm) -> STRUCTURAL REJECTION
  7. JSON evidence update -> docs/planning/evidence/RP-04-feasibility.json
"""

import json
import os
import struct
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[2]
OUT_DIR = HERE / "out"
EVIDENCE_PATH = PROJECT_ROOT / "docs" / "planning" / "evidence" / "RP-04-feasibility.json"
PYTHON_EXE = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
BLENDER_EXE = Path("F:/software/blender/blender.exe")


def run_cmd(cmd: list[str]) -> tuple[int, str, str]:
    env = os.environ.copy()
    env["TMP"] = "F:/tmp"
    env["TEMP"] = "F:/tmp"
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        cwd=str(PROJECT_ROOT),
    )
    return proc.returncode, proc.stdout, proc.stderr


def verify():
    print("=== [RP-04 FEASIBILITY VERIFICATION V2 START] ===")
    results = {
        "task_id": "RP-04",
        "display_code": "02.05",
        "version": "v2_rework_audit_alignment",
        "prototype": "parametric_wheel_hub_bearing_assembly",
        "timestamp": "2026-11-14",
        "audit_review_addressed": "docs/command/reviews/AUDIT_2026-11-14.md",
        "fidelity_status": {
            "bearing": "GEOMETRIC_ENVELOPE_ONLY (ASSUMPTION: contact stress, rolling elements, and preload are unsimulated)",
            "studs": "NOMINAL_CYLINDER_PLUS_METADATA (ASSUMPTION: threads are schematic, not physical helical sweep)",
            "assembly": "WebGL hierarchy verified; multi-mesh export != dynamic joint/stiffness verification (ASSUMPTION)"
        },
        "tests": []
    }

    # -------------------------------------------------------------
    # Test 1: Valid Assembly Build (ISO 273 Medium Series Ø15.5mm)
    # -------------------------------------------------------------
    print("\n--- Test 1: Valid Assembly Build (ISO 273 Medium: Ø15.5mm) ---")
    ret, stdout, stderr = run_cmd([
        str(PYTHON_EXE),
        str(HERE / "wheel_hub_assembly.py"),
        "--out-dir", str(OUT_DIR),
        "--prefix", "wheel_hub_assembly"
    ])
    print(stdout)
    if ret != 0:
        print("STDERR:", stderr)
        raise RuntimeError(f"Valid build failed with code {ret}")

    meta_file = OUT_DIR / "wheel_hub_assembly_metadata.json"
    with meta_file.open("r", encoding="utf-8") as f:
        meta = json.load(f)

    # Assertions on B-rep
    hub_valid = meta["components"]["hub"]["solid_valid"]
    bearing_valid = meta["components"]["bearing"]["solid_valid"]
    studs_valid = meta["components"]["studs"]["solid_valid"]
    clearance_info = meta["clearance_fit_check"]
    radial_clearance = clearance_info["radial_clearance_mm"]
    matched_series = clearance_info["iso273_series_matched"]

    assert hub_valid, "Hub solid is invalid B-rep!"
    assert bearing_valid, "Bearing solid is invalid B-rep!"
    assert studs_valid, "Studs compound is invalid B-rep!"
    assert radial_clearance == 0.75, f"Expected 0.75mm radial clearance for ISO 273 medium, got {radial_clearance}"
    assert matched_series == "medium", f"Expected 'medium' series match for Ø15.5mm hole, got '{matched_series}'"

    t1_result = {
        "name": "valid_assembly_cad_build_iso273_medium",
        "status": "PASS",
        "standard_reference": "ISO 273:1979 Fasteners - Clearance holes",
        "hole_diameter_mm": clearance_info["hole_diameter_mm"],
        "stud_diameter_mm": clearance_info["stud_diameter_mm"],
        "radial_clearance_mm": radial_clearance,
        "iso273_series_matched": matched_series,
        "components": {
            "hub": meta["components"]["hub"],
            "bearing": meta["components"]["bearing"],
            "studs": meta["components"]["studs"],
        },
        "assembly_bbox_mm": meta["assembly"]["bbox_size_mm"]
    }
    results["tests"].append(t1_result)
    print("Test 1 PASS: B-rep solids valid. ISO 273 medium series Ø15.5mm (clearance = 0.75 mm) verified.")

    # -------------------------------------------------------------
    # Test 2: ISO 273 Fine Series Test (Ø15.0mm)
    # -------------------------------------------------------------
    print("\n--- Test 2: ISO 273 Fine Series Test (Ø15.0mm) ---")
    ret, stdout, stderr = run_cmd([
        str(PYTHON_EXE),
        str(HERE / "wheel_hub_assembly.py"),
        "--override-hole-d", "15.0",
        "--prefix", "fine_check"
    ])
    print(stdout)
    if ret != 0:
        print("STDERR:", stderr)
        raise RuntimeError(f"Fine series test failed with code {ret}")

    fine_meta_file = OUT_DIR / "fine_check_metadata.json"
    with fine_meta_file.open("r", encoding="utf-8") as f:
        fine_meta = json.load(f)

    fine_clearance = fine_meta["clearance_fit_check"]["radial_clearance_mm"]
    fine_series = fine_meta["clearance_fit_check"]["iso273_series_matched"]
    assert fine_clearance == 0.50, f"Expected 0.50mm radial clearance for fine series, got {fine_clearance}"
    assert fine_series == "fine", f"Expected 'fine' series match for Ø15.0mm, got '{fine_series}'"

    t2_result = {
        "name": "valid_assembly_cad_build_iso273_fine",
        "status": "PASS",
        "hole_diameter_mm": 15.0,
        "radial_clearance_mm": fine_clearance,
        "iso273_series_matched": fine_series,
        "notes": "Verified that Ø15.0mm strictly maps to ISO 273 Fine series, not Medium."
    }
    results["tests"].append(t2_result)
    print("Test 2 PASS: ISO 273 fine series Ø15.0mm (clearance = 0.50 mm) verified.")

    # -------------------------------------------------------------
    # Test 3: Headless Blender GLB Assembly Conversion + extras validation
    # -------------------------------------------------------------
    print("\n--- Test 3: Headless Blender GLB Conversion with extras ---")
    hub_stl = OUT_DIR / "wheel_hub_assembly_hub.stl"
    bearing_stl = OUT_DIR / "wheel_hub_assembly_bearing.stl"
    studs_stl = OUT_DIR / "wheel_hub_assembly_studs.stl"
    out_glb = OUT_DIR / "wheel_hub_assembly.glb"

    blender_cmd = [
        str(BLENDER_EXE),
        "--background",
        "--factory-startup",
        "--python", str(HERE / "blender_assembly_to_glb.py"),
        "--",
        str(hub_stl),
        str(bearing_stl),
        str(studs_stl),
        str(out_glb)
    ]
    ret, stdout, stderr = run_cmd(blender_cmd)
    print(stdout)
    if ret != 0:
        print("STDERR:", stderr)
        raise RuntimeError(f"Blender conversion failed with code {ret}")

    assert out_glb.exists(), "GLB output file was not created!"
    glb_size = out_glb.stat().st_size
    assert glb_size > 10000, f"GLB file suspiciously small: {glb_size} bytes"

    # Verify glTF binary magic number and parse Chunk 0 for extras
    with out_glb.open("rb") as f:
        magic = f.read(4)
        assert magic == b"glTF", f"Invalid glTF header: {magic}"
        version, length = struct.unpack("<II", f.read(8))
        chunk_len, chunk_type = struct.unpack("<II", f.read(8))
        chunk_data = f.read(chunk_len).decode("utf-8")
        gltf_json = json.loads(chunk_data)

    nodes = gltf_json.get("nodes", [])
    node_names = [n.get("name") for n in nodes]
    nodes_with_extras = [n.get("name") for n in nodes if "extras" in n]
    print(f"  glTF Nodes in GLB: {node_names}")
    print(f"  Nodes with extras: {nodes_with_extras}")

    assert "Assembly_WheelHub" in node_names, "Missing Assembly_WheelHub root node!"
    assert "Assembly_WheelHub" in nodes_with_extras, "Assembly_WheelHub missing extras!"
    assert "Part_Hub" in nodes_with_extras, "Part_Hub missing extras!"
    assert "Part_Bearing" in nodes_with_extras, "Part_Bearing missing extras!"
    assert "Part_WheelStuds" in nodes_with_extras, "Part_WheelStuds missing extras!"

    t3_result = {
        "name": "blender_multi_node_glb_export_with_extras",
        "status": "PASS",
        "glb_path": str(out_glb.relative_to(PROJECT_ROOT)),
        "file_size_bytes": glb_size,
        "magic_header": "glTF",
        "unit_scaling": "0.001 (mm -> m)",
        "hierarchy_nodes": node_names,
        "nodes_with_extras": nodes_with_extras,
        "extras_verification": "CONFIRMED: node.extras populated for Assembly and child parts."
    }
    results["tests"].append(t3_result)
    print(f"Test 3 PASS: Multi-node GLB generated with confirmed node.extras attributes.")

    # -------------------------------------------------------------
    # Test 4: Poka-Yoke Fit Rejection - Hole Tighter than ISO 273 Fine
    # -------------------------------------------------------------
    print("\n--- Test 4: Poka-Yoke Test - Hole Tighter than ISO 273 Fine (Ø14.2mm) ---")
    ret, stdout, stderr = run_cmd([
        str(PYTHON_EXE),
        str(HERE / "wheel_hub_assembly.py"),
        "--override-hole-d", "14.2"
    ])
    print("Exit code:", ret)
    print("Stderr:", stderr.strip())
    assert ret == 2, f"Expected returncode 2 for poka-yoke fit rejection, got {ret}"
    assert "POKA-YOKE FIT REJECTED" in stderr, "Expected POKA-YOKE FIT REJECTED in stderr"

    t4_result = {
        "name": "poka_yoke_iso273_fit_rejection",
        "status": "PASS",
        "input_override": {"hub.bolt_hole_diameter_mm": 14.2},
        "expected_failure": "POKA-YOKE FIT REJECTED",
        "actual_exit_code": ret,
        "defense_outcome": "Intercepted hole diameter tighter than ISO 273 Fine standard (15.0mm)."
    }
    results["tests"].append(t4_result)
    print("Test 4 PASS: Non-standard tight clearance hole correctly intercepted by ISO 273 lookup table.")

    # -------------------------------------------------------------
    # Test 5: Poka-Yoke Structural Rejection 1 - PCD Breaches Center Bore
    # -------------------------------------------------------------
    print("\n--- Test 5: Poka-Yoke Test - PCD Too Small (Wall Punch) ---")
    ret, stdout, stderr = run_cmd([
        str(PYTHON_EXE),
        str(HERE / "wheel_hub_assembly.py"),
        "--override-pcd", "75.0"
    ])
    print("Exit code:", ret)
    print("Stderr:", stderr.strip())
    assert ret == 2, f"Expected returncode 2, got {ret}"
    assert "POKA-YOKE STRUCTURAL REJECTED" in stderr, "Expected POKA-YOKE STRUCTURAL REJECTED in stderr"

    t5_result = {
        "name": "poka_yoke_inner_wall_rejection",
        "status": "PASS",
        "input_override": {"hub.pcd_mm": 75.0},
        "expected_failure": "POKA-YOKE STRUCTURAL REJECTED",
        "actual_exit_code": ret,
        "defense_outcome": "Prevented kernel boolean collapse and geometric wall puncture into center bore."
    }
    results["tests"].append(t5_result)
    print("Test 5 PASS: Invalid PCD correctly intercepted and blocked by Poka-Yoke validator.")

    # -------------------------------------------------------------
    # Test 6: Poka-Yoke Structural Rejection 2 - PCD Exceeds Flange OD
    # -------------------------------------------------------------
    print("\n--- Test 6: Poka-Yoke Test - PCD Exceeds Flange OD ---")
    ret, stdout, stderr = run_cmd([
        str(PYTHON_EXE),
        str(HERE / "wheel_hub_assembly.py"),
        "--override-pcd", "150.0"
    ])
    print("Exit code:", ret)
    print("Stderr:", stderr.strip())
    assert ret == 2, f"Expected returncode 2, got {ret}"
    assert "POKA-YOKE STRUCTURAL REJECTED" in stderr, "Expected POKA-YOKE STRUCTURAL REJECTED"

    t6_result = {
        "name": "poka_yoke_outer_margin_rejection",
        "status": "PASS",
        "input_override": {"hub.pcd_mm": 150.0},
        "expected_failure": "POKA-YOKE STRUCTURAL REJECTED",
        "actual_exit_code": ret,
        "defense_outcome": "Prevented hole punch through outer flange perimeter."
    }
    results["tests"].append(t6_result)
    print("Test 6 PASS: Outer diameter overrun correctly intercepted and blocked.")

    # -------------------------------------------------------------
    # Write JSON Evidence
    # -------------------------------------------------------------
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with EVIDENCE_PATH.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n[EVIDENCE WRITTEN]: {EVIDENCE_PATH}")
    print("=== [ALL RP-04 REWORK FEASIBILITY VERIFICATIONS PASSED] ===")


if __name__ == "__main__":
    verify()
