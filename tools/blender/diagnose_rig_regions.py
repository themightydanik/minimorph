"""Measure exact worst indexed edges in all six existing manual regions at 60 Hz."""

import argparse, json
from pathlib import Path
import numpy as np
from evaluate_skin import Skin

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--input", type=Path, required=True)
p.add_argument("--full-frame", type=Path, required=True)
p.add_argument("--output", type=Path, required=True)
a = p.parse_args()
skin = Skin(a.input)
full = json.loads(a.full_frame.read_text())
import hashlib

assert full["asset_sha256"] == hashlib.sha256(a.input.read_bytes()).hexdigest()
v = skin.pos[:, [0, 2, 1]].copy()
v[:, 1] *= -1
regions = {}
for side, sign in [("L", 1), ("R", -1)]:
    for name, xlo, xhi, zlo, zhi in [
        ("CuffContact", 0.29, 0.36, 0.57, 0.67),
        ("Knee", 0.08, 0.34, 0.18, 0.34),
        ("Hip", 0.08, 0.34, 0.44, 0.56),
    ]:
        mask = (
            (v[:, 0] * sign > xlo)
            & (v[:, 0] * sign < xhi)
            & (v[:, 2] > zlo)
            & (v[:, 2] < zhi)
        )
        use = skin.valid & np.any(mask[skin.edges], axis=1)
        regions["Manual_" + name + "_" + side] = np.flatnonzero(use)
rows = {}
for clip, data in full["clips"].items():
    best = {name: {"ratio": 0} for name in regions}
    for frame in data["frames"]:
        world, _ = skin.evaluate(clip, frame["time"])
        for name, ix in regions.items():
            edges = skin.edges[ix]
            ratios = (
                np.linalg.norm(world[edges[:, 0]] - world[edges[:, 1]], axis=1)
                / skin.rest_lengths[ix]
            )
            j = int(np.argmax(ratios))
            if ratios[j] > best[name]["ratio"]:
                edge = edges[j]
                best[name] = {
                    "ratio": float(ratios[j]),
                    "time_seconds": frame["time"],
                    "vertex_ids": edge.tolist(),
                    "rest_positions_blender": v[edge].tolist(),
                    "influences": [
                        {
                            skin.bones[int(j)]: float(w)
                            for j, w in zip(skin.joints[i], skin.weights[i])
                            if w > 1e-8
                        }
                        for i in edge
                    ],
                }
    rows[clip] = best
out = {
    "asset_sha256": full["asset_sha256"],
    "sample_rate_hz": 60,
    "regions": "Original Manual_* coordinate boxes; all actual indexed edges with either endpoint inside. No welding or topology mutation.",
    "clips": rows,
}
a.output.write_text(json.dumps(out, indent=2) + "\n")
