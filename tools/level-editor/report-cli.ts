import {
  validateLevelLayout,
  validateLevelPublication,
  levelValidationReport,
  formatLevelValidationReport,
} from "../../packages/game-content/src/level-validation";
/** Injectable I/O keeps JSON/errors/exit semantics testable without a child process or browser. */
export function runLevelValidationCli(
  args: string[],
  io: { read: (path: string) => string; write: (text: string) => void },
): number {
  const json = args.includes("--json"),
    layout = args.includes("--layout");
  const paths = args.filter((a) => !a.startsWith("--"));
  let report;
  try {
    if (
      args.some(
        (a) => a.startsWith("--") && !["--json", "--layout"].includes(a),
      ) ||
      paths.length > 1
    )
      throw Error("Usage: validate-published [file.json] [--json] [--layout]");
    const value = JSON.parse(
      io.read(
        paths[0] ?? "packages/game-content/src/published/cosmic-sprint.json",
      ),
    );
    report = layout
      ? validateLevelLayout(value)
      : validateLevelPublication(value);
  } catch (e) {
    report = levelValidationReport(null, [
      {
        code: "INPUT_INVALID",
        severity: "error",
        message: e instanceof Error ? e.message : String(e),
        suggestion:
          "Supply a readable JSON publication, or use --layout for a bare existing layout.",
      },
    ]);
  }
  io.write(
    json
      ? JSON.stringify(report, null, 2)
      : formatLevelValidationReport(report),
  );
  return report.valid ? 0 : 1;
}
