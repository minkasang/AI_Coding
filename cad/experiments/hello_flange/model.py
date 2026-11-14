"""
Parametric wheel hub flange test part built with build123d (CAD unit: mm).
Exports STEP (exact B-rep CAD) and STL (mesh middleware) plus metadata JSON.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from build123d import (
    Align,
    BuildPart,
    Cylinder,
    Mode,
    PolarLocations,
    Unit,
    export_step,
    export_stl,
)

HERE = Path(__file__).resolve().parent
DEFAULT_PARAMS_PATH = HERE / "params.json"
DEFAULT_OUT_DIR = HERE / "out"


def load_params(params_path: Path, overrides: dict[str, float | int | None]) -> dict:
    with params_path.open("r", encoding="utf-8") as f:
        params = json.load(f)

    for key, val in overrides.items():
        if val is not None:
            params[key] = val

    validate_params(params)
    return params


def validate_params(p: dict) -> None:
    od = float(p["outer_diameter_mm"])
    th = float(p["thickness_mm"])
    pcd = float(p["pcd_mm"])
    cb = float(p["center_bore_mm"])
    bolt_d = float(p["bolt_hole_mm"])
    bolt_n = int(p["bolt_count"])

    if min(od, th, pcd, cb, bolt_d) <= 0:
        raise ValueError("All geometric dimensions must be positive (mm).")
    if bolt_n < 1:
        raise ValueError("bolt_count must be >= 1.")
    if cb + bolt_d >= pcd:
        raise ValueError(
            f"Bolt holes ({bolt_d} mm) on PCD ({pcd} mm) intersect center bore ({cb} mm)."
        )
    if pcd + bolt_d >= od:
        raise ValueError(
            f"Bolt holes ({bolt_d} mm) on PCD ({pcd} mm) exceed outer diameter ({od} mm)."
        )


def build_flange(params: dict):
    od = float(params["outer_diameter_mm"])
    th = float(params["thickness_mm"])
    pcd = float(params["pcd_mm"])
    cb = float(params["center_bore_mm"])
    bolt_d = float(params["bolt_hole_mm"])
    bolt_n = int(params["bolt_count"])

    outer_r = od / 2.0
    cb_r = cb / 2.0
    pcd_r = pcd / 2.0
    bolt_r = bolt_d / 2.0
    cut_h = th + 4.0

    with BuildPart() as bp:
        Cylinder(
            radius=outer_r,
            height=th,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
        # 中心孔通孔
        Cylinder(
            radius=cb_r,
            height=cut_h,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
            mode=Mode.SUBTRACT,
        )
        # 5 个均匀分布在 PCD 圆上的螺栓通孔
        with PolarLocations(radius=pcd_r, count=bolt_n):
            Cylinder(
                radius=bolt_r,
                height=cut_h,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
                mode=Mode.SUBTRACT,
            )

    return bp.part


def analytical_volume_mm3(params: dict) -> float:
    outer_r = float(params["outer_diameter_mm"]) / 2.0
    cb_r = float(params["center_bore_mm"]) / 2.0
    bolt_r = float(params["bolt_hole_mm"]) / 2.0
    bolt_n = int(params["bolt_count"])
    th = float(params["thickness_mm"])
    return math.pi * (outer_r**2 - cb_r**2 - bolt_n * bolt_r**2) * th


def export_flange(
    params: dict,
    out_dir: Path,
    prefix: str = "hello_flange",
    stl_tolerance: float = 0.02,
    stl_angular_tolerance: float = 0.1,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    part = build_flange(params)

    step_path = out_dir / f"{prefix}.step"
    stl_path = out_dir / f"{prefix}.stl"
    meta_path = out_dir / f"{prefix}_metadata.json"

    step_ok = export_step(part, str(step_path), unit=Unit.MM)
    stl_ok = export_stl(
        part,
        str(stl_path),
        tolerance=stl_tolerance,
        angular_tolerance=stl_angular_tolerance,
        ascii_format=False,
    )
    if not step_ok or not stl_ok:
        raise RuntimeError(f"Export failed: step_ok={step_ok}, stl_ok={stl_ok}")

    bbox = part.bounding_box()
    expected_vol = analytical_volume_mm3(params)
    meta = {
        "part_name": params.get("part_name", prefix),
        "unit": "mm",
        "parameters": params,
        "measured": {
            "brep_volume_mm3": round(float(part.volume), 4),
            "analytical_volume_mm3": round(expected_vol, 4),
            "bbox_size_mm": [
                round(float(bbox.size.X), 4),
                round(float(bbox.size.Y), 4),
                round(float(bbox.size.Z), 4),
            ],
        },
        "files": {
            "step": str(step_path),
            "stl": str(stl_path),
        },
        "notes": [
            "CAD units are millimeters (mm).",
            "STL is a mesh intermediate only; it does not preserve material or assembly hierarchy.",
        ],
    }
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return meta


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Generate parametric hub flange STEP/STL via build123d.")
    ap.add_argument("--params", type=Path, default=DEFAULT_PARAMS_PATH)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--prefix", type=str, default="hello_flange")
    ap.add_argument("--outer-diameter", type=float, default=None, dest="outer_diameter_mm")
    ap.add_argument("--thickness", type=float, default=None, dest="thickness_mm")
    ap.add_argument("--pcd", type=float, default=None, dest="pcd_mm")
    ap.add_argument("--center-bore", type=float, default=None, dest="center_bore_mm")
    ap.add_argument("--bolt-hole", type=float, default=None, dest="bolt_hole_mm")
    return ap.parse_args()


if __name__ == "__main__":
    args = parse_args()
    overrides = {
        "outer_diameter_mm": args.outer_diameter_mm,
        "thickness_mm": args.thickness_mm,
        "pcd_mm": args.pcd_mm,
        "center_bore_mm": args.center_bore_mm,
        "bolt_hole_mm": args.bolt_hole_mm,
    }
    p = load_params(args.params, overrides)
    result = export_flange(p, args.out_dir, prefix=args.prefix)
    print(json.dumps(result, indent=2, ensure_ascii=False))
