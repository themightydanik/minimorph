import { readFileSync } from "node:fs";
import { runLevelValidationCli } from "./report-cli";
process.exitCode = runLevelValidationCli(process.argv.slice(2), {
  read: (path) => readFileSync(path, "utf8"),
  write: (message) => console.log(message),
});
