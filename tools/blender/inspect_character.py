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
                if document["materials"][material].get("name") == "Kitten_VertexFur":
                    assert (
                        "COLOR_0" in primitive["attributes"]
                    ), "Missing baked fur vertex colors"
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
    assert (
        triangles <= 20000 and len(used_materials) <= 8 and primitives <= 8
    ), "Mobile geometry/material/draw budgets exceeded"
    assert byte_count <= 8 * 1024 * 1024
    return {
        "asset": path.name,
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
