"""
CARLAB Asset Quality Pipeline - CAD Solid Generator v2
Model: Gemini 3.8 Flash (gemini-3-8-flash)
Task: R-08 (03.10)

Integrates Gate 1 (Input/Provenance), Gate 2 (CAD Topology),
Gate 3 (Assembly Clearance), and Gate 6 (Transactional Atomic Cache).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from build123d import (
    Align,
    BuildPart,
    Cylinder,
    Locations,
    Mode,
    PolarLocations,
    Solid,
    export_step,
    export_stl,
)

from quality_gate import (
    Gate1_InputProvenance,
    Gate2_CadTopology,
    Gate3_AssemblyClearance,
    Gate6_AtomicCache,
    GateResult,
    TransactionalStaging,
)

HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = HERE / "config_standard.json"
DEFAULT_OUT_DIR = HERE / "out"
BUILD_CODE_VERSION = "2026.11.14.v2-gate"


def build_hub_solid(cfg: Dict[str, Any]) -> Solid:
    od = float(cfg["outer_diameter_mm"])
    th = float(cfg["flange_thickness_mm"])
    cb = float(cfg["center_bore_mm"])
    pilot_d = float(cfg["pilot_diameter_mm"])
    pilot_h = float(cfg["pilot_height_mm"])
    pcd = float(cfg["pcd_mm"])
    bolt_count = int(cfg["bolt_count"])
    hole_d = float(cfg["bolt_hole_diameter_mm"])

    with BuildPart() as bp:
        # Flange disk
        Cylinder(radius=od / 2.0, height=th, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # Spigot pilot
        with Locations((0, 0, th)):
            Cylinder(radius=pilot_d / 2.0, height=pilot_h, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # Center bore
        with Locations((0, 0, -2)):
            Cylinder(radius=cb / 2.0, height=th + pilot_h + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
        # PCD bolt holes
        with Locations((0, 0, -2)):
            with PolarLocations(radius=pcd / 2.0, count=bolt_count):
                Cylinder(radius=hole_d / 2.0, height=th + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)

    return bp.part


def build_rotor_solid(cfg: Dict[str, Any]) -> Solid:
    rotor_od = float(cfg["rotor_outer_diameter_mm"])
    rotor_th = float(cfg["rotor_thickness_mm"])
    hat_od = float(cfg["hat_outer_diameter_mm"])
    hat_h = float(cfg["hat_height_mm"])
    hat_th = float(cfg["hat_thickness_mm"])
    cb = float(cfg["center_bore_mm"])
    pcd = float(cfg["pcd_mm"])
    bolt_count = int(cfg["bolt_count"])
    hole_d = float(cfg["bolt_hole_diameter_mm"])

    with BuildPart() as bp:
        # 1. Hat mounting face (Z: 0 to hat_th)
        Cylinder(radius=hat_od / 2.0, height=hat_th, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # 2. Hat cylindrical barrel (Z: hat_th to hat_h)
        with Locations((0, 0, hat_th)):
            Cylinder(radius=hat_od / 2.0, height=hat_h - hat_th, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # 3. Outer rotor friction disc (Z: hat_h to hat_h + rotor_th)
        with Locations((0, 0, hat_h)):
            Cylinder(radius=rotor_od / 2.0, height=rotor_th, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # 4. Hollow out inner barrel
        with Locations((0, 0, hat_th)):
            Cylinder(radius=(hat_od / 2.0) - hat_th, height=hat_h + rotor_th + 2.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
        # 5. Center bore
        with Locations((0, 0, -2)):
            Cylinder(radius=cb / 2.0, height=hat_h + rotor_th + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
        # 6. Bolt holes
        with Locations((0, 0, -2)):
            with PolarLocations(radius=pcd / 2.0, count=bolt_count):
                Cylinder(radius=hole_d / 2.0, height=hat_th + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)

    return bp.part


def build_bearing_solid(cfg: Dict[str, Any]) -> Solid:
    od = float(cfg["outer_diameter_mm"])
    id_d = float(cfg["inner_diameter_mm"])
    w = float(cfg["width_mm"])

    with BuildPart() as bp:
        Cylinder(radius=od / 2.0, height=w, align=(Align.CENTER, Align.CENTER, Align.MIN))
        with Locations((0, 0, -1)):
            Cylinder(radius=id_d / 2.0, height=w + 2.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)

    return bp.part


def build_stud_solid(cfg: Dict[str, Any]) -> Solid:
    head_d = float(cfg["head_diameter_mm"])
    head_th = float(cfg["head_thickness_mm"])
    shank_d = float(cfg["nominal_diameter_mm"])
    shank_len = float(cfg["shank_length_mm"])

    with BuildPart() as bp:
        # Head (Z: -head_th to 0)
        with Locations((0, 0, -head_th)):
            Cylinder(radius=head_d / 2.0, height=head_th, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # Shank (Z: 0 to shank_len)
        Cylinder(radius=shank_d / 2.0, height=shank_len, align=(Align.CENTER, Align.CENTER, Align.MIN))

    return bp.part


BUILDERS = {
    "hub": build_hub_solid,
    "rotor": build_rotor_solid,
    "bearing": build_bearing_solid,
    "stud": build_stud_solid,
}


def run_cad_pipeline(
    config_path: Path = DEFAULT_CONFIG_PATH,
    out_dir: Path = DEFAULT_OUT_DIR,
    force_rebuild: bool = False,
) -> Tuple[bool, Dict[str, Any]]:
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    report: Dict[str, Any] = {
        "pipeline_version": config.get("pipeline_version", "2.0.0"),
        "config_path": str(config_path),
        "gate_results": {},
        "built_parts": {},
        "cache_stats": {"hits": 0, "misses": 0},
        "success": False,
    }

    # =========================================================================
    # GATE 1: Input & Provenance
    # =========================================================================
    g1_res = Gate1_InputProvenance.evaluate(config)
    report["gate_results"]["GATE_01_INPUT_PROVENANCE"] = g1_res.to_dict()
    if not g1_res.passed:
        report["error"] = g1_res.message
        return False, report

    # Generate solids and evaluate GATE 2 & GATE 3
    solids: Dict[str, Any] = {}
    parts = config["parts"]

    # Transactional staging
    staging = TransactionalStaging(out_dir)
    staging_dir = staging.__enter__()

    try:
        manifest_cache_file = out_dir / "cache_manifest.json"
        cached_manifest = {}
        if manifest_cache_file.exists() and not force_rebuild:
            try:
                with open(manifest_cache_file, "r", encoding="utf-8") as f:
                    cached_manifest = json.load(f)
            except Exception:
                cached_manifest = {}

        for part_key, part_cfg in parts.items():
            fingerprint = Gate6_AtomicCache.compute_deterministic_hash(part_key, part_cfg, BUILD_CODE_VERSION)
            step_file = out_dir / f"{part_key}.step"
            stl_file = out_dir / f"{part_key}.stl"

            cached_entry = cached_manifest.get(part_key)
            is_cache_valid = (
                not force_rebuild
                and cached_entry is not None
                and cached_entry.get("fingerprint") == fingerprint
                and step_file.exists()
                and stl_file.exists()
            )

            # Build solid for geometry and assembly check
            builder_fn = BUILDERS.get(part_key)
            if not builder_fn:
                raise ValueError(f"No builder registered for part '{part_key}'.")

            solid = builder_fn(part_cfg)
            solids[part_key] = solid

            # =====================================================================
            # GATE 2: CAD Geometry & Topology Gate
            # =====================================================================
            g2_res = Gate2_CadTopology.evaluate(part_key, solid)
            report["gate_results"][f"GATE_02_CAD_TOPOLOGY_{part_key}"] = g2_res.to_dict()
            if not g2_res.passed:
                staging.rollback()
                report["error"] = g2_res.message
                return False, report

            if is_cache_valid:
                report["cache_stats"]["hits"] += 1
                # Copy from out_dir to staging to maintain atomic set
                shutil.copy2(step_file, staging_dir / step_file.name)
                shutil.copy2(stl_file, staging_dir / stl_file.name)
                report["built_parts"][part_key] = {
                    "fingerprint": fingerprint,
                    "status": "CACHE_HIT",
                    "step": str(step_file),
                    "stl": str(stl_file),
                    "volumeMm3": float(solid.volume),
                }
            else:
                report["cache_stats"]["misses"] += 1
                target_step = staging_dir / f"{part_key}.step"
                target_stl = staging_dir / f"{part_key}.stl"
                export_step(solid, str(target_step))
                export_stl(solid, str(target_stl))
                report["built_parts"][part_key] = {
                    "fingerprint": fingerprint,
                    "status": "CACHE_MISS_REBUILT",
                    "step": str(out_dir / f"{part_key}.step"),
                    "stl": str(out_dir / f"{part_key}.stl"),
                    "volumeMm3": float(solid.volume),
                }

        # =========================================================================
        # GATE 3: Assembly Clearance & Interference
        # =========================================================================
        g3_res = Gate3_AssemblyClearance.evaluate(config, solids)
        report["gate_results"]["GATE_03_ASSEMBLY_CLEARANCE"] = g3_res.to_dict()
        if not g3_res.passed:
            staging.rollback()
            report["error"] = g3_res.message
            return False, report

        # Write updated cache manifest to staging
        new_manifest = {
            part_key: {
                "fingerprint": report["built_parts"][part_key]["fingerprint"],
                "step": f"{part_key}.step",
                "stl": f"{part_key}.stl",
                "volumeMm3": report["built_parts"][part_key]["volumeMm3"],
            }
            for part_key in parts
        }
        with open(staging_dir / "cache_manifest.json", "w", encoding="utf-8") as f:
            json.dump(new_manifest, f, indent=2)

        # Commit transactional staging
        staging.commit()
        report["success"] = True
        return True, report

    except Exception as exc:
        staging.rollback()
        report["error"] = str(exc)
        return False, report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run CAD Asset Quality Pipeline")
    parser.add_argument("--config", type=str, default=str(DEFAULT_CONFIG_PATH))
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    success, res = run_cad_pipeline(
        config_path=Path(args.config),
        out_dir=Path(args.out),
        force_rebuild=args.force,
    )
    print(json.dumps(res, indent=2))
    sys.exit(0 if success else 1)
