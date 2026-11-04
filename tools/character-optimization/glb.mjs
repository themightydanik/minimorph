import fs from "node:fs";
export function readGlb(path) {
  const bytes = fs.readFileSync(path);
  if (bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2)
    throw Error("GLB 2 required");
  const length = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.toString("utf8", 20, 20 + length));
  return { doc, binary: bytes.subarray(28 + length), bytes };
}
export const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const types = {
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
export function accessorBytes(glb, index) {
  const a = glb.doc.accessors[index],
    v = glb.doc.bufferViews[a.bufferView],
    T = types[a.componentType];
  if (!T || a.sparse) throw Error("Unsupported accessor");
  const size = T.BYTES_PER_ELEMENT * widths[a.type],
    out = Buffer.alloc(a.count * size),
    offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  for (let i = 0; i < a.count; i++)
    glb.binary.copy(
      out,
      i * size,
      offset + i * (v.byteStride ?? size),
      offset + i * (v.byteStride ?? size) + size,
    );
  return out;
}
export function accessor(glb, index) {
  const a = glb.doc.accessors[index],
    T = types[a.componentType],
    b = accessorBytes(glb, index);
  return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
}
export function writeGlb(path, doc, views) {
  let offset = 0;
  const buffers = [];
  doc.bufferViews.forEach((v, i) => {
    const padding = Buffer.alloc(-offset & 3);
    buffers.push(padding);
    offset += padding.length;
    v.byteOffset = offset;
    v.byteLength = views[i].length;
    buffers.push(views[i]);
    offset += views[i].length;
  });
  doc.buffers[0].byteLength = offset;
  let binary = Buffer.concat(buffers);
  binary = Buffer.concat([binary, Buffer.alloc(-binary.length & 3)]);
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc(-json.length & 3, 32)]);
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(path, Buffer.concat([header, json, binHeader, binary]));
}
