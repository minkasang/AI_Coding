"""
Multi-Part CAD Asset Generator with Fingerprint-Based Incremental Cache.
Demonstrates:
  1. Part Type (partId) vs Physical Instance (instanceId) separation
  2. SHA-256 fingerprinting for deterministic incremental rebuilds
  3. MountFrame assembly constraint alignment
  4. build123d 0.13.0 B-rep & tessellated STL generation
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

from build123d import (
    Align,
    BuildPart,
    Compound,
    Cylinder,
    Locations,
    Mode,
    PolarLocations,
    Solid,
    Unit,
    export_step,
    export_stl,
)

HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = HERE / "pipeline_config.json"
DEFAULT_OUT_DIR = HERE / "out"
BUILD_CODE_VERSION = "2026.11.14.v1"


def get_part_fingerprint(part_key: str, part_cfg: dict, code_version: str) -> str:
    payload = {
        "part_key": part_key,
        "part_cfg": part_cfg,
        "code_version": code_version,
    }
    dumped = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(dumped.encode("utf-8")).hexdigest()[:16]


def build_hub_solid(cfg: dict) -> Solid:
    od = float(cfg["outer_diameter_mm"])
    th = float(cfg["flange_thickness_mm"])
    cb = float(cfg["center_bore_mm"])
    pilot_d = float(cfg["pilot_diameter_mm"])
    pilot_h = float(cfg["pilot_height_mm"])
    pcd = float(cfg["pcd_mm"])
    bolt_count = int(cfg["bolt_count"])
    hole_d = float(cfg["bolt_hole_diameter_mm"])

    with BuildPart() as bp:
        # Flange disk: Z from 0 to th
        Cylinder(radius=od / 2.0, height=th, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # Pilot spigot: Z from th to th + pilot_h
        with Locations((0, 0, th)):
            Cylinder(radius=pilot_d / 2.0, height=pilot_h, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # Center bore cut: through all Z
        with Locations((0, 0, -2)):
            Cylinder(radius=cb / 2.0, height=th + pilot_h + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
        # PCD bolt holes: through flange thickness
        with Locations((0, 0, -2)):
            with PolarLocations(radius=pcd / 2.0, count=bolt_count):
                Cylinder(radius=hole_d / 2.0, height=th + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)

    return bp.part


def build_rotor_solid(cfg: dict) -> Solid:
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
        # 2. Hat cylindrical drum (Z: hat_th to hat_h)
        with Locations((0, 0, hat_th)):
            Cylinder(radius=hat_od / 2.0, height=hat_h - hat_th, align=(Align.CENTER, Align.CENTER, Align.MIN))
            # Hollow out interior
            Cylinder(radius=(hat_od - 16.0) / 2.0, height=hat_h - hat_th + 2.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
        # 3. Friction ring (Z: hat_h - rotor_th to hat_h)
        with Locations((0, 0, hat_h - rotor_th)):
            Cylinder(radius=rotor_od / 2.0, height=rotor_th, align=(Align.CENTER, Align.CENTER, Align.MIN))
            # Inner friction diameter relief
            Cylinder(radius=(hat_od + 20.0) / 2.0, height=rotor_th + 2.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
        # 4. Center bore
        with Locations((0, 0, -2)):
            Cylinder(radius=cb / 2.0, height=hat_h + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
        # 5. PCD mounting holes on hat face
        with Locations((0, 0, -2)):
            with PolarLocations(radius=pcd / 2.0, count=bolt_count):
                Cylinder(radius=hole_d / 2.0, height=hat_th + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)

    return bp.part


def build_bearing_solid(cfg: dict) -> Solid:
    od = float(cfg["outer_diameter_mm"])
    id_ = float(cfg["inner_diameter_mm"])
    w = float(cfg["width_mm"])

    with BuildPart() as bp:
        with Locations((0, 0, -w)):
            Cylinder(radius=od / 2.0, height=w, align=(Align.CENTER, Align.CENTER, Align.MIN))
            Cylinder(radius=id_ / 2.0, height=w + 4.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
            # Internal raceway/seal groove simulation
            with Locations((0, 0, 4.0)):
                Cylinder(radius=(od - 6.0) / 2.0, height=w - 8.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
                Cylinder(radius=(id_ + 6.0) / 2.0, height=w - 6.0, align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.ADD)

    return bp.part


def build_single_stud_solid(cfg: dict) -> Solid:
    stud_d = float(cfg["nominal_diameter_mm"])
    head_d = float(cfg["head_diameter_mm"])
    head_th = float(cfg["head_thickness_mm"])
    shank_l = float(cfg["shank_length_mm"])

    with BuildPart() as bp:
        # Head at Z: -head_th to 0
        with Locations((0, 0, -head_th)):
            Cylinder(radius=head_d / 2.0, height=head_th, align=(Align.CENTER, Align.CENTER, Align.MIN))
        # Shank extending into +Z: 0 to shank_l
        Cylinder(radius=stud_d / 2.0, height=shank_l, align=(Align.CENTER, Align.CENTER, Align.MIN))

    return bp.part


def generate_pipeline(config_path: Path, out_dir: Path, overrides: dict | None = None) -> dict:
    start_time = time.time()
    with config_path.open("r", encoding="utf-8") as f:
        config = json.load(f)

    if overrides:
        for k, v in overrides.items():
            if "." in k:
                sec, sub = k.split(".", 1)
                config["parts"][sec][sub] = v
            else:
                config[k] = v

    out_dir.mkdir(parents=True, exist_ok=True)
    parts_dir = out_dir / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)

    cache_file = out_dir / "cache_manifest.json"
    cache = {}
    if cache_file.exists():
        try:
            with cache_file.open("r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            cache = {}

    builders = {
        "hub": build_hub_solid,
        "rotor": build_rotor_solid,
        "bearing": build_bearing_solid,
        "stud": build_single_stud_solid,
    }

    built_solids = {}
    part_records = {}
    cache_stats = {"hits": 0, "misses": 0}

    for part_key, builder_fn in builders.items():
        part_cfg = config["parts"][part_key]
        fingerprint = get_part_fingerprint(part_key, part_cfg, BUILD_CODE_VERSION)
        step_file = parts_dir / f"{part_cfg['part_id']}.step"
        stl_file = parts_dir / f"{part_cfg['part_id']}.stl"

        is_cached = (
            part_key in cache
            and cache[part_key].get("fingerprint") == fingerprint
            and step_file.exists()
            and stl_file.exists()
        )

        if is_cached:
            cache_stats["hits"] += 1
            print(f"  [CACHE HIT] {part_key} ({part_cfg['part_id']}) fingerprint={fingerprint}")
            # Reconstruct Solid for assembly compound
            solid = builder_fn(part_cfg)
            built_solids[part_key] = solid
            part_records[part_key] = {
                "part_id": part_cfg["part_id"],
                "fingerprint": fingerprint,
                "status": "CACHED",
                "step_path": str(step_file.relative_to(out_dir)),
                "stl_path": str(stl_file.relative_to(out_dir)),
                "volume_mm3": cache[part_key]["volume_mm3"],
                "bbox_size_mm": cache[part_key]["bbox_size_mm"],
            }
        else:
            cache_stats["misses"] += 1
            print(f"  [CACHE MISS -> BUILD] {part_key} ({part_cfg['part_id']}) fingerprint={fingerprint}")
            solid = builder_fn(part_cfg)
            built_solids[part_key] = solid

            export_step(solid, str(step_file), unit=Unit.MM)
            export_stl(solid, str(stl_file), tolerance=0.02, angular_tolerance=0.1, ascii_format=False)

            bbox = solid.bounding_box()
            vol = round(float(solid.volume), 2)
            bbox_size = [round(float(bbox.size.X), 3), round(float(bbox.size.Y), 3), round(float(bbox.size.Z), 3)]

            cache[part_key] = {
                "fingerprint": fingerprint,
                "volume_mm3": vol,
                "bbox_size_mm": bbox_size,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            part_records[part_key] = {
                "part_id": part_cfg["part_id"],
                "fingerprint": fingerprint,
                "status": "REBUILT",
                "step_path": str(step_file.relative_to(out_dir)),
                "stl_path": str(stl_file.relative_to(out_dir)),
                "volume_mm3": vol,
                "bbox_size_mm": bbox_size,
            }

    # Save updated cache manifest
    with cache_file.open("w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)

    # Instantiate assembly
    hub_solid = built_solids["hub"]
    rotor_solid = built_solids["rotor"]
    bearing_solid = built_solids["bearing"]
    single_stud = built_solids["stud"]

    # Stud array: 5 instances transformed along PCD
    stud_cfg = config["parts"]["stud"]
    pcd = float(stud_cfg["pcd_mm"])
    n_studs = int(stud_cfg["instance_count"])

    stud_instances = []
    instance_metadata = []
    for i in range(n_studs):
        angle = (2.0 * math.pi / n_studs) * i
        x = (pcd / 2.0) * math.cos(angle)
        y = (pcd / 2.0) * math.sin(angle)
        inst_solid = single_stud.locate(Locations((x, y, 0)).locations[0])
        stud_instances.append(inst_solid)
        instance_metadata.append({
            "instance_id": f"{stud_cfg['part_id']}#inst_{i}",
            "part_id": stud_cfg["part_id"],
            "transform_mm": {
                "translation": [round(x, 4), round(y, 4), 0.0],
                "rotation_deg": [0.0, 0.0, round(math.degrees(angle), 2)]
            }
        })

    assembly_solids = [hub_solid, rotor_solid, bearing_solid] + stud_instances
    assembly_compound = Compound(assembly_solids)
    assembly_step = out_dir / f"{config['assembly_id']}.step"
    export_step(assembly_compound, str(assembly_step), unit=Unit.MM)

    elapsed = round(time.time() - start_time, 4)
    summary = {
        "assembly_id": config["assembly_id"],
        "pipeline_version": config["pipeline_version"],
        "elapsed_seconds": elapsed,
        "cache_stats": cache_stats,
        "parts": part_records,
        "instances": {
            "stud_instances": instance_metadata
        },
        "assembly_step": str(assembly_step.name),
        "total_volume_mm3": round(float(assembly_compound.volume), 2),
    }

    summary_file = out_dir / "build_summary.json"
    with summary_file.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    return summary


def main():
    parser = argparse.ArgumentParser(description="Multi-part asset generator with incremental cache.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--override-rotor-od", type=float, default=None)
    args = parser.parse_args()

    overrides = {}
    if args.override_rotor_od is not None:
        overrides["rotor.rotor_outer_diameter_mm"] = args.override_rotor_od

    summary = generate_pipeline(args.config, args.out_dir, overrides)
    print(f"\nASSET_GENERATOR_SUCCESS: {summary['assembly_id']}")
    print(f"  Elapsed: {summary['elapsed_seconds']}s")
    print(f"  Cache Stats: {summary['cache_stats']['hits']} hits, {summary['cache_stats']['misses']} misses")
    print(f"  Total Volume: {summary['total_volume_mm3']} mm^3")


if __name__ == "__main__":
    main()
