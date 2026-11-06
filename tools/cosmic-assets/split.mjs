/** Partition disconnected kits and rigid mechanism pieces; retains every prepared triangle and texture. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { readGlb, accessor, writeGlb } from "../character-optimization/glb.mjs";
const root = "assets/arenas/cosmic-sprint",
  inventory = JSON.parse(fs.readFileSync(`${root}/inventory.json`, "utf8"));
for (const asset of inventory.assets) {
  const file = `${root}/runtime/${asset.runtime}`,
    g = readGlb(file),
    doc = g.doc;
  if (doc.meshes.length !== 1)
    throw Error("Already split; prepare from source first");
  const primitive = doc.meshes[0].primitives[0],
    pos = accessor(g, primitive.attributes.POSITION),
    normal = accessor(g, primitive.attributes.NORMAL),
    uv = accessor(g, primitive.attributes.TEXCOORD_0),
    indices = accessor(g, primitive.indices);
  const parent = Uint32Array.from({ length: pos.length / 3 }, (_, i) => i),
    weld = new Map();
  function find(a) {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  }
  function join(a, b) {
    a = find(a);
    b = find(b);
    if (a !== b) parent[b] = a;
  }
  for (let i = 0; i < parent.length; i++) {
    const key = `${pos[i * 3]},${pos[i * 3 + 1]},${pos[i * 3 + 2]}`;
    if (weld.has(key)) join(i, weld.get(key));
    else weld.set(key, i);
  }
  for (let i = 0; i < indices.length; i += 3) {
    join(indices[i], indices[i + 1]);
    join(indices[i], indices[i + 2]);
  }
  const groups = new Map(),
    mechanism =
      asset.name === "Giant.Padded.Hammer.glb" ||
      asset.name === "Rotating.Carousel.glb";
  for (let i = 0; i < indices.length; i += 3) {
    const y =
      (pos[indices[i] * 3 + 1] +
        pos[indices[i + 1] * 3 + 1] +
        pos[indices[i + 2] * 3 + 1]) /
      3;
    const key = mechanism
      ? y > (asset.name === "Giant.Padded.Hammer.glb" ? -0.095 : 0.045)
        ? "Moving"
        : "Stationary"
      : find(indices[i]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(indices[i], indices[i + 1], indices[i + 2]);
  }
  const parts = [...groups].sort(([a], [b]) =>
      String(a).localeCompare(String(b)),
    ),
    views = [],
    next = structuredClone(doc);
  next.bufferViews = [];
  next.accessors = [];
  next.meshes = [];
  next.nodes = [];
  next.scenes = [{ nodes: [] }];
  next.scene = 0;
  asset.parts = [];
  function append(data, type, componentType, width, min, max) {
    const view = views.length,
      a = next.accessors.length;
    views.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    next.bufferViews.push({ buffer: 0, byteLength: data.byteLength });
    next.accessors.push({
      bufferView: view,
      componentType,
      count: data.length / width,
      type,
      ...(min ? { min, max } : {}),
    });
    return a;
  }
  function topAt(ids, x, z) {
    let top = -Infinity;
    for (let i = 0; i < ids.length; i += 3) {
      const a = ids[i] * 3,
        b = ids[i + 1] * 3,
        c = ids[i + 2] * 3,
        ax = pos[a],
        az = pos[a + 2],
        bx = pos[b],
        bz = pos[b + 2],
        cx = pos[c],
        cz = pos[c + 2],
        den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-12) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den,
        v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001)
        top = Math.max(
          top,
          u * pos[a + 1] + v * pos[b + 1] + (1 - u - v) * pos[c + 1],
        );
    }
    return top;
  }
  for (const [key, ids] of parts) {
    const kept = [...new Set(ids)],
      map = new Map(kept.map((old, i) => [old, i])),
      min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    const attributes = {};
    for (const [name, array, width] of [
      ["POSITION", pos, 3],
      ["NORMAL", normal, 3],
      ["TEXCOORD_0", uv, 2],
    ]) {
      const values = new Float32Array(kept.length * width);
      kept.forEach((old, i) =>
        values.set(array.subarray(old * width, old * width + width), i * width),
      );
      if (name === "POSITION")
        for (let i = 0; i < values.length; i++) {
          min[i % 3] = Math.min(min[i % 3], values[i]);
          max[i % 3] = Math.max(max[i % 3], values[i]);
        }
      attributes[name] = append(
        values,
        width === 3 ? "VEC3" : "VEC2",
        5126,
        width,
        name === "POSITION" ? min : undefined,
        max,
      );
    }
    const index = append(
        Uint32Array.from(ids, (i) => map.get(i)),
        "SCALAR",
        5125,
        1,
      ),
      part = next.meshes.length;
    next.meshes.push({
      primitives: [
        { attributes, indices: index, material: primitive.material },
      ],
    });
    next.nodes.push({
      name: mechanism ? String(key) : `Part${part}`,
      mesh: part,
    });
    next.scenes[0].nodes.push(part);
    const heights = [];
    for (const fx of [-0.22, 0, 0.22])
      for (const fz of [-0.22, 0, 0.22]) {
        if (fx === 0 && fz === 0) continue;
        const y = topAt(
          ids,
          (min[0] + max[0]) / 2 + fx * (max[0] - min[0]),
          (min[2] + max[2]) / 2 + fz * (max[2] - min[2]),
        );
        if (Number.isFinite(y)) heights.push(y);
      }
    heights.sort((a, b) => a - b);
    asset.parts.push({
      name: next.nodes[part].name,
      min,
      max,
      walkY: heights[Math.floor(heights.length / 2)] ?? max[1],
      triangles: ids.length / 3,
    });
  }
  for (const image of next.images) {
    const old = doc.bufferViews[image.bufferView],
      bytes = g.binary.subarray(
        old.byteOffset ?? 0,
        (old.byteOffset ?? 0) + old.byteLength,
      );
    image.bufferView = views.length;
    views.push(Buffer.from(bytes));
    next.bufferViews.push({ buffer: 0, byteLength: bytes.length });
  }
  writeGlb(file, next, views);
  asset.runtimeSha256 = createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
  asset.runtimeBytes = fs.statSync(file).size;
  console.log(
    asset.runtime,
    asset.parts.map((p) => `${p.name}:${p.triangles}`).join(", "),
  );
}
inventory.splitting =
  "Disconnected surface components split without triangle deletion. Hammer seam y=-0.095 and carousel seam y=0.045 partition existing faces at the hidden hub/shaft junction; base stays fixed, upper piece rotates. UVs/materials/textures retained. Sliding Bumper is a fused assembly and translates as a whole; no destructive head/housing cut.";
fs.writeFileSync(
  `${root}/inventory.json`,
  JSON.stringify(inventory, null, 2) + "\n",
);

fs.writeFileSync(
  `${root}/runtime-manifest.json`,
  JSON.stringify(
    {
      assets: inventory.assets.map(({ runtime, parts, bounds }) => ({
        runtime,
        parts,
        bounds,
      })),
    },
    null,
    2,
  ) + "\n",
);
