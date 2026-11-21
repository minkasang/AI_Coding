"""Headless RP-04-style STL to GLB conversion, with shared meshes and instance poses."""

import json
import sys
from pathlib import Path
from math import radians

import bpy
from mathutils import Matrix


def main(manifest_path, mesh_source):
    folder = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collection = bpy.context.scene.collection

    def add_node(name, extras, parent=None, mesh=None):
        node = bpy.data.objects.new(name, mesh)
        collection.objects.link(node)
        node.parent = parent
        for key, value in extras.items():
            node[key] = value
        return node

    root_id = manifest["root"]["frameId"]
    root = add_node(root_id, {"frameId": root_id, "sourceGrade": manifest["sourceGrade"],
                            "packageId": manifest["packageId"], "unit": "m"})
    meshes = {}
    for part_id, spec in manifest["partDefinitions"].items():
        bpy.ops.wm.stl_import(filepath=str(mesh_source / f"{part_id}.stl"),
                              forward_axis="Y", up_axis="Z")
        imported = bpy.context.object
        mesh = imported.data
        mesh.name = part_id
        mesh.transform(Matrix.Diagonal((0.001, 0.001, 0.001, 1.0)))
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        mesh.set_sharp_from_angle(angle=radians(32))
        material = bpy.data.materials.new(spec["material"]["assumption"])
        material.use_nodes = True
        surface = material.node_tree.nodes.get("Principled BSDF")
        surface.inputs["Base Color"].default_value = (*spec["displayColor"], 1)
        surface.inputs["Metallic"].default_value = 0.72
        surface.inputs["Roughness"].default_value = 0.34
        mesh.materials.append(material)
        meshes[part_id] = mesh
        bpy.data.objects.remove(imported, do_unlink=True)

    groups = {}
    for row in manifest["instances"]:
        instance = row["partInstanceId"]
        part = row["partId"]
        group = row["assemblyInstanceId"]
        if group not in groups:
            groups[group] = add_node(group, {"assemblyInstanceId": group}, root)
        node = add_node(instance, {
            "partInstanceId": instance, "partId": part, "assemblyInstanceId": group,
            "sourceGrade": manifest["sourceGrade"],
        }, groups[group], meshes[part])
        transform = Matrix(row["rootFromPartCad"])
        transform.translation *= 0.001
        node.matrix_local = transform

    bpy.ops.export_scene.gltf(filepath=str(folder / manifest["assets"]["glb"]), export_format="GLB",
                              export_extras=True, export_yup=True)


if __name__ == "__main__":
    main(*(Path(value).resolve() for value in sys.argv[sys.argv.index("--") + 1:]))
