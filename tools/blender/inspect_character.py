"""Dependency-free CI audit of the actual exported glTF buffers and node hierarchy."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
from validate_character import read_glb

IDENTITY = [[float(i == j) for j in range(4)] for i in range(4)]


def multiply(a, b):
    return [
        [sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)
    ]


def node_matrix(node):
    if "matrix" in node:
        return [[node["matrix"][col * 4 + row] for col in range(4)] for row in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    tx, ty, tz = node.get("translation", [0, 0, 0])
    return [
        [
            (1 - 2 * (y * y + z * z)) * sx,
            2 * (x * y - z * w) * sy,
            2 * (x * z + y * w) * sz,
            tx,
        ],
        [
            2 * (x * y + z * w) * sx,
            (1 - 2 * (x * x + z * z)) * sy,
            2 * (y * z - x * w) * sz,
            ty,
        ],
        [
            2 * (x * z - y * w) * sx,
            2 * (y * z + x * w) * sy,
            (1 - 2 * (x * x + y * y)) * sz,
            tz,
        ],
        [0, 0, 0, 1],
    ]


def inspect(path):
    document, byte_count = read_glb(path)
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    binary = data[28 + json_length :]
    widths = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    formats = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}

    def accessor(index):
        spec = document["accessors"][index]
        assert "sparse" not in spec, "Sparse accessors are outside this asset pipeline"
        view = document["bufferViews"][spec["bufferView"]]
        code = "<" + formats[spec["componentType"]] * widths[spec["type"]]
        size = struct.calcsize(code)
        stride = view.get("byteStride", size)
        offset = spec.get("byteOffset", 0)
        assert stride >= size and offset >= 0
        assert (
            offset + (spec["count"] - 1) * stride + size <= view["byteLength"]
        ), "Accessor exceeds buffer view"
        start = view.get("byteOffset", 0) + offset
        return [
            struct.unpack_from(code, binary, start + row * stride)
            for row in range(spec["count"])
        ]

    positions, triangles, primitives, used_materials, visited = [], 0, 0, set(), set()
    canonical_triangles = []
    surface_edges = {}
    surface_vertices = set()

    def walk(index, parent):
        nonlocal triangles, primitives
        assert index not in visited, "Cycle or repeated node in scene hierarchy"
        visited.add(index)
        node = document["nodes"][index]
        transform = multiply(parent, node_matrix(node))
        if "mesh" in node:
            for primitive in document["meshes"][node["mesh"]]["primitives"]:
                primitives += 1
                vertices = accessor(primitive["attributes"]["POSITION"])
                normals = accessor(primitive["attributes"]["NORMAL"])
                assert len(normals) == len(vertices)
                assert all(
                    all(math.isfinite(v) for v in p) for p in vertices + normals
                ), "Non-finite geometry"
                assert all(
                    0.9 <= math.sqrt(sum(v * v for v in n)) <= 1.1 for n in normals
                ), "Invalid vertex normal"
                if "TANGENT" in primitive["attributes"]:
                    tangents = accessor(primitive["attributes"]["TANGENT"])
                    assert len(tangents) == len(vertices), "Invalid tangent count"
                    assert all(
                        all(math.isfinite(c) for c in t) and abs(abs(t[3]) - 1) < 1e-5
                        for t in tangents
                    ), "Invalid tangent basis"
                indices = (
                    [v[0] for v in accessor(primitive["indices"])]
                    if "indices" in primitive
                    else list(range(len(vertices)))
                )
                assert len(indices) % 3 == 0
                assert all(
                    0 <= i < len(vertices) for i in indices
                ), "Index out of bounds"
                for row in range(0, len(indices), 3):
                    p, q, r = [vertices[i] for i in indices[row : row + 3]]
                    a, b = [q[i] - p[i] for i in range(3)], [
                        r[i] - p[i] for i in range(3)
                    ]
                    cross = [
                        a[1] * b[2] - a[2] * b[1],
                        a[2] * b[0] - a[0] * b[2],
                        a[0] * b[1] - a[1] * b[0],
                    ]
                    assert (
                        sum(v * v for v in cross) > 1e-24
                    ), "Degenerate exported triangle"
                    for edge in [(p, q), (q, r), (r, p)]:
                        key = tuple(sorted(edge))
                        surface_edges[key] = surface_edges.get(key, 0) + 1
                    surface_vertices.update((p, q, r))
                    rounded = tuple(
                        tuple((round(value, 6) or 0.0) for value in vertex)
                        for vertex in (p, q, r)
                    )
                    oriented = min(
                        rounded, rounded[1:] + rounded[:1], rounded[2:] + rounded[:2]
                    )
                    canonical_triangles.append((primitive["material"], oriented))
                triangles += len(indices) // 3
                positions.extend(
                    tuple(
                        sum(transform[i][j] * (*v, 1)[j] for j in range(4))
                        for i in range(3)
                    )
                    for v in vertices
                )
                material = primitive.get("material")
                assert material is not None and 0 <= material < len(
                    document["materials"]
                )
                mat = document["materials"][material]
                pbr = mat.get("pbrMetallicRoughness", {})
                assert (
                    "baseColorTexture" in pbr
                    and "metallicRoughnessTexture" in pbr
                    and "normalTexture" in mat
                ), "Missing Meshy PBR textures"
                assert (
                    mat.get("alphaMode", "OPAQUE") == "OPAQUE"
                ), "Unexpected transparency"
                assert mat.get("emissiveFactor", [0, 0, 0]) == [
                    0,
                    0,
                    0,
                ], "Unexpected emission"
                assert (
                    "TEXCOORD_0" in primitive["attributes"]
                ), "Missing texture UV coordinates"
                uv = accessor(primitive["attributes"]["TEXCOORD_0"])
                assert len(uv) == len(vertices) and all(
                    math.isfinite(c) for value in uv for c in value
                ), "Invalid texture UV coordinates"
                for binding in [
                    pbr["baseColorTexture"],
                    pbr["metallicRoughnessTexture"],
                    mat["normalTexture"],
                ]:
                    assert binding.get("texCoord", 0) == 0, "Unexpected UV set"
                    index = binding["index"]
                    assert (
                        0 <= index < len(document.get("textures", []))
                    ), "Invalid texture reference"
                    source = document["textures"][index]["source"]
                    assert (
                        0 <= source < len(document.get("images", []))
                    ), "Invalid image reference"
                used_materials.add(material)
        for child in node.get("children", []):
            walk(child, transform)

    for root in document["scenes"][document.get("scene", 0)]["nodes"]:
        walk(root, IDENTITY)
    minimum = [min(p[i] for p in positions) for i in range(3)]
    maximum = [max(p[i] for p in positions) for i in range(3)]
    height = maximum[1] - minimum[1]
    assert (
        abs(minimum[1]) <= 0.005 and abs(height - 1.8) <= 0.03
    ), "Incorrect origin/height in GLB Y-up coordinates"
    budget_path = path.parent / "budgets.json"
    if not budget_path.exists():
        budget_path = (
            Path(__file__).resolve().parents[2]
            / "assets/characters/minimorph/budgets.json"
        )
    limits = json.loads(budget_path.read_text())
    assert (
        triangles <= limits["triangles"]
        and len(used_materials) <= limits["materials"]
        and primitives <= limits["primitives"]
    ), "Declared review budgets exceeded"
    assert byte_count <= limits["bytes"], "Declared byte budget exceeded"
    image_info = []
    for image in document.get("images", []):
        view = document["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        payload = binary[start : start + view["byteLength"]]
        assert payload.startswith(b"\x89PNG\r\n\x1a\n"), "Expected embedded PNG maps"
        width, image_height = struct.unpack_from(">II", payload, 16)
        assert (
            width > 0 and image_height > 0 and width <= 4096 and image_height <= 4096
        ), "Invalid/oversized texture dimensions"
        image_info.append(
            {
                "name": image.get("name", ""),
                "width": width,
                "height": image_height,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
    boundary_edges = sum(count == 1 for count in surface_edges.values())
    nonmanifold_edges = sum(count != 2 for count in surface_edges.values())
    assert (
        boundary_edges == 0 and nonmanifold_edges == 0
    ), "Open or nonmanifold geometric surface"
    return {
        "asset": path.name,
        "welded_surface_vertices": len(surface_vertices),
        "welded_surface_boundary_edges": boundary_edges,
        "welded_surface_nonmanifold_edges": nonmanifold_edges,
        "bytes": byte_count,
        "glb_sha256": hashlib.sha256(data).hexdigest(),
        "geometry_sha256_1e6": hashlib.sha256(
            json.dumps(sorted(canonical_triangles), separators=(",", ":")).encode()
        ).hexdigest(),
        "rendered_triangles": triangles,
        "rendered_primitives": primitives,
        "rendered_vertices": len(positions),
        "materials": len(used_materials),
        "nodes": len(visited),
        "glTF_world_min": minimum,
        "glTF_world_max": maximum,
        "height": height,
        "embedded_images": len(document.get("images", [])),
        "skins": len(document.get("skins", [])),
        "animation_clips": len(document.get("animations", [])),
        "external_resources": 0,
        "limits": limits,
        "texture_images": image_info,
        "texture_rgba8_bytes_without_mips": sum(
            v["width"] * v["height"] * 4 for v in image_info
        ),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = inspect(args.input)
    text = json.dumps(report, indent=2)
    if args.report:
        args.report.write_text(text + "\n")
    print(text)
