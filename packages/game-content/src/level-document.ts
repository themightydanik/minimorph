/** New envelope: deliberately distinct from every legacy layout export. */
export interface LevelDocument {
  kind: "minimorph.level";
  schemaVersion: 1;
  levelId: string;
  version: number;
  metadata: { name: string; description?: string };
  geometry: { type: "trusted-arena"; ref: string };
  assets: string[];
  publication: { state: "draft" | "published" };
}
export type LevelRegistryCode =
  | "LEVEL_DOCUMENT_INVALID"
  | "LEVEL_FEATURE_UNSUPPORTED"
  | "LEVEL_UNKNOWN"
  | "LEVEL_VERSION_MISMATCH"
  | "LEVEL_DUPLICATE"
  | "LEVEL_REFERENCE_INVALID"
  | "LEVEL_ASSET_INVALID";
export class LevelRegistryError extends Error {
  constructor(
    readonly code: LevelRegistryCode,
    message: string,
    readonly levelId?: string,
  ) {
    super(message);
    this.name = "LevelRegistryError";
  }
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
export function parseLevelDocument(value: unknown): LevelDocument {
  const fail = (message: string): never => {
    throw new LevelRegistryError(
      "LEVEL_DOCUMENT_INVALID",
      message,
      record(value) && typeof value.levelId === "string"
        ? value.levelId
        : undefined,
    );
  };
  if (!record(value))
    return fail(
      "Expected a minimorph.level document; legacy layouts require the explicit legacy adapter.",
    );
  if (value.kind !== "minimorph.level" || value.schemaVersion !== 1)
    return fail(
      "Expected minimorph.level schema v1. Legacy exports require the explicit legacy adapter.",
    );
  if (
    [
      "sections",
      "sectionInstances",
      "markers",
      "navigation",
      "visuals",
      "environment",
      "overrides",
    ].some((k) => k in value)
  )
    throw new LevelRegistryError(
      "LEVEL_FEATURE_UNSUPPORTED",
      "Inline markers/navigation/visuals and section instances are future document capabilities; use a trusted compiled arena reference in schema v1.",
      typeof value.levelId === "string" ? value.levelId : undefined,
    );
  if (
    !keys(value, [
      "kind",
      "schemaVersion",
      "levelId",
      "version",
      "metadata",
      "geometry",
      "assets",
      "publication",
    ]) ||
    value.kind !== "minimorph.level" ||
    value.schemaVersion !== 1 ||
    typeof value.levelId !== "string" ||
    !/^[a-z][a-z0-9-]{0,38}$/.test(value.levelId) ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1
  )
    return fail(
      "Invalid document kind/schema, stable level ID or explicit positive integer version.",
    );
  if (
    !record(value.metadata) ||
    !keys(value.metadata, ["name", "description"]) ||
    typeof value.metadata.name !== "string" ||
    !value.metadata.name.trim() ||
    value.metadata.name.length > 120 ||
    (value.metadata.description !== undefined &&
      (typeof value.metadata.description !== "string" ||
        value.metadata.description.length > 2000))
  )
    return fail("Invalid level metadata.");
  if (
    !record(value.geometry) ||
    !keys(value.geometry, ["type", "ref"]) ||
    value.geometry.type !== "trusted-arena" ||
    typeof value.geometry.ref !== "string" ||
    !/^[a-zA-Z0-9:_-]{1,100}$/.test(value.geometry.ref)
  )
    return fail(
      "Geometry requires a trusted reference, never a URL or executable definition.",
    );
  if (
    !Array.isArray(value.assets) ||
    value.assets.length > 100 ||
    value.assets.some((a) => typeof a !== "string") ||
    new Set(value.assets).size !== value.assets.length
  )
    return fail("Asset dependencies must be unique trusted model IDs.");
  if (
    !record(value.publication) ||
    !keys(value.publication, ["state"]) ||
    !["draft", "published"].includes(String(value.publication.state))
  )
    return fail(
      "Invalid publication metadata; declaration is not review approval.",
    );
  return structuredClone(value) as unknown as LevelDocument;
}
