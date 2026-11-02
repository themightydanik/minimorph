"""Dependency-free validation of actual animated GLB buffers and skin data."""

import argparse, hashlib, json, math, struct
from pathlib import Path
from validate_character import read_glb
from inspect_character import node_matrix, multiply, IDENTITY

EXPECTED = {
    "Idle": 2.0,
    "Run": 0.6,
    "Jump": 0.4,
    "Fall": 0.8,
    "Land": 0.4,
    "Victory": 2.0,
}


def inspect(path):
    doc, size = read_glb(path, require_identity_root=False)
    data = path.read_bytes()
    n = struct.unpack_from("<I", data, 12)[0]
    binary = data[28 + n :]

    def accessor(index):
        a = doc["accessors"][index]
        v = doc["bufferViews"][a["bufferView"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        fmt = (
            "<"
            + {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[a["componentType"]] * width
        )
        length = struct.calcsize(fmt)
        stride = v.get("byteStride", length)
        start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        assert (
            stride >= length
            and a.get("byteOffset", 0) + (a["count"] - 1) * stride + length
            <= v["byteLength"]
        ), "Invalid accessor bounds"
        result = [
            struct.unpack_from(fmt, binary, start + i * stride)
            for i in range(a["count"])
        ]
        assert all(
            math.isfinite(x) for row in result for x in row
        ), "Nonfinite accessor"
        return result

    worlds = {}
    parents = {}
    active = set()

    def walk(index, parent):
        assert index not in active and index not in worlds, "Invalid bone hierarchy"
        active.add(index)
        m = node_matrix(doc["nodes"][index])
        assert all(math.isfinite(x) for row in m for x in row), "Invalid transform"
        worlds[index] = multiply(parent, m)
        for child in doc["nodes"][index].get("children", []):
            parents[child] = index
            walk(child, worlds[index])
        active.remove(index)

    for root in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        walk(root, IDENTITY)
    assert len(doc.get("skins", [])) == 1, "Expected one skin"
    skin = doc["skins"][0]
    joints = skin["joints"]
    assert len(set(joints)) == 20 and all(i in worlds for i in joints), "Invalid joints"
    names = {doc["nodes"][i]["name"] for i in joints}
    assert {"Root", "Pelvis", "Spine", "Chest", "Neck", "Head"} <= names
    for side in ["L", "R"]:
        assert {
            n + "." + side
            for n in [
                "Shoulder",
                "UpperArm",
                "LowerArm",
                "Hand",
                "UpperLeg",
                "LowerLeg",
                "Foot",
            ]
        } <= names
    assert len(accessor(skin["inverseBindMatrices"])) == len(
        joints
    ), "Invalid inverse binds"
    points = []
    triangles = 0
    vertices = 0
    for index, node in enumerate(doc["nodes"]):
        if "mesh" not in node:
            continue
        assert node.get("skin") == 0, "Unskinned model mesh"
        for p in doc["meshes"][node["mesh"]]["primitives"]:
            a = p["attributes"]
            assert "JOINTS_0" in a and "WEIGHTS_0" in a, "Missing skin attributes"
            position = accessor(a["POSITION"])
            weights = accessor(a["WEIGHTS_0"])
            joint_indices = accessor(a["JOINTS_0"])
            assert len(position) == len(weights) == len(joint_indices)
            for w, ji in zip(weights, joint_indices):
                assert (
                    all(0 <= x <= 1 for x in w) and abs(sum(w) - 1) < 1e-4
                ), "Invalid skin weights"
                assert all(
                    0 <= j < len(joints) for j in ji
                ), "Invalid skin joint reference"
            m = worlds[index]
            points.extend(
                tuple(sum(m[i][j] * (*v, 1)[j] for j in range(4)) for i in range(3))
                for v in position
            )
            vertices += len(position)
            triangles += len(accessor(p["indices"])) // 3
    assert triangles == 160000, "Approved geometry triangle count changed"
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    assert (
        abs(lo[1]) < 0.005 and abs(hi[1] - lo[1] - 1.8) < 0.005
    ), "Invalid neutral bounds"
    reference_path = (
        Path(__file__).resolve().parents[2]
        / "assets/characters/minimorph/minimorph_v1.glb"
    )
    reference, _ = read_glb(reference_path)
    reference_bytes = reference_path.read_bytes()
    rn = struct.unpack_from("<I", reference_bytes, 12)[0]
    rb = reference_bytes[28 + rn :]
    pa = reference["accessors"][
        reference["meshes"][0]["primitives"][0]["attributes"]["POSITION"]
    ]
    pv = reference["bufferViews"][pa["bufferView"]]
    start = pv.get("byteOffset", 0) + pa.get("byteOffset", 0)
    reference_points = [
        struct.unpack_from("<fff", rb, start + i * pv.get("byteStride", 12))
        for i in range(pa["count"])
    ]
    assert len(reference_points) == len(points), "Neutral geometry vertex count changed"
    neutral_error = max(
        abs(x - y) for a, b in zip(reference_points, points) for x, y in zip(a, b)
    )
    assert neutral_error < 1e-6, "Neutral approved geometry changed"
    clips = {}
    for clip in doc.get("animations", []):
        name = clip["name"]
        assert name in EXPECTED and name not in clips, "Unexpected/duplicate clip"
        duration = 0
        varying = 0
        for channel in clip["channels"]:
            sampler = clip["samplers"][channel["sampler"]]
            times = [t[0] for t in accessor(sampler["input"])]
            values = accessor(sampler["output"])
            assert (
                len(times) == len(values)
                and times[0] == 0
                and all(b > a for a, b in zip(times, times[1:]))
            ), "Invalid key times"
            duration = max(duration, times[-1])
            target = channel["target"]
            assert target["node"] in joints, "Animation outside skeleton"
            if (
                doc["nodes"][target["node"]]["name"] == "Root"
                and target["path"] == "translation"
            ):
                parent_matrix = worlds[parents[target["node"]]]
                for value in values:
                    world = [
                        sum(parent_matrix[i][j] * (*value, 1)[j] for j in range(4))
                        for i in range(3)
                    ]
                    assert (
                        abs(world[0]) < 1e-5 and abs(world[2]) < 1e-5
                    ), "Horizontal root motion is forbidden"
            if target["path"] == "rotation":
                assert all(
                    abs(sum(x * x for x in q) - 1) < 1e-3 for q in values
                ), "Invalid rotation"
            if target["path"] == "scale":
                assert all(
                    max(abs(x - 1) for x in row) < 1e-5 for row in values
                ), "Unexpected scale deformation"
            if name in ["Idle", "Run", "Fall"]:
                assert (
                    max(abs(a - b) for a, b in zip(values[0], values[-1])) < 1e-5
                ), "Loop seam mismatch"
            if any(
                max(abs(x - y) for x, y in zip(values[0], row)) > 1e-4 for row in values
            ):
                varying += 1
        assert (
            abs(duration - EXPECTED[name]) < 1e-4 and varying > 0
        ), "Invalid duration/static animation"
        clips[name] = {"duration": duration, "varying_channels": varying}
    assert set(clips) == set(EXPECTED), "Missing animation clips"
    images = []
    for image in doc["images"]:
        v = doc["bufferViews"][image["bufferView"]]
        o = v.get("byteOffset", 0)
        images.append(hashlib.sha256(binary[o : o + v["byteLength"]]).hexdigest())
    static_report = json.loads(
        (
            Path(__file__).resolve().parents[2]
            / "assets/characters/minimorph/validation.json"
        ).read_text()
    )
    assert sorted(images) == sorted(
        i["sha256"] for i in static_report["texture_images"]
    ), "Approved textures changed"
    assert size < 36 * 1024 * 1024, "Animated file budget exceeded"
    return {
        "asset": path.name,
        "bytes": size,
        "sha256": hashlib.sha256(data).hexdigest(),
        "triangles": triangles,
        "exported_vertices": vertices,
        "bones": len(joints),
        "skins": 1,
        "clips": clips,
        "neutral_world_min": lo,
        "neutral_world_max": hi,
        "embedded_images": len(images),
        "texture_hashes_match_static": True,
        "neutral_geometry_max_component_error": neutral_error,
        "quality_status": "technical pass does not approve deformation; see documented pose defects",
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument(
        "--input",
        type=Path,
        default=Path("assets/characters/minimorph/animation/minimorph_animated_v1.glb"),
    )
    p.add_argument("--report", type=Path)
    a = p.parse_args()
    r = inspect(a.input)
    s = json.dumps(r, indent=2)
    print(s)
    if a.report:
        a.report.write_text(s + "\n")
