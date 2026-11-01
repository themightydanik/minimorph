"""Validate a self-contained character GLB with Blender's actual imported geometry.

blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/validate_character.py -- --input path/to/character.glb
Budgets are targets, not measured counts; only a successful report measures an asset.
"""

import argparse
import json
import math
from pathlib import Path
import struct
import sys


def read_glb(path):
    data = path.read_bytes()
    assert len(data) >= 20, "Truncated GLB"
    magic, version, length = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2, "Expected glTF 2.0 binary"
    assert length == len(data), "GLB declared length does not match file"
    chunks, offset = [], 12
    while offset < length:
        assert offset + 8 <= length, "Truncated chunk header"
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        assert (
            size % 4 == 0 and offset + size <= length
        ), "Invalid chunk bounds/alignment"
        chunks.append((kind, data[offset : offset + size]))
        offset += size
    assert len(chunks) == 2 and [c[0] for c in chunks] == [
        0x4E4F534A,
        0x004E4942,
    ], "Expected JSON then BIN chunks"
    document = json.loads(chunks[0][1])
    assert document["asset"]["version"] == "2.0", "Unsupported glTF version"
    buffers = document.get("buffers", [])
    assert (
        len(buffers) == 1 and "uri" not in buffers[0]
    ), "External geometry is forbidden"
    assert 0 < buffers[0]["byteLength"] <= len(chunks[1][1]), "Invalid BIN length"
    for view in document.get("bufferViews", []):
        assert view.get("buffer", 0) == 0, "Invalid buffer reference"
        assert view.get("byteOffset", 0) >= 0 and view["byteLength"] > 0
        assert (
            view.get("byteOffset", 0) + view["byteLength"] <= buffers[0]["byteLength"]
        ), "Buffer view out of bounds"
    for image in document.get("images", []):
        assert (
            "uri" not in image and "bufferView" in image
        ), "Textures must be embedded in the GLB"
        assert image.get("mimeType") in (
            "image/png",
            "image/jpeg",
        ), "Use portable PNG/JPEG textures"
        assert 0 <= image["bufferView"] < len(document.get("bufferViews", []))
    assert document.get("meshes"), "No meshes"
    for mesh in document["meshes"]:
        for primitive in mesh["primitives"]:
            assert primitive.get("mode", 4) == 4, "Expected triangle primitives"
            assert (
                "POSITION" in primitive["attributes"]
                and "NORMAL" in primitive["attributes"]
            ), "Missing positions/normals"
            assert 0 <= primitive["attributes"]["POSITION"] < len(document["accessors"])
    roots = document["scenes"][document.get("scene", 0)]["nodes"]
    assert (
        len(roots) == 1
    ), "Expected one character root for the existing source interface"
    root = document["nodes"][roots[0]]
    assert root.get("translation", [0, 0, 0]) == [
        0,
        0,
        0,
    ], "Root translation must be applied"
    assert root.get("scale", [1, 1, 1]) == [1, 1, 1], "Root scale must be applied"
    assert root.get("rotation", [0, 0, 0, 1]) == [
        0,
        0,
        0,
        1,
    ], "Root rotation must be applied"
    if "matrix" in root:
        assert root["matrix"] == [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
        ], "Root matrix must be identity"
    return document, len(data)


def validate(path, max_triangles=20000, max_materials=8, max_bytes=8 * 1024 * 1024):
    import bpy
    from mathutils import Vector

    document, byte_count = read_glb(path)
    assert byte_count <= max_bytes, f"File exceeds budget: {byte_count} bytes"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    assert meshes, "Blender imported no geometry"
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    triangle_count, vertex_count, material_names, points = 0, 0, set(), []
    for obj in meshes:
        evaluated = obj.evaluated_get(dependency_graph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            assert mesh.vertices and mesh.loop_triangles, f"Empty mesh: {obj.name}"
            for vertex in mesh.vertices:
                point = obj.matrix_world @ vertex.co
                assert all(
                    math.isfinite(value) for value in point
                ), f"Non-finite vertex: {obj.name}"
                points.append(point.copy())
            for triangle in mesh.loop_triangles:
                vertices = [
                    obj.matrix_world @ mesh.vertices[index].co
                    for index in triangle.vertices
                ]
                assert (vertices[1] - vertices[0]).cross(
                    vertices[2] - vertices[0]
                ).length > 1e-12, f"Degenerate triangle: {obj.name}"
            triangle_count += len(mesh.loop_triangles)
            vertex_count += len(mesh.vertices)
            material_names.update(
                material.name for material in mesh.materials if material
            )
        finally:
            evaluated.to_mesh_clear()
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    # Blender imports glTF Y-up as Blender Z-up. Measurements are in world units.
    height = high.z - low.z
    assert abs(low.z) <= 0.005, f"Feet must be at origin, minimum height is {low.z}"
    assert (
        abs(height - 1.8) <= 0.03
    ), f"Expected approximately 1.8 units height, measured {height}"
    assert (
        triangle_count <= max_triangles
    ), f"Triangle budget exceeded: {triangle_count}"
    assert (
        0 < len(material_names) <= max_materials
    ), f"Material budget exceeded: {len(material_names)}"
    return {
        "asset": path.name,
        "blender": bpy.app.version_string,
        "bytes": byte_count,
        "mesh_objects": len(meshes),
        "vertices_instanced": vertex_count,
        "triangles_instanced": triangle_count,
        "used_materials": sorted(material_names),
        "height": height,
        "blender_world_min": list(low),
        "blender_world_max": list(high),
        "embedded_images": len(document.get("images", [])),
        "skins": len(document.get("skins", [])),
        "animation_clips": len(document.get("animations", [])),
        "budgets": {
            "triangles": max_triangles,
            "materials": max_materials,
            "bytes": max_bytes,
        },
        "orientation": "Negative-Z facing requires visual verification; not inferred from bounds.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--max-triangles", type=int, default=20000)
    parser.add_argument("--max-materials", type=int, default=8)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    report = validate(args.input, args.max_triangles, args.max_materials)
    text = json.dumps(report, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
