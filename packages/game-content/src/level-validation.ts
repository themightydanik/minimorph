import manifest from "../../../assets/arenas/cosmic-sprint/runtime-manifest.json";
import type { ArenaConfig, Point } from "./arenas";
import type { Platform } from "./legacy";
import {
  applyLayout,
  validateLayout,
  canRotateLayoutObject,
} from "./layout-override";
import { validateColliders } from "./colliders";
import { layoutSource } from "./editor-catalog";
import { validatePublication } from "./published-cosmic";
import { surfaceContains } from "./surface-geometry";

export type DiagnosticSeverity = "error" | "warning" | "unverified";
export type LevelDiagnosticCode =
  | "INPUT_INVALID"
  | "LAYOUT_INVALID"
  | "SOURCE_MISSING"
  | "ASSET_MISSING"
  | "OBJECT_REFERENCE_INVALID"
  | "COLLIDER_INVALID"
  | "COLLIDER_DIMENSIONS_INVALID"
  | "TRANSFORM_UNSUPPORTED"
  | "WALKABLE_SURFACE_MISSING"
  | "DECORATION_NON_COLLIDABLE"
  | "MARKER_SUPPORT_MISSING"
  | "MARKER_EDGE_SUPPORT"
  | "SUPPORT_PHASE_UNVERIFIED"
  | "WAYPOINT_UNSUPPORTED"
  | "ROUTE_INVALID"
  | "ROUTE_STAGE_MISSING"
  | "CONNECTIONS_UNVERIFIED"
  | "REACHABILITY_UNVERIFIED"
  | "PLAYTEST_UNVERIFIED"
  | "PUBLICATION_REVIEW_REQUIRED"
  | "PUBLICATION_INVALID";
export interface LevelDiagnostic {
  code: LevelDiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  objectId?: string;
  colliderId?: string;
  sectionId?: string;
  routeId?: string;
  connectionId?: string;
  path?: string;
  values?: Record<string, string | number | boolean | null>;
  suggestion?: string;
}
export interface LevelValidationReport {
  schemaVersion: 1;
  phase: "static";
  arenaId: string | null;
  valid: boolean;
  revision?: string;
  diagnostics: LevelDiagnostic[];
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const shown = (v: unknown): string | number | boolean | null =>
  v === null ||
  typeof v === "boolean" ||
  (typeof v === "number" && Number.isFinite(v))
    ? v
    : typeof v === "string"
      ? v
      : String(v);
const text = (e: unknown) => (e instanceof Error ? e.message : String(e));
const lexical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** No locale, wall clock or mutation of the layout/world participates in the report. */
export function levelValidationReport(
  arenaId: string | null,
  diagnostics: LevelDiagnostic[],
  revision?: string,
): LevelValidationReport {
  const rank = { error: 0, warning: 1, unverified: 2 };
  const sorted = [...diagnostics].sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      lexical(a.code, b.code) ||
      lexical(a.objectId ?? "", b.objectId ?? "") ||
      lexical(a.colliderId ?? "", b.colliderId ?? "") ||
      lexical(a.routeId ?? "", b.routeId ?? "") ||
      lexical(a.path ?? "", b.path ?? "") ||
      lexical(JSON.stringify(a), JSON.stringify(b)),
  );
  return {
    schemaVersion: 1,
    phase: "static",
    arenaId,
    valid: !sorted.some((d) => d.severity === "error"),
    ...(revision ? { revision } : {}),
    diagnostics: sorted,
  };
}
function preflight(value: unknown): LevelDiagnostic[] {
  const issues: LevelDiagnostic[] = [];
  if (!record(value)) return issues;
  const ids = new Set<string>();
  for (const [layer, raw] of [
    ["objects", value.objects],
    ["environment", value.environment],
  ] as const) {
    if (!Array.isArray(raw)) continue;
    for (const [i, item] of raw.entries()) {
      if (!record(item)) continue;
      const objectId = typeof item.id === "string" ? item.id : undefined,
        path = `${layer}[${i}]`,
        source =
          typeof item.sourceId === "string"
            ? layoutSource(item.sourceId)
            : undefined;
      if (!source)
        issues.push({
          code: "SOURCE_MISSING",
          severity: "error",
          objectId,
          path,
          values: { sourceId: shown(item.sourceId) },
          message:
            "Object source is absent from the trusted catalog/base layout.",
          suggestion:
            "Choose an existing prepared catalog source; imports cannot supply arbitrary asset URLs.",
        });
      if (!objectId || ids.has(objectId))
        issues.push({
          code: "OBJECT_REFERENCE_INVALID",
          severity: "error",
          objectId,
          path,
          message: "Object ID is missing or duplicated.",
          suggestion: "Use a stable unique object ID.",
        });
      if (objectId) ids.add(objectId);
      if (layer === "objects" && source) {
        if (
          (typeof item.yaw === "number" &&
            !canRotateLayoutObject(source.visual.id) &&
            Math.abs(item.yaw - (source.visual.yaw ?? 0)) > 1e-9) ||
          ((item.width !== undefined || item.depth !== undefined) &&
            (!source.platform || source.platform.radius !== undefined)) ||
          (source.mechanism && typeof item.scale === "number" && item.scale > 2)
        )
          issues.push({
            code: "TRANSFORM_UNSUPPORTED",
            severity: "error",
            objectId,
            path,
            message:
              "Transform exceeds the existing source rotation/dimension/scale capabilities.",
            values: { yaw: shown(item.yaw), scale: shown(item.scale) },
            suggestion:
              "Keep mechanism yaw fixed, mechanism scale ≤2 and dimension overrides on rectangular platform sources only.",
          });
        if (Array.isArray(item.colliders)) {
          const sx =
              Number(item.width ?? source.visual.width) / source.visual.width,
            sz =
              Number(item.depth ?? source.visual.depth) / source.visual.depth;
          for (const [j, c] of item.colliders.entries())
            if (
              record(c) &&
              typeof c.yaw === "number" &&
              Math.abs(sx - sz) > 1e-9 &&
              (Math.abs(Math.sin(c.yaw)) > 1e-9 || c.radius !== undefined)
            )
              issues.push({
                code: "TRANSFORM_UNSUPPORTED",
                severity: "error",
                objectId,
                colliderId: typeof c.id === "string" ? c.id : undefined,
                path: `${path}.colliders[${j}]`,
                values: { scaleX: sx, scaleZ: sz, localYaw: c.yaw },
                message:
                  "Unequal X/Z owner scaling with a rotated or circular local collider needs shear, axis remapping or an ellipse that the current collider compiler does not represent.",
                suggestion:
                  "Use equal X/Z scaling or align the local collider to the owner axes.",
              });
        }
      }
      if (layer === "objects" && item.colliders !== undefined) {
        try {
          validateColliders(item.colliders);
        } catch (e) {
          // Run the same collider validator per member to attribute the original failure.
          let attributed = false;
          if (Array.isArray(item.colliders))
            for (const [j, c] of item.colliders.entries()) {
              try {
                validateColliders([c]);
              } catch (reason) {
                attributed = true;
                const message = text(reason);
                issues.push({
                  code: /Invalid collider (x|y|z|yaw|width|depth|height|radius|strength|boost|multiplier|duration)\./.test(
                    message,
                  )
                    ? "COLLIDER_DIMENSIONS_INVALID"
                    : "COLLIDER_INVALID",
                  severity: "error",
                  objectId,
                  colliderId:
                    record(c) && typeof c.id === "string" ? c.id : undefined,
                  path: `${path}.colliders[${j}]`,
                  message,
                  values: record(c)
                    ? Object.fromEntries(
                        Object.entries(c).map(([k, v]) => [k, shown(v)]),
                      )
                    : undefined,
                  suggestion:
                    "Use the supported collider kind, bounded finite dimensions and matching gameplay properties.",
                });
              }
            }
          if (!attributed)
            issues.push({
              code: "COLLIDER_INVALID",
              severity: "error",
              objectId,
              path: `${path}.colliders`,
              message: text(e),
              suggestion: "Use at most 8 colliders with unique local IDs.",
            });
        }
      }
    }
  }
  if (Array.isArray(value.groups))
    for (const [i, g] of value.groups.entries())
      if (record(g) && Array.isArray(g.members))
        for (const id of g.members)
          if (typeof id !== "string" || (!ids.has(id) && !layoutSource(id)))
            issues.push({
              code: "OBJECT_REFERENCE_INVALID",
              severity: "error",
              objectId: typeof id === "string" ? id : undefined,
              path: `groups[${i}].members`,
              message: "Group member does not reference an existing object.",
              suggestion: "Remove the stale member or restore its object.",
            });
  return issues;
}
interface Support extends Platform {
  conditional?: boolean;
}
/** Configured compiled primitives only. Moving/timed supports are explicitly not phase proof. */
function supports(arena: ArenaConfig): Support[] {
  return [
    ...arena.platforms,
    ...arena.mechanisms.flatMap((m) => {
      if (
        ![
          "moving-platform",
          "disappearing-platform",
          "rotating-disc",
          "conveyor",
          "bounce-platform",
          "collapse-platform",
          "jump-pad",
        ].includes(m.kind) ||
        (m.kind === "conveyor" && m.surface === false)
      )
        return [];
      return [
        {
          id: m.id,
          x: m.x,
          y: m.y,
          z: m.z,
          yaw: m.yaw,
          width: "radius" in m ? m.radius * 2 : "width" in m ? m.width : 0,
          depth: "radius" in m ? m.radius * 2 : "depth" in m ? m.depth : 0,
          ...("radius" in m ? { radius: m.radius } : {}),
          conditional: !["rotating-disc", "conveyor", "jump-pad"].includes(
            m.kind,
          ),
        },
      ];
    }),
  ];
}
export function validateCompiledLevel(
  arena: ArenaConfig,
): LevelValidationReport {
  const issues: LevelDiagnostic[] = [],
    surfaces = supports(arena);
  const bind = (id: string | undefined) =>
    id ? arena.colliderOwners?.[id] : undefined;
  const at = (p: Point) =>
    surfaces.filter(
      (s) => Math.abs(p.y - s.y) < 0.01 && surfaceContains(s, p.x, p.z),
    );
  const ids = new Set<string>();
  for (const [i, s] of surfaces.entries()) {
    const b = bind(s.id),
      ref = {
        objectId: b?.ownerId ?? s.id,
        colliderId: b?.localId,
        path: `supports[${i}]`,
      };
    if (s.id && ids.has(s.id))
      issues.push({
        code: "OBJECT_REFERENCE_INVALID",
        severity: "error",
        ...ref,
        message: "Compiled support ID is duplicated.",
      });
    if (s.id) ids.add(s.id);
    if (
      ![s.x, s.y, s.z, s.width, s.depth, s.yaw ?? 0].every(Number.isFinite) ||
      s.width <= 0 ||
      s.depth <= 0 ||
      (s.radius !== undefined && (!Number.isFinite(s.radius) || s.radius <= 0))
    )
      issues.push({
        code: "COLLIDER_DIMENSIONS_INVALID",
        severity: "error",
        ...ref,
        message:
          "Compiled landing support has invalid coordinates or dimensions.",
        values: {
          width: shown(s.width),
          depth: shown(s.depth),
          radius: shown(s.radius),
        },
      });
  }
  const mechanismIds = new Set<string>();
  for (const m of arena.mechanisms) {
    const b = bind(m.id);
    if (mechanismIds.has(m.id))
      issues.push({
        code: "OBJECT_REFERENCE_INVALID",
        severity: "error",
        objectId: b?.ownerId ?? m.id,
        colliderId: b?.localId,
        message: "Compiled mechanism ID is duplicated.",
      });
    mechanismIds.add(m.id);
    const dimensions = Object.fromEntries(
      Object.entries(m).filter(([k]) =>
        ["width", "depth", "height", "length", "radius"].includes(k),
      ),
    );
    if (
      ![m.x, m.y, m.z, m.yaw ?? 0, m.period].every(Number.isFinite) ||
      m.period <= 0 ||
      Object.values(dimensions).some(
        (v) => typeof v !== "number" || !Number.isFinite(v) || v <= 0,
      )
    )
      issues.push({
        code: "COLLIDER_DIMENSIONS_INVALID",
        severity: "error",
        objectId: b?.ownerId ?? m.id,
        colliderId: b?.localId,
        values: Object.fromEntries(
          Object.entries({
            x: m.x,
            y: m.y,
            z: m.z,
            yaw: m.yaw ?? 0,
            period: m.period,
            ...dimensions,
          }).map(([k, v]) => [k, shown(v)]),
        ),
        message:
          "Compiled mechanism has invalid coordinates, dimensions or period.",
      });
  }
  const ownerIds = new Set(arena.visuals?.map((v) => v.id));
  for (const [id, b] of Object.entries(arena.colliderOwners ?? {}))
    if (
      !ownerIds.has(b.ownerId) ||
      (!arena.platforms.some((p) => p.id === id) &&
        !arena.mechanisms.some((m) => m.id === id))
    )
      issues.push({
        code: "OBJECT_REFERENCE_INVALID",
        severity: "error",
        objectId: b.ownerId,
        colliderId: b.localId,
        values: { compiledId: id },
        message:
          "Collider owner binding references a missing visual or physical primitive.",
      });
  for (const v of [...(arena.visuals ?? []), ...(arena.environment ?? [])]) {
    const asset = manifest.assets.find((a) => a.runtime === `${v.asset}.glb`);
    if (
      !asset ||
      (v.part !== undefined &&
        (!Number.isInteger(v.part) || !asset.parts[v.part]))
    )
      issues.push({
        code: "ASSET_MISSING",
        severity: "error",
        objectId: v.id,
        values: { asset: v.asset, part: shown(v.part) },
        message: "Prepared model or part is absent from the runtime manifest.",
        suggestion:
          "Select an existing prepared model/part. File integrity/loading still requires separate asset or browser checks.",
      });
    if (
      v.mechanismId &&
      !arena.mechanisms.some((m) => m.id === v.mechanismId) &&
      !v.animation
    )
      issues.push({
        code: "OBJECT_REFERENCE_INVALID",
        severity: "error",
        objectId: v.id,
        values: { mechanismId: v.mechanismId },
        message: "Visual references a missing mechanism.",
      });
  }
  const markers = [
    { id: "spawn", point: arena.spawn, radius: 0 },
    { id: "finish", point: arena.finish, radius: arena.finish.radius },
    ...arena.checkpoints.flatMap((p, i) =>
      p.enabled === false
        ? []
        : [{ id: `checkpoint-${i}`, point: p, radius: p.radius }],
    ),
  ];
  for (const { id, point, radius } of markers) {
    const found = at(point),
      stable = found.filter((s) => !s.conditional);
    if (!found.length)
      issues.push({
        code: "MARKER_SUPPORT_MISSING",
        severity: "error",
        objectId: id,
        values: Object.fromEntries(
          Object.entries(point).map(([k, v]) => [k, shown(v)]),
        ),
        message:
          "Marker centre has no landing support at its configured height/pose.",
        suggestion:
          "Place the marker on a compiled landing surface. Moving support phase-dependent accessibility needs simulation.",
      });
    else if (!stable.length)
      issues.push({
        code: "SUPPORT_PHASE_UNVERIFIED",
        severity: "unverified",
        objectId: id,
        values: { supportId: found[0].id ?? "" },
        message:
          "Marker depends on a moving, timed or contact-triggered support; configured pose is not a safe respawn guarantee.",
        suggestion:
          "Prefer a static safe support and verify obstacle phases in simulation/Playtest.",
      });
    else if (
      radius > 0 &&
      [
        [-radius, 0],
        [radius, 0],
        [0, -radius],
        [0, radius],
      ].some(
        ([x, z]) =>
          !at({ ...point, x: point.x + x, z: point.z + z }).some(
            (s) => !s.conditional,
          ),
      )
    )
      issues.push({
        code: "MARKER_EDGE_SUPPORT",
        severity: "warning",
        objectId: id,
        values: { radius },
        message:
          "At least one cardinal edge of the marker region lacks stable support. This is a sampled region check, not full footprint/clearance proof.",
        suggestion: "Review region size and landing edges in Playtest.",
      });
  }
  const routes = new Set<string>();
  for (const [i, r] of (arena.navigation ?? []).entries()) {
    const path = `navigation[${i}]`;
    if (
      routes.has(r.id) ||
      !Number.isInteger(r.stage) ||
      r.stage < 0 ||
      r.stage > arena.checkpoints.length ||
      r.points.length < 2
    )
      issues.push({
        code: "ROUTE_INVALID",
        severity: "error",
        routeId: r.id,
        path,
        message: "Route ID/stage/point count is invalid or duplicated.",
      });
    routes.add(r.id);
    for (const [j, p] of r.points.entries()) {
      // Match the existing publication height tolerance; containment is shared with simulation.
      const found = surfaces.filter(
        (s) =>
          [p.x, p.y, p.z].every(Number.isFinite) &&
          Math.abs(p.y - s.y) < 0.15 &&
          surfaceContains(s, p.x, p.z),
      );
      if (!found.length)
        issues.push({
          code: "WAYPOINT_UNSUPPORTED",
          severity: "error",
          routeId: r.id,
          path: `${path}.points[${j}]`,
          values: Object.fromEntries(
            Object.entries(p).map(([k, v]) => [k, shown(v)]),
          ),
          message: "Waypoint is not on a configured compiled landing support.",
          suggestion:
            "Move it to a supported surface; a segment between valid points still needs traversal verification.",
        });
      else if (found.every((s) => s.conditional))
        issues.push({
          code: "SUPPORT_PHASE_UNVERIFIED",
          severity: "unverified",
          routeId: r.id,
          path: `${path}.points[${j}]`,
          message:
            "Waypoint support is phase/contact dependent; its configured pose does not prove bot traversal.",
        });
    }
  }
  if (arena.navigation)
    for (let stage = 0; stage <= arena.checkpoints.length; stage++)
      if (!arena.navigation.some((r) => r.stage === stage))
        issues.push({
          code: "ROUTE_STAGE_MISSING",
          severity: "error",
          values: { stage },
          message: "No navigation route covers this checkpoint stage.",
          suggestion: "Author and simulate a legal route for this stage.",
        });
  issues.push(
    {
      code: "REACHABILITY_UNVERIFIED",
      severity: "unverified",
      message:
        "Static support checks do not prove jump range, route completion, bot completion, hazard timing or recovery safety.",
      suggestion:
        "Run shared-simulation legal-input traversals at documented initial states and phases.",
    },
    {
      code: "PLAYTEST_UNVERIFIED",
      severity: "unverified",
      message:
        "Asset decode, visual/collider agreement, head clearance, spawn crowd offsets and player-perceived safety require Playtest.",
      suggestion: "Review the actual level in desktop/touch Playtest.",
    },
    {
      code: "CONNECTIONS_UNVERIFIED",
      severity: "unverified",
      message:
        "Existing section metadata has no connection/anchor contract. No section adjacency or gap reachability is certified.",
      suggestion:
        "Review seams in Playtest; connection validation depends on a future section schema.",
    },
  );
  return levelValidationReport(arena.id, issues);
}
export function validateLevelLayout(value: unknown): LevelValidationReport {
  const issues = preflight(value);
  let layout;
  try {
    layout = validateLayout(structuredClone(value));
  } catch (e) {
    issues.push({
      code: "LAYOUT_INVALID",
      severity: "error",
      message: text(e),
      suggestion:
        "Correct the existing v1–v4 layout schema before compilation.",
    });
    return levelValidationReport(
      record(value) && typeof value.arenaId === "string" ? value.arenaId : null,
      issues,
    );
  }
  const arena = applyLayout(layout);
  issues.push(...validateCompiledLevel(arena).diagnostics);
  for (const o of layout.objects) {
    if (o.deleted) continue;
    const source = layoutSource(o.sourceId)!;
    const hasSupport =
      arena.platforms.some(
        (p) =>
          p.id === o.id || arena.colliderOwners?.[p.id ?? ""]?.ownerId === o.id,
      ) ||
      arena.mechanisms.some(
        (m) =>
          arena.colliderOwners?.[m.id]?.ownerId === o.id &&
          [
            "rotating-disc",
            "jump-pad",
            "conveyor",
            "moving-platform",
            "bounce-platform",
          ].includes(m.kind),
      );
    if (source.category === "platform" && !hasSupport)
      issues.push({
        code: "WALKABLE_SURFACE_MISSING",
        severity: "error",
        objectId: o.id,
        message: "A platform source has no compiled landing surface.",
        suggestion:
          "Restore an explicit supported surface collider or intentionally use a decorative source.",
      });
    if (source.category === "decoration" && !o.colliders?.length)
      issues.push({
        code: "DECORATION_NON_COLLIDABLE",
        severity: "warning",
        objectId: o.id,
        message:
          "This decorative placement has no gameplay collision; visible geometry is not walkability.",
        suggestion:
          "Keep it off the playable route, or add an explicit supported collider.",
      });
  }
  return levelValidationReport(arena.id, issues);
}
export function validateLevelPublication(
  value: unknown,
): LevelValidationReport {
  const report = validateLevelLayout(record(value) ? value.layout : undefined);
  let issues = [...report.diagnostics];
  if (record(value) && Array.isArray(value.navigation)) {
    try {
      const arena = applyLayout(structuredClone(value.layout));
      const validShape = value.navigation.every(
        (r) =>
          record(r) &&
          typeof r.id === "string" &&
          typeof r.name === "string" &&
          typeof r.stage === "number" &&
          Array.isArray(r.points) &&
          r.points.every(
            (p) =>
              record(p) &&
              typeof p.x === "number" &&
              typeof p.y === "number" &&
              typeof p.z === "number",
          ),
      );
      if (validShape) {
        arena.navigation = value.navigation as unknown as NonNullable<
          ArenaConfig["navigation"]
        >;
        issues = issues.filter(
          (d) => !d.routeId && d.code !== "ROUTE_STAGE_MISSING",
        );
        issues.push(
          ...validateCompiledLevel(arena).diagnostics.filter(
            (d) => !!d.routeId || d.code === "ROUTE_STAGE_MISSING",
          ),
        );
      } else
        issues.push({
          code: "ROUTE_INVALID",
          severity: "error",
          path: "navigation",
          message: "Publication navigation has invalid route/point structure.",
        });
    } catch {
      /* Layout diagnostics already explain why compilation is unavailable. */
    }
  }
  try {
    const publication = validatePublication(structuredClone(value));
    // Custom reviewed navigation is compiled by the existing publication validator.
    const compiled = validateCompiledLevel(publication.arena);
    const routeCodes = new Set([
      "ROUTE_INVALID",
      "WAYPOINT_UNSUPPORTED",
      "ROUTE_STAGE_MISSING",
      "SUPPORT_PHASE_UNVERIFIED",
    ]);
    const filtered = issues.filter(
      (d) => !(d.routeId || d.code === "ROUTE_STAGE_MISSING"),
    );
    for (const d of compiled.diagnostics)
      if (
        routeCodes.has(d.code) &&
        (d.routeId || d.code === "ROUTE_STAGE_MISSING")
      )
        filtered.push(d);
    return levelValidationReport(
      publication.arena.id,
      filtered,
      publication.revision,
    );
  } catch (e) {
    const message = text(e);
    issues.push({
      code: message.startsWith("Multiplayer publication blocked:")
        ? "PUBLICATION_REVIEW_REQUIRED"
        : "PUBLICATION_INVALID",
      severity: "error",
      message,
      suggestion:
        "Follow the existing publication/navigation review contract; a reviewed digest is not proof of reachability.",
    });
    return levelValidationReport(report.arenaId, issues);
  }
}
export function formatLevelValidationReport(
  report: LevelValidationReport,
): string {
  return [
    `${report.valid ? "VALID" : "INVALID"} static level report: ${report.arenaId ?? "unknown"}${report.revision ? ` (${report.revision})` : ""}`,
    ...report.diagnostics.map(
      (d) =>
        `${d.severity.toUpperCase()} ${d.code} [${[d.objectId, d.colliderId, d.routeId, d.path].filter(Boolean).join(" / ") || "level"}]: ${d.message}${d.values ? ` ${JSON.stringify(d.values)}` : ""}${d.suggestion ? ` Fix: ${d.suggestion}` : ""}`,
    ),
  ].join("\n");
}
