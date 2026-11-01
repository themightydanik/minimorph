import { it, expect, vi } from "vitest";
import * as pc from "playcanvas";
import { loadCharacterVisual } from "./character";
import type { CharacterVisual } from "./character";
const app = {} as pc.Application;
function entity() {
  return new pc.Entity("test entity", app);
}
function visual(): CharacterVisual {
  const root = entity();
  return { root, update: vi.fn(), destroy: vi.fn(() => root.destroy()) };
}
it("keeps a fallback on load failure, including synchronous source failures", async () => {
  const fallback = visual(),
    report = vi.fn(),
    anchor = entity();
  const presenter = loadCharacterVisual(
    {} as pc.Application,
    anchor,
    fallback,
    {
      load() {
        throw new Error("missing model");
      },
    },
    report,
  );
  await vi.waitFor(() => expect(report).toHaveBeenCalled());
  expect(fallback.destroy).not.toHaveBeenCalled();
  expect(anchor.children).toContain(fallback.root);
  presenter.destroy();
  expect(fallback.destroy).toHaveBeenCalledTimes(1);
});
it("disposes late async loads and cancels loading when the scene is destroyed", async () => {
  const fallback = visual(),
    loaded = visual();
  let signal: AbortSignal | undefined;
  let resolve: (v: CharacterVisual) => void = () => {};
  const promise = new Promise<CharacterVisual>((r) => {
    resolve = r;
  });
  const presenter = loadCharacterVisual(
    {} as pc.Application,
    entity(),
    fallback,
    {
      load(_app, s) {
        signal = s;
        return promise;
      },
    },
  );
  await Promise.resolve();
  presenter.destroy();
  presenter.destroy();
  expect(signal?.aborted).toBe(true);
  resolve(loaded);
  await vi.waitFor(() => expect(loaded.destroy).toHaveBeenCalledTimes(1));
  expect(fallback.destroy).toHaveBeenCalledTimes(1);
});
it("replaces only the visual and retains the controller anchor", async () => {
  const fallback = visual(),
    loaded = visual(),
    anchor = entity();
  anchor.setPosition(1, 2, 3);
  const presenter = loadCharacterVisual(
    {} as pc.Application,
    anchor,
    fallback,
    { load: async () => loaded },
  );
  await vi.waitFor(() => expect(anchor.children).toContain(loaded.root));
  expect(fallback.destroy).toHaveBeenCalledTimes(1);
  expect(anchor.getPosition().x).toBe(1);
  presenter.destroy();
  expect(loaded.destroy).toHaveBeenCalledTimes(1);
});
