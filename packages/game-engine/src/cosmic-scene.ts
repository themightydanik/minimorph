import * as pc from "playcanvas";
import type { ArenaConfig, ArenaVisual } from "@minimorph/game-content";
import { createPlayer } from "./physics";
import type { PlayerState } from "./physics";
import { sampleMechanism } from "./obstacles";
import { instancedNormalChunk } from "./instanced-normals";
import { editorAssetUrls as preparedAssetUrls } from "./editor-assets";
import { sampleEnvironmentMotion } from "./environment-motion";
import rawInventory from "../../../assets/arenas/cosmic-sprint/runtime-manifest.json";
export interface ArenaLoadStatus {
  ready: boolean;
  loaded: number;
  total: number;
  error: string | null;
}
interface Part {
  name: string;
  min: number[];
  max: number[];
  walkY: number;
  triangles: number;
}
interface Record {
  runtime: string;
  parts: Part[];
  bounds: { min: number[]; max: number[] };
}
const inventory = rawInventory.assets as unknown as Record[];
const urls: { [key: string]: string } = {
  "wide-floating-island": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/wide-floating-island.glb",
    import.meta.url,
  ).href,
  "main-floor-tile": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/main-floor-tile.glb",
    import.meta.url,
  ).href,
  "large-floor-panel": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/large-floor-panel.glb",
    import.meta.url,
  ).href,
  "circular-arena-floor": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/circular-arena-floor.glb",
    import.meta.url,
  ).href,
  "landing-transition-platform": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/landing-transition-platform.glb",
    import.meta.url,
  ).href,
  "cosmic-start-gate": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/cosmic-start-gate.glb",
    import.meta.url,
  ).href,
  "star-finish-gate": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/star-finish-gate.glb",
    import.meta.url,
  ).href,
  "checkpoint-gate-marker": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/checkpoint-gate-marker.glb",
    import.meta.url,
  ).href,
  "giant-padded-hammer": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/giant-padded-hammer.glb",
    import.meta.url,
  ).href,
  "turbo-conveyor": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/turbo-conveyor.glb",
    import.meta.url,
  ).href,
  "sliding-bumper": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/sliding-bumper.glb",
    import.meta.url,
  ).href,
  "inflatable-bounce-pad": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/inflatable-bounce-pad.glb",
    import.meta.url,
  ).href,
  "rotating-carousel": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/rotating-carousel.glb",
    import.meta.url,
  ).href,
  "space-decoration-kit": new URL(
    "../../../assets/arenas/cosmic-sprint/runtime/space-decoration-kit.glb",
    import.meta.url,
  ).href,
};
pc.basisInitialize({
  glueUrl: new URL(
    "../../../assets/vendor/basis/basis_transcoder.js",
    import.meta.url,
  ).href,
  wasmUrl: new URL(
    "../../../assets/vendor/basis/basis_transcoder.wasm",
    import.meta.url,
  ).href,
  lazyInit: true,
  numWorkers: 1,
});
interface DrawGroup {
  variant: string;
  ownedMaterial?: pc.StandardMaterial;
  pulse?: { speed: number; amplitude: number };
  entity: pc.Entity;
  mesh: pc.MeshInstance;
  buffer: pc.VertexBuffer;
  data: Float32Array;
  part: Part;
  partIndex: number;
}
interface Entry {
  key: string;
  asset: pc.Asset;
  wanted: boolean;
  loaded: boolean;
  error: string | null;
  groups: DrawGroup[];
  template?: pc.Entity;
}
/** One streamed container/texture set per authored asset. GPU instances share all geometry and PBR maps. */
export function createCosmicScene(
  app: pc.Application,
  arena: ArenaConfig,
  onLoad?: (status: ArenaLoadStatus) => void,
  editor = false,
  editorUrls: { [key: string]: string } = {},
) {
  const root = new pc.Entity(
    "Galactic Fun Park — authored GLB environment",
    app,
  );
  app.root.addChild(root);
  const entries = new Map<string, Entry>();
  let placements = [...arena.visuals!, ...(arena.environment ?? [])];
  let keys = [...new Set(placements.map((v) => v.asset))];
  let turboVisuals = placements.filter((v) => !v.environment && v.asset === "turbo-conveyor");
  const bandMaterial = new pc.StandardMaterial();
  bandMaterial.diffuse = new pc.Color(0.2, 0.95, 0.8);
  bandMaterial.emissive.copy(bandMaterial.diffuse);
  bandMaterial.useLighting = false;
  bandMaterial.opacity = 0.45;
  bandMaterial.blendType = pc.BLEND_ADDITIVEALPHA;
  bandMaterial.depthWrite = false;
  bandMaterial.update();
  const bands = new pc.Entity("Instanced turbo direction light bands", app);
  root.addChild(bands);
  bands.addComponent("render", {
    type: "box",
    castShadows: false,
    receiveShadows: false,
  });
  const bandMesh = bands.render!.meshInstances[0];
  bandMesh.material = bandMaterial;
  bandMesh.cull = false;
  let bandBuffer = new pc.VertexBuffer(
      app.graphicsDevice,
      pc.VertexFormat.getDefaultInstancingFormat(app.graphicsDevice),
      1,
      { usage: pc.BUFFER_DYNAMIC },
    ),
    bandData = new Float32Array(16);
  bandMesh.setInstancing(bandBuffer, false);
  let showEnvironment = true,
    lastPresentationTime = 0;
  const hiddenInEditor = new Set<string>(),
    focusedInEditor = new Set<string>();
  const pulseKey = (v: ArenaVisual) =>
    v.environment?.type === "pulse"
      ? `${v.environment.speed}:${v.environment.amplitude}`
      : "";
  const motion = { x: 0, y: 0, z: 0, yaw: 0, pulse: 0 };
  const canvas = app.graphicsDevice.canvas as HTMLCanvasElement;
  let disposed = false,
    overview = false,
    lastStatus = "",
    ready = false,
    canLoad = false,
    active = false;
  let lastState: Readonly<PlayerState> = createPlayer(arena);
  let wanted: string[] = [],
    required: string[] = [];
  onLoad?.({ ready: false, loaded: 0, total: keys.length, error: null });
  function publish() {
    if (disposed) return;
    const loaded = wanted.filter((k) => entries.get(k)?.loaded).length,
      error = wanted.map((k) => entries.get(k)?.error).find(Boolean) ?? null;
    const requiredError = required.some((k) => !!entries.get(k)?.error);
    ready = required.every((k) => entries.get(k)?.loaded) && !requiredError;
    canvas.dataset.environmentError = error && !requiredError ? error : "";
    canvas.dataset.arenaAssets = requiredError
      ? "error"
      : ready
        ? "ready"
        : "loading";
    canvas.dataset.arenaAssetCount = `${loaded}/${wanted.length}`;
    const status = `${ready}:${loaded}:${wanted.length}:${error}`;
    if (status !== lastStatus) {
      lastStatus = status;
      onLoad?.({
        ready,
        loaded,
        total: wanted.length,
        error: requiredError ? error : null,
      });
    }
  }
  function pump() {
    if (disposed || !canLoad) return;
    while (
      [...entries.values()].filter((e) => !e.loaded && !e.error).length < 2
    ) {
      const next = wanted.find((key) => !entries.has(key));
      if (!next) break;
      load(next);
    }
  }
  const camera = app.root.findByName("Follow camera") as pc.Entity;
  function makeVisibility() {
    return new Map(
      placements.map((v) => {
        const record = inventory.find((a) => a.runtime === `${v.asset}.glb`)!,
          part = record.parts[v.part ?? 0],
          b = v.part === undefined ? record.bounds : part;
        const d = b.max.map((x, i) => Math.max(0.0001, x - b.min[i]));
        let sx = v.width / d[0],
          sz = v.depth / d[2],
          sy = Math.min(sx, sz, 8);
        if (v.fit === "gate" || v.fit === "prop")
          sx = sy = sz = v.width / Math.max(d[0], d[2]);
        const o =
          v.animation ?? arena.mechanisms.find((o) => o.id === v.mechanismId);
        if (o?.kind === "rotating-disc") sy = Math.min(sy, 2);
        const pivot = v.fit === "floor" ? part.walkY : b.min[1],
          cy = v.y + ((b.min[1] + b.max[1]) / 2 - pivot) * sy;
        const reach = o?.kind === "pusher" ? o.reach : 0,
          cx = v.x - (o?.kind === "pusher" ? (o.side * reach) / 2 : 0);
        return [
          v,
          new pc.BoundingSphere(
            new pc.Vec3(cx, cy, v.z),
            Math.hypot(d[0] * sx, d[1] * sy, d[2] * sz) / 2 +
              reach / 2 +
              (v.environment?.amplitude ?? 0) * 2,
          ),
        ] as const;
      }),
    );
  }
  let visibility = makeVisibility();
  const inView = (v: ArenaVisual) => {
    if (!camera?.camera) return false;
    const sphere = visibility.get(v)!,
      p = camera.getPosition(),
      f = camera.forward;
    // Background far planes must not expand the original gameplay streaming budget.
    if (
      !overview &&
      !v.environment &&
      (sphere.center.x - p.x) * f.x +
        (sphere.center.y - p.y) * f.y +
        (sphere.center.z - p.z) * f.z >
        180 + sphere.radius
    )
      return false;
    return !!camera.camera.frustum.containsSphere(sphere);
  };
  const visible = (v: ArenaVisual) =>
    !hiddenInEditor.has(v.id) &&
    (!v.environment || (showEnvironment && v.environment.visible));
  const environmentNear = (v: ArenaVisual) => {
    const p = camera.getPosition();
    return (
      visible(v) &&
      (focusedInEditor.has(v.id) ||
        Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) <
          (v.environment?.viewDistance ?? 600) +
            (v.environment?.amplitude ?? 0) * 2 +
            Math.max(v.width, v.depth))
    );
  };
  const matrix = new pc.Mat4(),
    rotation = new pc.Quat(),
    position = new pc.Vec3(),
    scale = new pc.Vec3();
  function remove(entry: Entry) {
    for (const group of entry.groups) {
      group.mesh.setInstancing(null);
      group.entity.destroy();
      group.buffer.destroy();
      group.ownedMaterial?.destroy();
    }
    entry.groups = [];
    entry.template?.destroy();
    entry.template = undefined;
    app.assets.remove(entry.asset);
    entry.asset.unload();
  }
  function load(key: string) {
    const asset = new pc.Asset(`Cosmic environment ${key}`, "container", {
      url: editorUrls[key] ?? urls[key] ?? preparedAssetUrls[key],
    });
    const entry: Entry = {
      key,
      asset,
      wanted: true,
      loaded: false,
      error: null,
      groups: [],
    };
    entries.set(key, entry);
    app.assets.add(asset);
    asset.once("error", (error: string) => {
      if (!disposed && entries.get(key) === entry) {
        entry.error = String(error);
        publish();
        pump();
      }
    });
    asset.once("load", () => {
      if (disposed || entries.get(key) !== entry) {
        app.assets.remove(asset);
        asset.unload();
        return;
      }
      try {
        const record = inventory.find((a) => a.runtime === `${key}.glb`)!;
        entry.template = (
          asset.resource as pc.ContainerResource
        ).instantiateRenderEntity();
        entry.template.enabled = false;
        for (const component of entry.template.findComponents(
          "render",
        ) as pc.RenderComponent[]) {
          const partIndex = Math.max(
            0,
            record.parts?.findIndex((p) => p.name === component.entity.name) ??
              0,
          );
          const part = record.parts?.[partIndex] ?? {
            name: component.entity.name,
            ...record.bounds,
            walkY: record.bounds.max[1],
            triangles: 0,
          };
          const count = placements.filter(
            (v) =>
              v.asset === key && (v.part === undefined || v.part === partIndex),
          ).length;
          if (!count) continue;
          const variants = [
            ...new Set(
              placements
                .filter(
                  (v) =>
                    v.asset === key &&
                    (v.part === undefined || v.part === partIndex),
                )
                .map(pulseKey),
            ),
          ];
          for (const source of component.meshInstances) {
            for (const variant of variants) {
              const instanceCount = placements.filter(
                (v) =>
                  v.asset === key &&
                  (v.part === undefined || v.part === partIndex) &&
                  pulseKey(v) === variant,
              ).length;
              const entity = new pc.Entity(
                `${key}/${part.name} instances`,
                app,
              );
              root.addChild(entity);
              if (!source.mesh || !source.material) continue;
              source.material
                .getShaderChunks(pc.SHADERLANGUAGE_GLSL)
                .set("normalCoreVS", instancedNormalChunk);
              source.material.update();
              const ownedMaterial = variant
                ? (source.material.clone() as pc.StandardMaterial)
                : undefined;
              if (ownedMaterial) {
                ownedMaterial.emissiveMap = ownedMaterial.diffuseMap;
                ownedMaterial.emissive.copy(ownedMaterial.diffuse);
                ownedMaterial
                  .getShaderChunks(pc.SHADERLANGUAGE_GLSL)
                  .set("normalCoreVS", instancedNormalChunk);
                ownedMaterial.update();
              }
              const mesh = new pc.MeshInstance(
                source.mesh,
                ownedMaterial ?? source.material,
                entity,
              );
              const buffer = new pc.VertexBuffer(
                app.graphicsDevice,
                pc.VertexFormat.getDefaultInstancingFormat(app.graphicsDevice),
                instanceCount,
                { usage: pc.BUFFER_DYNAMIC },
              );
              mesh.setInstancing(buffer, false);
              if (placements.some((v) => v.asset === key && !!v.environment))
                mesh.cull = false;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const items = placements.filter((v) => v.asset === key),
                min = [Infinity, Infinity, Infinity],
                max = [-Infinity, -Infinity, -Infinity];
              for (const v of items) {
                const r = Math.max(v.width, v.depth);
                for (const [i, c] of [v.x, v.y, v.z].entries()) {
                  min[i] = Math.min(min[i], c - r * 2);
                  max[i] = Math.max(max[i], c + r * 2);
                }
              }
              mesh.setCustomAabb(
                new pc.BoundingBox(
                  new pc.Vec3(...min.map((v, i) => (v + max[i]) / 2)),
                  new pc.Vec3(...min.map((v, i) => (max[i] - v) / 2)),
                ),
              );
              entity.addComponent("render", { meshInstances: [mesh] });
              entry.groups.push({
                entity,
                mesh,
                buffer,
                data: new Float32Array(instanceCount * 16),
                variant,
                ownedMaterial,
                pulse: variant
                  ? {
                      speed: Number(variant.split(":")[0]),
                      amplitude: Number(variant.split(":")[1]),
                    }
                  : undefined,
                part,
                partIndex,
              });
            }
          }
        }
        entry.loaded = true;
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
      }
      scene.update(lastState, active, lastPresentationTime);
    });
    app.assets.load(asset);
  }
  function transform(
    v: ArenaVisual,
    part: Part,
    record: Record,
    state: Readonly<PlayerState>,
  ) {
    const bounds = v.part === undefined ? record.bounds : part;
    const dims = bounds.max.map((x, i) => Math.max(0.0001, x - bounds.min[i]));
    const envMotion = sampleEnvironmentMotion(
      v.environment,
      lastPresentationTime,
      motion,
    );
    const y = v.y + envMotion.y;
    let sx = v.width / dims[0],
      sz = v.depth / dims[2],
      sy = Math.min(sx, sz, 8),
      yaw = (v.yaw ?? 0) + envMotion.yaw,
      x = v.x + envMotion.x,
      z = v.z + envMotion.z;
    if (v.fit === "gate" || v.fit === "prop")
      sx = sy = sz = v.width / Math.max(dims[0], dims[2]);
    let pivotY = v.fit === "floor" ? part.walkY : bounds.min[1];
    if (v.mechanismId) {
      const o =
        v.animation ?? arena.mechanisms.find((o) => o.id === v.mechanismId)!;
      const pose = sampleMechanism(o, state.elapsed);
      if (o.kind === "sweeper") {
        sx = sy = sz = v.width / Math.max(dims[0], dims[2]);
        pivotY = record.bounds.min[1];
        if (part.name === "Moving") yaw -= pose.angle;
      } else if (o.kind === "rotating-disc") {
        sy = Math.min(sy, 2);
        pivotY =
          record.parts.find((p) => p.name === "Moving")?.walkY ?? part.walkY;
        if (part.name === "Moving") yaw -= pose.angle;
      } else if (o.kind === "pusher") {
        x = pose.x;
        z = pose.z;
        sx = sy = sz = v.width / Math.max(dims[0], dims[2]);
        pivotY = bounds.min[1];
      }
    }
    const cx = (bounds.min[0] + bounds.max[0]) / 2,
      cz = (bounds.min[2] + bounds.max[2]) / 2;
    // Rigid mechanisms rotate about their authored central axle, not each part's individual bbox.
    const centerX = v.mechanismId ? 0 : cx,
      centerZ = v.mechanismId ? 0 : cz;
    position.set(
      x - Math.cos(yaw) * centerX * sx - Math.sin(yaw) * centerZ * sz,
      y - pivotY * sy,
      z + Math.sin(yaw) * centerX * sx - Math.cos(yaw) * centerZ * sz,
    );
    rotation.setFromEulerAngles(0, (yaw * 180) / Math.PI, 0);
    scale.set(sx, sy, sz);
    matrix.setTRS(position, rotation, scale);
    return matrix;
  }
  const scene = {
    root,
    /** Editor placements use this very renderer and its instancing transforms. */
    setLayout(next: ArenaConfig) {
      arena = next;
      placements = [...next.visuals!, ...(next.environment ?? [])];
      visibility = makeVisibility();
      keys = [...new Set(placements.map((v) => v.asset))];
      turboVisuals = placements.filter((v) => !v.environment && v.asset === "turbo-conveyor");
      for (const [key, entry] of entries) {
        const record = inventory.find((a) => a.runtime === `${key}.glb`)!;
        if (
          entry.loaded &&
          record.parts.some(
            (_, i) =>
              placements.some(
                (v) =>
                  v.asset === key && (v.part === undefined || v.part === i),
              ) &&
              placements.some(
                (v) =>
                  v.asset === key &&
                  (v.part === undefined || v.part === i) &&
                  !entry.groups.some(
                    (g) => g.partIndex === i && g.variant === pulseKey(v),
                  ),
              ),
          )
        ) {
          entries.delete(key);
          remove(entry);
        }
      }
      for (const entry of entries.values())
        for (const group of entry.groups) {
          const count = placements.filter(
            (v) =>
              v.asset === entry.key &&
              (v.part === undefined || v.part === group.partIndex) &&
              pulseKey(v) === group.variant,
          ).length;
          if (count > group.buffer.numVertices) {
            group.mesh.setInstancing(null);
            group.buffer.destroy();
            group.buffer = new pc.VertexBuffer(
              app.graphicsDevice,
              pc.VertexFormat.getDefaultInstancingFormat(app.graphicsDevice),
              count,
              { usage: pc.BUFFER_DYNAMIC },
            );
            group.mesh.setInstancing(group.buffer, false);
            group.data = new Float32Array(count * 16);
          }
          // Editor can move objects outside the original group bounds.
          group.mesh.cull = false;
        }
      scene.update(lastState, active, lastPresentationTime);
    },
    placementBounds(id: string) {
      const v = placements.find((v) => v.id === id);
      if (!v) return undefined;
      const record = inventory.find((a) => a.runtime === `${v.asset}.glb`)!;
      let result: pc.BoundingBox | undefined;
      for (const part of record.parts) {
        if (v.part !== undefined && part !== record.parts[v.part]) continue;
        const local = new pc.BoundingBox();
        local.setMinMax(new pc.Vec3(...part.min), new pc.Vec3(...part.max));
        const world = new pc.BoundingBox();
        world.setFromTransformedAabb(
          local,
          transform(v, part, record, lastState),
        );
        if (result) result.add(world);
        else result = world;
      }
      return result;
    },
    setEditorFocus(ids: readonly string[]) {
      focusedInEditor.clear();
      ids.forEach((id) => focusedInEditor.add(id));
    },
    setEnvironmentVisible(value: boolean) {
      showEnvironment = value;
      scene.update(lastState, active, lastPresentationTime);
    },
    setEditorHidden(ids: readonly string[]) {
      hiddenInEditor.clear();
      ids.forEach((id) => hiddenInEditor.add(id));
      scene.update(lastState, active, lastPresentationTime);
    },
    isVisible(id: string) {
      const v = placements.find((v) => v.id === id);
      return !!v && visible(v) && (!v.environment || environmentNear(v));
    },
    get ready() {
      return ready;
    },
    retry() {
      if (disposed) return;
      let retried = false;
      for (const [key, entry] of entries)
        if (entry.error) {
          entries.delete(key);
          remove(entry);
          retried = true;
        }
      // Keep healthy and in-flight containers owned by this scene: the loader shares pending URLs.
      if (retried) scene.update(lastState, active, lastPresentationTime);
    },
    setOverview(value: boolean) {
      if (value === overview) return;
      overview = value;
      ready = false;
      lastStatus = "";
      canvas.dataset.arenaAssets = "loading";
      onLoad?.({ ready: false, loaded: 0, total: keys.length, error: null });
      scene.update(lastState, active, lastPresentationTime);
    },
    update(
      state: Readonly<PlayerState>,
      isActive = active,
      presentationTime = state.elapsed,
    ) {
      if (disposed) return;
      active = isActive;
      lastState = state;
      lastPresentationTime = presentationTime;
      // Let the approved character finish importing before starting heavy environment decoding.
      canLoad =
        active &&
        (editor ||
          canvas.dataset.character === "minimorph-optimized-v1" ||
          canvas.dataset.character === "procedural-fallback");
      wanted = keys
        .filter((key) =>
          placements.some(
            (v) =>
              v.asset === key &&
              visible(v) &&
              (v.environment
                ? environmentNear(v) && inView(v)
                : overview ||
                  Math.hypot(v.x - state.x, v.z - state.z) < 68 ||
                  inView(v)),
          ),
        )
        .sort(
          (a, b) =>
            Math.min(
              ...placements
                .filter((v) => v.asset === a)
                .map((v) => Math.hypot(v.x - state.x, v.z - state.z)),
            ) -
            Math.min(
              ...placements
                .filter((v) => v.asset === b)
                .map((v) => Math.hypot(v.x - state.x, v.z - state.z)),
            ),
        );
      required = keys.filter((key) =>
        placements.some(
          (v) =>
            !v.environment &&
            visible(v) &&
            v.asset === key &&
            (overview || Math.hypot(v.x - state.x, v.z - state.z) < 28),
        ),
      );
      for (const [key, entry] of entries)
        if (
          !overview &&
          (entry.loaded || entry.error) &&
          !placements.some(
            (v) =>
              v.asset === key &&
              visible(v) &&
              (v.environment
                ? environmentNear(v)
                : Math.hypot(v.x - state.x, v.z - state.z) < 90 || inView(v)),
          )
        ) {
          entries.delete(key);
          remove(entry);
        }
      pump();
      for (const entry of entries.values())
        if (entry.loaded) {
          const record = inventory.find(
            (a) => a.runtime === `${entry.key}.glb`,
          )!;
          for (const group of entry.groups) {
            let count = 0;
            for (const v of placements)
              if (
                v.asset === entry.key &&
                (v.part === undefined || v.part === group.partIndex) &&
                pulseKey(v) === group.variant
              ) {
                if (!visible(v) || (v.environment && !environmentNear(v)))
                  continue;
                if ((!overview || v.environment) && !inView(v)) continue;
                group.data.set(
                  transform(v, group.part, record, state).data,
                  count++ * 16,
                );
              }
            group.entity.enabled = count > 0;
            group.mesh.instancingCount = count;
            if (count) group.buffer.setData(group.data);
            if (count && group.pulse && group.ownedMaterial) {
              group.ownedMaterial.emissiveIntensity =
                0.1 +
                (0.5 +
                  0.5 * Math.sin(lastPresentationTime * group.pulse.speed)) *
                  group.pulse.amplitude;
            }
          }
        }
      const capacity = Math.max(1, turboVisuals.length * 3);
      if (capacity > bandBuffer.numVertices) {
        bandMesh.setInstancing(null);
        bandBuffer.destroy();
        bandBuffer = new pc.VertexBuffer(
          app.graphicsDevice,
          pc.VertexFormat.getDefaultInstancingFormat(app.graphicsDevice),
          capacity,
          { usage: pc.BUFFER_DYNAMIC },
        );
        bandData = new Float32Array(capacity * 16);
        bandMesh.setInstancing(bandBuffer, false);
      }
      let bandCount = 0;
      for (const v of turboVisuals) {
        if (!entries.get(v.asset)?.loaded) continue;
        const yaw = v.yaw ?? 0,
          m =
            v.animation ?? arena.mechanisms.find((m) => m.id === v.mechanismId),
          direction =
            m?.kind === "conveyor"
              ? Math.sign(
                  m.velocityX * Math.sin(yaw) + m.velocityZ * Math.cos(yaw),
                ) || -1
              : -1;
        for (let i = 0; i < 3; i++) {
          const along =
            (((state.elapsed * 0.7 + i / 3) % 1) - 0.5) * v.depth * direction;
          position.set(
            v.x + Math.sin(yaw) * along,
            v.y + 0.065,
            v.z + Math.cos(yaw) * along,
          );
          rotation.setFromEulerAngles(0, (yaw * 180) / Math.PI, 0);
          scale.set(v.width * 0.72, 0.025, 0.16);
          matrix.setTRS(position, rotation, scale);
          bandData.set(matrix.data, bandCount++ * 16);
        }
      }
      bands.enabled = bandCount > 0;
      bandMesh.instancingCount = bandCount;
      if (bandCount) bandBuffer.setData(bandData);
      publish();
      canvas.dataset.arenaInstances = String(
        [...entries.values()].reduce(
          (n, e) =>
            n + e.groups.reduce((s, g) => s + g.mesh.instancingCount, 0),
          0,
        ),
      );
      canvas.dataset.arenaTriangles = String(
        [...entries.values()].reduce(
          (n, e) =>
            n +
            e.groups.reduce(
              (s, g) => s + g.mesh.instancingCount * g.part.triangles,
              0,
            ),
          0,
        ),
      );
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) remove(entry);
      entries.clear();
      bandMesh.setInstancing(null);
      bandBuffer.destroy();
      root.destroy();
      bandMaterial.destroy();
      delete canvas.dataset.arenaAssets;
      delete canvas.dataset.arenaAssetCount;
      delete canvas.dataset.arenaInstances;
      delete canvas.dataset.arenaTriangles;
    },
  };
  scene.update(lastState, active, lastPresentationTime);
  return scene;
}
