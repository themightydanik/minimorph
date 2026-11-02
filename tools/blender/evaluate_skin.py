"""Evaluate actual exported glTF skinning at every half-frame using NumPy.
No Blender dependency: regression checks apply to the delivered GLB itself.
"""

import argparse, hashlib, json, struct
from pathlib import Path
import numpy as np


def load(path):
    data = path.read_bytes()
    n = struct.unpack_from("<I", data, 12)[0]
    d = json.loads(data[20 : 20 + n])
    binary = data[28 + n :]

    def acc(index):
        a = d["accessors"][index]
        v = d["bufferViews"][a["bufferView"]]
        dtype = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[a["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        item = np.dtype(dtype).itemsize
        result = np.ndarray(
            (a["count"], width),
            dtype=dtype,
            buffer=binary,
            offset=v.get("byteOffset", 0) + a.get("byteOffset", 0),
            strides=(v.get("byteStride", width * item), item),
        ).copy()
        if a.get("normalized"):
            result = result / np.iinfo(np.dtype(dtype)).max
        return result

    return d, acc


def matrix(t, q, s):
    x, y, z, w = q
    qnorm = np.linalg.norm(q)
    assert qnorm > 0.99
    x, y, z, w = q / qnorm
    r = np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )
    m = np.eye(4)
    m[:3, :3] = r * np.array(s)[None, :]
    m[:3, 3] = t
    return m


class Skin:
    def __init__(self, path):
        self.path = path
        self.doc, self.acc = load(path)
        self.nodes = self.doc["nodes"]
        self.skin = self.doc["skins"][0]
        self.bones = [self.nodes[i]["name"] for i in self.skin["joints"]]
        self.ibm = (
            self.acc(self.skin["inverseBindMatrices"])
            .reshape(-1, 4, 4)
            .transpose(0, 2, 1)
        )
        p = self.doc["meshes"][0]["primitives"][0]
        a = p["attributes"]
        self.pos = self.acc(a["POSITION"]).astype(float)
        self.joints = self.acc(a["JOINTS_0"]).astype(int)
        self.weights = self.acc(a["WEIGHTS_0"]).astype(float)
        self.tri = self.acc(p["indices"]).ravel().reshape(-1, 3)
        self.edges = np.unique(
            np.sort(self.tri[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1), axis=0
        )
        self.clips = {a["name"]: a for a in self.doc["animations"]}
        self.channels = {}
        for name, clip in self.clips.items():
            assert all(
                s.get("interpolation", "LINEAR") in ("LINEAR", "STEP")
                for s in clip["samplers"]
            ), "Evaluator supports sampled LINEAR/STEP glTF tracks"
            self.channels[name] = [
                (
                    c["target"]["node"],
                    c["target"]["path"],
                    self.acc(clip["samplers"][c["sampler"]]["input"]).ravel(),
                    self.acc(clip["samplers"][c["sampler"]]["output"]).astype(float),
                    clip["samplers"][c["sampler"]].get("interpolation", "LINEAR"),
                )
                for c in clip["channels"]
            ]
        self.influences = []
        for bone in range(len(self.bones)):
            vertex, slot = np.where((self.joints == bone) & (self.weights > 1e-8))
            self.influences.append((vertex, self.weights[vertex, slot]))
        self.neutral, self.bind_matrices = self.evaluate(None, 0)
        self.rest_lengths = np.linalg.norm(
            self.neutral[self.edges[:, 0]] - self.neutral[self.edges[:, 1]], axis=1
        )
        self.valid = self.rest_lengths > 1e-4

    def duration(self, name):
        return max(t[-1] for _, _, t, _, _ in self.channels[name])

    def evaluate(self, name, time):
        overrides = {}
        for node, path, times, values, interpolation in self.channels.get(name, []):
            i = min(
                max(int(np.searchsorted(times, time, side="right") - 1), 0),
                len(times) - 1,
            )
            value = values[i]
            if i + 1 < len(times) and interpolation != "STEP":
                alpha = np.clip((time - times[i]) / (times[i + 1] - times[i]), 0, 1)
                other = values[i + 1]
                if path == "rotation":
                    value = value / np.linalg.norm(value)
                    other = other / np.linalg.norm(other)
                    dot = float(np.dot(value, other))
                    if dot < 0:
                        other = -other
                        dot = -dot
                    dot = np.clip(dot, -1.0, 1.0)
                    if dot > 0.9995:
                        value = (1 - alpha) * value + alpha * other
                    else:
                        angle = np.arccos(dot)
                        value = (
                            np.sin((1 - alpha) * angle) * value
                            + np.sin(alpha * angle) * other
                        ) / np.sin(angle)
                    value /= np.linalg.norm(value)
                else:
                    value = (1 - alpha) * value + alpha * other
            overrides[node, path] = value
        worlds = {}

        def visit(i, parent):
            n = self.nodes[i]
            if "matrix" in n and not any(
                (i, k) in overrides for k in ["translation", "rotation", "scale"]
            ):
                local = np.array(n["matrix"]).reshape(4, 4).T
            else:
                local = matrix(
                    overrides.get((i, "translation"), n.get("translation", [0, 0, 0])),
                    overrides.get((i, "rotation"), n.get("rotation", [0, 0, 0, 1])),
                    overrides.get((i, "scale"), n.get("scale", [1, 1, 1])),
                )
            worlds[i] = parent @ local
            for child in n.get("children", []):
                visit(child, worlds[i])

        for i in self.doc["scenes"][self.doc.get("scene", 0)]["nodes"]:
            visit(i, np.eye(4))
        matrices = np.array(
            [worlds[i] @ self.ibm[j] for j, i in enumerate(self.skin["joints"])]
        )
        deformed = np.zeros_like(self.pos)
        for m, (indices, w) in zip(matrices, self.influences):
            deformed[indices] += (
                np.einsum("ij,kj->ik", self.pos[indices], m[:3, :3]) + m[:3, 3]
            ) * w[:, None]
        return deformed, matrices


def joint_violations(skin, labels):
    failures = []
    for side in ["L", "R"]:
        paw = np.flatnonzero((labels == "Hand." + side) & (skin.neutral[:, 1] < 0.44))
        forbidden = [
            skin.bones.index(b)
            for b in skin.bones
            if b.startswith(("UpperLeg", "LowerLeg", "Foot")) or b == "Pelvis"
        ]
        bad = np.sum(
            np.where(np.isin(skin.joints[paw], forbidden), skin.weights[paw], 0), axis=1
        )
        failures.extend(paw[bad > 1e-4].tolist())
        torso = np.flatnonzero(np.isin(labels, ["Chest", "Pelvis", "Head"]))
        leaked = np.sum(
            np.where(
                skin.joints[torso] == skin.bones.index("Hand." + side),
                skin.weights[torso],
                0,
            ),
            axis=1,
        )
        failures.extend(torso[leaked > 1e-6].tolist())
    return sorted(set(failures))


def measure(path, semantic, hz=60):
    skin = Skin(path)
    source = (
        Path(__file__).resolve().parents[2]
        / "assets/characters/minimorph/minimorph_v1.glb"
    )
    sd, sa = load(source)
    sp = sa(sd["meshes"][0]["primitives"][0]["attributes"]["POSITION"])
    assert len(sp) == len(skin.neutral)
    neutral_error = float(np.max(np.abs(sp - skin.neutral)))
    feet = {
        side: np.flatnonzero(
            (skin.neutral[:, 0] * s > 0.01) & (skin.neutral[:, 1] < 0.045)
        )
        for side, s in [("L", 1), ("R", -1)]
    }
    rigid_vertices = np.array([], int)
    rigid_bones = np.array([], int)
    labels = None
    if semantic:
        sem = np.load(semantic)
        rigid_vertices = sem["unique_first"][sem["rigid_indices"]]
        rigid_bones = np.array(
            [skin.bones.index(str(sem["names"][i])) for i in sem["rigid_bones"]]
        )
        labels = sem["labels"]
        assert len(labels) == len(
            skin.pos
        ), "Semantic/source vertex correspondence mismatch"
        head = np.flatnonzero(labels == "Head")
        rigid_vertices = np.r_[rigid_vertices, head]
        rigid_bones = np.r_[
            rigid_bones, np.full(len(head), skin.bones.index("Head"), int)
        ]
        assert len(rigid_vertices) > 1000, "Missing rigid-region constraints"
    results = {}
    worst = []
    for name in skin.clips:
        duration = skin.duration(name)
        rows = []
        for time in np.linspace(0, duration, round(duration * hz) + 1):
            p, matrices = skin.evaluate(name, float(time))
            ratios = (
                np.linalg.norm(p[skin.edges[:, 0]] - p[skin.edges[:, 1]], axis=1)[
                    skin.valid
                ]
                / skin.rest_lengths[skin.valid]
            )
            k = int(np.argmax(ratios))
            edge = skin.edges[skin.valid][k]
            rigid_error = 0
            if len(rigid_vertices):
                expected = (
                    np.einsum(
                        "nij,nj->ni",
                        matrices[rigid_bones, :3, :3],
                        skin.pos[rigid_vertices],
                    )
                    + matrices[rigid_bones, :3, 3]
                )
                rigid_error = float(
                    np.max(np.linalg.norm(p[rigid_vertices] - expected, axis=1))
                )
            minima = {
                side: float(p[indices, 1].min()) for side, indices in feet.items()
            }
            contact = {side: abs(minima[side]) < 0.002 for side in feet}
            if name == "Run":
                phase = time / duration
                required = {
                    side: bool(((phase + offset) % 1) < 0.5)
                    for side, offset in [("L", 0), ("R", 0.5)]
                }
            else:
                required = {side: name in ["Idle", "Land", "Victory"] for side in feet}
            row = {
                "time": float(time),
                "minimum_y": float(p[:, 1].min()),
                "maximum_edge_stretch": float(ratios[k]),
                "edge_stretch_p99": float(np.percentile(ratios, 99)),
                "minimum_edge_ratio": float(ratios.min()),
                "rigid_armor_max_error": rigid_error,
                "sole_minima": minima,
                "required_contacts": required,
                "contact_pass": all(not required[s] or contact[s] for s in feet),
                "worst_edge": edge.tolist(),
            }
            rows.append(row)
        maximum = max(rows, key=lambda r: r["maximum_edge_stretch"])
        edge = maximum["worst_edge"]
        worst.append(
            {
                "clip": name,
                "time": maximum["time"],
                "ratio": maximum["maximum_edge_stretch"],
                "vertex_ids": edge,
                "rest_world_positions": skin.neutral[edge].tolist(),
                "influences": [
                    {
                        skin.bones[j]: float(w)
                        for j, w in zip(skin.joints[i], skin.weights[i])
                        if w > 1e-6
                    }
                    for i in edge
                ],
            }
        )
        results[name] = {
            "frames_sampled": len(rows),
            "minimum_y": min(r["minimum_y"] for r in rows),
            "maximum_edge_stretch": maximum["maximum_edge_stretch"],
            "maximum_rigid_armor_error": max(r["rigid_armor_max_error"] for r in rows),
            "contact_failures": sum(not r["contact_pass"] for r in rows),
            "frames": rows,
        }
    joint_failures = joint_violations(skin, labels) if labels is not None else []
    limits = {
        "maximum_edge_stretch": 2.0,
        "minimum_y": -0.002,
        "rigid_armor_max_error": 1e-5,
        "neutral_max_error": 3e-6,
    }
    gates = {
        "edge_stretch": all(
            r["maximum_edge_stretch"] <= limits["maximum_edge_stretch"]
            for r in results.values()
        ),
        "ground_penetration": all(
            r["minimum_y"] >= limits["minimum_y"] for r in results.values()
        ),
        "foot_contacts": all(r["contact_failures"] == 0 for r in results.values()),
        "rigid_armor": all(
            r["maximum_rigid_armor_error"] <= limits["rigid_armor_max_error"]
            for r in results.values()
        ),
        "neutral_fidelity": neutral_error <= limits["neutral_max_error"],
        "joint_influences": len(joint_failures) == 0,
    }
    return {
        "asset_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "semantic_sha256": hashlib.sha256(semantic.read_bytes()).hexdigest(),
        "sample_rate_hz": hz,
        "limits": limits,
        "gates": gates,
        "all_measured_gates_pass": all(gates.values()),
        "neutral_max_error": neutral_error,
        "joint_influence_failures": joint_failures,
        "clips": results,
        "worst_edges": worst,
        "human_approved": False,
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--semantic", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    p.add_argument("--require-pass", action="store_true")
    a = p.parse_args()
    r = measure(a.input, a.semantic)
    a.report.parent.mkdir(parents=True, exist_ok=True)
    a.report.write_text(json.dumps(r, indent=2) + "\n")
    print(
        json.dumps(
            {
                "gates": r["gates"],
                "clips": {
                    k: {x: y for x, y in v.items() if x != "frames"}
                    for k, v in r["clips"].items()
                },
            },
            indent=2,
        )
    )

    if a.require_pass and not r["all_measured_gates_pass"]:
        raise SystemExit(
            "DEFORMATION QUALITY FAIL: "
            + ", ".join(k for k, v in r["gates"].items() if not v)
        )
