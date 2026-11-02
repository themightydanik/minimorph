"""One pose-aware, bounded local weight pass over existing workbench regions.
No remeshing, bone edits, animation edits or threshold changes.
"""

import argparse, json, hashlib
from pathlib import Path
import numpy as np
from scipy.sparse import coo_matrix, eye
from scipy.sparse.linalg import factorized
from evaluate_skin import Skin

POSES = [
    ("Run", 0.1),
    ("Run", 0.4),
    ("Jump", 0.4),
    ("Fall", 0),
    ("Land", 1 / 6),
    ("Victory", 1),
    ("Idle", 1.5),
]


def project_capped_simplex(x):
    x = np.maximum(x, 0)
    overflow = x.sum(1) > 1
    if np.any(overflow):
        p = x[overflow]
        ordered = np.sort(p, axis=1)[:, ::-1]
        cum = np.cumsum(ordered, axis=1) - 1
        steps = np.arange(1, p.shape[1] + 1)
        rho = (ordered - cum / steps > 0).sum(1) - 1
        theta = cum[np.arange(len(p)), rho] / (rho + 1)
        x[overflow] = np.maximum(p - theta[:, None], 0)
    return x


def run(asset, semantic, output):
    skin = Skin(asset)
    sem = np.load(semantic)
    names = list(sem["names"])
    source_w = sem["weights"].copy()
    unique = sem["unique"]
    first = sem["unique_first"]
    inv = sem["inverse"]
    w = source_w[first].copy()
    tr = inv[sem["triangles"]]
    edges = np.unique(np.sort(tr[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1), axis=0)
    p = skin.pos[first]
    rest = np.linalg.norm(p[edges[:, 1]] - p[edges[:, 0]], axis=1)
    edges = edges[rest > 1e-4]
    rest = rest[rest > 1e-4]
    labels = sem["labels"][first]
    fixed = np.zeros(len(unique), bool)
    fixed[sem["rigid_indices"]] = True
    fixed[unique[:, 2] >= 0.98] = True
    fixed[unique[:, 2] < 0.16] = True
    bone_order = np.array([skin.bones.index(n) for n in names])
    matrices = [skin.evaluate(n, t)[1][bone_order] for n, t in POSES]
    reports = []
    edited = np.zeros(len(unique), bool)
    for side, sign in [("L", 1), ("R", -1)]:
        for region, mask, allowed in [
            (
                "Knee",
                (unique[:, 0] * sign > 0.08)
                & (unique[:, 0] * sign < 0.34)
                & (unique[:, 2] > 0.18)
                & (unique[:, 2] < 0.34),
                ["UpperLeg." + side, "LowerLeg." + side, "Foot." + side],
            ),
            (
                "Hip",
                (unique[:, 0] * sign > 0.08)
                & (unique[:, 0] * sign < 0.34)
                & (unique[:, 2] > 0.44)
                & (unique[:, 2] < 0.56),
                ["Pelvis", "UpperLeg." + side, "Chest"],
            ),
        ]:
            ids = np.flatnonzero(mask & ~fixed & np.isin(labels, allowed))
            k = len(allowed) - 1
            mapid = np.full(len(unique), -1, int)
            mapid[ids] = np.arange(len(ids))
            bidx = np.array([names.index(n) for n in allowed])
            touch = (mapid[edges[:, 0]] >= 0) | (mapid[edges[:, 1]] >= 0)
            ee = edges[touch]
            ll = rest[touch]
            nv = len(ids)
            totalrows = len(ee) * 3 * len(matrices)
            row_chunks = []
            col_chunks = []
            data_chunks = []
            targets = []
            if not nv:
                continue
            initial = w[ids][:, bidx]
            initial /= np.maximum(initial.sum(1, keepdims=True), 1e-20)
            xold = initial[:, 1:].ravel()
            for pose_index, m in enumerate(matrices):
                transforms = (
                    np.einsum("nij,vj->vni", m[:, :3, :3], p) + m[:, :3, 3][None, :, :]
                )
                actual = np.einsum("vni,vn->vi", transforms, w)
                reference = actual.copy()
                reference[ids] = transforms[ids, bidx[0]]
                base = reference[ee[:, 1]] - reference[ee[:, 0]]
                rotations = np.einsum("bn,bjk->njk", w.T, m[:, :3, :3])
                desired = np.einsum(
                    "nij,nj->ni",
                    (rotations[ee[:, 0]] + rotations[ee[:, 1]]) * 0.5,
                    p[ee[:, 1]] - p[ee[:, 0]],
                )
                targets.append(((desired - base) / ll[:, None]).ravel())
                for endpoint, sgn in [(0, -1), (1, 1)]:
                    take = np.flatnonzero(mapid[ee[:, endpoint]] >= 0)
                    vertices = ee[take, endpoint]
                    local = mapid[vertices]
                    for variable, bone in enumerate(bidx[1:]):
                        delta = (
                            (transforms[vertices, bone] - transforms[vertices, bidx[0]])
                            * sgn
                            / ll[take, None]
                        )
                        row_chunks.append(
                            (
                                pose_index * len(ee) * 3
                                + take[:, None] * 3
                                + np.arange(3)
                            ).ravel()
                        )
                        col_chunks.append(np.repeat(local * k + variable, 3))
                        data_chunks.append(delta.ravel())
            a = coo_matrix(
                (
                    np.concatenate(data_chunks),
                    (np.concatenate(row_chunks), np.concatenate(col_chunks)),
                ),
                shape=(totalrows, nv * k),
            ).tocsr()
            b = np.concatenate(targets)
            regularization = 0.1
            q = (a.T @ a).tocsc() + regularization * eye(nv * k, format="csc")
            rhs = a.T @ b + regularization * xold
            rho = max(float(np.median(q.diagonal())) * 0.02, 0.1)
            solve = factorized(q + rho * eye(nv * k, format="csc"))
            z = xold.reshape(nv, k).copy()
            dual = np.zeros_like(z)
            before = float(np.linalg.norm(a @ xold - b))
            converged = False
            for iteration in range(1200):
                primal = solve(rhs + rho * (z - dual).ravel()).reshape(nv, k)
                previous = z.copy()
                z = project_capped_simplex(primal + dual)
                dual += primal - z
                if (
                    np.max(np.abs(primal - z)) < 1e-6
                    and np.max(np.abs(z - previous)) < 1e-6
                ):
                    converged = True
                    break
            solution = np.column_stack([1 - z.sum(1), z])
            w[ids] = 0
            w[np.ix_(ids, bidx)] = solution
            edited[ids] = True
            after = float(np.linalg.norm(a @ z.ravel() - b))
            reports.append(
                {
                    "region": "Manual_" + region + "_" + side,
                    "unique_vertices": nv,
                    "iterations": iteration + 1,
                    "converged": converged,
                    "relative_edge_objective_before": before,
                    "relative_edge_objective_after": after,
                    "allowed_bones": allowed,
                }
            )
    # No modifications to contact bridges: safe local closed-cut contour was not found.
    assert np.max(np.abs(w[fixed] - source_w[first][fixed])) == 0
    assert np.all(w >= -1e-12) and np.max(np.abs(w.sum(1) - 1)) < 1e-6
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {key: sem[key] for key in sem.files}
    payload["weights"] = w[inv]
    np.savez_compressed(output, **payload)
    report = {
        "input_asset_sha256": hashlib.sha256(asset.read_bytes()).hexdigest(),
        "input_semantic_sha256": hashlib.sha256(semantic.read_bytes()).hexdigest(),
        "output_semantic_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "one_pass": True,
        "geometry_modified": False,
        "animations_modified": False,
        "rigid_constraints_unchanged": True,
        "selected_unique_vertices": int(edited.sum()),
        "selected_gpu_vertices": int(edited[inv].sum()),
        "actually_changed_gpu_vertices": int(
            np.count_nonzero(np.max(np.abs(w[inv] - source_w), axis=1) > 1e-10)
        ),
        "regions": reports,
        "contact_repair": "Rejected automatically: proposed contact boundary is open, so no blind topology split or cap was performed.",
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--asset", type=Path, required=True)
    p.add_argument("--semantic", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    run(a.asset, a.semantic, a.output)
