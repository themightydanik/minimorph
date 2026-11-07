import { readFileSync } from "node:fs";
import { validatePublication } from "../../packages/game-content/src/published-cosmic";
const file =
  process.argv[2] ?? "packages/game-content/src/published/cosmic-sprint.json";
const publication = validatePublication(JSON.parse(readFileSync(file, "utf8")));
console.log(`Validated published Cosmic Sprint: ${publication.revision}`);
