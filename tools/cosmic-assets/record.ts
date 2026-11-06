import fs from "node:fs";
import { getArena } from "@minimorph/game-content";
import { recordPark } from "../../tests/helpers/park-pilot";
const arena = getArena("cosmic-sprint");
for (const choice of ["easy", "hard"] as const) {
  const run = recordPark(arena, choice);
  console.log(
    choice,
    JSON.stringify({ ...run, segments: run.segments.length }),
  );
  if (process.argv.includes("--write") && run.state.won) {
    run.segments.at(-1)!.seconds += 0.8;
    fs.writeFileSync(
      `tests/fixtures/park-${choice}-run.json`,
      JSON.stringify(run, null, 2) + "\n",
    );
    if (choice === "hard") {
      const file = "tests/fixtures/full-round-runs.json",
        all = JSON.parse(fs.readFileSync(file, "utf8"));
      all["cosmic-sprint"] = run;
      fs.writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
    }
  }
}
