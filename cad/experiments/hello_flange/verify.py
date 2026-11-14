"""
Verification script for hello_flange CAD outputs (STEP + STL + parameter variation).
Checks positive volume, hole counts, outer diameter, PCD radius, and STL mesh bounds.
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

from build123d import GeomType, import_step

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from model import analytical_volume_mm3, export_flange, load_params  # noqa: E402


def read_stl_stats(stl_path: Path) -> dict:
    data = stl_path.read_bytes()
    if len(data) < 84:
        raise ValueError(f"STL file too small: {stl_path}")

    tri_count = struct.unpack_from("<I", data, 80)[0]
    expected_bin_size = 84 + tri_count * 50
    if len(data) != expected_bin_size:
        raise ValueError(
            f"Expected binary STL size {expected_bin_size}, got {len(data)} bytes."
        )

    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    offset = 84
    for _ in range(tri_count):
        # skip normal (3 floats), read 3 vertices (9 floats)
        vals = struct.unpack_from("<9f", data, offset + 12)
        xs.extend((vals[0], vals[3], vals[6]))
        ys.extend((vals[1], vals[4], vals[7]))
        zs.extend((vals[2], vals[5], vals[8]))
        offset += 50

    return {
        "triangle_count": tri_count,
        "bbox_size_mm": [
            round(max(xs) - min(xs), 4),
            round(max(ys) - min(ys), 4),
            round(max(zs) - min(zs), 4),
        ],
    }


def verify_export(params: dict, out_dir: Path, prefix: str) -> dict:
    meta = export_flange(params, out_dir, prefix=prefix)
    step_path = Path(meta["files"]["step"])
    stl_path = Path(meta["files"]["stl"])

    assert step_path.is_file() and step_path.stat().st_size > 0, "STEP file missing or empty"
    assert stl_path.is_file() and stl_path.stat().st_size > 0, "STL file missing or empty"

    # Round-trip reload STEP and inspect B-rep topology
    imported = import_step(str(step_path))
    vol = float(imported.volume)
    expected_vol = analytical_volume_mm3(params)
    assert vol > 0.0, f"Volume must be positive, got {vol}"
    rel_err = abs(vol - expected_vol) / expected_vol
    assert rel_err < 1e-4, f"Volume mismatch: step={vol:.4f}, expected={expected_vol:.4f}"

    bbox = imported.bounding_box()
    od = float(params["outer_diameter_mm"])
    th = float(params["thickness_mm"])
    pcd = float(params["pcd_mm"])
    cb = float(params["center_bore_mm"])
    bolt_d = float(params["bolt_hole_mm"])
    bolt_n = int(params["bolt_count"])

    assert abs(bbox.size.X - od) < 1e-3, f"Outer diameter X mismatch: {bbox.size.X} != {od}"
    assert abs(bbox.size.Y - od) < 1e-3, f"Outer diameter Y mismatch: {bbox.size.Y} != {od}"
    assert abs(bbox.size.Z - th) < 1e-3, f"Thickness Z mismatch: {bbox.size.Z} != {th}"

    # Inspect cylindrical faces: 1 outer wall + 1 center bore + 5 bolt holes
    cyl_faces = imported.faces().filter_by(GeomType.CYLINDER)
    outer_faces = []
    cb_faces = []
    bolt_faces = []

    for f in cyl_faces:
        r = float(f.radius)
        c = f.bounding_box().center()
        radial_offset = math.hypot(float(c.X), float(c.Y))
        if abs(r - od / 2.0) < 1e-3 and radial_offset < 1e-3:
            outer_faces.append(f)
        elif abs(r - cb / 2.0) < 1e-3 and radial_offset < 1e-3:
            cb_faces.append(f)
        elif abs(r - bolt_d / 2.0) < 1e-3:
            bolt_faces.append((f, radial_offset))

    assert len(outer_faces) == 1, f"Expected 1 outer cylinder face, got {len(outer_faces)}"
    assert len(cb_faces) == 1, f"Expected 1 center bore face, got {len(cb_faces)}"
    assert len(bolt_faces) == bolt_n, f"Expected {bolt_n} bolt hole faces, got {len(bolt_faces)}"

    for _, dist in bolt_faces:
        assert abs(dist - pcd / 2.0) < 1e-3, f"Bolt hole PCD radius mismatch: {dist} != {pcd / 2.0}"

    # Verify STL mesh bounds & triangle count
    stl_stats = read_stl_stats(stl_path)
    assert stl_stats["triangle_count"] > 0, "STL has 0 triangles"
    sx, sy, sz = stl_stats["bbox_size_mm"]
    assert abs(sx - od) < 0.2 and abs(sy - od) < 0.2 and abs(sz - th) < 0.05, (
        f"STL bbox {stl_stats['bbox_size_mm']} does not match [{od}, {od}, {th}]"
    )

    return {
        "prefix": prefix,
        "step_bytes": step_path.stat().st_size,
        "stl_bytes": stl_path.stat().st_size,
        "step_volume_mm3": round(vol, 4),
        "analytical_volume_mm3": round(expected_vol, 4),
        "volume_rel_error": rel_err,
        "step_bbox_mm": [round(float(bbox.size.X), 4), round(float(bbox.size.Y), 4), round(float(bbox.size.Z), 4)],
        "center_bore_count": len(cb_faces),
        "bolt_hole_count": len(bolt_faces),
        "measured_pcd_mm": round(2.0 * sum(d for _, d in bolt_faces) / len(bolt_faces), 4),
        "stl": stl_stats,
    }


def main() -> None:
    base_params = load_params(HERE / "params.json", {})
    base_report = verify_export(base_params, HERE / "out", prefix="hello_flange")

    # 参数变更回归：修改外径、厚度、PCD、中心孔并验证导出结果按预期变化
    variant_params = load_params(
        HERE / "params.json",
        {
            "outer_diameter_mm": 162.0,
            "thickness_mm": 20.0,
            "pcd_mm": 120.0,
            "center_bore_mm": 72.6,
            "bolt_hole_mm": 15.0,
        },
    )
    variant_report = verify_export(variant_params, HERE / "out" / "variant_check", prefix="hello_flange_variant")

    assert variant_report["step_bbox_mm"] != base_report["step_bbox_mm"]
    assert variant_report["measured_pcd_mm"] == 120.0
    assert variant_report["step_volume_mm3"] > base_report["step_volume_mm3"]

    print(json.dumps({"status": "PASS", "baseline": base_report, "variant": variant_report}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
