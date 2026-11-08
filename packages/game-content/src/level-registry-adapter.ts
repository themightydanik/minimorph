import { levelRegistry } from "./rounds";
import { LevelRegistryError } from "./level-document";
import type { LevelRegistry } from "./level-registry";
import { validateLayout } from "./layout-override";
import { publishedLayoutOverride } from "./published-cosmic";
import {
  levelValidationReport,
  validateCompiledLevel,
} from "./level-validation";
/** Explicit legacy draft adapter. A v4 layout is never silently parsed as a LevelDocument. */
export function adaptLegacyEditorLayout(
  value: unknown,
  registry: LevelRegistry = levelRegistry,
) {
  const resolved = registry.resolve("cosmic-sprint", 1);
  if (resolved.editor !== "legacy-cosmic-v4")
    throw new LevelRegistryError(
      "LEVEL_FEATURE_UNSUPPORTED",
      "This registry has no Cosmic Sprint v4 editor adapter.",
      "cosmic-sprint",
    );
  return {
    kind: "legacy-cosmic-layout" as const,
    state: "draft" as const,
    document: resolved.document,
    layout: validateLayout(structuredClone(value)),
  };
}
/** Safe future editor entry point. No half-working multi-level authoring UI is exposed. */
export function openEditorLevel(
  id: string,
  version?: number,
  registry: LevelRegistry = levelRegistry,
) {
  const resolved = registry.resolve(id, version);
  if (resolved.editor === "legacy-cosmic-v4")
    return {
      mode: "legacy-cosmic-v4" as const,
      ...resolved,
      layout: structuredClone(publishedLayoutOverride),
    };
  return {
    mode: "read-only" as const,
    ...resolved,
    reason:
      "Independent level document authoring is not implemented yet; no legacy Cosmic Sprint overrides may be applied to this level.",
  };
}
/** Extends PR #18 diagnostics without imposing its known route issue on legacy publication. */
export function validateRegisteredLevel(
  value: unknown,
  registry: LevelRegistry = levelRegistry,
) {
  try {
    const resolved =
      typeof value === "string"
        ? registry.resolve(value)
        : registry.resolveDocument(value);
    return {
      ...validateCompiledLevel(resolved.arena),
      level: {
        id: resolved.document.levelId,
        version: resolved.document.version,
        ...resolved.identity,
      },
    };
  } catch (e) {
    if (!(e instanceof LevelRegistryError)) throw e;
    return levelValidationReport(e.levelId ?? null, [
      {
        code: e.code,
        severity: "error",
        objectId: e.levelId,
        message: e.message,
        suggestion:
          "Use an exact registered level ID/version and trusted document; future fields require a later schema/compiler.",
      },
    ]);
  }
}
