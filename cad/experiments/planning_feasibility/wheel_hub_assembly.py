"""
Parametric Multi-Component Wheel Hub & Bearing Assembly (build123d 0.13.0, CAD unit: mm).
Demonstrates:
  1. Component separation (Hub, Bearing Envelope, Stud Array)
  2. ISO 273 bolt clearance fit validation (15mm hole for M14 stud -> 0.5mm radial clearance)
  3. Poka-yoke engineering constraint assertions (wall thickness, PCD margins, chordal spacing)
  4. Multi-part STEP, STL, and JSON metadata export for downstream headless Blender GLB conversion.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import sys
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
DEFAULT_PARAMS_PATH = HERE / "params.json"
DEFAULT_OUT_DIR = HERE / "out"

# ISO 273:1979 Fasteners — Clearance holes for bolts and screws
# Reference table (nominal hole diameter in mm for standard metric thread diameters)
ISO_273_TABLE: dict[float, dict[str, float]] = {
    10.0: {"fine": 10.5, "medium": 11.0, "coarse": 12.0},
    12.0: {"fine": 13.0, "medium": 13.5, "coarse": 14.5},
    14.0: {"fine": 15.0, "medium": 15.5, "coarse": 16.5},
    16.0: {"fine": 17.0, "medium": 17.5, "coarse": 18.5},
    20.0: {"fine": 21.0, "medium": 22.0, "coarse": 24.0},
}


class PokaYokeViolation(ValueError):
    """Raised when geometric or engineering compatibility constraints are violated."""
    pass


def load_and_validate_params(params_path: Path, overrides: dict | None = None) -> dict:
    with params_path.open("r", encoding="utf-8") as f:
        params = json.load(f)

    if overrides:
        for k, v in overrides.items():
            if v is not None:
                if "." in k:
                    section, subkey = k.split(".", 1)
                    params[section][subkey] = v
                else:
                    params[k] = v

    validate_engineering_constraints(params)
    return params


def validate_engineering_constraints(p: dict) -> None:
    hub = p["hub"]
    od = float(hub["outer_diameter_mm"])
    th = float(hub["flange_thickness_mm"])
    cb = float(hub["center_bore_mm"])
    pcd = float(hub["pcd_mm"])
    bolt_count = int(hub["bolt_count"])
    hole_d = float(hub["bolt_hole_diameter_mm"])

    stud = p["stud"]
    stud_d = float(stud["nominal_diameter_mm"])
    head_d = float(stud["head_diameter_mm"])

    min_margin = float(p.get("tolerances", {}).get("min_wall_margin_mm", 5.0))

    # Basic positive checks
    if min(od, th, cb, pcd, hole_d, stud_d, head_d) <= 0:
        raise PokaYokeViolation("All dimensions must be strictly positive.")
    if bolt_count < 3:
        raise PokaYokeViolation(f"Wheel bolt count must be >= 3, got {bolt_count}.")

    # Poka-Yoke 1: ISO 273 clearance fit validation using discrete standard lookup
    if hole_d <= stud_d:
        raise PokaYokeViolation(
            f"[POKA-YOKE FIT REJECTED] Hole diameter ({hole_d:.2f} mm) must be larger than stud diameter ({stud_d:.2f} mm) "
            f"for clearance fit (interference or zero-clearance detected)."
        )

    if stud_d in ISO_273_TABLE:
        fine_d = ISO_273_TABLE[stud_d]["fine"]
        if hole_d < fine_d:
            raise PokaYokeViolation(
                f"[POKA-YOKE FIT REJECTED] Hole diameter ({hole_d:.2f} mm) is tighter than ISO 273 fine series "
                f"({fine_d:.2f} mm) for M{stud_d:.0f}. Bolt assembly would jam."
            )

    # Poka-Yoke 2: Inner wall margin between PCD bolt holes and center bore
    inner_margin = (pcd - cb) / 2.0 - hole_d / 2.0
    if inner_margin < min_margin:
        raise PokaYokeViolation(
            f"[POKA-YOKE STRUCTURAL REJECTED] PCD ({pcd} mm) bolt holes penetrate center bore ({cb} mm). "
            f"Inner wall margin is {inner_margin:.2f} mm < minimum required {min_margin:.2f} mm."
        )

    # Poka-Yoke 3: Outer wall margin between PCD bolt holes and outer flange edge
    outer_margin = (od - pcd) / 2.0 - hole_d / 2.0
    if outer_margin < min_margin:
        raise PokaYokeViolation(
            f"[POKA-YOKE STRUCTURAL REJECTED] PCD ({pcd} mm) bolt holes exceed flange outer diameter ({od} mm). "
            f"Outer wall margin is {outer_margin:.2f} mm < minimum required {min_margin:.2f} mm."
        )

    # Poka-Yoke 4: Chordal bolt head interference
    chordal_pitch = pcd * math.sin(math.pi / bolt_count)
    if chordal_pitch < head_d + 2.0:
        raise PokaYokeViolation(
            f"[POKA-YOKE PACKAGING REJECTED] Bolt heads collide! Chordal spacing ({chordal_pitch:.2f} mm) "
            f"< bolt head diameter ({head_d} mm) + 2mm tool clearance."
        )


def build_hub_solid(p: dict) -> Solid:
    hub = p["hub"]
    od = float(hub["outer_diameter_mm"])
    th = float(hub["flange_thickness_mm"])
    cb = float(hub["center_bore_mm"])
    pilot_d = float(hub["pilot_diameter_mm"])
    pilot_h = float(hub["pilot_height_mm"])
    pcd = float(hub["pcd_mm"])
    bolt_count = int(hub["bolt_count"])
    hole_d = float(hub["bolt_hole_diameter_mm"])

    with BuildPart() as bp:
        # 1. Main flange disk (Z: 0 to th)
        Cylinder(
            radius=od / 2.0,
            height=th,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
        # 2. Pilot spigot for wheel center location (Z: th to th + pilot_h)
        with Locations((0, 0, th)):
            Cylinder(
                radius=pilot_d / 2.0,
                height=pilot_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
        # 3. Center through bore (Z: -2 to th + pilot_h + 2)
        total_h = th + pilot_h + 4.0
        with Locations((0, 0, -2)):
            Cylinder(
                radius=cb / 2.0,
                height=total_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )
        # 4. PCD bolt clearance holes (Z: -2 to th + 2)
        with Locations((0, 0, -2)):
            with PolarLocations(radius=pcd / 2.0, count=bolt_count):
                Cylinder(
                    radius=hole_d / 2.0,
                    height=th + 4.0,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                    mode=Mode.SUBTRACT,
                )

    return bp.part


def build_bearing_solid(p: dict) -> Solid:
    bearing = p["bearing"]
    od = float(bearing["outer_diameter_mm"])
    id_ = float(bearing["inner_diameter_mm"])
    w = float(bearing["width_mm"])

    # Double row angular contact / deep groove hub bearing envelope
    # Positioned immediately behind the hub flange (Z: -w to 0)
    with BuildPart() as bp:
        # Outer race envelope
        with Locations((0, 0, -w)):
            Cylinder(
                radius=od / 2.0,
                height=w,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
            # Inner bore
            Cylinder(
                radius=id_ / 2.0,
                height=w + 4.0,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )
            # Internal raceway / seal relief groove (subtracted to reflect true bearing profile)
            seal_od = od - 6.0
            seal_id = id_ + 6.0
            seal_cut_h = w - 8.0
            with Locations((0, 0, 4.0)):
                Cylinder(
                    radius=seal_od / 2.0,
                    height=seal_cut_h,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                    mode=Mode.SUBTRACT,
                )
                Cylinder(
                    radius=seal_id / 2.0,
                    height=seal_cut_h + 2.0,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                    mode=Mode.ADD,
                )

    return bp.part


def build_stud_array_solid(p: dict) -> Compound:
    hub = p["hub"]
    pcd = float(hub["pcd_mm"])
    bolt_count = int(hub["bolt_count"])
    th = float(hub["flange_thickness_mm"])

    stud = p["stud"]
    stud_d = float(stud["nominal_diameter_mm"])
    head_d = float(stud["head_diameter_mm"])
    head_th = float(stud["head_thickness_mm"])
    shank_l = float(stud["shank_length_mm"])

    studs = []
    for i in range(bolt_count):
        angle = (2.0 * math.pi / bolt_count) * i
        x = (pcd / 2.0) * math.cos(angle)
        y = (pcd / 2.0) * math.sin(angle)

        with BuildPart() as bp:
            # Head seated behind flange: Z from -head_th to 0
            with Locations((x, y, -head_th)):
                Cylinder(
                    radius=head_d / 2.0,
                    height=head_th,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                )
            # Shank extending through flange into +Z: Z from 0 to shank_l
            with Locations((x, y, 0)):
                Cylinder(
                    radius=stud_d / 2.0,
                    height=shank_l,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                )
        studs.append(bp.part)

    return Compound(studs)


def export_assembly(
    params: dict,
    out_dir: Path,
    prefix: str = "wheel_hub_assembly",
    stl_tolerance: float = 0.02,
    stl_angular_tolerance: float = 0.1,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)

    hub_solid = build_hub_solid(params)
    bearing_solid = build_bearing_solid(params)
    studs_solid = build_stud_array_solid(params)

    # 1. Export individual components
    hub_step = out_dir / f"{prefix}_hub.step"
    hub_stl = out_dir / f"{prefix}_hub.stl"
    export_step(hub_solid, str(hub_step), unit=Unit.MM)
    export_stl(
        hub_solid,
        str(hub_stl),
        tolerance=stl_tolerance,
        angular_tolerance=stl_angular_tolerance,
        ascii_format=False,
    )

    bearing_step = out_dir / f"{prefix}_bearing.step"
    bearing_stl = out_dir / f"{prefix}_bearing.stl"
    export_step(bearing_solid, str(bearing_step), unit=Unit.MM)
    export_stl(
        bearing_solid,
        str(bearing_stl),
        tolerance=stl_tolerance,
        angular_tolerance=stl_angular_tolerance,
        ascii_format=False,
    )

    studs_step = out_dir / f"{prefix}_studs.step"
    studs_stl = out_dir / f"{prefix}_studs.stl"
    export_step(studs_solid, str(studs_step), unit=Unit.MM)
    export_stl(
        studs_solid,
        str(studs_stl),
        tolerance=stl_tolerance,
        angular_tolerance=stl_angular_tolerance,
        ascii_format=False,
    )

    # 2. Export composite assembly STEP
    assembly_compound = Compound([hub_solid, bearing_solid, studs_solid])
    assembly_step = out_dir / f"{prefix}_assembly.step"
    export_step(assembly_compound, str(assembly_step), unit=Unit.MM)

    # 3. Assemble metadata
    hub_bbox = hub_solid.bounding_box()
    bearing_bbox = bearing_solid.bounding_box()
    studs_bbox = studs_solid.bounding_box()
    assembly_bbox = assembly_compound.bounding_box()

    hole_d = float(params["hub"]["bolt_hole_diameter_mm"])
    stud_d = float(params["stud"]["nominal_diameter_mm"])
    hole_r = hole_d / 2.0
    stud_r = stud_d / 2.0
    radial_clearance = hole_r - stud_r

    # Identify matching ISO 273 clearance series
    iso273_series_matched = "custom"
    if stud_d in ISO_273_TABLE:
        for sname, sdia in ISO_273_TABLE[stud_d].items():
            if abs(hole_d - sdia) < 1e-4:
                iso273_series_matched = sname
                break

    meta = {
        "assembly_name": params["assembly_name"],
        "unit": "mm",
        "fidelity": "DEMONSTRATION_PROTOTYPE",
        "engineering_standards": [
            "ISO 273:1979 (Clearance holes for bolts and screws)",
            "ISO 4014 (Hexagon head bolts)",
            "ISO 15 (Rolling bearings - boundary dimensions)"
        ],
        "clearance_fit_check": {
            "hole_diameter_mm": hole_d,
            "stud_diameter_mm": stud_d,
            "radial_clearance_mm": round(radial_clearance, 4),
            "iso273_series_matched": iso273_series_matched,
            "iso273_reference_options": ISO_273_TABLE.get(stud_d, {}),
            "status": "PASS" if radial_clearance > 0 else "INTERFERENCE_FAIL"
        },
        "fidelity_disclaimers": {
            "bearing": "DAC42800042 is modeled as a GEOMETRIC_ENVELOPE_ONLY representation (ASSUMPTION). Internal rolling elements, contact kinematics, press-fit tolerances, raceway stress, and preloads are NOT simulated.",
            "studs": "Nominal cylinder plus metadata; threads are schematic, not physical helical sweeps (ASSUMPTION).",
            "assembly": "Three separate mesh nodes prove visual and hierarchical separation in WebGL; physical stiffness and bolted joint clamping force are NOT validated (ASSUMPTION)."
        },
        "components": {
            "hub": {
                "solid_valid": bool(hub_solid.is_valid),
                "volume_mm3": round(float(hub_solid.volume), 2),
                "bbox_size_mm": [
                    round(float(hub_bbox.size.X), 3),
                    round(float(hub_bbox.size.Y), 3),
                    round(float(hub_bbox.size.Z), 3),
                ],
                "files": {"step": hub_step.name, "stl": hub_stl.name}
            },
            "bearing": {
                "solid_valid": bool(bearing_solid.is_valid),
                "volume_mm3": round(float(bearing_solid.volume), 2),
                "bbox_size_mm": [
                    round(float(bearing_bbox.size.X), 3),
                    round(float(bearing_bbox.size.Y), 3),
                    round(float(bearing_bbox.size.Z), 3),
                ],
                "files": {"step": bearing_step.name, "stl": bearing_stl.name}
            },
            "studs": {
                "solid_valid": bool(studs_solid.is_valid),
                "volume_mm3": round(float(studs_solid.volume), 2),
                "bbox_size_mm": [
                    round(float(studs_bbox.size.X), 3),
                    round(float(studs_bbox.size.Y), 3),
                    round(float(studs_bbox.size.Z), 3),
                ],
                "files": {"step": studs_step.name, "stl": studs_stl.name}
            }
        },
        "assembly": {
            "total_volume_mm3": round(float(assembly_compound.volume), 2),
            "bbox_size_mm": [
                round(float(assembly_bbox.size.X), 3),
                round(float(assembly_bbox.size.Y), 3),
                round(float(assembly_bbox.size.Z), 3),
            ],
            "step_file": assembly_step.name
        }
    }

    meta_path = out_dir / f"{prefix}_metadata.json"
    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    return meta


def main():
    parser = argparse.ArgumentParser(description="Build parametric wheel hub assembly.")
    parser.add_argument("--params", type=Path, default=DEFAULT_PARAMS_PATH)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--prefix", type=str, default="wheel_hub_assembly")
    parser.add_argument("--override-pcd", type=float, default=None)
    parser.add_argument("--override-outer-d", type=float, default=None)
    parser.add_argument("--override-hole-d", type=float, default=None)
    args = parser.parse_args()

    overrides = {}
    if args.override_pcd is not None:
        overrides["hub.pcd_mm"] = args.override_pcd
    if args.override_outer_d is not None:
        overrides["hub.outer_diameter_mm"] = args.override_outer_d
    if args.override_hole_d is not None:
        overrides["hub.bolt_hole_diameter_mm"] = args.override_hole_d

    try:
        p = load_and_validate_params(args.params, overrides)
        meta = export_assembly(p, args.out_dir, prefix=args.prefix)
        print(f"ASSEMBLY_BUILD_SUCCESS: {meta['assembly']['step_file']}")
        print(f"  Hub Volume: {meta['components']['hub']['volume_mm3']} mm^3")
        print(f"  Bearing Volume: {meta['components']['bearing']['volume_mm3']} mm^3")
        print(f"  Studs Volume: {meta['components']['studs']['volume_mm3']} mm^3")
        print(f"  Clearance: {meta['clearance_fit_check']['radial_clearance_mm']} mm (ISO 273 PASS)")
    except PokaYokeViolation as e:
        print(f"POKA_YOKE_ERROR: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
