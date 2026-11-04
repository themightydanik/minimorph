/** Offline candidate only. Never reads/writes the production character config. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { MeshoptSimplifier } from "meshoptimizer";
import { readGlb, accessor, accessorBytes, widths, writeGlb } from "./glb.mjs";
const source =
  "assets/characters/minimorph/animation/minimorph_animated_v1.glb";
const out =
  process.argv[2] ??
  "assets/characters/minimorph/optimization/minimorph_candidate_v1.glb";
if (
  !path
    .resolve(out)
    .startsWith(
      path.resolve("assets/characters/minimorph/optimization") + path.sep,
    ) ||
  (fs.existsSync(out) && fs.lstatSync(out).isSymbolicLink())
)
  throw Error(
    "Output must be a regular file in the isolated optimization directory",
  );
if (path.resolve(out) === path.resolve(source))
  throw Error("Cannot overwrite approved asset");
const ratio = Number(process.argv[3] ?? 0.75),
  maxError = Number(process.argv[4] ?? 0.0015);
if (
  !Number.isFinite(ratio) ||
  !Number.isFinite(maxError) ||
  ratio < 0.6 ||
  ratio > 0.95 ||
  maxError <= 0 ||
  maxError > 0.005
)
  throw Error("Study bounds: retain 60–95%, error <=0.5%");
const original = readGlb(source),
  doc = structuredClone(original.doc),
  p = doc.meshes[0].primitives[0];
if (doc.meshes.length !== 1 || doc.meshes[0].primitives.length !== 1)
  throw Error("Expected approved single primitive");
const pos = accessor(original, p.attributes.POSITION),
  normal = accessor(original, p.attributes.NORMAL),
  uv = accessor(original, p.attributes.TEXCOORD_0),
  joints = accessor(original, p.attributes.JOINTS_0),
  weights = accessor(original, p.attributes.WEIGHTS_0),
  indices = accessor(original, p.indices),
  count = pos.length / 3;
const stride = 25,
  attrs = new Float32Array(count * stride),
  locks = new Uint8Array(count);
let locked = 0;
for (let i = 0; i < count; i++) {
  attrs.set(normal.subarray(i * 3, i * 3 + 3), i * stride);
  attrs.set(uv.subarray(i * 2, i * 2 + 2), i * stride + 3);
  let head = 0,
    hands = 0;
  for (let j = 0; j < 4; j++) {
    const bone = joints[i * 4 + j],
      w = weights[i * 4 + j];
    attrs[i * stride + 5 + bone] += w;
    if (bone === 4 || bone === 5) head += w;
    if (bone === 9 || bone === 13) hands += w;
  }
  // Preserve face/helmet/ears and hands. No component pruning, bone or influence reduction.
  if (pos[i * 3 + 1] > 1.25 || head > 0.5 || hands > 0.5) {
    locks[i] = 1;
    locked++;
  }
}
await MeshoptSimplifier.ready;
const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(
  new Uint32Array(indices),
  pos,
  3,
  attrs,
  stride,
  [0.01, 0.01, 0.01, 0.1, 0.1, ...Array(20).fill(0.2)],
  locks,
  Math.floor((indices.length * ratio) / 3) * 3,
  maxError,
  ["LockBorder"],
);
const kept = Uint32Array.from([...new Set(simplified)].sort((a, b) => a - b)),
  remap = new Uint32Array(count);
kept.forEach((old, i) => (remap[old] = i));
for (const index of [...Object.values(p.attributes), p.indices])
  if (
    doc.accessors.filter(
      (a) => a.bufferView === doc.accessors[index].bufferView,
    ).length !== 1
  )
    throw Error("Shared mesh buffer view requires explicit handling");
const views = doc.bufferViews.map((v) =>
  Buffer.from(
    original.binary.subarray(
      v.byteOffset ?? 0,
      (v.byteOffset ?? 0) + v.byteLength,
    ),
  ),
);
for (const index of Object.values(p.attributes)) {
  const a = doc.accessors[index],
    raw = accessorBytes(original, index),
    size = raw.length / a.count,
    b = Buffer.alloc(kept.length * size);
  kept.forEach((old, i) => raw.copy(b, i * size, old * size, (old + 1) * size));
  views[a.bufferView] = b;
  a.count = kept.length;
  delete a.byteOffset;
  if (a.type === "VEC3" && index === p.attributes.POSITION) {
    a.min = [Infinity, Infinity, Infinity];
    a.max = [-Infinity, -Infinity, -Infinity];
    for (const old of kept)
      for (let c = 0; c < 3; c++) {
        a.min[c] = Math.min(a.min[c], pos[old * 3 + c]);
        a.max[c] = Math.max(a.max[c], pos[old * 3 + c]);
      }
  }
}
const newIndices = Uint32Array.from(simplified, (i) => remap[i]),
  ia = doc.accessors[p.indices];
views[ia.bufferView] = Buffer.from(newIndices.buffer);
ia.count = newIndices.length;
ia.componentType = 5125;
delete ia.byteOffset;
doc.asset.extras = {
  ...doc.asset.extras,
  optimizationStudy: {
    approvedForProduction: false,
    sourceSha256: createHash("sha256").update(original.bytes).digest("hex"),
    ratio,
    maxError,
    method:
      "Index-only simplification; retained vertex attributes, skeleton, clips and images unchanged",
  },
};
fs.mkdirSync(path.dirname(out), { recursive: true });
writeGlb(out, doc, views);
fs.writeFileSync(out + ".vertex-map.u32", Buffer.from(kept.buffer));
const result = {
  source,
  out,
  originalVertices: count,
  candidateVertices: kept.length,
  originalTriangles: indices.length / 3,
  candidateTriangles: newIndices.length / 3,
  lockedVertices: locked,
  relativeError: error,
  estimatedObjectErrorMetres: error * MeshoptSimplifier.getScale(pos, 3),
  sourceSha256: createHash("sha256").update(original.bytes).digest("hex"),
  candidateSha256: createHash("sha256").update(fs.readFileSync(out)).digest("hex"),
  originalBytes: original.bytes.length,
  candidateBytes: fs.statSync(out).size,
  materials: doc.materials.length,
  primitives: 1,
  bones: doc.skins[0].joints.length,
  maxInfluences: widths[doc.accessors[p.attributes.WEIGHTS_0].type],
  productionApproved: false,
};
fs.writeFileSync(out + ".json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
