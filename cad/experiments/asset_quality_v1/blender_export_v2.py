r"""
CARLAB Asset Quality Pipeline - Blender Exporter v2
Model: Gemini 3.8 Flash (gemini-3-8-flash)
Task: R-08 (03.10)

Executes Gate 4 (Transform Parity) and Gate 5 (WebGL Performance & Metadata Budget).
Usage:
  F:\software\blender\blender.exe --background --factory-startup --python blender_export_v2.py -- --config <config.json> --stl-dir <stl_dir> --out-glb <out.glb>
"""

import argparse
import json
import math
import os
import sys

import bpy

# Adjust path to import quality_gate
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from quality_gate import Gate4_TransformParity, Gate5_WebGLBudget, GateResult


def create_pbr_material(name: str, base_color: tuple, metallic: float, roughness: float):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
    return mat


def main():
    if "--" not in sys.argv:
        raise RuntimeError("Missing '--' argument separator for Blender script.")
    idx = sys.argv.index("--")
    custom_args = sys.argv[idx + 1 :]

    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--stl-dir", required=True)
    parser.add_argument("--out-glb", required=True)
    parser.add_argument("--report-json", default="")
    args = parser.parse_args(custom_args)

    with open(args.config, "r", encoding="utf-8") as f:
        config = json.load(f)

    report = {
        "pipeline_version": config.get("pipeline_version", "2.0.0"),
        "gate_results": {},
        "success": False,
    }

    # =========================================================================
    # GATE 4: Coordinate & Rigid Transform Parity Gate
    # =========================================================================
    transform_matrix = config.get("coordinate_frames", {}).get("cad_to_gltf_transform_matrix")
    g4_res = Gate4_TransformParity.evaluate(transform_matrix)
    report["gate_results"]["GATE_04_TRANSFORM_PARITY"] = g4_res.to_dict()
    if not g4_res.passed:
        report["error"] = g4_res.message
        _emit_report(args.report_json, report)
        print(f"GATE_04_FAIL: {g4_res.message}")
        sys.exit(1)

    # Reset Blender scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # Assembly root Empty
    root_empty = bpy.data.objects.new("Assembly_WheelEnd", None)
    root_empty.empty_display_type = "PLAIN_AXES"
    root_empty["carlab_part_id"] = config.get("assembly_id", "SYS-30-WHEEL-END-ASSY")
    root_empty["carlab_unit"] = "meter"
    root_empty["provenance"] = "HYBRID_VALIDATED"
    root_empty["revision"] = "v2.0.0"
    root_empty["partId"] = config.get("assembly_id", "SYS-30-WHEEL-END-ASSY")
    root_empty["instanceId"] = "root_assembly#0"
    scene.collection.objects.link(root_empty)

    parts_cfg = config["parts"]
    parts_meta = [
        ("hub", parts_cfg["hub"], (0.75, 0.77, 0.80, 1.0), 0.85, 0.25, (0.0, 0.0, 0.0)),
        ("rotor", parts_cfg["rotor"], (0.35, 0.36, 0.38, 1.0), 0.70, 0.45, (0.0, 0.0, 0.014)),
        ("bearing", parts_cfg["bearing"], (0.90, 0.92, 0.95, 1.0), 0.95, 0.12, (0.0, 0.0, -0.028)),
    ]

    for part_key, p_cfg, color, metallic, roughness, offset_m in parts_meta:
        stl_path = os.path.join(args.stl_dir, f"{part_key}.stl")
        if not os.path.exists(stl_path):
            raise FileNotFoundError(f"Missing STL for part '{part_key}': {stl_path}")

        objs_before = set(scene.objects)
        bpy.ops.wm.stl_import(filepath=stl_path)
        new_objs = list(set(scene.objects) - objs_before)
        mesh_obj = new_objs[0]

        mesh_obj.name = f"Part_{p_cfg['part_id']}"
        mesh_obj.parent = root_empty

        # Set mandatory extras
        mesh_obj["partId"] = p_cfg["part_id"]
        mesh_obj["instanceId"] = f"{p_cfg['part_id']}#inst_0"
        mesh_obj["provenance"] = p_cfg["provenance"]
        mesh_obj["revision"] = "rev_A"
        mesh_obj["cadBoundingBoxMm"] = [p_cfg.get("outer_diameter_mm", 100), p_cfg.get("outer_diameter_mm", 100), 20.0]

        # Apply mm->m scale (0.001) and mounting offset
        mesh_obj.scale = (0.001, 0.001, 0.001)
        mesh_obj.location = offset_m
        bpy.context.view_layer.objects.active = mesh_obj
        mesh_obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.shade_smooth()

        mat = create_pbr_material(f"Mat_{p_cfg['part_id']}", color, metallic, roughness)
        mesh_obj.data.materials.clear()
        mesh_obj.data.materials.append(mat)

    # 4. Shared Mesh Instancing for 5 Studs
    stud_cfg = parts_cfg["stud"]
    stud_stl = os.path.join(args.stl_dir, "stud.stl")
    if not os.path.exists(stud_stl):
        raise FileNotFoundError(f"Missing stud STL: {stud_stl}")

    objs_before = set(scene.objects)
    bpy.ops.wm.stl_import(filepath=stud_stl)
    base_stud = list(set(scene.objects) - objs_before)[0]
    base_stud_mesh = base_stud.data
    base_stud_mesh.name = f"Mesh_{stud_cfg['part_id']}_Shared"

    stud_mat = create_pbr_material(f"Mat_{stud_cfg['part_id']}", (0.15, 0.16, 0.18, 1.0), 0.85, 0.35)
    base_stud_mesh.materials.clear()
    base_stud_mesh.materials.append(stud_mat)

    # Remove temporary object
    bpy.data.objects.remove(base_stud, do_unlink=True)

    # Instantiate 5 studs around PCD
    pcd_m = float(stud_cfg.get("pcd_mm", 114.3)) * 0.001
    radius_m = pcd_m / 2.0
    stud_count = int(stud_cfg.get("instance_count", 5))

    for i in range(stud_count):
        theta = 2.0 * math.pi * i / stud_count
        tx = radius_m * math.cos(theta)
        ty = radius_m * math.sin(theta)
        tz = 0.0

        inst_obj = bpy.data.objects.new(f"Inst_Stud_{i}", base_stud_mesh)
        inst_obj.location = (tx, ty, tz)
        inst_obj.scale = (0.001, 0.001, 0.001)
        inst_obj.parent = root_empty

        # Mandatory extras
        inst_obj["partId"] = stud_cfg["part_id"]
        inst_obj["instanceId"] = f"{stud_cfg['part_id']}#inst_{i}"
        inst_obj["provenance"] = stud_cfg["provenance"]
        inst_obj["revision"] = "rev_A"
        inst_obj["cadBoundingBoxMm"] = [stud_cfg["head_diameter_mm"], stud_cfg["head_diameter_mm"], stud_cfg["shank_length_mm"]]

        scene.collection.objects.link(inst_obj)

    # 5. Export scene to GLB with extras
    for obj in scene.objects:
        obj.select_set(True)

    out_glb_path = os.path.abspath(args.out_glb)
    os.makedirs(os.path.dirname(out_glb_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_glb_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
    )

    # =========================================================================
    # GATE 5: WebGL & Mesh Performance Budget Gate
    # =========================================================================
    from pathlib import Path
    budgets = config.get("budgets", {})
    g5_res = Gate5_WebGLBudget.evaluate(Path(out_glb_path), budgets)
    report["gate_results"]["GATE_05_WEBGL_BUDGET"] = g5_res.to_dict()

    if not g5_res.passed:
        report["error"] = g5_res.message
        _emit_report(args.report_json, report)
        print(f"GATE_05_FAIL: {g5_res.message}")
        sys.exit(1)

    report["success"] = True
    _emit_report(args.report_json, report)
    print(f"BLENDER_EXPORT_V2_SUCCESS: {out_glb_path}")
    sys.exit(0)


def _emit_report(report_path: str, report_data: dict):
    if report_path:
        os.makedirs(os.path.dirname(os.path.abspath(report_path)), exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)


if __name__ == "__main__":
    main()
