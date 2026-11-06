import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readGlb, accessor } from "../character-optimization/glb.mjs";
const root = "assets/arenas/cosmic-sprint",
  inventory = JSON.parse(fs.readFileSync(`${root}/inventory.json`, "utf8"));
assert.equal(inventory.assets.length, 23);
let triangles = 0,
  bytes = 0;
for (const asset of inventory.assets) {
  const file = `${root}/runtime/${asset.runtime}`,
    glb = readGlb(file),
    doc = glb.doc;
  assert.equal(glb.bytes.readUInt32LE(8), glb.bytes.length);
  assert.equal(
    createHash("sha256").update(glb.bytes).digest("hex"),
    asset.runtimeSha256,
  );
  assert.deepEqual(doc.extensionsRequired, ["KHR_texture_basisu"]);
  assert.equal(doc.buffers.length, 1);
  assert.ok(!doc.buffers[0].uri);
  for (const v of doc.bufferViews) {
    assert.equal(v.buffer, 0);
    assert.ok((v.byteOffset ?? 0) + v.byteLength <= glb.binary.length);
  }
  assert.equal(doc.nodes.length, asset.parts.length);
  assert.equal(doc.meshes.length, asset.parts.length);
  let count = 0;
  for (const [i, mesh] of doc.meshes.entries()) {
    assert.equal(mesh.primitives.length, 1);
    const p = mesh.primitives[0],
      pos = accessor(glb, p.attributes.POSITION),
      normal = accessor(glb, p.attributes.NORMAL),
      uv = accessor(glb, p.attributes.TEXCOORD_0),
      indices = accessor(glb, p.indices);
    assert.equal(indices.length % 3, 0);
    assert.ok(indices.every((index) => index < pos.length / 3));
    assert.ok(pos.every(Number.isFinite));
    assert.ok(normal.every(Number.isFinite));
    assert.ok(uv.every(Number.isFinite));
    assert.equal(indices.length / 3, asset.parts[i].triangles);
    assert.equal(doc.nodes[i].name, asset.parts[i].name);
    assert.equal(doc.nodes[i].mesh, i);
    count += indices.length / 3;
  }
  assert.equal(count, asset.runtimeTriangles);
  assert.ok(asset.relativeError <= 0.0025);
  assert.equal(doc.images.length, 3);
  assert.equal(doc.materials.length, asset.materials);
  for (const [i, image] of doc.images.entries()) {
    const view = doc.bufferViews[image.bufferView],
      data = glb.binary.subarray(
        view.byteOffset,
        view.byteOffset + view.byteLength,
      ),
      expected = asset.runtimeImages[i];
    assert.equal(image.mimeType, "image/ktx2");
    assert.equal(
      data.subarray(0, 12).toString("hex"),
      "ab4b5458203230bb0d0a1a0a",
    );
    assert.equal(data.readUInt32LE(20), 2048);
    assert.equal(data.readUInt32LE(24), 2048);
    assert.equal(data.readUInt32LE(40), 12);
    const dfd = data.readUInt32LE(48);
    assert.equal(
      data[dfd + 14],
      i === 0 ? 2 : 1,
      "Color uses sRGB; data maps stay linear",
    );
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      expected.sha256,
    );
    assert.equal(doc.textures[i].extensions.KHR_texture_basisu.source, i);
  }
  triangles += count;
  bytes += glb.bytes.length;
}
console.log(
  `Cosmic assets: 23 valid local GLBs, ${triangles} triangles, ${bytes} bytes; unchanged 2048px maps, full mips, pinned hashes and separated parts verified.`,
);
