import type { OnlineDriver } from '@minimorph/multiplayer-client';
import { createRemotePlayers } from './remote-players';
import type { RaceMode } from "@minimorph/game-content";
import * as pc from "playcanvas";
import {
  createPlayer,
  stepArenaPlayer,
  FIXED_STEP,
  wrapAngle,
} from "./physics";
import type { Input, PlayerState } from "./physics";
import { createProceduralCat, loadCharacterVisual } from "./character";
import type { CharacterSource } from "./character";
import { createCameraPose, updateCamera, reframeRecovery } from "./camera";
import { LevelManager } from "./levels";
import { RaceSession } from "./session";
import type { RaceSnapshot } from "./session";
import { createArenaScene } from "./arena-scene";
import { createPolishEffects } from "./polish-effects";
import { createPolishLighting } from "./polish-lighting";
import { PresentationEvents } from "./presentation-events";
import type { PresentationEvent } from "./presentation-events";
export { RaceSession } from "./session";
export type { RaceSnapshot, RacePhase } from "./session";
export { LevelManager } from "./levels";
export { stepArenaPlayer } from "./physics";
export { animatedCharacterSource, gltfCharacterSource } from "./character";
export type { CharacterSource, CharacterVisual } from "./character";
export { createPlayer, stepPlayer } from "./physics";
export type { PlayerState } from "./physics";
export interface GameOptions {
  onPresentation?: (event: PresentationEvent) => void;
  remoteCharacter?: CharacterSource;
  initialArena?: string;
  mode?: RaceMode;
  raceFlow?: boolean;
  onSession?: (snapshot: RaceSnapshot & { progress: number; mode: RaceMode; section: string; hint: string }) => void;
  character?: CharacterSource;
  onCharacterError?: (error: unknown) => void;
}
export interface Game {
  setOnline(driver: OnlineDriver | undefined, arenaId?: string): void;
  selectLevel(id: string, mode?: RaceMode): void;
  start(): void;
  chooseLevel(): void;
  pause(): void;
  resume(): void;
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
  const levels = new LevelManager(options.initialArena, options.mode);
  const session = new RaceSession(levels.current.id, options.raceFlow);
  const materials: pc.StandardMaterial[] = [];
  const sceneryGroup = app.batcher!.addGroup("Static scenery", false, 100).id;
  const makeMaterial = (hex: string, glow = false) => {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color().fromString(hex);
    if (glow) {
      m.emissive = m.diffuse.clone();
      m.emissiveIntensity = 0.32;
    }
    m.useMetalness = true;
    m.metalness = glow ? .05 : .18;
    m.shininess = glow ? 34 : 55;
    m.update();
    return m;
  };
  const material = (hex: string, glow = false) => { const m = makeMaterial(hex, glow); materials.push(m); return m; };
  const silver = material("#b9cbe2"),
    cyan = material("#38edec", true),
    navy = material("#141d3c");
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
    if (parent.name === "Arena static" || parent.parent?.name === "Arena static")
      e.render!.batchGroupId = sceneryGroup;
    e.render!.meshInstances.forEach((mesh) => {
      mesh.material = mat;
    });
    e.setLocalPosition(position[0], position[1], position[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    parent.addChild(e);
    return e;
  };
  const lighting = createPolishLighting(app);
  const camera = new pc.Entity("Follow camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.025, 0.035, 0.09),
    farClip: 180,
    fov: 58,
  });
  app.root.addChild(camera);
  let arenaScene = createArenaScene(app, levels.current, shape, makeMaterial);
  const effectRoot = new pc.Entity("Pooled visual effects"); app.root.addChild(effectRoot);
  const effects = createPolishEffects(app, effectRoot, shape);
  const events = new PresentationEvents(event => { if (!document.hidden) effects.emit(event); options.onPresentation?.(event); });
  camera.camera!.clearColor = new pc.Color().fromString(levels.current.palette.sky);
  canvas.dataset.arena = levels.current.id;
  const cat = new pc.Entity("Character controller anchor");
  app.root.addChild(cat);
  const character = loadCharacterVisual(
    app,
    cat,
    createProceduralCat(shape, { silver, navy, cyan }),
    options.character,
    options.onCharacterError,
  );
  const remotes=createRemotePlayers(app,canvas,options.remoteCharacter,()=>createProceduralCat(shape,{silver,navy,cyan}),shape);
  let online:OnlineDriver|undefined;
  let player = createPlayer(levels.current),
    previous = { ...player },
    accumulator = 0,
    destroyed = false,
    pendingJump = false,
    pendingDive = false,
    cameraYaw = 0;
  let lastWallTime = performance.now();
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
  const notify = () => {
    const arena = levels.current;
    const progress = player.won ? 1 : Math.min(1, Math.max(0, (arena.spawn.z - player.z) / (arena.spawn.z - arena.finish.z)));
    canvas.dataset.heading = String(player.heading);
    canvas.dataset.hits = String(player.obstacleHits);
    canvas.dataset.mode = levels.mode;
    canvas.dataset.phase = session.phase;
    canvas.dataset.progress = String(Math.round(progress * 100));
    canvas.dataset.action = player.action;
    canvas.dataset.event = player.lastEvent ?? "none";
    onState(player);
    const section = arena.sections?.find(s => -player.z >= s.start && -player.z < s.end);
    if (!online) options.onSession?.({ ...session.snapshot(), progress, mode: levels.mode, section: section?.name ?? arena.subtitle, hint: section?.hint ?? "" });
  };
  const visibility = () => {
    accumulator = 0;
    pendingJump = false; pendingDive = false;
    if (document.hidden) effects.reset();
    if (document.hidden && !online) { session.pause(); character.update(player, 0); }
    app.timeScale = document.hidden ? 0 : 1;
    notify();
  };
  document.addEventListener("visibilitychange", visibility);
  const update = (delta: number) => {
    const dt = Math.min(delta, 0.1);
    const wasRacing = session.phase === "racing";
    const now = performance.now();
    session.tick(Math.max(0, (now - lastWallTime) / 1000));
    lastWallTime = now;
    if (wasRacing && session.phase === "racing") accumulator += dt; else accumulator = 0;
    const network=online?.frame(Date.now());
    if(network){previous={...player};player=network.local;cameraYaw=network.yaw;session.phase=network.phase==="waiting"?"prepare":network.phase;accumulator=0;}
    const input = online ? {x:0,z:0,jump:false} : readInput();
    pendingJump ||= wasRacing && input.jump;
    pendingDive ||= wasRacing && !!input.dive;
    while (!online && accumulator >= FIXED_STEP) {
      previous = { ...player };
      cameraYaw = wrapAngle(
        cameraYaw + (session.phase === "racing" ? input.cameraTurn ?? 0 : 0) * FIXED_STEP * 1.5,
      );
      if (session.phase === "racing") stepArenaPlayer(
        player,
        { ...input, cameraYaw, jump: pendingJump, dive: pendingDive || !!input.dive },
        FIXED_STEP,
        levels.current,
      );
      if (player.won) session.finish();
      if (previous.respawns !== player.respawns) {
        previous = { ...player };
        if (levels.current.sections) reframeRecovery(pose,player,cameraYaw,canvas.clientWidth/Math.max(1,canvas.clientHeight));
      }
      pendingJump = false; pendingDive = false;
      accumulator -= FIXED_STEP;
    }
    const alpha = online ? 1 : accumulator / FIXED_STEP;
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
    character.update(player, session.phase === "paused" || session.phase === "countdown" ? 0 : dt);
    arenaScene.update(network ? {...player,elapsed:network.elapsed} : player);
    const presentationDt = session.phase === "paused" || session.phase === "countdown" ? 0 : dt;
    effects.begin(levels.current, presentationDt);
    events.observe("local", player);
    effects.track("local", player, false, presentationDt);
    if (network) for (const remote of network.remotes) {
      if (remote.status === "dnf") continue;
      events.observe(remote.id, remote.state, true);
      effects.track(remote.id, remote.state, true, presentationDt);
    }
    effects.end();
    canvas.dataset.activeEffects = String(effects.active);
    const framing = levels.current.sections?.find(s => -player.z >= s.start && -player.z < s.end);
    updateCamera(
      pose,
      player,
      cameraYaw,
      canvas.clientWidth / Math.max(1, canvas.clientHeight),
      dt,
      levels.current,
      framing,
    );
    camera.setPosition(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    camera.camera!.fov = pose.fov;
    remotes.update(network?.remotes??[],camera,dt);
    notify();
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    observer.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", visibility);
    app.off("update", update);
    remotes.destroy();
    character.destroy();
    effects.destroy();
    lighting.destroy();
    arenaScene.destroy();
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
  function resetPlayer(reframe = false) {
    player = createPlayer(levels.current); previous = { ...player };
    accumulator = 0; pendingJump = false; pendingDive = false; effects.reset(); events.reset();
    if (reframe) { cameraYaw = 0; Object.assign(pose, { x: player.x, y: player.y + 5, z: player.z + 9, lookX: player.x, lookY: player.y + 1, lookZ: player.z - 1 }); }
  }
  return {
    setOnline(driver,arenaId){
      // Reconnect uses the same driver/arena; retain visual high-water marks, not old cue playback.
      if (driver && driver === online && (!arenaId || arenaId === levels.current.id)) return;
      online=undefined;
      if(arenaId)this.selectLevel(arenaId,"race");
      online=driver;accumulator=0;pendingJump=false;pendingDive=false;
      if(!driver){session.choose();notify();}
    },
    selectLevel(id, mode) {
      if (destroyed) return;
      levels.load(id, mode); arenaScene.destroy();
      arenaScene = createArenaScene(app, levels.current, shape, makeMaterial);
      camera.camera!.clearColor = new pc.Color().fromString(levels.current.palette.sky);
      canvas.dataset.arena = id;
      app.batcher!.generate();
      resetPlayer(true); session.select(id); notify();
    },
    start() { lastWallTime = performance.now(); session.start(); character.update(player, 0); pendingJump = false; pendingDive = false; notify(); },
    chooseLevel() { session.choose(); pendingJump = false; pendingDive = false; notify(); },
    pause() { if(online)return;session.pause(); character.update(player, 0); pendingJump = false; pendingDive = false; accumulator = 0; notify(); },
    resume() { lastWallTime = performance.now(); session.start(); character.update(player, 0); pendingJump = false; pendingDive = false; notify(); },
    restart() {
      resetPlayer();
      session.select(levels.current.id);
      lastWallTime = performance.now();
      if (options.raceFlow) session.start(); else session.phase = "racing";
      notify();
    },
    destroy,
  };
}
