import * as pc from "playcanvas";
import {
  applyLayout,
  emptyLayout,
  editableVisuals,
  canRotateLayoutObject,
  validateLayout,
  editorCatalog,
  layoutSource,
  defaultColliders,
  colliderTransform,
  publishedLayoutOverride,
  authoringObject,
  decorativeObject,
  selectionPivot,
  transformSelection,
  groupSelection,
  ungroupSelection,
  duplicateSelection,
  deleteSelection,
  setAuthoringMetadata,
} from "@minimorph/game-content";
import type {
  ArenaConfig,
  LayoutObject,
  LayoutOverride,
  LayoutCollider,
  EnvironmentObject,
  EnvironmentAnimationType,
} from "@minimorph/game-content";
import { createCosmicScene } from "./cosmic-scene";
import { createPolishLighting } from "./polish-lighting";
import { createPlayer } from "./physics";
import "./editor.css";
import { createColliderOverlays } from "./collider-overlays";
import { EditorHistory } from "./editor-history";
import { editorAssetUrls } from "./editor-assets";
/** Preview-only authoring mode: no player, sockets or persisted production overrides. */
export function mountLevelEditor(
  host: HTMLElement,
  launchPlaytest: (
    host: HTMLElement,
    arena: ArenaConfig,
    environmentUrls: { [key: string]: string },
    onExit: () => void,
  ) => { destroy(): void },
) {
  host.innerHTML = `<main class="level-editor"><header><b>Minimorph · Galactic Fun Park · Environment Tools</b><button data-playtest class="editor-playtest-button">▶ Playtest</button><label><input type="checkbox" data-show-colliders>Show Colliders</label><label><input type="checkbox" data-collider-mode>Collider Edit Mode</label><label><input type="checkbox" data-show-environment checked>Environment layer</label><button data-group>Group</button><button data-ungroup>Ungroup</button><button data-duplicate-selection>Duplicate selection</button><button data-delete-selection>Delete selection</button><button data-undo disabled>Undo</button><button data-redo disabled>Redo</button><button data-export>Save / Export JSON</button><button data-import>Import JSON</button><input data-file type="file" accept=".json,application/json" hidden><button data-reset>Reset layout</button><a href="/">Back to game</a></header><aside><h3>Cosmic Sprint</h3><p>Draft only · export never changes the published game.</p><h3>Asset catalog · 23 GLBs</h3><input data-asset-search aria-label="Search assets" placeholder="Search prepared assets"><select data-catalog aria-label="Asset catalog"></select><select data-add-at aria-label="Placement location"><option value="target">At camera target</option><option value="selection">At selected object</option></select><select data-add-layer aria-label="Object layer"><option value="gameplay">Gameplay / colliders</option><option value="environment">Environment · NON-COLLIDABLE</option></select><select data-environment-category aria-label="Environment category"><option>planet</option><option>island</option><option>cloud</option><option>satellite</option><option>star</option><option>rocket</option><option>structure</option></select><button data-add>Add selected asset</button><p data-catalog-note></p><h3>Scene objects</h3><div data-hierarchy></div></aside><section class="editor-viewport"><canvas aria-label="Cosmic Sprint editor viewport"></canvas><nav><button data-top>Top-down</button><button data-focus>Focus selection</button><span>Click: select · right drag: orbit · middle / Shift drag: pan · wheel: zoom · arrows: move gizmo on X/Z</span></nav><output data-status role="status">Loading actual GLB scene…</output></section><aside><h3>Selected object</h3><div data-inspector></div><p>Spawn, finish, checkpoints, decoration and bot routes are read-only. Moving platforms does not regenerate routes. Export and review before use in gameplay.</p></aside></main>`;
  let playtestSession: { destroy(): void } | undefined;
  const editorElement = host.querySelector<HTMLElement>(".level-editor")!;
  const playtestHost = document.createElement("div");
  host.append(playtestHost);
  const q = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
  const canvas = q<HTMLCanvasElement>("canvas"),
    status = q<HTMLOutputElement>("[data-status]");
  canvas.tabIndex = 0;
  canvas.id = "minimorph-editor";
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
    farClip: 8000,
    nearClip: 0.1,
    fov: 58,
  });
  app.root.addChild(camera);
  const lighting = createPolishLighting(app);
  let layout = structuredClone(publishedLayoutOverride),
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
    editorAssetUrls,
  );
  const overlays = createColliderOverlays(app);
  overlays.build(arena);
  let colliderMode = false,
    selectedCollider = "";
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
  let selection = new Set<string>(),
    environmentTime = 0;
  positionCamera();
  function focus() {
    const ids = selection.size ? [...selection] : selected ? [selected] : [];
    scene.setEditorFocus(ids);
    const bounds = ids
      .map((id) => scene.placementBounds(id))
      .filter((b): b is pc.BoundingBox => !!b);
    if (!bounds.length) return;
    const box = bounds[0].clone();
    for (const b of bounds.slice(1)) box.add(b);
    target.copy(box.center);
    const radius = Math.max(5, box.halfExtents.length());
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight),
      half = Math.atan(Math.tan((29 * Math.PI) / 180) * Math.min(1, aspect));
    distance = Math.min(6000, Math.max(18, (radius / Math.sin(half)) * 1.2));
    positionCamera();
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
  const history = new EditorHistory();
  function updateHistoryButtons() {
    q<HTMLButtonElement>("[data-undo]").disabled = !history.canUndo;
    q<HTMLButtonElement>("[data-redo]").disabled = !history.canRedo;
  }
  function applyDraft(next: LayoutOverride, remember = true) {
    const validated = validateLayout(next),
      nextArena = applyLayout(validated);
    if (remember) history.record(layout, validated);
    layout = validated;
    arena = nextArena;
    scene.setLayout(arena);
    overlays.build(arena);
    scene.update(state, true);
    scene.setEditorHidden(
      layout.objects.filter((o) => o.visible === false).map((o) => o.id),
    );
    canvas.dataset.layout = JSON.stringify(layout);
    canvas.dataset.editorSelected = selected;
    updateHistoryButtons();
  }
  function traverseHistory(redo: boolean) {
    if (dragging) return;
    const next = redo ? history.redo(layout) : history.undo(layout);
    if (!next) return;
    applyDraft(next, false);
    selection = new Set(
      [...selection].filter((id) => authoringObject(layout, id)),
    );
    if (!authoringObject(layout, selected)) selected = "";
    scene.setEditorFocus([]);
    refresh();
  }
  q("[data-undo]").addEventListener("click", () => traverseHistory(false));
  q("[data-redo]").addEventListener("click", () => traverseHistory(true));
  window.addEventListener("keydown", historyShortcut);
  function historyShortcut(e: KeyboardEvent) {
    if (playtestSession) return;
    if (
      !(e.ctrlKey || e.metaKey) ||
      e.altKey ||
      !["z", "y"].includes(e.key.toLowerCase())
    )
      return;
    e.preventDefault();
    traverseHistory(e.key.toLowerCase() === "y" || e.shiftKey);
  }
  function setObject(o: LayoutObject) {
    const old = authoringObject(layout, o.id);
    if (old?.locked) {
      const before = { ...old },
        after = { ...o };
      delete before.locked;
      delete after.locked;
      delete before.visible;
      delete after.visible;
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw Error("Unlock the object before editing.");
    }
    const next = structuredClone(layout),
      i = next.objects.findIndex((v) => v.id === o.id);
    if (i >= 0) next.objects[i] = o;
    else next.objects.push(o);
    applyDraft(next);
  }

  function specs(o: LayoutObject) {
    return o.colliders ?? defaultColliders(o.sourceId);
  }
  function selectedSpec() {
    const o = object();
    return o ? specs(o).find((c) => c.id === selectedCollider) : undefined;
  }
  function saveCollider(c: LayoutCollider) {
    const o = object()!;
    const colliders = structuredClone(specs(o));
    const i = colliders.findIndex((v) => v.id === c.id);
    if (i >= 0) colliders[i] = c;
    else colliders.push(c);
    setObject({ ...o, colliders });
  }
  function colliderInspector(box: HTMLElement, o: LayoutObject) {
    const title = document.createElement("p");
    title.textContent =
      "Parent-local collider offsets. Editing these never changes the GLB.";
    box.append(title);
    for (const c of specs(o)) {
      const b = document.createElement("button");
      b.dataset.collider = c.id;
      b.textContent = `${c.id} · ${c.kind}`;
      b.addEventListener("click", () => {
        selectedCollider = c.id;
        inspector();
      });
      box.append(b);
    }
    const types = document.createElement("select");
    types.dataset.colliderType = "";
    types.setAttribute("aria-label", "New collider type");
    for (const [value, label] of [
      ["surface", "Walkable surface"],
      ["solid", "Solid box + walkable top"],
      ["hazard", "Hazard box (knockback)"],
      ["bounce", "Bounce trigger / landing"],
      ["turbo", "Turbo trigger (non-solid)"],
    ]) {
      const op = document.createElement("option");
      op.value = value;
      op.textContent = label;
      types.append(op);
    }
    box.append(types);
    const add = document.createElement("button");
    add.dataset.addCollider = "";
    add.textContent = "Add Collider";
    add.addEventListener("click", () => {
      try {
        const c: LayoutCollider = {
          id: crypto.randomUUID(),
          kind: types.value as LayoutCollider["kind"],
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          width: 5,
          depth: 5,
          height: 1,
        };
        saveCollider(c);
        selectedCollider = c.id;
        inspector();
      } catch (e) {
        status.textContent = String(e);
      }
    });
    box.append(add);
    const c = selectedSpec();
    if (!c) return;
    const t = colliderTransform(o, c);
    anchor.setPosition(t.x, t.y, t.z);
    gizmo.attach([anchor]);
    const fields = [
      "x",
      "y",
      "z",
      "yaw",
      "width",
      "depth",
      "height",
      ...(c.radius === undefined ? [] : ["radius"]),
      ...(c.kind === "hazard"
        ? ["strength"]
        : c.kind === "bounce"
          ? ["boost"]
          : c.kind === "turbo"
            ? ["multiplier", "duration"]
            : []),
    ] as const;
    for (const key of fields) {
      const label = document.createElement("label");
      label.textContent =
        key === "yaw" ? "Local Y rotation (degrees)" : `Collider ${key}`;
      const input = document.createElement("input");
      input.type = "number";
      input.step = ".1";
      input.dataset.colliderProperty = key;
      const value =
        c[key as keyof LayoutCollider] ??
        (key === "strength"
          ? 8
          : key === "boost"
            ? 10.5
            : key === "multiplier"
              ? 1.5
              : key === "duration"
                ? 5
                : 0);
      input.value = String(
        key === "yaw" ? (Number(value) * 180) / Math.PI : value,
      );
      input.disabled =
        (c.kind === "surface" && key === "height") ||
        (c.radius !== undefined && (key === "width" || key === "depth"));
      input.addEventListener("change", () => {
        try {
          if (!input.value.trim()) throw Error("Enter a number");
          saveCollider({
            ...c,
            [key]: Number(input.value) * (key === "yaw" ? Math.PI / 180 : 1),
          });
          inspector();
        } catch (e) {
          status.textContent = String(e);
          input.value = String(value);
        }
      });
      label.append(input);
      box.append(label);
    }
    const remove = document.createElement("button");
    remove.textContent = "Delete Collider";
    remove.addEventListener("click", () => {
      setObject({ ...o, colliders: specs(o).filter((v) => v.id !== c.id) });
      selectedCollider = "";
      inspector();
    });
    box.append(remove);
  }
  function selectionIds() {
    return selection.size ? [...selection] : selected ? [selected] : [];
  }
  function notifyError(action: () => void) {
    try {
      action();
    } catch (e) {
      status.textContent = String(e);
    }
  }
  function transformChosen(change: Parameters<typeof transformSelection>[2]) {
    applyDraft(transformSelection(layout, selectionIds(), change));
    inspector();
  }
  function groupInspector(box: HTMLElement) {
    const ids = selectionIds(),
      pivot = selectionPivot(layout, ids),
      locked = ids.some((id) => authoringObject(layout, id)?.locked);
    const p = document.createElement("p");
    p.textContent = `${ids.length} decorations/environment objects selected. Group transforms preserve parent-local colliders.${locked ? " Unlock members to transform." : ""}`;
    box.append(p);
    if (!locked) {
      anchor.setPosition(pivot.x, pivot.y, pivot.z);
      gizmo.attach([anchor]);
    }
    for (const key of ["x", "y", "z", "yaw", "scale"] as const) {
      const label = document.createElement("label");
      label.textContent =
        key === "yaw"
          ? "Rotate selection Y (degrees)"
          : key === "scale"
            ? "Scale selection (factor)"
            : `Selection ${key}`;
      const input = document.createElement("input");
      input.type = "number";
      input.step = key === "scale" ? ".1" : "1";
      input.disabled = locked;
      input.dataset.groupProperty = key;
      input.value = String(
        key === "yaw" ? 0 : key === "scale" ? 1 : pivot[key],
      );
      input.addEventListener("change", () =>
        notifyError(() => {
          const value = Number(input.value);
          if (!input.value.trim()) throw Error("Enter a number");
          transformChosen({
            [key]:
              key === "yaw"
                ? (value * Math.PI) / 180
                : key === "scale"
                  ? value
                  : value - pivot[key],
          });
        }),
      );
      label.append(input);
      box.append(label);
    }
  }
  function setEnvironment(o: EnvironmentObject) {
    const before = layout.environment?.find((e) => e.id === o.id);
    if (before?.locked) {
      const a = { ...before },
        b = { ...o };
      delete a.locked;
      delete b.locked;
      delete a.visible;
      delete b.visible;
      if (JSON.stringify(a) !== JSON.stringify(b))
        throw Error("Unlock the object before editing.");
    }
    applyDraft({
      ...layout,
      environment: layout.environment!.map((e) => (e.id === o.id ? o : e)),
    });
  }
  function metadataControls(box: HTMLElement, id: string) {
    const o = authoringObject(layout, id);
    if (!o) return;
    for (const key of ["visible", "locked"] as const) {
      const label = document.createElement("label");
      label.textContent =
        key === "visible"
          ? "Visible (gameplay objects: editor only)"
          : "Locked against editing";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = key === "visible" ? o.visible !== false : !!o.locked;
      input.dataset.metadata = key;
      input.addEventListener("change", () =>
        notifyError(() => {
          applyDraft(
            setAuthoringMetadata(layout, id, { [key]: input.checked }),
          );
          refresh();
        }),
      );
      label.append(input);
      box.append(label);
    }
  }
  function environmentInspector(box: HTMLElement, o: EnvironmentObject) {
    metadataControls(box, o.id);
    const note = document.createElement("p");
    note.textContent =
      "Environment layer: presentation only, never collidable. Categories label reused GLB parts; no physics bodies or gameplay animation.";
    box.append(note);
    if (!o.locked && scene.isVisible(o.id)) {
      anchor.setPosition(o.x, o.y, o.z);
      gizmo.attach([anchor]);
    }
    for (const key of [
      "x",
      "y",
      "z",
      "yaw",
      "scale",
      "viewDistance",
    ] as const) {
      const label = document.createElement("label");
      label.textContent = key === "yaw" ? "Rotation Y (degrees)" : key;
      const input = document.createElement("input");
      input.type = "number";
      input.step = ".1";
      input.disabled = !!o.locked;
      input.dataset.environmentProperty = key;
      input.value = String(key === "yaw" ? (o.yaw * 180) / Math.PI : o[key]);
      input.addEventListener("change", () =>
        notifyError(() => {
          if (!input.value.trim()) throw Error("Enter a number");
          setEnvironment({
            ...o,
            [key]: Number(input.value) * (key === "yaw" ? Math.PI / 180 : 1),
          });
          inspector();
        }),
      );
      label.append(input);
      box.append(label);
    }
    const type = document.createElement("select");
    type.dataset.environmentAnimation = "";
    type.setAttribute("aria-label", "Environment animation");
    type.disabled = !!o.locked;
    for (const [value, label] of [
      ["none", "No animation"],
      ["rotate", "Slow rotation"],
      ["bob", "Gentle floating"],
      ["orbit", "Orbital movement"],
      ["pulse", "Emissive pulsing"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      type.append(option);
    }
    type.value = o.animation.type;
    type.addEventListener("change", () =>
      notifyError(() => {
        setEnvironment({
          ...o,
          animation: {
            ...o.animation,
            type: type.value as EnvironmentAnimationType,
            amplitude: Math.min(
              o.animation.amplitude,
              type.value === "pulse" ? 2 : 100,
            ),
          },
        });
        inspector();
      }),
    );
    box.append(type);
    for (const key of ["speed", "amplitude"] as const) {
      const label = document.createElement("label");
      label.textContent = `Animation ${key}`;
      const input = document.createElement("input");
      input.type = "number";
      input.step = ".1";
      input.disabled = !!o.locked;
      input.dataset.animationProperty = key;
      input.value = String(o.animation[key]);
      input.addEventListener("change", () =>
        notifyError(() => {
          if (!input.value.trim()) throw Error("Enter a number");
          setEnvironment({
            ...o,
            animation: { ...o.animation, [key]: Number(input.value) },
          });
          inspector();
        }),
      );
      label.append(input);
      box.append(label);
    }
  }
  function inspector() {
    const box = q("[data-inspector]");
    box.replaceChildren();
    const name = document.createElement("p");
    name.textContent = selected || "Click an object or select it in the list.";
    box.append(name);
    const o = object();
    gizmo.detach();
    if (selection.size > 1) {
      groupInspector(box);
      return;
    }
    const env = layout.environment?.find((o) => o.id === selected);
    if (env) {
      environmentInspector(box, env);
      return;
    }
    if (o) {
      metadataControls(box, o.id);
      if (o.locked) {
        const locked = document.createElement("p");
        locked.textContent = "Locked. Unlock to move or edit colliders.";
        box.append(locked);
        return;
      }
    }
    if (!o && colliderMode && /^checkpoint-\d+$/.test(selected)) {
      const index = Number(selected.slice("checkpoint-".length)),
        cp = arena.checkpoints[index];
      const note = document.createElement("p");
      note.textContent =
        "Checkpoint trigger: yellow. Position stays fixed; radius/enabled are independent of gate art.";
      box.append(note);
      const radius = document.createElement("input");
      radius.type = "number";
      radius.step = ".1";
      radius.value = String(cp.radius);
      radius.setAttribute("aria-label", "Checkpoint radius");
      box.append(radius);
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = cp.enabled !== false;
      enabled.setAttribute("aria-label", "Checkpoint enabled");
      box.append(enabled);
      const save = () => {
        try {
          const checkpoints = (layout.checkpoints ?? []).filter(
            (c) => c.index !== index,
          );
          checkpoints.push({
            index,
            radius: Number(radius.value),
            enabled: enabled.checked,
          });
          applyDraft({ ...layout, checkpoints });
          inspector();
        } catch (e) {
          status.textContent = String(e);
        }
      };
      radius.addEventListener("change", save);
      enabled.addEventListener("change", save);
      return;
    }
    if (!o) {
      const p = document.createElement("p");
      p.textContent = "Read-only: fixed marker / decoration / navigation.";
      box.append(p);
      return;
    }
    if (colliderMode) {
      colliderInspector(box, o);
      return;
    }
    const colliderButton = document.createElement("button");
    colliderButton.textContent = "Edit Colliders";
    colliderButton.addEventListener("click", () => {
      colliderMode = true;
      q<HTMLInputElement>("[data-collider-mode]").checked = true;
      q<HTMLInputElement>("[data-show-colliders]").checked = true;
      overlays.root.enabled = true;
      selectedCollider = specs(o)[0]?.id ?? "";
      inspector();
    });
    box.append(colliderButton);
    anchor.setPosition(o.x, o.y, o.z);
    gizmo.attach([anchor]);
    for (const key of [
      "x",
      "y",
      "z",
      "yaw",
      "width",
      "depth",
      "scale",
      "impactStrength",
    ] as const) {
      const label = document.createElement("label");
      const source = layoutSource(o.sourceId)!;
      label.textContent =
        key === "yaw"
          ? "Rotation Y (degrees)"
          : key === "impactStrength"
            ? "Impact Strength"
            : key === "width" || key === "depth"
              ? `Base ${key} (m)`
              : key === "scale"
                ? "Uniform scale"
                : key.toUpperCase();
      const input = document.createElement("input");
      input.type = "number";
      input.step = key === "yaw" ? "1" : "0.25";
      input.dataset.property = key;
      const current =
        key === "width" || key === "depth"
          ? (o[key] ?? source.visual[key])
          : key === "scale"
            ? (o.scale ?? 1)
            : key === "impactStrength"
              ? (o.impactStrength ?? source.mechanism?.impactStrength ?? 8)
              : key === "yaw"
                ? (o.yaw * 180) / Math.PI
                : o[key];
      input.value = String(current);
      input.disabled =
        (key === "yaw" && !canRotateLayoutObject(o.sourceId)) ||
        ((key === "width" || key === "depth") &&
          (!source.platform || source.platform.radius !== undefined)) ||
        (key === "impactStrength" &&
          !["sweeper", "pusher"].includes(source.mechanism?.kind ?? ""));
      if (key === "scale") {
        input.min = ".1";
        input.max = source.mechanism ? "2" : "4";
        input.step = ".1";
      }
      if (key === "impactStrength") {
        input.min = "2";
        input.max = "24";
        input.step = "1";
      }
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
          input.value = String(current);
        }
      });
      label.append(input);
      box.append(label);
    }
    const info = document.createElement("p");
    const source = layoutSource(o.sourceId)!;
    info.textContent =
      source.category === "decoration" && !o.colliders?.length
        ? "NON-COLLIDABLE decoration. No walkable surface, barrier or trigger. Uniform scale only."
        : source.platform
          ? "Linked collision surface. Width/depth and uniform scale affect art + collision. Circular floors: uniform scale only. Surface elevation: Y; thickness is not supported by the planar physics."
          : "Linked mechanism/trigger. Uniform scale (0.1–2) updates collision dimensions. Rotation and individual dimensions are locked to preserve supported collision rules.";
    box.append(info);
    for (const [text, action] of [
      [
        "Duplicate",
        () => {
          const copy = duplicateSelection(layout, [object()!.id]);
          applyDraft(copy.layout);
          selection = new Set(copy.ids);
          selected = copy.ids[0];
          refresh();
        },
      ],
      [
        "Delete",
        () => {
          applyDraft(deleteSelection(layout, [object()!.id]));
          selection.clear();
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
  function select(id: string, additive = false, preserve = false) {
    if (!preserve) {
      scene.setEditorFocus([]);
      if (additive && !colliderMode && decorativeObject(layout, id)) {
        if ([...selection].some((v) => !decorativeObject(layout, v)))
          selection.clear();
        if (selection.has(id)) selection.delete(id);
        else selection.add(id);
      } else {
        const group = !colliderMode
          ? layout.groups?.find((g) => g.members.includes(id))
          : undefined;
        selection = new Set(group?.members ?? (id ? [id] : []));
      }
    }
    const primary = selection.has(id) ? id : ([...selection][0] ?? "");
    if (selected !== primary) selectedCollider = "";
    selected = primary;
    canvas.dataset.editorSelected = selected;
    canvas.dataset.editorSelection = JSON.stringify([...selection]);
    inspector();
    for (const button of q(
      "[data-hierarchy]",
    ).querySelectorAll<HTMLButtonElement>("[data-object]"))
      button.setAttribute(
        "aria-pressed",
        String(selection.has(button.dataset.object!)),
      );
  }
  function refresh() {
    const list = q("[data-hierarchy]");
    list.replaceChildren();
    for (const group of layout.groups ?? []) {
      const b = document.createElement("button");
      b.dataset.group = group.id;
      b.textContent = `▣ ${group.name} (${group.members.length})`;
      b.addEventListener("click", () => {
        selection = new Set(group.members);
        select(group.members[0], false, true);
      });
      list.append(b);
    }
    for (const [layer, visuals] of [
      ["Gameplay / decorative geometry", arena.visuals ?? []],
      ["Environment · no collisions", arena.environment ?? []],
    ] as const) {
      const label = document.createElement("h4");
      label.textContent = layer;
      list.append(label);
      for (const v of visuals) {
        const row = document.createElement("div");
        row.className = "editor-object-row";
        const b = document.createElement("button");
        b.dataset.object = v.id;
        const o = authoringObject(layout, v.id),
          source = o ? layoutSource(o.sourceId) : undefined;
        b.textContent = `${v.environment ? "☄ " : source?.category === "decoration" ? (o && "colliders" in o && o.colliders?.length ? "[colliders] " : "[decor] ") : source ? "" : "🔒 "}${v.id.startsWith("editor-") || v.id.startsWith("environment-") ? `${v.asset}${v.part === undefined ? "" : ` / ${v.part}`} · ${v.id.slice(-8)}` : v.id}`;
        b.disabled = !!o?.locked;
        b.addEventListener("click", (e) =>
          select(v.id, e.ctrlKey || e.metaKey),
        );
        row.append(b);
        if (o)
          for (const key of ["visible", "locked"] as const) {
            const toggle = document.createElement("button");
            toggle.dataset[
              key === "visible" ? "toggleVisible" : "toggleLocked"
            ] = v.id;
            toggle.textContent =
              key === "visible"
                ? o.visible === false
                  ? "Show"
                  : "Hide"
                : o.locked
                  ? "Unlock"
                  : "Lock";
            toggle.setAttribute("aria-label", `${toggle.textContent} ${v.id}`);
            toggle.addEventListener("click", () =>
              notifyError(() => {
                applyDraft(
                  setAuthoringMetadata(layout, v.id, {
                    [key]: key === "visible" ? o.visible === false : !o.locked,
                  }),
                );
                refresh();
              }),
            );
            row.append(toggle);
          }
        list.append(row);
      }
    }
    const ids = new Set(
      [...(arena.visuals ?? []), ...(arena.environment ?? [])].map((v) => v.id),
    );
    selection = new Set([...selection].filter((id) => ids.has(id)));
    if (!ids.has(selected)) selected = [...selection][0] ?? "";
    select(selected, false, true);
  }
  q("[data-group]").addEventListener("click", () =>
    notifyError(() => {
      applyDraft(
        groupSelection(layout, selectionIds(), `group-${crypto.randomUUID()}`),
      );
      refresh();
    }),
  );
  q("[data-ungroup]").addEventListener("click", () =>
    notifyError(() => {
      applyDraft(ungroupSelection(layout, selectionIds()));
      refresh();
    }),
  );
  q("[data-duplicate-selection]").addEventListener("click", () =>
    notifyError(() => {
      const copy = duplicateSelection(layout, selectionIds());
      applyDraft(copy.layout);
      selection = new Set(copy.ids);
      selected = copy.ids[0] ?? "";
      refresh();
    }),
  );
  q("[data-delete-selection]").addEventListener("click", () =>
    notifyError(() => {
      applyDraft(deleteSelection(layout, selectionIds()));
      selection.clear();
      selected = "";
      refresh();
    }),
  );
  q<HTMLInputElement>("[data-show-environment]").addEventListener(
    "change",
    (e) => {
      scene.setEnvironmentVisible((e.target as HTMLInputElement).checked);
      inspector();
    },
  );
  let dragLayout: LayoutOverride | undefined,
    dragPivot: { x: number; y: number; z: number } | undefined;
  gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMSTART, () => {
    history.begin(layout);
    if (selection.size > 1 || selected.startsWith("environment-")) {
      dragLayout = structuredClone(layout);
      dragPivot = selectionPivot(layout, selectionIds());
    }
    dragging = true;
    gizmoGesture = true;
  });
  gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMMOVE, () => {
    if (dragLayout && dragPivot) {
      const at = anchor.getPosition();
      notifyError(() =>
        applyDraft(
          transformSelection(dragLayout!, selectionIds(), {
            x: at.x - dragPivot!.x,
            y: at.y - dragPivot!.y,
            z: at.z - dragPivot!.z,
          }),
        ),
      );
      return;
    }
    const o = object();
    if (!o) return;
    const p = anchor.getPosition();
    if (colliderMode) {
      const c = selectedSpec();
      if (!c) return;
      const source = layoutSource(o.sourceId)!.visual,
        scale = o.scale ?? 1,
        sx = ((o.width ?? source.width) / source.width) * scale,
        sz = ((o.depth ?? source.depth) / source.depth) * scale,
        dx = p.x - o.x,
        dz = p.z - o.z,
        co = Math.cos(o.yaw),
        si = Math.sin(o.yaw);
      try {
        const next = {
          ...c,
          x: (dx * co - dz * si) / sx,
          y: (p.y - o.y) / scale,
          z: (dx * si + dz * co) / sz,
        };
        saveCollider(next);
        for (const key of ["x", "y", "z"] as const) {
          const input = host.querySelector<HTMLInputElement>(
            `[data-collider-property="${key}"]`,
          );
          if (input) input.value = String(next[key]);
        }
      } catch (e) {
        status.textContent = String(e);
      }
      return;
    }
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
    dragLayout = undefined;
    dragPivot = undefined;
    history.end(layout);
    updateHistoryButtons();
    inspector();
  });
  let pointer:
    | { x: number; y: number; button: number; shift: boolean }
    | undefined;
  const listeners = new AbortController(),
    opts = { signal: listeners.signal };
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      gizmo.mouseButtons[0] = !e.shiftKey;
    },
    { ...opts, capture: true },
  );
  canvas.addEventListener(
    "pointerup",
    () => {
      gizmo.mouseButtons[0] = true;
    },
    { ...opts, capture: true },
  );
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
        target.x += (-dx * Math.cos(azimuth) - dy * Math.sin(azimuth)) * s;
        target.z += (dx * Math.sin(azimuth) - dy * Math.cos(azimuth)) * s;
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
          8000,
        ),
        ray = new pc.Ray(from, to.sub(from).normalize()),
        hit = new pc.Vec3();
      if (colliderMode) {
        const hit = overlays.pick(ray);
        if (hit) {
          select(hit.ownerId);
          selectedCollider = hit.localId;
          inspector();
        }
        return;
      }
      let best = Infinity,
        id = "";
      for (const v of [...arena.visuals!, ...(arena.environment ?? [])]) {
        if (authoringObject(layout, v.id)?.locked || !scene.isVisible(v.id))
          continue;
        const bounds = scene.placementBounds(v.id);
        if (bounds?.intersectsRay(ray, hit)) {
          const d = from.distance(hit);
          if (d < best) {
            best = d;
            id = v.id;
          }
        }
      }
      if (id) select(id, e.ctrlKey || e.metaKey);
    },
    opts,
  );
  canvas.addEventListener(
    "keydown",
    (e) => {
      if (
        (selection.size > 1 || selected.startsWith("environment-")) &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        notifyError(() =>
          transformChosen({
            x: e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0,
            z: e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0,
          }),
        );
        return;
      }
      const o = object();
      if (
        !o ||
        o.locked ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      )
        return;
      e.preventDefault();
      if (colliderMode) {
        const c = selectedSpec();
        if (c)
          saveCollider({
            ...c,
            x:
              c.x +
              (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0),
            z: c.z + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0),
          });
        inspector();
        return;
      }
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
        Math.min(6000, distance * Math.exp(e.deltaY * 0.001)),
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
    a.download = "minimorph-cosmic-sprint-layout-v4.json";
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
      if (file.size > 1024 * 1024) throw Error("JSON exceeds 1 MiB.");
      const next = validateLayout(JSON.parse(await file.text()));
      applyDraft(next);
      selected = "";
      selection.clear();
      scene.setEditorFocus([]);
      refresh();
      status.textContent = "Imported local draft. Gameplay links preserved.";
    } catch (error) {
      status.textContent = `Import rejected: ${String(error)}`;
    } finally {
      input.value = "";
    }
  });
  q("[data-reset]").addEventListener("click", () => {
    applyDraft(emptyLayout());
    selected = "";
    selection.clear();
    scene.setEditorFocus([]);
    refresh();
    status.textContent = "Original PR #13 layout restored.";
  });
  function catalogNote() {
    const source = editorCatalog.find(
      (s) => s.visual.id === q<HTMLSelectElement>("[data-catalog]").value,
    );
    q("[data-catalog-note]").textContent =
      q<HTMLSelectElement>("[data-add-layer]").value === "environment"
        ? "Environment instance: presentation only, NON-COLLIDABLE regardless of source asset."
        : source?.category === "decoration"
          ? "NON-COLLIDABLE: decoration only. Unsupported ramps, barriers and kit shapes have no gameplay collision."
          : source?.category === "platform"
            ? "Walkable platform with linked collision surface."
            : "Functional mechanism with linked collision / trigger; new bounce pads include a landing surface.";
  }
  function filterCatalog() {
    const needle = q<HTMLInputElement>(
      "[data-asset-search]",
    ).value.toLowerCase();
    const select = q<HTMLSelectElement>("[data-catalog]");
    select.replaceChildren();
    for (const source of editorCatalog.filter((s) =>
      s.name.toLowerCase().includes(needle),
    )) {
      const option = document.createElement("option");
      option.value = source.visual.id;
      option.textContent = source.name;
      select.append(option);
    }
    q<HTMLButtonElement>("[data-add]").disabled = !select.options.length;
    catalogNote();
  }
  q("[data-asset-search]").addEventListener("input", filterCatalog);
  q("[data-catalog]").addEventListener("change", catalogNote);
  q("[data-add-layer]").addEventListener("change", catalogNote);
  q("[data-add]").addEventListener("click", () => {
    const source = editorCatalog.find(
      (s) => s.visual.id === q<HTMLSelectElement>("[data-catalog]").value,
    );
    if (!source) return;
    const at =
      q<HTMLSelectElement>("[data-add-at]").value === "selection"
        ? (authoringObject(layout, selected) ?? target)
        : target;
    try {
      if (q<HTMLSelectElement>("[data-add-layer]").value === "environment") {
        const o: EnvironmentObject = {
          id: `environment-${crypto.randomUUID()}`,
          sourceId: source.visual.id,
          category: q<HTMLSelectElement>("[data-environment-category]")
            .value as EnvironmentObject["category"],
          x: at.x,
          y: at.y,
          z: at.z,
          yaw: 0,
          scale: 1,
          viewDistance: 600,
          animation: { type: "none", speed: 0.25, amplitude: 1 },
        };
        applyDraft({
          ...layout,
          environment: [...(layout.environment ?? []), o],
        });
        selection = new Set([o.id]);
        selected = o.id;
        refresh();
        return;
      }
      const o: LayoutObject = {
        id: `editor-${crypto.randomUUID()}`,
        sourceId: source.visual.id,
        x: at.x,
        y: at.y,
        z: at.z,
        yaw: source.visual.yaw ?? 0,
      };
      setObject(o);
      selection = new Set([o.id]);
      selected = o.id;
      refresh();
    } catch (e) {
      status.textContent = String(e);
    }
  });
  filterCatalog();
  const resize = new ResizeObserver(() => {
    if (!playtestSession)
      app.resizeCanvas(
        canvas.parentElement!.clientWidth,
        canvas.parentElement!.clientHeight,
      );
  });
  resize.observe(canvas.parentElement!);
  app.on("update", (dt: number) => {
    if (playtestSession) return;
    environmentTime += Math.min(dt, 0.1);
    scene.update(state, true, environmentTime);
    overlays.draw();
    const bounds = scene.placementBounds(selected);
    if (bounds && !colliderMode) {
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
  function exitPlaytest() {
    const session = playtestSession;
    playtestSession = undefined;
    try {
      session?.destroy();
    } finally {
      playtestHost.hidden = true;
      editorElement.hidden = false;
      app.timeScale = 1;
      app.autoRender = true;
      scene.root.enabled = true;
      inspector();
      app.resizeCanvas(
        canvas.parentElement!.clientWidth,
        canvas.parentElement!.clientHeight,
      );
      canvas.focus();
    }
  }
  q("[data-playtest]").addEventListener("click", () => {
    if (playtestSession || dragging) return;
    try {
      const draft = applyLayout(layout);
      editorElement.hidden = true;
      playtestHost.hidden = false;
      gizmo.enabled = false;
      app.timeScale = 0;
      app.autoRender = false;
      scene.root.enabled = false;
      playtestSession = launchPlaytest(
        playtestHost,
        draft,
        editorAssetUrls,
        exitPlaytest,
      );
    } catch (error) {
      exitPlaytest();
      status.textContent = `Playtest failed: ${String(error)}`;
    }
  });
  q<HTMLInputElement>("[data-show-colliders]").addEventListener(
    "change",
    (e) => {
      overlays.root.enabled = (e.target as HTMLInputElement).checked;
    },
  );
  q<HTMLInputElement>("[data-collider-mode]").addEventListener(
    "change",
    (e) => {
      colliderMode = (e.target as HTMLInputElement).checked;
      if (colliderMode) {
        overlays.root.enabled = true;
        q<HTMLInputElement>("[data-show-colliders]").checked = true;
        selectedCollider = object() ? (specs(object()!)[0]?.id ?? "") : "";
      }
      inspector();
    },
  );
  scene.setOverview(true);
  refresh();
  app.start();
  return {
    destroy() {
      playtestSession?.destroy();
      window.removeEventListener("keydown", historyShortcut);
      listeners.abort();
      resize.disconnect();
      gizmo.destroy();
      overlays.destroy();
      scene.destroy();
      lighting.destroy();
      app.destroy();
      host.replaceChildren();
    },
  };
}
