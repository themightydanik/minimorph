"""Derive semantic weight constraints from actual topology, UV/PBR and anatomy.
Run with Python (NumPy/SciPy/Pillow), then Blender consumes the NPZ. No mesh edits.
"""

import argparse, json, struct, hashlib
from pathlib import Path
from io import BytesIO
import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix, diags
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import factorized

NAMES = ["Root", "Pelvis", "Spine", "Chest", "Neck", "Head"] + [
    n + "." + s
    for s in ["L", "R"]
    for n in [
        "Shoulder",
        "UpperArm",
        "LowerArm",
        "Hand",
        "UpperLeg",
        "LowerLeg",
        "Foot",
    ]
]


def read(path):
    b = path.read_bytes()
    n = struct.unpack_from("<I", b, 12)[0]
    d = json.loads(b[20 : 20 + n])
    binary = b[28 + n :]

    def acc(index):
        a = d["accessors"][index]
        v = d["bufferViews"][a["bufferView"]]
        dtype = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[a["componentType"]]
        w = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        item = np.dtype(dtype).itemsize
        return np.ndarray(
            (a["count"], w),
            dtype=dtype,
            buffer=binary,
            offset=v.get("byteOffset", 0) + a.get("byteOffset", 0),
            strides=(v.get("byteStride", item * w), item),
        ).copy()

    return d, binary, acc


def prepare(source, output):
    d, b, acc = read(source)
    p = d["meshes"][0]["primitives"][0]
    v = acc(p["attributes"]["POSITION"])
    pos = v[:, [0, 2, 1]].copy()
    pos[:, 1] *= -1
    uv = acc(p["attributes"]["TEXCOORD_0"])
    tri = acc(p["indices"]).ravel().reshape(-1, 3)
    u, first, inv = np.unique(pos, axis=0, return_index=True, return_inverse=True)
    ft = inv[tri]
    edges = np.unique(np.sort(ft[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1), axis=0)
    length = np.linalg.norm(u[edges[:, 0]] - u[edges[:, 1]], axis=1)
    rows = np.r_[edges[:, 0], edges[:, 1]]
    cols = np.r_[edges[:, 1], edges[:, 0]]
    graph = coo_matrix(
        (np.ones(len(rows)), (rows, cols)), shape=(len(u), len(u))
    ).tocsr()
    # Exact shared geometric EDGES establish surface adjacency; mere point contact does not.
    directed = ft[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    order = np.lexsort(np.sort(directed, axis=1).T[::-1])
    ordered = np.sort(directed, axis=1)[order]
    paired = np.all(ordered[1:] == ordered[:-1], axis=1)
    pairs = np.flatnonzero(paired)
    faces = np.repeat(np.arange(len(ft)), 3)[order]
    fg = coo_matrix(
        (
            np.ones(2 * len(pairs)),
            (
                np.r_[faces[pairs], faces[pairs + 1]],
                np.r_[faces[pairs + 1], faces[pairs]],
            ),
        ),
        shape=(len(ft), len(ft)),
    ).tocsr()
    face_components, _ = connected_components(fg)
    connectivity_cuts = []
    for level in [0.55, 0.60, 0.65]:
        keep = np.all(u[ft, 2] < level, axis=1)
        sub = fg.multiply(keep[:, None]).multiply(keep[None, :]).tocsr()
        sub.eliminate_zeros()
        _, face_labels = connected_components(sub)
        _, counts = np.unique(face_labels[keep], return_counts=True)
        connectivity_cuts.append(
            {
                "maximum_z": level,
                "largest_face_components": sorted(map(int, counts), reverse=True)[:6],
            }
        )

    def sample(binding):
        image = d["images"][d["textures"][binding["index"]]["source"]]
        view = d["bufferViews"][image["bufferView"]]
        offset = view.get("byteOffset", 0)
        im = (
            np.asarray(
                Image.open(BytesIO(b[offset : offset + view["byteLength"]])).convert(
                    "RGB"
                )
            )
            / 255
        )
        xy = np.clip(
            (uv * [im.shape[1], im.shape[0]]).astype(int),
            0,
            [im.shape[1] - 1, im.shape[0] - 1],
        )
        return im[xy[:, 1], xy[:, 0]][first]

    pbr = d["materials"][0]["pbrMetallicRoughness"]
    color = sample(pbr["baseColorTexture"])
    metal = sample(pbr["metallicRoughnessTexture"])[:, 2]
    gray = color.max(1) - color.min(1)
    x = np.abs(u[:, 0])
    z = u[:, 2]
    initial = np.zeros((len(u), len(NAMES)))
    labels = np.full(len(u), "Pelvis", dtype="<U16")

    def assign(mask, name):
        labels[mask] = name

    assign(z > 0.55, "Chest")
    assign(z >= 0.98, "Head")
    for side, sign in [("L", 1), ("R", -1)]:
        half = u[:, 0] * sign > 0
        assign(half & (z < 0.53) & ((x > 0.095) | (z < 0.28)), "UpperLeg." + side)
        assign(half & (z < 0.26), "LowerLeg." + side)
        assign(half & (z < 0.18), "Foot." + side)
        arm = half & (x > 0.35) & (z > 0.29) & (z < 0.84)
        assign(arm, "UpperArm." + side)
        assign(arm & (z < 0.72), "LowerArm." + side)
        assign(arm & (z < 0.44), "Hand." + side)
    # Infer complete low paw surfaces by connectivity, not by an x/z plane through them.
    paw_components = []
    low = z < 0.55
    cut = graph.multiply(low[:, None]).multiply(low[None, :]).tocsr()
    cut.eliminate_zeros()
    _, lab = connected_components(cut)
    for side, sign in [("L", 1), ("R", -1)]:
        candidates = np.flatnonzero((u[:, 0] * sign > 0.40) & (z < 0.42))
        counts = np.bincount(lab[candidates])
        component = int(counts.argmax())
        paw = low & (lab == component)
        assign(paw & (z < 0.44), "Hand." + side)
        assign(paw & (z >= 0.44), "LowerArm." + side)
        assert 500 < int(paw.sum()) < 1500 and np.all(
            u[paw, 0] * sign > 0.30
        ), "Paw component unexpectedly crosses torso; inspect topology"
        paw_components.append(
            {
                "side": side,
                "vertices": int(paw.sum()),
                "min": u[paw].min(0).tolist(),
                "max": u[paw].max(0).tolist(),
            }
        )
    # Connected silver atlas regions are assigned as WHOLE plates, never cut by a weight plane.
    armor = (metal > 0.6) & (gray < 0.22) & (z < 0.98)
    sg = graph.multiply(armor[:, None]).multiply(armor[None, :]).tocsr()
    sg.eliminate_zeros()
    _, components = connected_components(sg)
    ids, cnts = np.unique(components[armor], return_counts=True)
    rigid_regions = []
    for cid, count in zip(ids, cnts):
        if count < 12:
            continue
        region = np.flatnonzero(armor & (components == cid))
        values, counts = np.unique(labels[region], return_counts=True)
        name = str(values[counts.argmax()])
        center = u[region].mean(0)
        if abs(center[0]) > 0.1 and center[2] < 0.55:
            side = "L" if center[0] > 0 else "R"
            name = (
                "Foot."
                if center[2] < 0.22
                else "LowerLeg." if center[2] < 0.30 else "UpperLeg."
            ) + side
        labels[region] = name
        rigid_regions.append({"bone": name, "indices": region.tolist()})
    initial = np.zeros((len(u), len(NAMES)))
    for i, name in enumerate(NAMES):
        initial[:, i] = labels == name
    boundary = np.zeros(len(u), bool)
    different = labels[edges[:, 0]] != labels[edges[:, 1]]
    boundary[edges[different].ravel()] = True
    free = boundary.copy()
    for _ in range(8):
        free |= np.asarray(graph @ free.astype(float)).ravel() > 0
    fixed = ~free
    for region in rigid_regions:
        fixed[region["indices"]] = True
    # Fur paws and complete soles are rigid, including inner toes formerly assigned to pelvis.
    fixed[(z < 0.18)] = True
    for side, sign in [("L", 1), ("R", -1)]:
        fixed[(u[:, 0] * sign > 0.35) & (z < 0.42)] = True
    fixed[z >= 0.98] = True
    weights = initial.copy()
    unknown = np.flatnonzero(~fixed)
    known = np.flatnonzero(fixed)
    conductance = (1 / np.maximum(length, 1e-5)).astype(np.float64)
    adj = coo_matrix(
        (np.r_[conductance, conductance], (rows, cols)), shape=graph.shape
    ).tocsr()
    lap = diags(np.asarray(adj.sum(1)).ravel()) - adj
    if len(unknown):
        solve = factorized(lap[unknown][:, unknown].tocsc())
        rhs = -(lap[unknown][:, known] @ initial[known])
        weights[unknown] = np.column_stack(
            [solve(rhs[:, i]) for i in range(len(NAMES))]
        )
    weights = np.maximum(weights, 0)
    weights /= weights.sum(1, keepdims=True)
    # Paw controls must never leak into chest/hips through a fused contact.
    for side in ["L", "R"]:
        hand = NAMES.index("Hand." + side)
        valid = np.isin(labels, ["Hand." + side, "LowerArm." + side]) & (z < 0.49)
        for target, name in enumerate(NAMES):
            transfer = (~valid) & (labels == name)
            if target == hand:
                target = NAMES.index("LowerArm." + side)
            weights[transfer, target] += weights[transfer, hand]
            weights[transfer, hand] = 0
    # Four-influence export budget. Keep continuity, normalize after truncation.
    order = np.argsort(-weights, axis=1)
    keep = np.zeros_like(weights)
    np.put_along_axis(
        keep, order[:, :4], np.take_along_axis(weights, order[:, :4], axis=1), axis=1
    )
    weights = keep / keep.sum(1, keepdims=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output,
        positions=pos,
        unique=u,
        inverse=inv,
        weights=weights[inv],
        names=np.array(NAMES),
        triangles=tri,
        labels=labels[inv],
        rigid_indices=np.array([i for r in rigid_regions for i in r["indices"]]),
        rigid_bones=np.array(
            [NAMES.index(r["bone"]) for r in rigid_regions for i in r["indices"]]
        ),
        unique_first=first,
    )
    report = {
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "vertex_count": len(pos),
        "welded_vertices": len(u),
        "face_edge_connected_components": int(face_components),
        "connectivity_cuts": connectivity_cuts,
        "paw_components_below_z_055": paw_components,
        "harmonic_unknown_vertices": len(unknown),
        "rigid_regions": [
            {k: v for k, v in r.items() if k != "indices"}
            | {"vertices": len(r["indices"])}
            for r in rigid_regions
        ],
        "geometry_cut_or_moved": False,
        "diagnosis": "Old hand masks excluded z<0.40, although paws reach z≈0.303; old leg masks excluded inner toes x<0.095. Foot IK targets were correct; wrong weights caused floor penetration.",
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument(
        "--input",
        type=Path,
        default=Path("assets/characters/minimorph/minimorph_v1.glb"),
    )
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    print(json.dumps(prepare(a.input, a.output), indent=2))
