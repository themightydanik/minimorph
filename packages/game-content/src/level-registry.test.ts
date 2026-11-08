import { runLevelValidationCli } from "../../../tools/level-editor/report-cli";
import { describe, it, expect } from "vitest";
import {
  LevelRegistry,
  LevelRegistryError,
  parseLevelDocument,
  legacyLevelDocument,
  levelIdentity,
  levelRegistry,
  arenas,
  trainingArenas,
  getArena,
  layoutFingerprint,
  publishedLayoutRevision,
  validatePublication,
  adaptLegacyEditorLayout,
  openEditorLevel,
  validateRegisteredLevel,
  emptyLayout,
  validateLayout,
} from "./index";
import type { ArenaConfig, TrustedLevelSource } from "./index";
import published from "./published/cosmic-sprint.json";
function source(id: string, x: number): TrustedLevelSource {
  const arena: ArenaConfig = {
    subtitle: "Independent fixture",
    description: "Test-only compiled world",
    difficulty: "test",
    palette: {
      sky: "#001122",
      deck: "#223344",
      alternate: "#334455",
      accent: "#44aacc",
      hazard: "#ee4455",
      planet: "#8899aa",
    },
    routes: [],
    id,
    name: id,
    spawn: { x, y: 0, z: 0 },
    finish: { x, y: 0, z: -8, radius: 1 },
    checkpoints: [],
    platforms: [{ id: `${id}-floor`, x, y: 0, z: -4, width: 10, depth: 20 }],
    mechanisms: [],
    obstacles: [],
    visuals: [],
    environment: [],
    navigation: [
      {
        id: "safe",
        name: "Safe",
        stage: 0,
        points: [
          { x, y: 0, z: 0 },
          { x, y: 0, z: -8 },
        ],
      },
    ],
    colliderOwners: {},
    branches: [],
  };
  return { ref: `test:${id}:v1`, levelId: id, arena, editor: "read-only" };
}
const fixtures = () => {
  const a = source("test-alpha", 0),
    b = source("test-beta", 40);
  return {
    sources: [a, b],
    documents: [
      legacyLevelDocument(a),
      {
        ...legacyLevelDocument(b),
        version: 2,
        publication: { state: "draft" as const },
      },
    ],
  };
};
const errorCode = (fn: () => unknown) => {
  try {
    fn();
    return undefined;
  } catch (e) {
    expect(e).toBeInstanceOf(LevelRegistryError);
    return (e as LevelRegistryError).code;
  }
};
describe("independent registry/document contract", () => {
  it("resolves two independent trusted documents deterministically, preserves version pins and rejects unknown references", () => {
    const f = fixtures(),
      r = new LevelRegistry(f.documents, f.sources),
      reverse = new LevelRegistry([...f.documents].reverse(), f.sources);
    expect(r.resolve("test-alpha", 1).arena.spawn.x).toBe(0);
    expect(r.resolve("test-beta", 2).arena.spawn.x).toBe(40);
    expect(r.resolveDocument(f.documents[1]).arena.id).toBe("test-beta");
    expect(r.list()).toEqual(reverse.list());
    expect(r.gameplayManifestRevision()).toBe(
      reverse.gameplayManifestRevision(),
    );
    expect(errorCode(() => r.resolve("missing"))).toBe("LEVEL_UNKNOWN");
    expect(errorCode(() => r.resolve("test-beta", 1))).toBe(
      "LEVEL_VERSION_MISMATCH",
    );
    expect(
      errorCode(
        () => new LevelRegistry([f.documents[0], f.documents[0]], f.sources),
      ),
    ).toBe("LEVEL_DUPLICATE");
    expect(errorCode(() => new LevelRegistry(f.documents, []))).toBe(
      "LEVEL_REFERENCE_INVALID",
    );
    expect(
      errorCode(() => new LevelRegistry([], [...f.sources, f.sources[0]])),
    ).toBe("LEVEL_REFERENCE_INVALID");
    expect(r.isPublishedRace("test-alpha")).toBe(true);
    expect(r.isPublishedRace("test-beta")).toBe(false);
  });
  it("rejects disguised legacy JSON, executable URLs, future fields, invalid dependencies and modified registered documents", () => {
    const f = fixtures(),
      r = new LevelRegistry(f.documents, f.sources);
    expect(errorCode(() => parseLevelDocument(emptyLayout()))).toBe(
      "LEVEL_DOCUMENT_INVALID",
    );
    expect(
      errorCode(() =>
        parseLevelDocument({ ...f.documents[0], sectionInstances: [] }),
      ),
    ).toBe("LEVEL_FEATURE_UNSUPPORTED");
    expect(
      errorCode(() =>
        parseLevelDocument({
          ...f.documents[0],
          geometry: { type: "trusted-arena", ref: "https://evil/level.js" },
        }),
      ),
    ).toBe("LEVEL_DOCUMENT_INVALID");
    expect(
      errorCode(
        () =>
          new LevelRegistry(
            [{ ...f.documents[0], assets: ["missing-model"] }],
            f.sources,
          ),
      ),
    ).toBe("LEVEL_ASSET_INVALID");
    expect(
      errorCode(() =>
        r.resolveDocument({
          ...f.documents[0],
          metadata: { name: "unregistered" },
        }),
      ),
    ).toBe("LEVEL_REFERENCE_INVALID");
  });
  it("keeps registered data immutable and avoids mutable document/list aliases", () => {
    const f = fixtures(),
      r = new LevelRegistry(f.documents, f.sources),
      first = r.resolve("test-alpha");
    first.document.metadata.name = "changed";
    first.assets = [];
    r.list()[0].metadata.name = "other";
    expect(r.resolve("test-alpha").document.metadata.name).toBe("test-alpha");
    expect(Object.isFrozen(first.arena.platforms)).toBe(true);
    expect(() => {
      first.arena.spawn.x = 999;
    }).toThrow();
  });
  it("separates physical/simulation identity from presentation and metadata, preserving collision order", () => {
    const a = source("test-alpha", 0).arena,
      visual = structuredClone(a);
    visual.palette.sky = "#123456";
    visual.navigation = visual.navigation?.map((r) => ({
      ...r,
      name: "new display label",
    }));
    visual.environment = [
      {
        id: "background",
        asset: "main-floor-tile",
        x: 100,
        y: 20,
        z: 0,
        width: 10,
        depth: 10,
        environment: {
          type: "bob",
          speed: 1,
          amplitude: 2,
          viewDistance: 600,
          visible: true,
        },
      },
    ];
    expect(levelIdentity(visual).gameplayDigest).toBe(
      levelIdentity(a).gameplayDigest,
    );
    expect(levelIdentity(visual).presentationRevision).not.toBe(
      levelIdentity(a).presentationRevision,
    );
    const physical = structuredClone(a);
    physical.platforms = [{ ...physical.platforms[0], width: 11 }];
    expect(levelIdentity(physical).gameplayDigest).not.toBe(
      levelIdentity(a).gameplayDigest,
    );
    expect(levelIdentity(a, "new-simulation").gameplayDigest).not.toBe(
      levelIdentity(a).gameplayDigest,
    );
    const ordered = structuredClone(a);
    ordered.platforms = [
      ...ordered.platforms,
      { ...ordered.platforms[0], id: "other", y: 0.5 },
    ];
    const reversed = {
      ...ordered,
      platforms: [...ordered.platforms].reverse(),
    };
    expect(levelIdentity(ordered).gameplayDigest).not.toBe(
      levelIdentity(reversed).gameplayDigest,
    );
    const f = fixtures(),
      r1 = new LevelRegistry(f.documents, f.sources),
      r2 = new LevelRegistry(
        f.documents.map((d) => ({
          ...d,
          version: d.version + 1,
          metadata: { name: "new title" },
        })),
        f.sources,
      );
    expect(r1.gameplayManifestRevision()).toBe(r2.gameplayManifestRevision());
  });
  it("preserves all six base arena canonical fingerprints, reference identity, order and Cosmic publication fingerprint", () => {
    // Captured on c27b02f before the registry implementation; includes full arrays and presentation.
    expect(arenas.map((a) => [a.id, layoutFingerprint(a)])).toEqual([
      ["cosmic-sprint", "fcfc39873df4c391"],
      ["orbit-chaos", "dd13c7c61e68e19c"],
      ["gravity-mayhem", "81a1a6e400ef2b27"],
    ]);
    expect(trainingArenas.map((a) => [a.id, layoutFingerprint(a)])).toEqual([
      ["cosmic-sprint", "0e949b1f457d2a36"],
      ["orbit-chaos", "27c308f4dad00fac"],
      ["gravity-mayhem", "577b53ffc5bc8199"],
    ]);
    for (const a of arenas) expect(getArena(a.id)).toBe(a);
    for (const a of trainingArenas) expect(getArena(a.id, "training")).toBe(a);
    expect(levelRegistry.list()).toHaveLength(6);
    expect(() => getArena("training-cosmic-sprint")).toThrow();
    expect(validatePublication(published).revision).toBe("95476a6fcdcc57ce");
    expect(publishedLayoutRevision).toBe("95476a6fcdcc57ce");
  });
  it("adapts legacy v1-v4 drafts explicitly and exposes a safe editor document adapter", () => {
    for (const version of [1, 2, 3, 4]) {
      const old = { version, arenaId: "cosmic-sprint", objects: [] };
      const adapted = adaptLegacyEditorLayout(old);
      expect(adapted.layout).toEqual(validateLayout(old));
      expect(adapted.layout.version).toBe(4);
      expect(
        adaptLegacyEditorLayout(JSON.parse(JSON.stringify(adapted.layout)))
          .layout,
      ).toEqual(adapted.layout);
    }
    const editor = openEditorLevel("cosmic-sprint", 1);
    expect(editor.mode).toBe("legacy-cosmic-v4");
    if (editor.mode === "legacy-cosmic-v4")
      expect(editor.layout).toEqual(validateLayout(published.layout));
    const f = fixtures(),
      r = new LevelRegistry(f.documents, f.sources);
    expect(openEditorLevel("test-alpha", 1, r).mode).toBe("read-only");
    expect(errorCode(() => openEditorLevel("test-alpha", 2, r))).toBe(
      "LEVEL_VERSION_MISMATCH",
    );
  });
  it("extends deterministic diagnostics while retaining the known carousel issue separately", () => {
    expect(validateRegisteredLevel("missing").diagnostics[0].code).toBe(
      "LEVEL_UNKNOWN",
    );
    const f = fixtures(),
      r = new LevelRegistry(f.documents, f.sources);
    expect(validateRegisteredLevel(f.documents[0], r).valid).toBe(true);
    expect(
      validateRegisteredLevel({ ...f.documents[0], version: 99 }, r)
        .diagnostics[0].code,
    ).toBe("LEVEL_VERSION_MISMATCH");
    const defaultReport = validateRegisteredLevel("cosmic-sprint");
    expect(
      defaultReport.diagnostics.filter((d) => d.severity === "error"),
    ).toMatchObject([
      { code: "WAYPOINT_UNSUPPORTED", routeId: "carousel-crossing" },
    ]);
    expect(() => validatePublication(published)).not.toThrow();
    expect(validateRegisteredLevel(f.documents[0], r)).toEqual(
      validateRegisteredLevel(f.documents[0], r),
    );
  });
});

it("CLI explicitly distinguishes registered documents/IDs from legacy exports", () => {
  let output = "";
  const io = {
    read: () => JSON.stringify(levelRegistry.resolve("orbit-chaos").document),
    write: (text: string) => (output = text),
  };
  const status = runLevelValidationCli(
      ["--document", "level.json", "--json"],
      io,
    ),
    report = JSON.parse(output);
  expect(status).toBe(report.valid ? 0 : 1);
  expect(report.level).toMatchObject({ id: "orbit-chaos", version: 1 });
  expect(runLevelValidationCli(["--level=missing", "--json"], io)).toBe(1);
  expect(JSON.parse(output).diagnostics[0].code).toBe("LEVEL_UNKNOWN");
  expect(
    runLevelValidationCli(["--document", "layout.json", "--json"], {
      ...io,
      read: () => JSON.stringify(emptyLayout()),
    }),
  ).toBe(1);
  expect(JSON.parse(output).diagnostics[0].code).toBe("LEVEL_DOCUMENT_INVALID");
  expect(
    runLevelValidationCli(["--layout", "--level=cosmic-sprint", "--json"], io),
  ).toBe(1);
  expect(JSON.parse(output).diagnostics[0].code).toBe("INPUT_INVALID");
});
