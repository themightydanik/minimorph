import { describe, it, expect } from "vitest";
import {
  applyLayout,
  emptyLayout,
  validateLevelLayout,
  validateLevelPublication,
  validateCompiledLevel,
  formatLevelValidationReport,
  publishedLayoutRevision,
  validatePublication,
  defaultColliders,
  levelValidationReport,
} from "./index";
import published from "./published/cosmic-sprint.json";
import { runLevelValidationCli } from "../../../tools/level-editor/report-cli";
const placement = (id = "editor-test") => ({
  id,
  sourceId: "catalog:main-floor-tile",
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
});
const codes = (r: ReturnType<typeof validateLevelLayout>) =>
  r.diagnostics.map((d) => d.code);
describe("structured headless validation contract", () => {
  it("is deterministic, immutable and keeps publication identity and v4 compatible", () => {
    const before = structuredClone(published),
      a = validateLevelPublication(published),
      b = validateLevelPublication(published);
    expect(a).toEqual(b);
    // Existing default publication bypasses route support checks; diagnostics expose
    // this authored waypoint without changing geometry or the legacy publish gate.
    expect(a.valid).toBe(false);
    expect(a.diagnostics.filter((d) => d.severity === "error")).toMatchObject([
      {
        code: "WAYPOINT_UNSUPPORTED",
        routeId: "carousel-crossing",
        values: { x: 48, y: 0.2, z: -155 },
      },
    ]);
    expect(published).toEqual(before);
    expect(a.revision).toBe("95476a6fcdcc57ce");
    expect(a.revision).toBe(publishedLayoutRevision);
    expect(validatePublication(published).revision).toBe(a.revision);
    expect(codes(a)).toEqual(
      expect.arrayContaining([
        "REACHABILITY_UNVERIFIED",
        "PLAYTEST_UNVERIFIED",
        "CONNECTIONS_UNVERIFIED",
      ]),
    );
    expect(
      codes(validateLevelLayout({ ...emptyLayout(), objects: [] })),
    ).not.toContain("LAYOUT_INVALID");
  });
  it("attributes missing sources, duplicate IDs and collider dimension failures without compiling partial input", () => {
    const a = placement(),
      bad = { ...placement("editor-bad"), sourceId: "catalog:missing" },
      collider = { ...defaultColliders(a.sourceId)[0], width: -1 };
    const report = validateLevelLayout({
      ...emptyLayout(),
      objects: [{ ...a, colliders: [collider] }, a, bad],
    });
    expect(report.valid).toBe(false);
    expect(codes(report)).toEqual(
      expect.arrayContaining([
        "SOURCE_MISSING",
        "OBJECT_REFERENCE_INVALID",
        "COLLIDER_DIMENSIONS_INVALID",
        "LAYOUT_INVALID",
      ]),
    );
    expect(
      report.diagnostics.find((d) => d.code === "COLLIDER_DIMENSIONS_INVALID"),
    ).toMatchObject({
      objectId: a.id,
      colliderId: "body",
      values: { width: -1 },
    });
    expect(codes(report)).not.toContain("REACHABILITY_UNVERIFIED");
  });
  it("reports existing mechanism restrictions and unsupported shear without changing legacy schema acceptance", () => {
    const hammer = {
      ...placement(),
      sourceId: "catalog:giant-padded-hammer",
      yaw: 0,
    };
    expect(
      codes(validateLevelLayout({ ...emptyLayout(), objects: [hammer] })),
    ).toContain("TRANSFORM_UNSUPPORTED");
    const shear = {
      ...placement(),
      width: 24,
      colliders: [
        { ...defaultColliders("catalog:main-floor-tile")[0], yaw: 0.4 },
      ],
    };
    expect(() =>
      applyLayout({ ...emptyLayout(), objects: [shear] }),
    ).not.toThrow();
    expect(
      codes(validateLevelLayout({ ...emptyLayout(), objects: [shear] })),
    ).toContain("TRANSFORM_UNSUPPORTED");
    expect(
      codes(
        validateLevelLayout({
          ...emptyLayout(),
          objects: [{ ...shear, width: 12 }],
        }),
      ),
    ).not.toContain("TRANSFORM_UNSUPPORTED");
  });
  it("finds missing expected surfaces, unsafe markers, missing assets and stale compiled bindings", () => {
    expect(
      codes(
        validateLevelLayout({
          ...emptyLayout(),
          objects: [{ ...placement(), colliders: [] }],
        }),
      ),
    ).toContain("WALKABLE_SURFACE_MISSING");
    const arena = applyLayout(emptyLayout());
    arena.platforms = [];
    arena.mechanisms = [];
    arena.colliderOwners = { missing: { ownerId: "gone", localId: "body" } };
    arena.visuals = [
      {
        id: "missing-model",
        asset: "missing",
        x: 0,
        y: 0,
        z: 0,
        width: 2,
        depth: 2,
      },
    ];
    const report = validateCompiledLevel(arena);
    expect(codes(report)).toEqual(
      expect.arrayContaining([
        "ASSET_MISSING",
        "OBJECT_REFERENCE_INVALID",
        "MARKER_SUPPORT_MISSING",
        "WAYPOINT_UNSUPPORTED",
      ]),
    );
    expect(
      report.diagnostics.find((d) => d.code === "MARKER_SUPPORT_MISSING"),
    ).toHaveProperty("objectId");
  });
  it("uses actual compiled owner-local surfaces and distinguishes conditional support and unsupported waypoints", () => {
    const arena = applyLayout({
      ...emptyLayout(),
      objects: [
        {
          ...placement(),
          x: 100,
          y: 2,
          z: 100,
          yaw: Math.PI / 2,
          colliders: [
            {
              ...defaultColliders("catalog:main-floor-tile")[0],
              x: 2,
              width: 4,
              depth: 4,
            },
          ],
        },
      ],
    });
    arena.spawn = { x: 100, y: 2, z: 98 };
    arena.checkpoints = [];
    arena.finish = { ...arena.spawn, radius: 0.5 };
    arena.navigation = [
      {
        id: "valid",
        name: "Valid",
        stage: 0,
        points: [arena.spawn, arena.finish],
      },
    ];
    expect(codes(validateCompiledLevel(arena))).not.toContain(
      "MARKER_SUPPORT_MISSING",
    );
    expect(codes(validateCompiledLevel(arena))).not.toContain(
      "WAYPOINT_UNSUPPORTED",
    );
    arena.navigation[0].points[1].x = 1000;
    expect(codes(validateCompiledLevel(arena))).toContain(
      "WAYPOINT_UNSUPPORTED",
    );
    arena.platforms = [];
    arena.colliderOwners = {};
    arena.mechanisms = [
      {
        id: "lift",
        kind: "moving-platform",
        ...arena.spawn,
        width: 4,
        depth: 4,
        axis: "y",
        amplitude: 1,
        period: 4,
      },
    ];
    expect(codes(validateCompiledLevel(arena))).toContain(
      "SUPPORT_PHASE_UNVERIFIED",
    );
  });
  it("reports custom publication routes and review gate without relaxing existing rules", () => {
    const layout = { ...emptyLayout(), objects: [{ ...placement(), x: 100 }] },
      navigation = [
        {
          id: "bad-route",
          name: "Bad",
          stage: 0,
          points: [
            { x: 999, y: 0, z: 999 },
            { x: 998, y: 0, z: 999 },
          ],
        },
      ];
    const report = validateLevelPublication({
      layout,
      navigation,
      navigationReviewedFor: null,
    });
    expect(codes(report)).toEqual(
      expect.arrayContaining([
        "PUBLICATION_REVIEW_REQUIRED",
        "WAYPOINT_UNSUPPORTED",
      ]),
    );
    expect(() =>
      validatePublication({ layout, navigation, navigationReviewedFor: null }),
    ).toThrow();
  });
  it("accepts supported compiled data while explicitly withholding reachability certification", () => {
    const arena = applyLayout(emptyLayout());
    arena.platforms = [{ id: "floor", x: 0, y: 0, z: 0, width: 10, depth: 10 }];
    arena.mechanisms = [];
    arena.visuals = [];
    arena.environment = [];
    arena.colliderOwners = {};
    arena.checkpoints = [];
    arena.spawn = { x: 0, y: 0, z: 0 };
    arena.finish = { x: 1, y: 0, z: 1, radius: 0.5 };
    arena.navigation = [
      {
        id: "safe",
        name: "Safe",
        stage: 0,
        points: [arena.spawn, arena.finish],
      },
    ];
    const before = structuredClone(arena),
      report = validateCompiledLevel(arena);
    expect(report.valid).toBe(true);
    expect(report.diagnostics).toHaveLength(3);
    expect(report.diagnostics.every((d) => d.severity === "unverified")).toBe(
      true,
    );
    expect(arena).toEqual(before);
  });
  it("formats valid/unverified and invalid JSON/human CLI reports with blocking exit codes", () => {
    let out = "";
    const io = {
      read: () => JSON.stringify(published),
      write: (v: string) => (out = v),
    };
    const exit = runLevelValidationCli(["--json"], io),
      report = JSON.parse(out);
    expect(exit).toBe(1);
    expect(report.valid).toBe(false);
    expect(report.phase).toBe("static");
    const supportedDraft = {
      ...emptyLayout(),
      objects: [{ ...placement(), x: 48, y: 0.2, z: -155, width: 4, depth: 4 }],
    };
    expect(
      runLevelValidationCli(["--layout", "--json"], {
        ...io,
        read: () => JSON.stringify(supportedDraft),
      }),
    ).toBe(0);
    expect(JSON.parse(out).valid).toBe(true);
    const good = levelValidationReport("fixture", [
      {
        code: "REACHABILITY_UNVERIFIED",
        severity: "unverified",
        message: "Needs simulation",
      },
    ]);
    expect(good.valid).toBe(true);
    expect(formatLevelValidationReport(good)).toContain(
      "UNVERIFIED REACHABILITY_UNVERIFIED",
    );
    expect(
      runLevelValidationCli(["--layout", "--json"], {
        ...io,
        read: () =>
          JSON.stringify({
            ...emptyLayout(),
            objects: [{ ...placement(), sourceId: "missing" }],
          }),
      }),
    ).toBe(1);
    expect(JSON.parse(out).valid).toBe(false);
    expect(runLevelValidationCli(["--json"], { ...io, read: () => "{" })).toBe(
      1,
    );
    expect(JSON.parse(out).diagnostics[0].code).toBe("INPUT_INVALID");
    expect(runLevelValidationCli(["--invalid"], io)).toBe(1);
    expect(out).toContain("Usage:");
  });
});
