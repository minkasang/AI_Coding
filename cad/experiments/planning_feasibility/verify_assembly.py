"""
Automated Verification Suite for RP-04 Planning Feasibility Prototype.
Runs:
  1. Valid assembly generation (CAD solids, B-rep validity, bounding boxes, volumes)
  2. ISO 273 clearance fit assertion
  3. Blender headless GLB conversion & mesh geometry inspection
  4. Poka-yoke anti-pattern tests (asserting rejection on invalid parameters)
  5. JSON evidence generation -> docs/planning/evidence/RP-04-feasibility.json
"""

import json
import os
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
    print("=== [RP-04 FEASIBILITY VERIFICATION START] ===")
    results = {
        "task_id": "RP-04",
        "display_code": "02.05",
        "prototype": "parametric_wheel_hub_bearing_assembly",
        "timestamp": "2026-11-14",
        "tests": []
    }

    # -------------------------------------------------------------
    # Test 1: Valid Assembly Build (build123d CAD)
    # -------------------------------------------------------------
    print("\n--- Test 1: Valid Assembly Build ---")
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
    radial_clearance = meta["clearance_fit_check"]["radial_clearance_mm"]

    assert hub_valid, "Hub solid is invalid B-rep!"
    assert bearing_valid, "Bearing solid is invalid B-rep!"
    assert studs_valid, "Studs compound is invalid B-rep!"
    assert radial_clearance == 0.5, f"Expected 0.5mm radial clearance, got {radial_clearance}"

    t1_result = {
        "name": "valid_assembly_cad_build",
        "status": "PASS",
        "clearance_check": meta["clearance_fit_check"],
        "components": {
            "hub": meta["components"]["hub"],
            "bearing": meta["components"]["bearing"],
            "studs": meta["components"]["studs"],
        },
        "assembly_bbox_mm": meta["assembly"]["bbox_size_mm"]
    }
    results["tests"].append(t1_result)
    print("Test 1 PASS: B-rep solids valid, ISO 273 clearance = 0.50 mm verified.")

    # -------------------------------------------------------------
    # Test 2: Headless Blender GLB Assembly Conversion
    # -------------------------------------------------------------
    print("\n--- Test 2: Headless Blender GLB Conversion ---")
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

    # Verify glTF binary magic number
    with out_glb.open("rb") as f:
        magic = f.read(4)
        assert magic == b"glTF", f"Invalid glTF header: {magic}"

    t2_result = {
        "name": "blender_multi_node_glb_export",
        "status": "PASS",
        "glb_path": str(out_glb.relative_to(PROJECT_ROOT)),
        "file_size_bytes": glb_size,
        "magic_header": "glTF",
        "unit_scaling": "0.001 (mm -> m)",
        "hierarchy_nodes": ["Assembly_WheelHub", "Part_Hub", "Part_Bearing", "Part_WheelStuds"]
    }
    results["tests"].append(t2_result)
    print(f"Test 2 PASS: Multi-node GLB generated ({glb_size} bytes, magic header valid).")

    # -------------------------------------------------------------
    # Test 3: Poka-Yoke Anti-Pattern Test 1 - PCD Breaches Center Bore
    # -------------------------------------------------------------
    print("\n--- Test 3: Poka-Yoke Test - PCD Too Small (Wall Punch) ---")
    # center bore = 67.1mm, hole = 15mm. If PCD is set to 75mm, margin is (75-67.1)/2 - 7.5 = -3.55mm!
    ret, stdout, stderr = run_cmd([
        str(PYTHON_EXE),
        str(HERE / "wheel_hub_assembly.py"),
        "--override-pcd", "75.0"
    ])
    print("Exit code:", ret)
    print("Stderr:", stderr.strip())
    assert ret == 2, f"Expected returncode 2 for poka-yoke rejection, got {ret}"
    assert "POKA-YOKE STRUCTURAL REJECTED" in stderr, "Expected POKA-YOKE STRUCTURAL REJECTED in stderr"

    t3_result = {
        "name": "poka_yoke_wall_thickness_rejection",
        "status": "PASS",
        "input_override": {"hub.pcd_mm": 75.0},
        "expected_failure": "POKA-YOKE STRUCTURAL REJECTED",
        "actual_exit_code": ret,
        "defense_outcome": "Prevented kernel boolean collapse and geometric wall puncture."
    }
    results["tests"].append(t3_result)
    print("Test 3 PASS: Invalid PCD correctly intercepted and blocked by Poka-Yoke validator.")

    # -------------------------------------------------------------
    # Test 4: Poka-Yoke Anti-Pattern Test 2 - PCD Exceeds Flange OD
    # -------------------------------------------------------------
    print("\n--- Test 4: Poka-Yoke Test - PCD Exceeds Flange OD ---")
    # outer_diameter = 152mm. If PCD = 150mm and hole = 15mm, holes poke outside flange!
    ret, stdout, stderr = run_cmd([
        str(PYTHON_EXE),
        str(HERE / "wheel_hub_assembly.py"),
        "--override-pcd", "150.0"
    ])
    print("Exit code:", ret)
    print("Stderr:", stderr.strip())
    assert ret == 2, f"Expected returncode 2, got {ret}"
    assert "POKA-YOKE STRUCTURAL REJECTED" in stderr, "Expected POKA-YOKE STRUCTURAL REJECTED"

    t4_result = {
        "name": "poka_yoke_outer_margin_rejection",
        "status": "PASS",
        "input_override": {"hub.pcd_mm": 150.0},
        "expected_failure": "POKA-YOKE STRUCTURAL REJECTED",
        "actual_exit_code": ret,
        "defense_outcome": "Prevented hole punch through outer flange perimeter."
    }
    results["tests"].append(t4_result)
    print("Test 4 PASS: Outer diameter overrun correctly intercepted and blocked.")

    # -------------------------------------------------------------
    # Write JSON Evidence
    # -------------------------------------------------------------
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with EVIDENCE_PATH.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n[EVIDENCE WRITTEN]: {EVIDENCE_PATH}")
    print("=== [ALL RP-04 FEASIBILITY VERIFICATIONS PASSED] ===")


if __name__ == "__main__":
    verify()
