import { afterEach, expect, it, vi } from "vitest";
import * as pc from "playcanvas";
import { getArena } from "@minimorph/game-content";
import { createPlayer } from "./physics";
import { createCosmicScene } from "./cosmic-scene";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const pending: pc.Asset[] = [],
    remove = vi.fn(),
    unload = vi
      .spyOn(pc.Asset.prototype, "unload")
      .mockImplementation(() => {}),
    status = vi.fn();
  const canvas = {
    dataset: { character: "minimorph-optimized-v1" },
  } as unknown as HTMLCanvasElement;
  const app = {
    root: new pc.Entity("Test scene root", {
      _entityIndex: {},
    } as unknown as pc.Application),
    graphicsDevice: { canvas },
    assets: {
      add: vi.fn(),
      remove,
      load: (asset: pc.Asset) => pending.push(asset),
    },
  } as unknown as pc.Application;
  const arena = getArena("cosmic-sprint"),
    scene = createCosmicScene(app, arena, status);
  scene.update(createPlayer(arena), true);
  return { app, arena, scene, pending, remove, unload, status, canvas };
}
it("repeated placement updates and overview requests share pending asset loads instead of cloning textures per instance", () => {
  const f = fixture();
  for (let i = 0; i < 40; i++) f.scene.update(createPlayer(f.arena));
  f.scene.setOverview(true);
  f.scene.setOverview(true);
  expect(f.pending).toHaveLength(2);
  expect(
    new Set(f.pending.map((a) => (a.file as { url?: string } | null)?.url))
      .size,
  ).toBe(2);
  f.scene.destroy();
  expect(f.app.root.children).toHaveLength(0);
  expect(f.remove).toHaveBeenCalledTimes(2);
});
it("missing assets fail closed, and late completions after disposal cannot instantiate meshes or publish stale UI state", () => {
  const f = fixture(),
    floor = f.pending.find((a) => a.name.includes("wide-floating-island"))!;
  floor.fire("error", "asset missing");
  expect(f.scene.ready).toBe(false);
  expect(f.canvas.dataset.arenaAssets).toBe("error");
  const healthyPending = f.pending.find((asset) => asset !== floor)!;
  f.scene.retry();
  expect(f.canvas.dataset.arenaAssets).toBe("loading");
  expect(f.remove).toHaveBeenCalledWith(floor);
  expect(f.remove).not.toHaveBeenCalledWith(healthyPending);
  const instantiate = vi.fn(() => {
    throw Error("Resurrected disposed scene");
  });
  f.scene.destroy();
  const notifications = f.status.mock.calls.length;
  for (const asset of f.pending) {
    asset.resource = { instantiateRenderEntity: instantiate };
    asset.fire("load");
  }
  expect(instantiate).not.toHaveBeenCalled();
  expect(f.status).toHaveBeenCalledTimes(notifications);
  expect(f.app.root.children).toHaveLength(0);
  expect(f.unload.mock.calls.length).toBeGreaterThanOrEqual(
    f.pending.length * 2,
  );
});
