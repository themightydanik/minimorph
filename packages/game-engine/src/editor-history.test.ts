import { it, expect } from "vitest";
import { emptyLayout, editorCatalog } from "@minimorph/game-content";
import { EditorHistory } from "./editor-history";
it("coalesces a continuous drag and restores complete dimension/gameplay snapshots", () => {
  const h = new EditorHistory(),
    before = emptyLayout();
  let after = before;
  h.begin(before);
  for (let x = 0; x < 100; x++) {
    const next = {
      ...emptyLayout(),
      objects: [
        {
          id: "editor-a",
          sourceId: "catalog:giant-padded-hammer",
          x,
          y: 0,
          z: 0,
          yaw: Math.PI / 2,
          scale: 2,
          impactStrength: 16,
        },
      ],
    };
    h.record(after, next);
    after = next;
  }
  h.end(after);
  expect(h.undo(after)).toEqual(before);
  expect(h.canUndo).toBe(false);
  expect(h.redo(before)).toEqual(after);
  h.record(after, before);
  expect(h.canRedo).toBe(false);
  expect(h.undo(before)).toEqual(after);
});
it("bounds history to 50 actions and catalogs all 23 assets with independent kit parts", () => {
  const h = new EditorHistory();
  let value = emptyLayout();
  for (let i = 0; i < 70; i++) {
    const next = {
      ...emptyLayout(),
      objects: [
        {
          id: "editor-a",
          sourceId: "catalog:main-floor-tile",
          x: i,
          y: 0,
          z: 0,
          yaw: 0,
        },
      ],
    };
    h.record(value, next);
    value = next;
  }
  let count = 0;
  while (h.canUndo) {
    value = h.undo(value)!;
    count++;
  }
  expect(count).toBe(50);
  expect(new Set(editorCatalog.map((s) => s.visual.asset)).size).toBe(23);
  expect(
    editorCatalog.filter((s) => s.visual.asset === "space-decoration-kit"),
  ).toHaveLength(7);
});
