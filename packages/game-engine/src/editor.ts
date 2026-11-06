import * as pc from "playcanvas";
import {
  applyLayout,
  emptyLayout,
  editableVisuals,
  canRotateLayoutObject,
  validateLayout,
} from "@minimorph/game-content";
import type { LayoutObject } from "@minimorph/game-content";
import { createCosmicScene } from "./cosmic-scene";
import { createPolishLighting } from "./polish-lighting";
import { createPlayer } from "./physics";
import "./editor.css";
/** Preview-only authoring mode: no player, sockets or persisted production overrides. */
export function mountLevelEditor(host: HTMLElement) {
  host.innerHTML = `<main class="level-editor"><header><b>Minimorph · Level Editor v0.1</b><button data-export>Save / Export JSON</button><button data-import>Import JSON</button><input data-file type="file" accept=".json,application/json" hidden><button data-reset>Reset layout</button><a href="/">Back to game</a></header><aside><h3>Cosmic Sprint</h3><p>Draft only · export never changes the published game.</p><div data-hierarchy></div></aside><section class="editor-viewport"><canvas aria-label="Cosmic Sprint editor viewport"></canvas><nav><button data-top>Top-down</button><button data-focus>Focus selection</button><span>Click: select · right drag: orbit · middle / Shift drag: pan · wheel: zoom · arrows: move gizmo on X/Z</span></nav><output data-status role="status">Loading actual GLB scene…</output></section><aside><h3>Selected object</h3><div data-inspector></div><p>Spawn, finish, checkpoints, decoration and bot routes are read-only. Moving platforms does not regenerate routes. Export and review before use in gameplay.</p></aside></main>`;
  const q = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
  const canvas = q<HTMLCanvasElement>("canvas"),
    status = q<HTMLOutputElement>("[data-status]");
  canvas.tabIndex = 0;
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
      deviceTypes: ["webgl2"],
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    },
  });
  app.setCanvasFillMode(
    pc.FILLMODE_NONE,
    canvas.parentElement!.clientWidth,
    canvas.parentElement!.clientHeight,
  );
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  const camera = new pc.Entity("Follow camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color().fromString("#101a38"),
    farClip: 1500,
    nearClip: 0.1,
    fov: 58,
  });
  app.root.addChild(camera);
  const lighting = createPolishLighting(app);
  let layout = emptyLayout(),
    arena = applyLayout(layout),
    selected = "",
    dragging = false,
    gizmoGesture = false;
  const scene = createCosmicScene(
    app,
    arena,
    (s) => {
      status.textContent = s.error
        ? `Asset error: ${s.error}. Reload to retry.`
        : s.loaded === s.total && s.ready
          ? `GLBs ready (${s.loaded}/${s.total}) · unsaved local draft`
          : `Loading GLBs ${s.loaded}/${s.total}…`;
    },
    true,
  );
  const state = createPlayer(arena);
  const anchor = new pc.Entity("Editor transform anchor");
  app.root.addChild(anchor);
  const layer = pc.Gizmo.createLayer(app);
  camera.camera!.layers = [...camera.camera!.layers, layer.id];
  const gizmo = new pc.TranslateGizmo(camera.camera!, layer);
  gizmo.mouseButtons[1] = false;
  gizmo.mouseButtons[2] = false;
  gizmo.enableShape("y", false);
  gizmo.enableShape("xy", false);
  gizmo.enableShape("yz", false);
  gizmo.enableShape("xyz", false);
  const target = new pc.Vec3(38, 0, -90);
  let distance = 270,
    azimuth = 0.35,
    elevation = 1.15;
  function positionCamera() {
    const c = Math.cos(elevation);
    camera.setPosition(
      target.x + distance * c * Math.sin(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * c * Math.cos(azimuth),
    );
    camera.lookAt(target);
  }
  positionCamera();
  function focus() {
    const v = arena.visuals!.find((v) => v.id === selected);
    if (v) {
      target.set(v.x, v.y, v.z);
      distance = Math.max(18, Math.max(v.width, v.depth) * 2.2);
      positionCamera();
    }
  }
  function object(): LayoutObject | undefined {
    const v = arena.visuals!.find((v) => v.id === selected);
    if (!v) return;
    const existing = layout.objects.find((o) => o.id === selected);
    if (existing) return existing;
    if (!editableVisuals().some((s) => s.id === selected)) return;
    return {
      id: v.id,
      sourceId: v.id,
      x: v.x,
      y: v.y,
      z: v.z,
      yaw: v.yaw ?? 0,
    };
  }
  function setObject(o: LayoutObject) {
    const next = structuredClone(layout),
      i = next.objects.findIndex((v) => v.id === o.id);
    if (i >= 0) next.objects[i] = o;
    else next.objects.push(o);
    const validated = validateLayout(next),
      nextArena = applyLayout(validated);
    layout = validated;
    arena = nextArena;
    scene.setLayout(arena);
    scene.update(state, true);
    canvas.dataset.layout = JSON.stringify(layout);
    canvas.dataset.editorSelected = selected;
  }
  function inspector() {
    const box = q("[data-inspector]");
    box.replaceChildren();
    const name = document.createElement("p");
    name.textContent = selected || "Click an object or select it in the list.";
    box.append(name);
    const o = object();
    gizmo.detach();
    if (!o) {
      const p = document.createElement("p");
      p.textContent = "Read-only: fixed marker / decoration / navigation.";
      box.append(p);
      return;
    }
    anchor.setPosition(o.x, o.y, o.z);
    gizmo.attach([anchor]);
    for (const key of ["x", "y", "z", "yaw"] as const) {
      const label = document.createElement("label");
      label.textContent =
        key === "yaw" ? "Rotation Y (degrees)" : key.toUpperCase();
      const input = document.createElement("input");
      input.type = "number";
      input.step = key === "yaw" ? "1" : "0.25";
      input.dataset.property = key;
      input.value = String(key === "yaw" ? (o.yaw * 180) / Math.PI : o[key]);
      input.disabled = key === "yaw" && !canRotateLayoutObject(o.sourceId);
      input.addEventListener("change", () => {
        try {
          const n = Number(input.value);
          if (input.value.trim() === "") throw Error("Enter a number.");
          setObject({
            ...object()!,
            [key]: key === "yaw" ? (n * Math.PI) / 180 : n,
          });
          inspector();
        } catch (e) {
          status.textContent = String(e);
          input.value = String(
            key === "yaw" ? (o.yaw * 180) / Math.PI : o[key],
          );
        }
      });
      label.append(input);
      box.append(label);
    }
    const info = document.createElement("p");
    info.textContent = canRotateLayoutObject(o.sourceId)
      ? "Linked: visual + platform collision surface."
      : "Linked: visual + mechanism / trigger. Rotation locked: this mechanism has no arbitrary yaw support in shared physics.";
    box.append(info);
    for (const [text, action] of [
      [
        "Duplicate",
        () => {
          const copy = {
            ...object()!,
            id: `editor-${crypto.randomUUID()}`,
            x: object()!.x + 5,
          };
          setObject(copy);
          selected = copy.id;
          refresh();
        },
      ],
      [
        "Delete",
        () => {
          setObject({ ...object()!, deleted: true });
          selected = "";
          refresh();
        },
      ],
    ] as const) {
      const button = document.createElement("button");
      button.textContent = text;
      button.addEventListener("click", () => {
        try {
          action();
        } catch (e) {
          status.textContent = String(e);
        }
      });
      box.append(button);
    }
  }
  function select(id: string) {
    selected = id;
    canvas.dataset.editorSelected = id;
    inspector();
    for (const b of q("[data-hierarchy]").querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(b.dataset.object === id));
  }
  function refresh() {
    const list = q("[data-hierarchy]");
    list.replaceChildren();
    for (const v of arena.visuals!) {
      const b = document.createElement("button");
      b.dataset.object = v.id;
      b.textContent = `${editableVisuals().some((s) => s.id === v.id) || layout.objects.some((o) => o.id === v.id) ? "" : "🔒 "}${v.id}`;
      b.addEventListener("click", () => select(v.id));
      list.append(b);
    }
    select(selected);
  }
  gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMSTART, () => {
    dragging = true;
    gizmoGesture = true;
  });
  gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMMOVE, () => {
    const o = object();
    if (!o) return;
    const p = anchor.getPosition();
    try {
      setObject({ ...o, x: p.x, z: p.z });
      for (const key of ["x", "z"] as const)
        q<HTMLInputElement>(`[data-property="${key}"]`).value = String(p[key]);
    } catch (e) {
      anchor.setPosition(o.x, o.y, o.z);
      status.textContent = String(e);
    }
  });
  gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMEND, () => {
    dragging = false;
    inspector();
  });
  let pointer:
    | { x: number; y: number; button: number; shift: boolean }
    | undefined;
  const listeners = new AbortController(),
    opts = { signal: listeners.signal };
  canvas.addEventListener("contextmenu", (e) => e.preventDefault(), opts);
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      pointer = {
        x: e.clientX,
        y: e.clientY,
        button: e.button,
        shift: e.shiftKey,
      };
      if (e.button !== 0 || e.shiftKey) canvas.setPointerCapture(e.pointerId);
    },
    opts,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!pointer || dragging) return;
      const dx = e.clientX - pointer.x,
        dy = e.clientY - pointer.y;
      if (pointer.button === 2 && !pointer.shift) {
        azimuth -= dx * 0.006;
        elevation = Math.max(
          0.08,
          Math.min(Math.PI / 2 - 0.002, elevation + dy * 0.006),
        );
      } else if (pointer.button === 1 || pointer.shift) {
        const s = distance * 0.0015;
        target.x += (-dx * Math.cos(azimuth) + dy * Math.sin(azimuth)) * s;
        target.z += (dx * Math.sin(azimuth) + dy * Math.cos(azimuth)) * s;
      } else return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      positionCamera();
    },
    opts,
  );
  canvas.addEventListener(
    "pointerup",
    (e) => {
      const p = pointer;
      pointer = undefined;
      if (gizmoGesture) {
        gizmoGesture = false;
        return;
      }
      if (
        !p ||
        p.button !== 0 ||
        p.shift ||
        dragging ||
        Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4
      )
        return;
      const rect = canvas.getBoundingClientRect(),
        from = camera.camera!.screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          0.1,
        ),
        to = camera.camera!.screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          1500,
        ),
        ray = new pc.Ray(from, to.sub(from).normalize()),
        hit = new pc.Vec3();
      let best = Infinity,
        id = "";
      for (const v of arena.visuals!) {
        const bounds = scene.placementBounds(v.id);
        if (bounds?.intersectsRay(ray, hit)) {
          const d = from.distance(hit);
          if (d < best) {
            best = d;
            id = v.id;
          }
        }
      }
      if (id) select(id);
    },
    opts,
  );
  canvas.addEventListener(
    "keydown",
    (e) => {
      const o = object();
      if (
        !o ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      )
        return;
      e.preventDefault();
      setObject({
        ...o,
        x: o.x + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0),
        z: o.z + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0),
      });
      inspector();
    },
    opts,
  );
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      distance = Math.max(
        8,
        Math.min(700, distance * Math.exp(e.deltaY * 0.001)),
      );
      positionCamera();
    },
    { ...opts, passive: false },
  );
  q("[data-top]").addEventListener("click", () => {
    target.set(38, 0, -90);
    distance = 290;
    elevation = Math.PI / 2 - 0.002;
    azimuth = 0;
    positionCamera();
  });
  q("[data-focus]").addEventListener("click", focus);
  q("[data-export]").addEventListener("click", () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(validateLayout(layout), null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "minimorph-cosmic-sprint-layout-v1.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  q("[data-import]").addEventListener("click", () =>
    q<HTMLInputElement>("[data-file]").click(),
  );
  q<HTMLInputElement>("[data-file]").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    try {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 256 * 1024) throw Error("JSON exceeds 256 KiB.");
      const next = validateLayout(JSON.parse(await file.text())),
        nextArena = applyLayout(next);
      layout = next;
      arena = nextArena;
      selected = "";
      scene.setLayout(arena);
      canvas.dataset.layout = JSON.stringify(layout);
      refresh();
      status.textContent = "Imported local draft. Gameplay links preserved.";
    } catch (error) {
      status.textContent = `Import rejected: ${String(error)}`;
    } finally {
      input.value = "";
    }
  });
  q("[data-reset]").addEventListener("click", () => {
    layout = emptyLayout();
    arena = applyLayout(layout);
    selected = "";
    scene.setLayout(arena);
    canvas.dataset.layout = JSON.stringify(layout);
    refresh();
    status.textContent = "Original PR #13 layout restored.";
  });
  const resize = new ResizeObserver(() =>
    app.resizeCanvas(
      canvas.parentElement!.clientWidth,
      canvas.parentElement!.clientHeight,
    ),
  );
  resize.observe(canvas.parentElement!);
  app.on("update", () => {
    scene.update(state, true);
    const bounds = scene.placementBounds(selected);
    if (bounds) {
      const a = bounds.getMin(),
        b = bounds.getMax(),
        corners = Array.from(
          { length: 8 },
          (_, i) =>
            new pc.Vec3(
              i & 1 ? b.x : a.x,
              i & 2 ? b.y : a.y,
              i & 4 ? b.z : a.z,
            ),
        );
      for (let i = 0; i < 8; i++)
        for (const bit of [1, 2, 4])
          if (!(i & bit))
            app.drawLine(corners[i], corners[i | bit], pc.Color.YELLOW);
    }
  });
  scene.setOverview(true);
  refresh();
  app.start();
  return {
    destroy() {
      listeners.abort();
      resize.disconnect();
      gizmo.destroy();
      scene.destroy();
      lighting.destroy();
      app.destroy();
      host.replaceChildren();
    },
  };
}
