r"""
Headless Blender 5.2.2 multi-component assembly importer and GLB exporter.
Usage:
  F:\software\blender\blender.exe --background --factory-startup --python blender_assembly_to_glb.py -- <hub.stl> <bearing.stl> <studs.stl> <out.glb>
"""

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
        raise RuntimeError("Missing '-- <hub.stl> <bearing.stl> <studs.stl> <out.glb>' arguments.")
    idx = sys.argv.index("--")
    args = sys.argv[idx + 1 :]
    if len(args) < 4:
        raise RuntimeError("Need <hub.stl>, <bearing.stl>, <studs.stl>, and <out.glb>.")

    hub_stl = os.path.abspath(args[0])
    bearing_stl = os.path.abspath(args[1])
    studs_stl = os.path.abspath(args[2])
    out_glb = os.path.abspath(args[3])
    os.makedirs(os.path.dirname(out_glb), exist_ok=True)

    # 1. Reset factory scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # 2. Create assembly root Empty with engineering extras
    root_empty = bpy.data.objects.new("Assembly_WheelHub", None)
    root_empty.empty_display_type = "PLAIN_AXES"
    root_empty["carlab_part_id"] = "SYS-30-WHEEL-HUB-ASSY"
    root_empty["carlab_part_type"] = "Assembly"
    root_empty["carlab_unit"] = "meter"
    root_empty["carlab_cad_unit"] = "mm"
    root_empty["carlab_fidelity"] = "DEMONSTRATION_PROTOTYPE"
    root_empty["carlab_disclaimer"] = "Assembly hierarchy in WebGL. Dynamic physics/kinematics not simulated."
    scene.collection.objects.link(root_empty)

    # 3. Import and configure parts with metadata extras
    part_specs = [
        (
            "Part_Hub",
            hub_stl,
            (0.70, 0.73, 0.76, 1.0),
            0.85,
            0.25,
            {
                "partId": "SYS-30-HUB-001",
                "family": "rotational_symmetric",
                "materialClass": "aluminum_alloy_A356",
                "mountingType": "bolted_pcd_5x114.3",
                "clearanceHoleStandard": "ISO_273_medium",
            },
        ),
        (
            "Part_Bearing",
            bearing_stl,
            (0.85, 0.87, 0.90, 1.0),
            0.95,
            0.12,
            {
                "partId": "SYS-30-BRG-DAC4280",
                "family": "rotational_standard_catalog",
                "materialClass": "bearing_steel_GCr15",
                "modelingFidelity": "GEOMETRIC_ENVELOPE_ONLY",
                "disclaimer": "Rolling kinematics/contact stress NOT modeled",
            },
        ),
        (
            "Part_WheelStuds",
            studs_stl,
            (0.15, 0.16, 0.18, 1.0),
            0.80,
            0.50,
            {
                "partId": "SYS-30-FASTENER-M14",
                "family": "threaded_fastener",
                "materialClass": "high_tensile_steel_grade_10.9",
                "threadSpec": "M14x1.5-6g",
                "modelingFidelity": "NOMINAL_CYLINDER_PLUS_METADATA",
            },
        ),
    ]

    total_tris = 0
    total_verts = 0

    for part_name, stl_path, color, metallic, roughness, extras in part_specs:
        if not os.path.exists(stl_path):
            raise FileNotFoundError(f"Part STL not found: {stl_path}")

        # Record objects before import
        objs_before = set(scene.objects)
        bpy.ops.wm.stl_import(filepath=stl_path)
        new_objs = list(set(scene.objects) - objs_before)
        if not new_objs:
            raise RuntimeError(f"Failed to import mesh from {stl_path}")

        mesh_obj = new_objs[0]
        mesh_obj.name = part_name
        mesh_obj.parent = root_empty

        # Attach metadata extras to mesh object
        for k, v in extras.items():
            mesh_obj[k] = v

        # Convert CAD mm -> Three.js / glTF meters (0.001)
        mesh_obj.scale = (0.001, 0.001, 0.001)
        bpy.context.view_layer.objects.active = mesh_obj
        mesh_obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

        # Smooth shading
        bpy.ops.object.shade_smooth()

        # Material assignment
        mat = create_pbr_material(f"Mat_{part_name}", color, metallic, roughness)
        mesh_obj.data.materials.clear()
        mesh_obj.data.materials.append(mat)

        # Count geometry
        tris = len(mesh_obj.data.polygons)
        verts = len(mesh_obj.data.vertices)
        total_tris += tris
        total_verts += verts
        print(f"  Imported {part_name}: {verts} vertices, {tris} triangles, extras={list(extras.keys())}")

    # 4. Export GLB with extras
    for obj in scene.objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
    )

    glb_size = os.path.getsize(out_glb)
    print(f"BLENDER_ASSEMBLY_GLB_OK: {out_glb}")
    print(f"  Total Vertices: {total_verts}")
    print(f"  Total Triangles: {total_tris}")
    print(f"  GLB File Size: {glb_size} bytes")


if __name__ == "__main__":
    main()
