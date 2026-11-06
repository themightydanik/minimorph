/** Generate the owner-facing inventory from actual source bytes, decoded geometry and encoder logs. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readGlb } from "../character-optimization/glb.mjs";
const root = "assets/arenas/cosmic-sprint",
  report = JSON.parse(fs.readFileSync(`${root}/inventory.json`, "utf8"));
function dimensions(b) {
  if (b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a")
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let at = 2; at < b.length; ) {
    if (b[at] !== 255) throw Error("JPEG marker");
    const marker = b[at + 1],
      length = b.readUInt16BE(at + 2);
    if ([192, 193, 194].includes(marker))
      return [b.readUInt16BE(at + 7), b.readUInt16BE(at + 5)];
    at += 2 + length;
  }
  throw Error("No source image dimensions");
}
for (const asset of report.assets) {
  const g = readGlb(`${root}/source/${asset.name}`);
  assert.equal(
    createHash("sha256").update(g.bytes).digest("hex"),
    asset.sourceSha256,
  );
  for (const node of g.doc.nodes)
    assert.ok(
      !node.translation && !node.rotation && !node.scale && !node.matrix,
      "Source has identity transforms",
    );
  for (const [i, image] of g.doc.images.entries()) {
    const view = g.doc.bufferViews[image.bufferView],
      b = g.binary.subarray(
        view.byteOffset ?? 0,
        (view.byteOffset ?? 0) + view.byteLength,
      );
    [asset.images[i].width, asset.images[i].height] = dimensions(b);
    const log = fs.readFileSync(
      `work/pr13/textures/${asset.runtime}-${i}.log`,
      "utf8",
    );
    asset.runtimeImages[i].qualityMetrics = log
      .split("\n")
      .filter((s) => /^RGB Avg:/.test(s))
      .slice(0, 1);
    asset.runtimeImages[i].encoderRgbPsnr = Number(
      asset.runtimeImages[i].qualityMetrics[0].match(/PSNR:\s*([\d.]+)/)[1],
    );
  }
}
fs.writeFileSync(
  `${root}/inventory.json`,
  JSON.stringify(report, null, 2) + "\n",
);
const total = (key) => report.assets.reduce((n, a) => n + a[key], 0),
  fmt = (n) => n.toLocaleString("en-US"),
  size = (n) => (n / 1048576).toFixed(2),
  dim = (a) => a.dimensions.map((v) => v.toFixed(4)).join(" × ");
const psnr = report.assets.flatMap((a) =>
  a.runtimeImages.map((i) => i.encoderRgbPsnr),
);
const lines = [
  "# Cosmic Sprint — owner asset audit",
  "",
  "Source: [cosmic-assets-v1](https://github.com/themightydanik/minimorph/releases/tag/cosmic-assets-v1), all 23 GLB files. Actual source/runtime hashes, vertex/triangle counts, image hashes and sizes, pivots, original nodes, components, prepared parts and measured bounds are versioned in [inventory.json](../assets/arenas/cosmic-sprint/inventory.json). No live release downloads occur in gameplay.",
  "",
  `Source total: **${fmt(total("sourceTriangles"))} triangles**, ${fmt(total("sourceVertices"))} vertices, ${size(total("sourceBytes"))} MiB. Prepared total: **${fmt(total("runtimeTriangles"))} triangles**, ${size(total("runtimeBytes"))} MiB across all 23 versioned GLBs (the game packages only referenced models).`,
  "",
  "## Complete measured inventory",
  "",
  "Each original has one node, one mesh, one primitive, one material, identity transforms and a centered (0,0,0) pivot. “Components” counts welded connected triangle islands, not independently addressable glTF nodes. “Parts” is the independently addressable prepared hierarchy.",
  "",
  "| Original GLB | Vertices | Source → runtime triangles | Dimensions X × Y × Z (source units) | Components → parts | Runtime MiB |",
  "| --- | ---: | ---: | --- | ---: | ---: |",
  ...report.assets.map(
    (a) =>
      `| ${a.name} | ${fmt(a.sourceVertices)} | ${fmt(a.sourceTriangles)} → ${fmt(a.runtimeTriangles)} | ${dim(a)} | ${a.components} → ${a.parts.length} | ${size(a.runtimeBytes)} |`,
  ),
  "",
  "## Format, textures and mobile preparation",
  "",
  "- All 23 original GLBs are valid glTF 2.0 with embedded images and required `EXT_meshopt_compression` / `KHR_mesh_quantization`. The pipeline decodes every accessor and validates finite positions, index ranges and buffer bounds; runtime geometry uses ordinary float attributes and local embedded KTX2 images.",
  "- Every original has three **2048 × 2048** maps: base color, ORM and OpenGL normal. Materials, UVs and decoded normals are preserved. No recoloring, image resizing, material substitution or device-dependent quality tier is applied.",
  `- UASTC LDR 4×4, level 2, **no RDO**, full 12-level mip chains; base color is sRGB and data maps linear. Full-resolution encoder RGB PSNR ranges **${Math.min(...psnr).toFixed(2)}–${Math.max(...psnr).toFixed(2)} dB**. These are encoder comparisons with source pixels, not a claim about every hardware transcode target. BasisU v2_50 and the matching vendored transcoder are pinned; Apache-2.0 and Zstandard notices ship in both app packages.`,
  "- Meshoptimizer 0.25 uses attribute-aware, bounded-error simplification. Positions/UVs/normals of retained vertices are kept; normal-map detail stays intact. The configured relative error limit is 0.25%; actual per-model error is stored in the inventory. This is the simplifier’s error estimate, not a claim of exact surface identity.",
  "- Source exports are centered, right-handed, Y-up and roughly one source unit across their longest horizontal axis; they are not metre-sized level modules. Floors fit their authored gameplay footprints, with a fixed vertical scale cap of 8 (2 for carousel relief) to keep padded surface relief and collision-plane differences small. Gates and prominent props retain uniform scale; gates span local Z and turn 90° for the start/finish approach. Rendering and simple invisible colliders share the authored placement/rotation.",
  "- One asset container, material and map set serves all instances of that model. Hardware instancing batches repeated floors, gates and hammer parts. Visibility-aware resource streaming with distance hysteresis and ordinary frustum culling bounds the working set; it changes resource lifetime, not model fidelity, DPR or lighting quality.",
  "",
  "## Kits, moving parts and limitations",
  "",
  "The eight multi-object kits are initially packed into a single primitive. They contain 3–7 disconnected objects; the preparation tool partitions those components without removing triangles or rebaking UVs. All prepared parts share the original material/maps. Their actual part names, bounds and floor ray-sampled walk heights are recorded. They remain available even when a particular shape is not placed in this course; no owner model is silently discarded.",
  "",
  "Hammer and Carousel are single connected assemblies, not ready-made animation rigs. The tool partitions existing faces at the concealed shaft/hub seams (hammer Y=-0.095, carousel Y=0.045), preserving every prepared triangle. The pedestal stays fixed while the upper geometry rotates around the authored central axis. At the rest transform the combined geometry is unchanged. Small seam behavior is reviewable in the actual game.",
  "",
  "Sliding Bumper is also fused. The conservative workaround translates the complete authored padded assembly along the authoritative piston stroke; it does not pretend the housing/head are independently modeled. A future artist-authored separated housing/head could improve this presentation. Conveyor tread art remains intact rather than scrolling its whole baked atlas; the authored belt direction and real surface velocity provide the mechanic. Raised Star Finish uses broad landing decks and a real jump/drop instead of presenting an unimplemented walkable ramp.",
  "",
  "## Reproduction and runtime budgets",
  "",
  "Run `npm run download:cosmic-assets` (GitHub CLI), then `COSMIC_BASISU=/path/to/pinned/basisu npm run prepare:cosmic-assets`. The encoder source is BinomialLLC/basis_universal v2_50 at 9bebe16726b3a61c8c213eeee3b7cffb462ef34e; build Release with SSE enabled. Source GLBs remain unmodified in the ignored source directory, and their release hashes are checked. Runtime GLBs and both manifests are committed.",
  "",
  "`npm run check:cosmic-assets` verifies all 23 runtime hashes, GLB buffers/indices, part hierarchy/triangle conservation, local embedded textures, unchanged 2048px dimensions, full mips and color-space flags. Actual browser resource/frame measurements and the course comparison are recorded with the [in-engine evidence](evidence/cosmic-sprint/README.md). Physical Xiaomi Redmi Note 8 testing is unavailable in this environment; no device FPS claim is made.",
  "",
];
fs.writeFileSync("docs/cosmic-sprint-assets.md", lines.join("\n"));
