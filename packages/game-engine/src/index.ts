import * as pc from "playcanvas";
import {
  platforms,
  finish,
  checkpoints,
  obstacles,
} from "@minimorph/game-content";
import {
  createPlayer,
  stepPlayer,
  FIXED_STEP,
  obstaclePosition,
  wrapAngle,
} from "./physics";
import type { Input, PlayerState } from "./physics";
import { createProceduralCat, loadCharacterVisual } from "./character";
import type { CharacterSource } from "./character";
import { createCameraPose, updateCamera } from "./camera";
export { gltfCharacterSource } from "./character";
export type { CharacterSource, CharacterVisual } from "./character";
export { createPlayer, stepPlayer } from "./physics";
export type { PlayerState } from "./physics";
export interface GameOptions {
  character?: CharacterSource;
  onCharacterError?: (error: unknown) => void;
}
export interface Game {
  restart(): void;
  destroy(): void;
}
export function createGame(
  canvas: HTMLCanvasElement,
  readInput: () => Input,
  onState: (state: Readonly<PlayerState>) => void,
  options: GameOptions = {},
): Game {
  let app: pc.Application;
  try {
    app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        deviceTypes: ["webgl2"],
        antialias: false,
        alpha: false,
        powerPreference: "low-power",
      },
    });
  } catch {
    throw new Error(
      "WebGL 2 is unavailable. Please use a recent browser with hardware acceleration.",
    );
  }
  app.setCanvasFillMode(
    pc.FILLMODE_NONE,
    canvas.parentElement!.clientWidth,
    canvas.parentElement!.clientHeight,
  );
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  const materials: pc.StandardMaterial[] = [];
  const sceneryGroup = app.batcher!.addGroup("Static scenery", false, 100).id;
  const material = (hex: string, glow = false) => {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color().fromString(hex);
    if (glow) {
      m.emissive = m.diffuse.clone();
      m.emissiveIntensity = 0.8;
    }
    m.shininess = 40;
    m.update();
    materials.push(m);
    return m;
  };
  const silver = material("#b9cbe2"),
    cyan = material("#38edec", true),
    navy = material("#141d3c"),
    purple = material("#6756ac"),
    white = material("#f1f7ff", true);
  const shape = (
    name: string,
    type: "box" | "capsule" | "cone" | "cylinder" | "sphere",
    parent: pc.Entity,
    position: number[],
    scale: number[],
    mat: pc.StandardMaterial,
  ) => {
    const e = new pc.Entity(name);
    e.addComponent("render", { type });
    if (parent === app.root || parent.name === "Finish beacon")
      e.render!.batchGroupId = sceneryGroup;
    e.render!.meshInstances.forEach((mesh) => {
      mesh.material = mat;
    });
    e.setLocalPosition(position[0], position[1], position[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    parent.addChild(e);
    return e;
  };
  app.scene.ambientLight = new pc.Color(0.55, 0.62, 0.8);
  const sun = new pc.Entity("Starlight");
  sun.addComponent("light", {
    type: "directional",
    color: new pc.Color(0.8, 0.9, 1),
    intensity: 1.4,
    castShadows: false,
  });
  sun.setEulerAngles(45, 30, 0);
  app.root.addChild(sun);
  const camera = new pc.Entity("Follow camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.025, 0.035, 0.09),
    farClip: 180,
    fov: 58,
  });
  app.root.addChild(camera);
  platforms.forEach((p, i) => {
    shape(
      "Orbit platform " + i,
      "box",
      app.root,
      [p.x, p.y - 0.45, p.z],
      [p.width, 0.9, p.depth],
      i % 2 ? purple : navy,
    );
    shape(
      "Runway light " + i,
      "box",
      app.root,
      [p.x, p.y + 0.015, p.z - p.depth / 2 + 0.12],
      [p.width, 0.03, 0.12],
      cyan,
    );
  });
  // Static low-poly scenery, shared materials, no downloaded assets or dynamic shadows.
  for (let i = 0; i < 60; i++) {
    const x = Math.sin(i * 127.1) * 55,
      y = 6 + ((i * 17) % 35),
      z = -70 + ((i * 29) % 100);
    shape("Star", "sphere", app.root, [x, y, z], [0.1, 0.1, 0.1], white);
  }
  shape(
    "Distant planet",
    "sphere",
    app.root,
    [-24, 15, -65],
    [15, 15, 15],
    purple,
  );
  const goal = new pc.Entity("Finish beacon");
  goal.setPosition(finish.x, finish.y, finish.z);
  app.root.addChild(goal);
  shape("Finish pad", "cylinder", goal, [0, 0.04, 0], [3.6, 0.08, 3.6], cyan);
  for (const side of [-1, 1])
    shape(
      "Finish pillar",
      "box",
      goal,
      [side * 2, 1.8, 0],
      [0.18, 3.6, 0.18],
      cyan,
    );
  shape("Finish arch", "box", goal, [0, 3.6, 0], [4.2, 0.2, 0.2], white);
  const dynamic = new pc.Entity("Dynamic course");
  app.root.addChild(dynamic);
  const amber = material("#ffb959", true);
  const checkpointPads = checkpoints.map((point, i) => {
    const pad = shape(
      "Checkpoint " + (i + 1),
      "cylinder",
      dynamic,
      [point.x, point.y + 0.04, point.z],
      [2.4, 0.06, 2.4],
      amber,
    );
    for (const side of [-1, 1])
      shape(
        "Checkpoint marker",
        "box",
        dynamic,
        [point.x + side * 1.6, point.y + 0.5, point.z],
        [0.1, 1, 0.1],
        cyan,
      );
    return pad;
  });
  const hazardEntities = obstacles.map((obstacle) =>
    shape(
      "Moving sweeper",
      "box",
      dynamic,
      [obstacle.x, obstacle.y + obstacle.height / 2, obstacle.z],
      [obstacle.width, obstacle.height, obstacle.depth],
      amber,
    ),
  );
  const confetti = Array.from({ length: 20 }, (_, i) => {
    const piece = shape(
      "Finish sparkle",
      "box",
      dynamic,
      [0, 0, 0],
      [0.09, 0.09, 0.09],
      i % 2 ? cyan : white,
    );
    piece.enabled = false;
    return piece;
  });
  const cat = new pc.Entity("Character controller anchor");
  app.root.addChild(cat);
  const character = loadCharacterVisual(
    app,
    cat,
    createProceduralCat(shape, { silver, navy, cyan }),
    options.character,
    options.onCharacterError,
  );
  let player = createPlayer(),
    previous = { ...player },
    accumulator = 0,
    destroyed = false,
    pendingJump = false,
    cameraYaw = 0,
    visualTime = 0;
  const pose = createCameraPose();
  const resize = () => {
    if (!destroyed) {
      app.graphicsDevice.maxPixelRatio = Math.min(
        window.devicePixelRatio || 1,
        1.5,
      );
      app.resizeCanvas(
        Math.max(1, canvas.parentElement!.clientWidth),
        Math.max(1, canvas.parentElement!.clientHeight),
      );
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement!);
  window.addEventListener("resize", resize);
  const visibility = () => {
    accumulator = 0;
    pendingJump = false;
    app.timeScale = document.hidden ? 0 : 1;
  };
  document.addEventListener("visibilitychange", visibility);
  const update = (delta: number) => {
    const dt = Math.min(delta, 0.1);
    visualTime += dt;
    accumulator += dt;
    const input = readInput();
    pendingJump ||= input.jump;
    while (accumulator >= FIXED_STEP) {
      previous = { ...player };
      cameraYaw = wrapAngle(
        cameraYaw + (input.cameraTurn ?? 0) * FIXED_STEP * 1.5,
      );
      stepPlayer(
        player,
        { ...input, cameraYaw, jump: pendingJump },
        FIXED_STEP,
      );
      if (previous.respawns !== player.respawns) previous = { ...player };
      pendingJump = false;
      accumulator -= FIXED_STEP;
    }
    const alpha = accumulator / FIXED_STEP;
    cat.setPosition(
      previous.x + (player.x - previous.x) * alpha,
      previous.y + (player.y - previous.y) * alpha,
      previous.z + (player.z - previous.z) * alpha,
    );
    cat.setEulerAngles(
      0,
      ((previous.heading +
        wrapAngle(player.heading - previous.heading) * alpha) *
        180) /
        Math.PI,
      0,
    );
    const recoveryScale = player.recovery
      ? Math.max(0, player.respawnTimer / 0.4)
      : 1;
    cat.setLocalScale(recoveryScale, recoveryScale, recoveryScale);
    character.update(player, dt);
    checkpointPads.forEach((pad, i) => {
      pad.render!.meshInstances[0].material =
        player.checkpoint > i ? cyan : amber;
      const pulse =
        player.checkpoint === i + 1
          ? 1 +
            Math.sin(player.checkpointFlash * Math.PI * 5) *
              player.checkpointFlash *
              0.15
          : 1;
      pad.setLocalScale(2.4 * pulse, 0.06, 2.4 * pulse);
    });
    hazardEntities.forEach((entity, i) => {
      const p = obstaclePosition(obstacles[i], player.elapsed);
      entity.setLocalPosition(p.x, p.y + obstacles[i].height / 2, p.z);
    });
    confetti.forEach((piece, i) => {
      piece.enabled = player.won;
      if (player.won) {
        const angle = i * 2.4 + visualTime * 1.2;
        piece.setLocalPosition(
          finish.x + Math.cos(angle) * (1.5 + (i % 3) * 0.35),
          finish.y + 0.6 + ((visualTime * 1.4 + i * 0.2) % 3.8),
          finish.z + Math.sin(angle) * 2,
        );
        piece.setLocalEulerAngles(visualTime * 90, i * 30, visualTime * 70);
      }
    });
    updateCamera(
      pose,
      player,
      cameraYaw,
      canvas.clientWidth / Math.max(1, canvas.clientHeight),
      dt,
    );
    camera.setPosition(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    camera.camera!.fov = pose.fov;
    onState(player);
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    observer.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", visibility);
    app.off("update", update);
    character.destroy();
    app.destroy();
    materials.forEach((m) => m.destroy());
  };
  try {
    app.batcher!.generate();
    resize();
    app.on("update", update);
    app.start();
  } catch (error) {
    destroy();
    throw error;
  }
  return {
    restart() {
      player = createPlayer();
      previous = { ...player };
      accumulator = 0;
      pendingJump = false;
      onState(player);
    },
    destroy,
  };
}
