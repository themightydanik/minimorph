"""Apply a bounded weight candidate to the existing workbench; preserve actions/mesh."""

import argparse
import sys
from pathlib import Path
import bpy
import numpy as np

p = argparse.ArgumentParser(description=__doc__)
for name in ("project", "weights", "baseline", "output"):
    p.add_argument("--" + name, type=Path, required=True)
a = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
bpy.ops.wm.open_mainfile(filepath=str(a.project.resolve()))
s = dict(np.load(a.weights))
old = dict(np.load(a.baseline))
o = next(
    o
    for o in bpy.context.scene.objects
    if o.type == "MESH" and len(o.data.vertices) == len(s["positions"])
)
positions = np.array([v.co[:] for v in o.data.vertices])
assert np.max(np.abs(positions - s["positions"])) < 1e-6
ids = np.flatnonzero(np.max(np.abs(s["weights"] - old["weights"]), axis=1) > 1e-10)
# Cache NPZ arrays above: repeated lazy NPZ reads would decompress the whole mesh.
for name in s["names"]:
    o.vertex_groups[str(name)].remove(ids.tolist())
for i in ids:
    for j in np.flatnonzero(s["weights"][i] > 1e-8):
        o.vertex_groups[str(s["names"][j])].add(
            [int(i)], float(s["weights"][i, j]), "REPLACE"
        )
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.resolve()))
print("Updated GPU vertices:", len(ids))
