import * as pc from "playcanvas";
import { loadCharacterVisual, characterClip } from "./character";
import type {
  CharacterSource,
  CharacterVisual,
  ShapeFactory,
} from "./character";
import type { ParticipantSnapshot } from "@minimorph/multiplayer-protocol";
const colors = [
  "#48f5dc",
  "#ffb75b",
  "#c87cff",
  "#ff588b",
  "#9aff9c",
  "#71a8ff",
  "#ffe68b",
  "#ffffff",
];
export function createRemotePlayers(
  app: pc.Application,
  canvas: HTMLCanvasElement,
  source: CharacterSource | undefined,
  fallback: () => CharacterVisual,
  shape: ShapeFactory,
) {
  const entries = new Map<
    string,
    {
      anchor: pc.Entity;
      visual: ReturnType<typeof loadCharacterVisual>;
      label: HTMLSpanElement;
      material: pc.StandardMaterial;
    }
  >();
  const active = new Set<string>();
  const projected = new pc.Vec3(), screen = new pc.Vec3();
  const labels = document.createElement("div");
  labels.className = "participant-labels";
  canvas.parentElement!.append(labels);
  return {
    update(players: ParticipantSnapshot[], camera: pc.Entity, dt: number) {
      active.clear(); for(const player of players)active.add(player.id);
      for (const [id, e] of entries)
        if (!active.has(id)) {
          e.visual.destroy();
          e.label.remove();
          e.material.destroy();
          entries.delete(id);
        }
      for (const p of players) {
        let e = entries.get(p.id);
        if (!e) {
          const anchor = new pc.Entity("Remote Minimorph");
          app.root.addChild(anchor);
          const material = new pc.StandardMaterial();
          material.diffuse = new pc.Color().fromString(colors[p.color % 8]);
          material.emissive = material.diffuse.clone();
          material.emissiveIntensity = 0.5;
          material.update();
          shape(
            "Participant color ring",
            "cylinder",
            anchor,
            [0, 0.03, 0],
            [1.2, 0.035, 1.2],
            material,
          );
          const label = document.createElement("span");
          label.textContent = p.name + (p.bot ? " · BOT" : "");
          label.style.borderColor = colors[p.color % 8];
          labels.append(label);
          e = {
            anchor,
            visual: loadCharacterVisual(app, anchor, fallback(), source),
            label,
            material,
          };
          entries.set(p.id, e);
        }
        e.anchor.setPosition(p.state.x, p.state.y, p.state.z);
        e.anchor.setEulerAngles(0, (p.state.heading * 180) / Math.PI, 0);
        e.anchor.enabled = p.status !== "dnf";
        e.visual.update(p.state, dt);
        e.label.dataset.action = p.state.action;
        e.label.dataset.animation = characterClip(p.state);
        e.label.dataset.player = p.id;
        e.label.dataset.x = String(p.state.x);
        e.label.dataset.z = String(p.state.z);
        const at = camera.camera!.worldToScreen(
          projected.set(p.state.x, p.state.y + 2.2, p.state.z), screen,
        );
        const width = canvas.clientWidth,
          height = canvas.clientHeight,
          sx = (at.x / app.graphicsDevice.width) * width,
          sy = (at.y / app.graphicsDevice.height) * height;
        e.label.hidden =
          p.status === "dnf" ||
          at.z < 0 ||
          sx < 0 ||
          sx > width ||
          sy < 0 ||
          sy > height;
        e.label.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%)`;
      }
      canvas.dataset.remoteCount = String(entries.size);
    },
    destroy() {
      for (const e of entries.values()) {
        e.visual.destroy();
        e.label.remove();
        e.material.destroy();
      }
      entries.clear();
      labels.remove();
      canvas.dataset.remoteCount = "0";
    },
  };
}
