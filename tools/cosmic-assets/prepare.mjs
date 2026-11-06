/** Offline, deterministic owner-asset preparation; original GLBs and embedded images stay intact. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { writeGlb } from "../character-optimization/glb.mjs";
const root = "assets/arenas/cosmic-sprint",
  source = path.join(root, "source"),
  output = path.join(root, "runtime");
fs.mkdirSync(output, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const types = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const reports = [];
for (const name of fs
  .readdirSync(source)
  .filter(
    (n) => n.endsWith(".glb") && (!process.argv[2] || n === process.argv[2]),
  )
  .sort()) {
  const bytes = fs.readFileSync(path.join(source, name));
  if (
    bytes.toString("ascii", 0, 4) !== "glTF" ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw Error(`Invalid GLB: ${name}`);
  const jsonLength = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength)),
    binary = bytes.subarray(28 + jsonLength);
  if (
    doc.meshes.length !== 1 ||
    doc.meshes[0].primitives.length !== 1 ||
    doc.nodes.length !== 1
  )
    throw Error("Unexpected hierarchy; explicit handling required");
  const primitive = doc.meshes[0].primitives[0];
  const views = doc.bufferViews.map((v) => {
    const e = v.extensions?.EXT_meshopt_compression;
    if (e) {
      const out = new Uint8Array(e.count * e.byteStride);
      MeshoptDecoder.decodeGltfBuffer(
        out,
        e.count,
        e.byteStride,
        binary.subarray(e.byteOffset ?? 0, (e.byteOffset ?? 0) + e.byteLength),
        e.mode,
        e.filter,
      );
      return Buffer.from(out);
    }
    if (v.buffer !== 0)
      throw Error("External/fallback view without compressed data");
    if ((v.byteOffset ?? 0) + v.byteLength > binary.length)
      throw Error("View exceeds BIN");
    return Buffer.from(
      binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength),
    );
  });
  function read(index) {
    const a = doc.accessors[index],
      v = doc.bufferViews[a.bufferView],
      T = types[a.componentType],
      w = widths[a.type],
      out = new Float32Array(a.count * w);
    if (!T || !w || a.sparse) throw Error("Unsupported accessor");
    const stride = v.byteStride ?? w * T.BYTES_PER_ELEMENT,
      b = views[a.bufferView];
    for (let i = 0; i < a.count; i++) {
      const part = new T(
        b.buffer,
        b.byteOffset + (a.byteOffset ?? 0) + i * stride,
        w,
      );
      for (let j = 0; j < w; j++)
        out[i * w + j] = a.normalized
          ? a.componentType === 5120
            ? Math.max(-1, part[j] / 127)
            : part[j] / 255
          : part[j];
    }
    return out;
  }
  const pos = read(primitive.attributes.POSITION),
    normal = read(primitive.attributes.NORMAL),
    uv = read(primitive.attributes.TEXCOORD_0),
    indices = Uint32Array.from(read(primitive.indices));
  const vertexCount = pos.length / 3;
  if (indices.some((i) => i >= vertexCount) || ![...pos].every(Number.isFinite))
    throw Error("Invalid vertices/indices");
  const parent = Uint32Array.from({ length: vertexCount }, (_, i) => i),
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
  for (let i = 0; i < vertexCount; i++) {
    const key = `${pos[i * 3]},${pos[i * 3 + 1]},${pos[i * 3 + 2]}`,
      old = weld.get(key);
    if (old !== undefined) join(i, old);
    else weld.set(key, i);
  }
  for (let i = 0; i < indices.length; i += 3) {
    join(indices[i], indices[i + 1]);
    join(indices[i], indices[i + 2]);
  }
  const components = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const id = find(indices[i]);
    components.set(id, (components.get(id) ?? 0) + 1);
  }
  const attrs = new Float32Array(vertexCount * 5);
  for (let i = 0; i < vertexCount; i++) {
    attrs.set(normal.subarray(i * 3, i * 3 + 3), i * 5);
    attrs.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3);
  }
  const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    pos,
    3,
    attrs,
    5,
    [0.01, 0.01, 0.01, 0.1, 0.1],
    null,
    60000,
    0.0025,
    [],
  );
  const kept = Uint32Array.from([...new Set(simplified)].sort((a, b) => a - b)),
    remap = new Uint32Array(vertexCount);
  kept.forEach((v, i) => (remap[v] = i));
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) {
    min[i % 3] = Math.min(min[i % 3], pos[i]);
    max[i % 3] = Math.max(max[i % 3], pos[i]);
  }
  const images = doc.images.map((image) => ({
    name: image.name,
    mimeType: image.mimeType,
    bytes: views[image.bufferView].length,
    sha256: sha(views[image.bufferView]),
  }));
  const outDoc = {
    asset: {
      version: "2.0",
      generator: "Minimorph deterministic cosmic-assets preparation v1",
    },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ name: name.replace(".glb", ""), mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    materials: structuredClone(doc.materials),
    textures: structuredClone(doc.textures),
    images: structuredClone(doc.images),
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: [],
  };
  const outViews = [];
  function add(values, type, componentType, target) {
    const index = outViews.length;
    outViews.push(
      Buffer.from(values.buffer, values.byteOffset, values.byteLength),
    );
    outDoc.bufferViews.push({
      buffer: 0,
      byteLength: values.byteLength,
      target,
    });
    outDoc.accessors.push({
      bufferView: index,
      componentType,
      count: values.length / widths[type],
      type,
    });
  }
  for (const [arr, w, type] of [
    [pos, 3, "VEC3"],
    [normal, 3, "VEC3"],
    [uv, 2, "VEC2"],
  ]) {
    const values = new Float32Array(kept.length * w);
    kept.forEach((old, i) =>
      values.set(arr.subarray(old * w, old * w + w), i * w),
    );
    add(values, type, 5126, 34962);
  }
  outDoc.accessors[0].min = [Infinity, Infinity, Infinity];
  outDoc.accessors[0].max = [-Infinity, -Infinity, -Infinity];
  for (const i of kept)
    for (let c = 0; c < 3; c++) {
      outDoc.accessors[0].min[c] = Math.min(
        outDoc.accessors[0].min[c],
        pos[i * 3 + c],
      );
      outDoc.accessors[0].max[c] = Math.max(
        outDoc.accessors[0].max[c],
        pos[i * 3 + c],
      );
    }
  add(
    Uint32Array.from(simplified, (i) => remap[i]),
    "SCALAR",
    5125,
    34963,
  );
  for (const image of outDoc.images) {
    const original = image.bufferView;
    image.bufferView = outViews.length;
    outViews.push(views[original]);
    outDoc.bufferViews.push({ buffer: 0, byteLength: views[original].length });
  }
  const filename = name
    .toLowerCase()
    .replaceAll(".", "-")
    .replace(/-glb$/, ".glb");
  writeGlb(path.join(output, filename), outDoc, outViews);
  const report = {
    name,
    runtime: filename,
    sourceSha256: sha(bytes),
    runtimeSha256: sha(fs.readFileSync(path.join(output, filename))),
    sourceBytes: bytes.length,
    runtimeBytes: fs.statSync(path.join(output, filename)).size,
    sourceVertices: vertexCount,
    sourceTriangles: indices.length / 3,
    runtimeVertices: kept.length,
    runtimeTriangles: simplified.length / 3,
    relativeError: error,
    objectError: error * MeshoptSimplifier.getScale(pos, 3),
    bounds: { min, max },
    dimensions: max.map((v, i) => v - min[i]),
    pivot: [0, 0, 0],
    nodes: doc.nodes,
    meshes: 1,
    primitives: 1,
    materials: doc.materials.length,
    images,
    components: components.size,
    largestComponents: [...components.values()]
      .sort((a, b) => b - a)
      .slice(0, 12),
    sourceExtensions: doc.extensionsRequired,
  };
  reports.push(report);
  console.log(
    name,
    report.sourceTriangles,
    "→",
    report.runtimeTriangles,
    "error",
    error,
    "components",
    report.components,
  );
}
if (!process.argv[2])
  fs.writeFileSync(
    path.join(root, "inventory.json"),
    JSON.stringify(
      {
        release: "cosmic-assets-v1",
        method:
          "meshoptimizer 0.25 attribute-aware simplification, error <=0.25%, original embedded image bytes/materials retained; no recolor or texture resizing",
        assets: reports,
      },
      null,
      2,
    ) + "\n",
  );
