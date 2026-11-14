r"""
Headless Blender 5.2.2 Multi-Instance Asset Pipeline Importer & GLB Exporter.
Demonstrates:
  1. Shared Mesh Data-block instantiation (1 stud mesh data reused across 5 instances)
  2. Explicit mm -> m unit scaling (0.001)
  3. PBR material assignment and node.extras engineering metadata injection
Usage:
  F:\software\blender\blender.exe --background --factory-startup --python blender_pipeline_export.py -- <out_dir> <out_glb>
"""

import json
import math
import os
import sys
import bpy


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
        raise RuntimeError("Missing '-- <out_dir> <out_glb>' arguments.")
    idx = sys.argv.index("--")
    args = sys.argv[idx + 1 :]
    if len(args) < 2:
        raise RuntimeError("Need <out_dir> and <out_glb>.")

    out_dir = os.path.abspath(args[0])
    out_glb = os.path.abspath(args[1])
    summary_file = os.path.join(out_dir, "build_summary.json")

    with open(summary_file, "r", encoding="utf-8") as f:
        summary = json.load(f)

    parts_dir = os.path.join(out_dir, "parts")

    # 1. Reset factory scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # 2. Assembly root Empty
    root_empty = bpy.data.objects.new("Assembly_WheelEnd", None)
    root_empty.empty_display_type = "PLAIN_AXES"
    root_empty["carlab_part_id"] = summary["assembly_id"]
    root_empty["carlab_part_type"] = "Assembly"
    root_empty["carlab_unit"] = "meter"
    root_empty["carlab_cad_unit"] = "mm"
    root_empty["carlab_version"] = summary["pipeline_version"]
    scene.collection.objects.link(root_empty)

    # 3. Base parts configuration
    base_parts = [
        ("hub", "SYS-30-HUB-001", (0.75, 0.77, 0.80, 1.0), 0.85, 0.25, "rotational_symmetric"),
        ("rotor", "SYS-40-ROTOR-001", (0.35, 0.36, 0.38, 1.0), 0.70, 0.45, "rotational_symmetric"),
        ("bearing", "SYS-30-BRG-DAC4280", (0.90, 0.92, 0.95, 1.0), 0.95, 0.12, "rotational_standard_catalog"),
    ]

    for part_key, part_id, color, metallic, roughness, family in base_parts:
        stl_path = os.path.join(parts_dir, f"{part_id}.stl")
        if not os.path.exists(stl_path):
            raise FileNotFoundError(f"Part STL not found: {stl_path}")

        objs_before = set(scene.objects)
        bpy.ops.wm.stl_import(filepath=stl_path)
        new_objs = list(set(scene.objects) - objs_before)
        mesh_obj = new_objs[0]

        mesh_obj.name = f"Part_{part_id}"
        mesh_obj.parent = root_empty

        # Set extras
        mesh_obj["partId"] = part_id
        mesh_obj["instanceId"] = f"{part_id}#inst_0"
        mesh_obj["family"] = family
        mesh_obj["unit"] = "meter"

        # Apply 0.001 scale
        mesh_obj.scale = (0.001, 0.001, 0.001)
        bpy.context.view_layer.objects.active = mesh_obj
        mesh_obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.shade_smooth()

        mat = create_pbr_material(f"Mat_{part_id}", color, metallic, roughness)
        mesh_obj.data.materials.clear()
        mesh_obj.data.materials.append(mat)

    # 4. Shared mesh instantiation for 5 Studs
    stud_id = "SYS-30-STUD-M14"
    stud_stl = os.path.join(parts_dir, f"{stud_id}.stl")
    if not os.path.exists(stud_stl):
        raise FileNotFoundError(f"Stud STL not found: {stud_stl}")

    objs_before = set(scene.objects)
    bpy.ops.wm.stl_import(filepath=stud_stl)
    base_stud = list(set(scene.objects) - objs_before)[0]
    base_stud_mesh = base_stud.data
    base_stud_mesh.name = f"Mesh_{stud_id}_Shared"

    # Material for studs
    stud_mat = create_pbr_material(f"Mat_{stud_id}", (0.15, 0.16, 0.18, 1.0), 0.85, 0.35)
    base_stud_mesh.materials.clear()
    base_stud_mesh.materials.append(stud_mat)

    # Remove the temporary imported object
    bpy.data.objects.remove(base_stud, do_unlink=True)

    # Now instantiate 5 objects sharing the same mesh data!
    stud_instances_meta = summary["instances"]["stud_instances"]
    for inst_info in stud_instances_meta:
        inst_id = inst_info["instance_id"]
        tx = inst_info["transform_mm"]["translation"][0] * 0.001  # convert to meters
        ty = inst_info["transform_mm"]["translation"][1] * 0.001
        tz = inst_info["transform_mm"]["translation"][2] * 0.001

        # Create new object referencing the shared mesh!
        inst_obj = bpy.data.objects.new(f"Inst_{inst_id}", base_stud_mesh)
        inst_obj.location = (tx, ty, tz)
        inst_obj.scale = (0.001, 0.001, 0.001)
        inst_obj.parent = root_empty

        # Set instance metadata extras
        inst_obj["partId"] = stud_id
        inst_obj["instanceId"] = inst_id
        inst_obj["family"] = "threaded_fastener"
        inst_obj["isSharedMeshInstance"] = True

        scene.collection.objects.link(inst_obj)

    # 5. Export scene to GLB with extras
    for obj in scene.objects:
        obj.select_set(True)

    os.makedirs(os.path.dirname(out_glb), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
    )

    glb_size = os.path.getsize(out_glb)
    print(f"BLENDER_PIPELINE_GLB_OK: {out_glb} ({glb_size} bytes)")


if __name__ == "__main__":
    main()
