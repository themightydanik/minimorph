import type { ArenaConfig, RaceMode } from "./arenas";
import type { LevelDocument } from "./level-document";
import { parseLevelDocument, LevelRegistryError } from "./level-document";
import { layoutFingerprint } from "./published-cosmic";
import assetManifest from "../../../assets/arenas/cosmic-sprint/runtime-manifest.json";
/** Explicit semantic epoch. Physics/sampling changes still require a reviewed bump. */
export const SIMULATION_REVISION = "tournament-v1-colliders-v4";
export interface TrustedLevelSource {
  ref: string;
  levelId: string;
  arena: ArenaConfig;
  legacy?: { arenaId: string; mode: RaceMode };
  editor: "legacy-cosmic-v4" | "read-only";
}
export interface LevelIdentity {
  simulationRevision: string;
  gameplayDigest: string;
  presentationRevision: string;
}
export interface ResolvedLevel {
  document: LevelDocument;
  arena: ArenaConfig;
  identity: LevelIdentity;
  assets: readonly string[];
  editor: TrustedLevelSource["editor"];
}
export function arenaAssetDependencies(arena: ArenaConfig): string[] {
  return [
    ...new Set(
      [...(arena.visuals ?? []), ...(arena.environment ?? [])].map(
        (v) => v.asset,
      ),
    ),
  ].sort();
}
/** Ordered physical arrays remain ordered: tie/contact behavior can depend on them. */
export function levelIdentity(
  arena: ArenaConfig,
  simulationRevision = SIMULATION_REVISION,
): LevelIdentity {
  const gameplay = {
    airControl: arena.airControl,
    spawn: arena.spawn,
    finish: arena.finish,
    checkpoints: arena.checkpoints,
    platforms: arena.platforms,
    obstacles: arena.obstacles,
    mechanisms: arena.mechanisms,
    navigation: arena.navigation?.map((r) => ({
      id: r.id,
      stage: r.stage,
      skill: r.skill,
      points: r.points,
    })),
    branches: arena.branches?.map((b) => ({
      id: b.id,
      start: b.start,
      end: b.end,
      x: b.x,
      skill: b.skill,
    })),
  };
  const assets = arenaAssetDependencies(arena);
  const presentation = {
    name: arena.name,
    subtitle: arena.subtitle,
    description: arena.description,
    difficulty: arena.difficulty,
    palette: arena.palette,
    sections: arena.sections,
    routes: arena.routes,
    navigationLabels: arena.navigation?.map((r) => ({
      id: r.id,
      name: r.name,
    })),
    branchLabels: arena.branches?.map((b) => ({
      id: b.id,
      name: b.name,
      tradeoff: b.tradeoff,
    })),
    expectedSeconds: arena.expectedSeconds,
    visuals: arena.visuals,
    environment: arena.environment,
    assets: assets.map((id) =>
      assetManifest.assets.find((a) => a.runtime === `${id}.glb`),
    ),
  };
  return {
    simulationRevision,
    gameplayDigest: layoutFingerprint({ simulationRevision, gameplay }),
    presentationRevision: layoutFingerprint(presentation),
  };
}
function freezeDefinition(value: unknown, seen = new WeakSet<object>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) freezeDefinition(child, seen);
  Object.freeze(value);
}
/** Headless, explicit document/reference set. No mutation API, callbacks, network or latest-version fallback. */
export class LevelRegistry {
  private readonly entries = new Map<
    string,
    {
      document: LevelDocument;
      source: TrustedLevelSource;
      identity: LevelIdentity;
    }
  >();
  constructor(
    documents: readonly unknown[],
    sources: readonly TrustedLevelSource[],
  ) {
    const refs = new Map<string, TrustedLevelSource>();
    for (const source of sources) {
      if (refs.has(source.ref))
        throw new LevelRegistryError(
          "LEVEL_REFERENCE_INVALID",
          `Duplicate trusted source reference: ${source.ref}`,
          source.levelId,
        );
      if (source.arena.id !== (source.legacy?.arenaId ?? source.levelId))
        throw new LevelRegistryError(
          "LEVEL_REFERENCE_INVALID",
          "Trusted source arena ID does not match its level binding.",
          source.levelId,
        );
      if (
        source.editor === "legacy-cosmic-v4" &&
        (source.levelId !== "cosmic-sprint" || source.legacy?.mode !== "race")
      )
        throw new LevelRegistryError(
          "LEVEL_REFERENCE_INVALID",
          "The v4 editor adapter is restricted to legacy racing Cosmic Sprint.",
          source.levelId,
        );
      refs.set(source.ref, source);
    }
    for (const raw of documents) {
      const document = parseLevelDocument(raw),
        id = document.levelId;
      if (this.entries.has(id))
        throw new LevelRegistryError(
          "LEVEL_DUPLICATE",
          `Duplicate level ID: ${id}`,
          id,
        );
      const source = refs.get(document.geometry.ref);
      if (!source || source.levelId !== id)
        throw new LevelRegistryError(
          "LEVEL_REFERENCE_INVALID",
          `Missing or incorrectly bound trusted source: ${document.geometry.ref}`,
          id,
        );
      const required = arenaAssetDependencies(source.arena);
      if (
        document.assets.some(
          (id) => !assetManifest.assets.some((a) => a.runtime === `${id}.glb`),
        ) ||
        required.some((id) => !document.assets.includes(id))
      )
        throw new LevelRegistryError(
          "LEVEL_ASSET_INVALID",
          "Document dependencies must reference prepared models and include every compiled model.",
          id,
        );
      freezeDefinition(source.arena);
      const identity = levelIdentity(source.arena);
      identity.presentationRevision = layoutFingerprint({
        arena: identity.presentationRevision,
        metadata: document.metadata,
        assets: [...document.assets].sort(),
      });
      this.entries.set(id, {
        document,
        source: {
          ...source,
          ...(source.legacy ? { legacy: { ...source.legacy } } : {}),
        },
        identity,
      });
    }
  }
  list(): LevelDocument[] {
    return [...this.entries.values()]
      .map((e) => structuredClone(e.document))
      .sort((a, b) =>
        a.levelId < b.levelId ? -1 : a.levelId > b.levelId ? 1 : 0,
      );
  }
  private entry(id: string, version?: number) {
    const e = this.entries.get(id);
    if (!e)
      throw new LevelRegistryError(
        "LEVEL_UNKNOWN",
        `Unknown registered level: ${id}`,
        id,
      );
    if (version !== undefined && version !== e.document.version)
      throw new LevelRegistryError(
        "LEVEL_VERSION_MISMATCH",
        `Level ${id} has version ${e.document.version}, requested ${version}.`,
        id,
      );
    return e;
  }
  /** Zero allocation on the physics/prediction lookup path; preserves original legacy arena identity. */
  resolveArena(id: string, version?: number): ArenaConfig {
    return this.entry(id, version).source.arena;
  }
  isPublishedRace(id: string): boolean {
    const e = this.entries.get(id);
    return (
      !!e &&
      e.document.publication.state === "published" &&
      e.source.legacy?.mode !== "training"
    );
  }
  resolve(id: string, version?: number): ResolvedLevel {
    const e = this.entry(id, version);
    return {
      document: structuredClone(e.document),
      arena: e.source.arena,
      identity: { ...e.identity },
      assets: [...e.document.assets],
      editor: e.source.editor,
    };
  }
  resolveDocument(value: unknown): ResolvedLevel {
    const doc = parseLevelDocument(value),
      registered = this.resolve(doc.levelId, doc.version);
    if (layoutFingerprint(doc) !== layoutFingerprint(registered.document))
      throw new LevelRegistryError(
        "LEVEL_REFERENCE_INVALID",
        "Document differs from the exact registered document. Register a reviewed version explicitly.",
        doc.levelId,
      );
    return registered;
  }
  /** Presentation/document-only version edits do not invalidate collision compatibility. */
  gameplayManifestRevision(): string {
    return layoutFingerprint(
      this.list()
        .filter((d) => this.isPublishedRace(d.levelId))
        .map((d) => {
          const { simulationRevision, gameplayDigest } = this.entries.get(
            d.levelId,
          )!.identity;
          return { levelId: d.levelId, simulationRevision, gameplayDigest };
        }),
    );
  }
}
export function legacyLevelDocument(source: TrustedLevelSource): LevelDocument {
  return {
    kind: "minimorph.level",
    schemaVersion: 1,
    levelId: source.levelId,
    version: 1,
    metadata: {
      name: source.arena.name,
      description: source.arena.description,
    },
    geometry: { type: "trusted-arena", ref: source.ref },
    assets: arenaAssetDependencies(source.arena),
    publication: { state: "published" },
  };
}
