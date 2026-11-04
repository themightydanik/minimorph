"""Validate the isolated candidate without relaxing the approved-asset checks."""

import argparse, hashlib, json, struct, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "blender"))
from evaluate_skin import Skin, load

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/characters/minimorph/animation/minimorph_animated_v1.glb"
CANDIDATE = ROOT / "assets/characters/minimorph/optimization/minimorph_candidate_v1.glb"


def view_bytes(path, doc, i):
    b = path.read_bytes()
    n = struct.unpack_from("<I", b, 12)[0]
    v = doc["bufferViews"][i]
    start = 28 + n + v.get("byteOffset", 0)
    return b[start : start + v["byteLength"]]


def surface_distances(points, vertices, triangles):
    from scipy.spatial import cKDTree

    tri = vertices[triangles]
    centres = tri.mean(1)
    _, nearest = cKDTree(centres).query(points, k=24)
    result = []
    for start in range(0, len(points), 1024):
        p = points[start : start + 1024, None, :]
        t = tri[nearest[start : start + 1024]]
        a, b, c = t[:, :, 0], t[:, :, 1], t[:, :, 2]
        ab = b - a
        ac = c - a
        ap = p - a
        n = np.cross(ab, ac)
        nn = np.maximum((n * n).sum(2), 1e-30)
        proj = p - n * (((ap * n).sum(2) / nn)[:, :, None])
        v = proj - a
        d00 = (ab * ab).sum(2)
        d01 = (ab * ac).sum(2)
        d11 = (ac * ac).sum(2)
        d20 = (v * ab).sum(2)
        d21 = (v * ac).sum(2)
        den = np.maximum(d00 * d11 - d01 * d01, 1e-30)
        u = (d11 * d20 - d01 * d21) / den
        w = (d00 * d21 - d01 * d20) / den
        inside = (u >= 0) & (w >= 0) & (u + w <= 1)
        dist = np.where(inside, ((p - proj) ** 2).sum(2), np.inf)
        for x, y in [(a, b), (b, c), (c, a)]:
            edge = y - x
            alpha = np.clip(
                ((p - x) * edge).sum(2) / np.maximum((edge * edge).sum(2), 1e-30), 0, 1
            )
            dist = np.minimum(dist, ((p - (x + alpha[:, :, None] * edge)) ** 2).sum(2))
        result.extend(np.sqrt(dist.min(1)).tolist())
    return np.array(result)


def validate(structure_only=False, report_path=None):
    source = Skin(SOURCE)
    candidate = Skin(CANDIDATE)
    kept = np.fromfile(str(CANDIDATE) + ".vertex-map.u32", dtype="<u4")
    config = (ROOT / "packages/game-ui/src/character-config.ts").read_text()
    assert (
        "animation/minimorph_animated_v1.glb" in config
        and "optimization/" not in config
    ), "Candidate is not approved for production"
    assert (
        hashlib.sha256(SOURCE.read_bytes()).hexdigest()
        == "1bcecf7f25e35f1cfb7e4afce6542098a29c44bd9e86cd4ac281da3c3a818f76"
    )
    for key in [
        "nodes",
        "skins",
        "animations",
        "materials",
        "textures",
        "images",
        "samplers",
        "scenes",
    ]:
        assert source.doc.get(key) == candidate.doc.get(key), key + " changed"
    assert (
        len(candidate.doc["meshes"]) == 1
        and len(candidate.doc["meshes"][0]["primitives"]) == 1
    )
    assert len(source.tri) * 0.6 <= len(candidate.tri) < len(source.tri)
    assert (
        candidate.doc["asset"]["extras"]["optimizationStudy"]["approvedForProduction"]
        is False
    )
    assert len(kept) == len(candidate.pos) and len(set(kept.tolist())) == len(kept)
    p = source.doc["meshes"][0]["primitives"][0]
    q = candidate.doc["meshes"][0]["primitives"][0]
    for name, index in p["attributes"].items():
        np.testing.assert_array_equal(
            source.acc(index)[kept], candidate.acc(q["attributes"][name]), err_msg=name
        )
    mesh_accessors = set(p["attributes"].values()) | {p["indices"]}
    for i in range(len(source.doc["accessors"])):
        if i not in mesh_accessors:
            np.testing.assert_array_equal(
                source.acc(i), candidate.acc(i), err_msg=f"Animation/skin accessor {i}"
            )
    image_hashes = []
    for im in source.doc["images"]:
        a = view_bytes(SOURCE, source.doc, im["bufferView"])
        b = view_bytes(CANDIDATE, candidate.doc, im["bufferView"])
        assert a == b
        image_hashes.append(hashlib.sha256(a).hexdigest())
    locked = source.pos[:, 1] > 1.25
    head = ((source.joints == 4) | (source.joints == 5)) * source.weights
    hands = ((source.joints == 9) | (source.joints == 13)) * source.weights
    locked |= (head.sum(1) > 0.5) | (hands.sum(1) > 0.5)
    assert np.all(
        np.isin(np.flatnonzero(locked), kept)
    ), "Protected face/head/hand vertices removed"
    removed = np.setdiff1d(np.arange(len(source.pos)), kept)
    samples = []
    max_retained = 0
    for clip in source.clips:
        for fraction in [0, 0.25, 0.5, 0.75, 1]:
            time = source.duration(clip) * fraction
            a, _ = source.evaluate(clip, time)
            b, _ = candidate.evaluate(clip, time)
            delta = float(np.abs(a[kept] - b).max())
            max_retained = max(max_retained, delta)
            assert delta < 1e-8
            # Every removed original vertex, distance to an actual candidate triangle (24-centroid shortlist).
            # Upper bound at these sample points, not a continuous surface/Hausdorff or full-animation proof.
            if structure_only:
                continue
            distances = surface_distances(a[removed], b, candidate.tri)
            samples.append(
                {
                    "clip": clip,
                    "fraction": fraction,
                    "removedVertexP99Metres": float(np.quantile(distances, 0.99)),
                    "removedVertexMaxMetres": float(distances.max()),
                }
            )
    report = {
        "productionApproved": False,
        "originalTriangles": len(source.tri),
        "candidateTriangles": len(candidate.tri),
        "originalVertices": len(source.pos),
        "candidateVertices": len(candidate.pos),
        "protectedVerticesRetained": int(locked.sum()),
        "retainedAttributeRowsExact": True,
        "originalAnimationAndSkinAccessorsExact": True,
        "originalTextureBytesExact": True,
        "imageSha256": image_hashes,
        "bones": len(candidate.bones),
        "clips": list(candidate.clips),
        "maxRetainedVertexPoseDifferenceMetres": max_retained,
        "retainedPoseSampleCount": len(source.clips) * 5,
        "poseSamples": samples,
        "limitations": "Removed-vertex distances use a centroid shortlist and 30 sampled poses, not continuous surface equivalence. Existing original rig defects remain; triangle interpolation and sleeve/body shading can differ. Owner visual approval required.",
    }
    out = (
        Path(report_path)
        if report_path
        else ROOT / "artifacts/character-optimization-validation.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "poseSamples"}, indent=2))
    print(
        "Worst sampled removed vertex distance:",
        max((s["removedVertexMaxMetres"] for s in samples), default=None),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--structure-only", action="store_true")
    parser.add_argument("--report")
    args = parser.parse_args()
    validate(args.structure_only, args.report)
