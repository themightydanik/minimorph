import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = "assets/arenas/cosmic-sprint",
  inventory = JSON.parse(fs.readFileSync(`${root}/inventory.json`, "utf8"));
fs.mkdirSync(`${root}/source`, { recursive: true });
if (inventory.assets.some((a) => !fs.existsSync(`${root}/source/${a.name}`)))
  execFileSync(
    "gh",
    [
      "release",
      "download",
      "cosmic-assets-v1",
      "--repo",
      "themightydanik/minimorph",
      "--pattern",
      "*.glb",
      "--skip-existing",
      "--dir",
      `${root}/source`,
    ],
    { stdio: "inherit" },
  );
for (const a of inventory.assets)
  if (
    createHash("sha256")
      .update(fs.readFileSync(`${root}/source/${a.name}`))
      .digest("hex") !== a.sourceSha256
  )
    throw Error(`Release source changed: ${a.name}`);
console.log("All 23 source GLBs match the pinned owner-release hashes.");
