/** Full-resolution UASTC: no image resize, recolor or artistic substitution. Requires pinned BasisU v2_50. */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readGlb, writeGlb } from "../character-optimization/glb.mjs";
const root = "assets/arenas/cosmic-sprint",
  inventory = JSON.parse(fs.readFileSync(`${root}/inventory.json`, "utf8"));
const encoder = process.env.COSMIC_BASISU;
if (!encoder)
  throw Error("Set COSMIC_BASISU to the pinned v2_50 Basis Universal encoder");
fs.mkdirSync("work/pr13/textures", { recursive: true });
for (const asset of inventory.assets) {
  const file = `${root}/runtime/${asset.runtime}`,
    glb = readGlb(file),
    doc = glb.doc;
  if (doc.extensionsRequired?.includes("KHR_texture_basisu"))
    throw Error(
      "Run geometry preparation first, never recompress existing UASTC",
    );
  const views = doc.bufferViews.map((v) =>
    Buffer.from(
      glb.binary.subarray(
        v.byteOffset ?? 0,
        (v.byteOffset ?? 0) + v.byteLength,
      ),
    ),
  );
  asset.runtimeImages = [];
  for (const [i, image] of doc.images.entries()) {
    const stem = `work/pr13/textures/${asset.runtime}-${i}`,
      input = stem + (image.mimeType === "image/png" ? ".png" : ".jpg"),
      output = stem + ".ktx2";
    fs.writeFileSync(input, views[image.bufferView]);
    const args = [
      "-file",
      input,
      "-output_file",
      output,
      "-uastc",
      "-uastc_level",
      "2",
      "-mipmap",
      "-ktx2",
      "-max_threads",
      "4",
      "-stats",
      ...(i === 0 ? ["-srgb"] : ["-linear"]),
    ];
    const log = execFileSync(encoder, args, {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    fs.writeFileSync(stem + ".log", log);
    const bytes = fs.readFileSync(output);
    views[image.bufferView] = bytes;
    image.mimeType = "image/ktx2";
    asset.runtimeImages.push({
      sourceImageSha256: asset.images[i].sha256,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      width: bytes.readUInt32LE(20),
      height: bytes.readUInt32LE(24),
      levels: bytes.readUInt32LE(40),
      transfer: i === 0 ? "sRGB" : "linear",
      qualityMetrics: log
        .split("\n")
        .filter((s) => /^RGB Avg:/.test(s))
        .slice(0, 1),
    });
  }
  doc.extensionsUsed = ["KHR_texture_basisu"];
  doc.extensionsRequired = ["KHR_texture_basisu"];
  for (const texture of doc.textures) {
    texture.extensions = { KHR_texture_basisu: { source: texture.source } };
    delete texture.source;
  }
  writeGlb(file, doc, views);
  asset.runtimeBytes = fs.statSync(file).size;
  asset.runtimeSha256 = createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
  console.log(
    asset.runtime,
    asset.runtimeBytes,
    asset.runtimeImages.map((i) => i.qualityMetrics.at(-1)),
  );
}
inventory.texturePreparation = {
  encoder:
    "BinomialLLC/basis_universal v2_50 @ 9bebe16726b3a61c8c213eeee3b7cffb462ef34e",
  mode: "UASTC LDR 4x4, effort 2, no RDO, full-resolution mip chains; base sRGB, data maps linear",
  command:
    "COSMIC_BASISU=/path/to/basisu node tools/cosmic-assets/compress.mjs",
  physicalDeviceValidated: false,
};
fs.writeFileSync(
  `${root}/inventory.json`,
  JSON.stringify(inventory, null, 2) + "\n",
);
