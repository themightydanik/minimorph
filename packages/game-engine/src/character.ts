import * as pc from "playcanvas";
import type { PlayerState } from "./physics";
export interface CharacterVisual {
  /** Feet at local origin, facing -Z, roughly 1.8 world units tall. */
  root: pc.Entity;
  update(state: Readonly<PlayerState>, dt: number): void;
  destroy(): void;
}
export interface CharacterSource {
  /** Own loaded assets until visual.destroy(); honor cancellation and release failures. */
  load(app: pc.Application, signal: AbortSignal): Promise<CharacterVisual>;
}
export type Primitive = "box" | "capsule" | "cone" | "cylinder" | "sphere";
export type ShapeFactory = (
  name: string,
  type: Primitive,
  parent: pc.Entity,
  position: number[],
  scale: number[],
  material: pc.StandardMaterial,
) => pc.Entity;
export function createProceduralCat(
  shape: ShapeFactory,
  materials: {
    silver: pc.StandardMaterial;
    navy: pc.StandardMaterial;
    cyan: pc.StandardMaterial;
  },
): CharacterVisual {
  const root = new pc.Entity("Procedural space cat");
  const body = new pc.Entity("Animated suit");
  root.addChild(body);
  const { silver, navy, cyan } = materials;
  shape("Suit", "capsule", body, [0, 0.65, 0], [0.65, 0.85, 0.55], silver);
  shape("Helmet", "sphere", body, [0, 1.3, 0], [0.95, 0.8, 0.85], silver);
  shape("Visor", "sphere", body, [0, 1.32, -0.3], [0.75, 0.53, 0.4], navy);
  const arms: pc.Entity[] = [],
    boots: pc.Entity[] = [];
  for (const side of [-1, 1]) {
    const ear = shape(
      "Cat ear",
      "cone",
      body,
      [side * 0.32, 1.77, 0],
      [0.28, 0.4, 0.28],
      silver,
    );
    ear.setLocalEulerAngles(0, 0, side * -15);
    shape(
      "Glowing eye",
      "sphere",
      body,
      [side * 0.19, 1.35, -0.49],
      [0.18, 0.24, 0.09],
      cyan,
    );
    boots.push(
      shape(
        "Boot",
        "box",
        root,
        [side * 0.22, 0.15, 0],
        [0.28, 0.3, 0.4],
        navy,
      ),
    );
    arms.push(
      shape(
        "Arm",
        "capsule",
        body,
        [side * 0.48, 0.7, 0],
        [0.2, 0.5, 0.2],
        silver,
      ),
    );
  }
  shape("Chest core", "sphere", body, [0, 0.8, -0.29], [0.2, 0.2, 0.06], cyan);
  let clock = 0,
    stride = 0;
  return {
    root,
    update(state, dt) {
      clock += dt;
      const speed = Math.hypot(state.vx, state.vz) / 6;
      stride += dt * speed * 13;
      const landing =
        Math.sin(Math.PI * Math.min(1, state.landingTime / 0.2)) *
        state.landingImpact;
      const air = !state.grounded && !state.recovery;
      const bob = state.won
        ? Math.abs(Math.sin(clock * 5)) * 0.25
        : air
          ? 0.04
          : Math.sin(stride * 2) * speed * 0.045 +
            Math.sin(clock * 2) * (1 - speed) * 0.015;
      body.setLocalPosition(0, bob, 0);
      body.setLocalScale(
        1 + landing * 0.12,
        1 - landing * 0.16 + (air ? 0.04 : 0),
        1 + landing * 0.12,
      );
      body.setLocalEulerAngles(
        air ? -8 : speed * 7,
        state.won ? clock * 70 : 0,
        0,
      );
      arms.forEach((arm, i) =>
        arm.setLocalEulerAngles(
          air ? -50 : Math.sin(stride + i * Math.PI) * speed * 30,
          0,
          state.won ? (i ? -120 : 120) : i ? -8 : 8,
        ),
      );
      boots.forEach((boot, i) => {
        boot.setLocalPosition(
          i ? 0.22 : -0.22,
          0.15 +
            (air
              ? 0.12
              : Math.max(0, Math.sin(stride + i * Math.PI)) * speed * 0.12),
          0,
        );
        boot.setLocalEulerAngles(
          air ? 20 : Math.sin(stride + i * Math.PI) * speed * 25,
          0,
          0,
        );
      });
    },
    destroy() {
      root.destroy();
    },
  };
}
/** Optional local GLB/GLTF source. No model is downloaded by the default game. */
export function gltfCharacterSource(url: string, scale = 1): CharacterSource {
  return {
    load(app, signal) {
      return new Promise((resolve, reject) => {
        const asset = new pc.Asset("Character model", "container", { url });
        let completed = false;
        const cleanup = () => {
          app.assets.remove(asset);
          asset.unload();
        };
        const abort = () => {
          if (!completed) {
            completed = true;
            cleanup();
            reject(new DOMException("Character load cancelled", "AbortError"));
          }
        };
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener("abort", abort, { once: true });
        asset.once("error", (error: string) => {
          signal.removeEventListener("abort", abort);
          if (!completed) {
            completed = true;
            cleanup();
            reject(new Error(error));
          }
        });
        asset.once("load", () => {
          signal.removeEventListener("abort", abort);
          if (completed || signal.aborted) {
            cleanup();
            return;
          }
          try {
            const root = (
              asset.resource as pc.ContainerResource
            ).instantiateRenderEntity();
            root.setLocalScale(scale, scale, scale);
            completed = true;
            resolve({
              root,
              update() {},
              destroy() {
                root.destroy();
                cleanup();
              },
            });
          } catch (error) {
            completed = true;
            cleanup();
            reject(error);
          }
        });
        app.assets.add(asset);
        app.assets.load(asset);
      });
    },
  };
}
/** Swaps visuals only; late/cancelled loads can never resurrect a destroyed scene. */
export function loadCharacterVisual(
  app: pc.Application,
  anchor: pc.Entity,
  fallback: CharacterVisual,
  source?: CharacterSource,
  onError?: (error: unknown) => void,
) {
  const controller = new AbortController();
  let visual = fallback,
    disposed = false;
  anchor.addChild(visual.root);
  if (source)
    void Promise.resolve()
      .then(() => source.load(app, controller.signal))
      .then((loaded) => {
        if (disposed) {
          loaded.destroy();
          return;
        }
        visual.destroy();
        visual = loaded;
        anchor.addChild(visual.root);
      })
      .catch((error) => {
        if (!disposed) onError?.(error);
      });
  return {
    update(state: Readonly<PlayerState>, dt: number) {
      visual.update(state, dt);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      visual.destroy();
      anchor.destroy();
    },
  };
}

export const CHARACTER_CLIPS = ["Idle", "Run", "Jump", "Fall", "Land", "Victory"] as const;
export type CharacterClip = typeof CHARACTER_CLIPS[number];
/** Physics owns movement; clips are in-place and only change the visual skeleton. */
export function characterClip(state: Readonly<PlayerState>): CharacterClip {
  if (state.won) return "Victory";
  if (state.recovery) return "Idle";
  if (!state.grounded) return state.vy > 0 ? "Jump" : "Fall";
  if (state.landingTime > 0) return "Land";
  return Math.hypot(state.vx, state.vz) > 0.15 ? "Run" : "Idle";
}
export interface AnimatedCharacterConfig {
  url: string;
  version: string;
  scale?: number;
  yaw?: number;
  loadTimeoutMs?: number;
}
export function animatedCharacterSource(config: AnimatedCharacterConfig): CharacterSource {
  return {
    async load(app, signal) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      const timer = setTimeout(abort, config.loadTimeoutMs ?? 20000);
      let visual: CharacterVisual;
      try {
        visual = await gltfCharacterSource(config.url, config.scale ?? 1).load(app, controller.signal);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      }
      try {
        const asset = app.assets.find("Character model", "container");
        const resource = asset?.resource as pc.ContainerResource | undefined;
        const tracks = new Map(resource?.animations.map(a => {
          const track = a.resource as pc.AnimTrack;
          return [track.name || a.name, track];
        }));
        for (const name of CHARACTER_CLIPS) if (!tracks.has(name)) throw new Error(`Missing character clip: ${name}`);
        const root = visual.root;
        root.setLocalEulerAngles(0, config.yaw ?? 0, 0);
        root.addComponent("anim", { activate: true });
        for (const name of CHARACTER_CLIPS) root.anim!.assignAnimation(name, tracks.get(name)!, undefined, 1, ["Idle", "Run", "Fall"].includes(name));
        let current: CharacterClip | undefined;
        const canvas = app.graphicsDevice.canvas as HTMLCanvasElement;
        canvas.dataset.character = config.version;
        return {
          root,
          update(state) {
            const next = characterClip(state);
            if (next !== current) {
              root.anim!.baseLayer!.transition(next, current ? 0.08 : 0, 0);
              current = next;
            }
            canvas.dataset.characterClip = next;
            canvas.dataset.characterActive = root.anim!.baseLayer!.activeState;
            canvas.dataset.characterTime = String(root.anim!.baseLayer!.activeStateCurrentTime);
          },
          destroy() { visual.destroy(); },
        };
      } catch (error) {
        visual.destroy();
        throw error;
      }
    },
  };
}
