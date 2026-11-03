"""Diagnose a bounded face-dual cut; report open boundaries without altering geometry.
Welded positions help trace UV seams, but do not authorize welding or cutting.
"""

import json, numpy as np
from pathlib import Path
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import maximum_flow, breadth_first_order
import argparse

p = argparse.ArgumentParser()
p.add_argument("--semantic", type=Path, required=True)
p.add_argument("--output", type=Path, required=True)
args = p.parse_args()
s = np.load(args.semantic)
u = s["unique"]
tri = s["inverse"][s["triangles"]]
e = np.sort(tri[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1)
o = np.lexsort(e.T[::-1])
es = e[o]
pair = np.flatnonzero(np.all(es[1:] == es[:-1], axis=1))
face = np.repeat(np.arange(len(tri)), 3)[o]
edge = es[pair]
f1 = face[pair]
f2 = face[pair + 1]
center = u[tri].mean(1)
mid = u[edge].mean(1)
manifest = []
for side, sign in [("L", 1), ("R", -1)]:
    keep = (center[:, 2] > 0.42) & (center[:, 2] < 0.73) & (center[:, 0] * sign > 0.16)
    ids = np.flatnonzero(keep)
    local = np.full(len(tri), -1, int)
    local[ids] = np.arange(len(ids))
    good = keep[f1] & keep[f2]
    a = local[f1[good]]
    b = local[f2[good]]
    eg = edge[good]
    em = mid[good]
    allowed = (
        (em[:, 0] * sign > 0.28)
        & (em[:, 0] * sign < 0.38)
        & (em[:, 1] > -0.14)
        & (em[:, 1] < 0.19)
        & (em[:, 2] > 0.46)
        & (em[:, 2] < 0.72)
    )
    cost = np.full(len(a), 100000000, np.int64)
    cost[allowed] = np.maximum(
        1,
        (np.linalg.norm(u[eg[allowed, 0]] - u[eg[allowed, 1]], axis=1) * 1e6).astype(
            np.int64
        ),
    )
    source = len(ids)
    sink = source + 1
    arm = np.flatnonzero(center[ids, 0] * sign > 0.40)
    body = np.flatnonzero(center[ids, 0] * sign < 0.27)
    row = np.r_[a, b, np.full(len(arm), source), body]
    col = np.r_[b, a, arm, np.full(len(body), sink)]
    cap = np.r_[cost, cost, np.full(len(arm), 100000000), np.full(len(body), 100000000)]
    g = coo_matrix((cap, (row, col)), shape=(sink + 1, sink + 1)).tocsr()
    flow = maximum_flow(g, source, sink)
    res = g - flow.flow
    res.data = (res.data > 0).astype(np.int64)
    res.eliminate_zeros()
    reached = breadth_first_order(res, source, directed=True, return_predecessors=False)
    inside = np.zeros(sink + 1, bool)
    inside[reached] = True
    cross = inside[a] != inside[b]
    cut = eg[cross]
    counts = np.bincount(cut.ravel(), minlength=len(u))
    verts = np.flatnonzero(counts)
    manifest.append(
        {
            "side": side,
            "minimum_cut_cost": int(flow.flow_value),
            "cut_edges_unique": cut.tolist(),
            "cut_edges_gpu": s["unique_first"][cut].tolist(),
            "boundary_degrees": counts[verts].tolist(),
            "open_end_gpu_ids": s["unique_first"][np.flatnonzero(counts == 1)].tolist(),
            "open_end_positions_blender": u[np.flatnonzero(counts == 1)].tolist(),
            "safe_to_cut": bool(
                flow.flow_value < 100000000
                and len(cut) >= 3
                and np.all(counts[verts] == 2)
            ),
            "topology_modified": False,
        }
    )
args.output.write_text(json.dumps(manifest, indent=2) + "\n")
