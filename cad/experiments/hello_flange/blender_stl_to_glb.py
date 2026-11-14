r"""
Headless Blender 5.2.2 script: import STL (mm) -> scale to meters -> assign metal PBR -> export GLB.
Usage:
  F:\software\blender\blender.exe --background --factory-startup --python blender_stl_to_glb.py -- <in.stl> <out.glb>
"""

import os
import sys
import bpy


def main():
    if "--" not in sys.argv:
        raise RuntimeError("Missing '-- <input.stl> <output.glb>' arguments.")
    idx = sys.argv.index("--")
    args = sys.argv[idx + 1 :]
    if len(args) < 2:
        raise RuntimeError("Need <input.stl> and <output.glb>.")

    in_stl = os.path.abspath(args[0])
    out_glb = os.path.abspath(args[1])
    os.makedirs(os.path.dirname(out_glb), exist_ok=True)

    # Clear default scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Import STL (Blender 4.0+ / 5.2 uses wm.stl_import)
    bpy.ops.wm.stl_import(filepath=in_stl)

    imported = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not imported:
        raise RuntimeError(f"No mesh imported from {in_stl}")

    obj = imported[0]
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Convert CAD mm -> Three.js / glTF meters (0.001)
    obj.scale = (0.001, 0.001, 0.001)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Assign basic machined aluminum/steel PBR material
    mat = bpy.data.materials.new(name="MachinedHubAlloy")
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.62, 0.65, 0.69, 1.0)
        bsdf.inputs["Metallic"].default_value = 0.90
        bsdf.inputs["Roughness"].default_value = 0.28
    obj.data.materials.clear()
    obj.data.materials.append(mat)

    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        use_selection=True,
    )
    print(f"BLENDER_GLB_OK: {out_glb} bytes={os.path.getsize(out_glb)}")


if __name__ == "__main__":
    main()
