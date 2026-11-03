import { characterConfig } from "./character-config";
import { animatedCharacterSource, createGame } from "@minimorph/game-engine";
import type { Game } from "@minimorph/game-engine";
export interface MountedGame {
  destroy(): void;
  setHostStatus(message: string): void;
}
export function mountGame(root: HTMLElement, target: string): MountedGame {
  root.innerHTML = `<main class="game-shell">
    <canvas aria-label="Minimorph 3D obstacle course" tabindex="0"></canvas>
    <header><a class="brand" href="#">MINIMORPH<span>ORBIT RUN / 001</span></a><span class="target"></span></header>
    <section class="mission"><span class="eyebrow">CADET TRAINING</span><h1>Small paws.<br>Giant leaps.</h1><p>Cross the floating islands.<br>Reach the cyan finish beacon.</p></section>
    <aside class="telemetry" aria-label="Run statistics"><span>FLIGHT TIME <strong data-time>00.0</strong></span><span>RECOVERIES <strong data-falls>0</strong></span><span>CHECKPOINTS <strong data-checkpoints>0 / 2</strong></span><span>TO BEACON <strong data-distance>34m</strong></span></aside>
    <div class="message" role="status" aria-live="polite">Preparing your orbit…</div>
    <footer><span class="host-status"></span><span class="keyboard-help">WASD / ARROWS · MOVE &nbsp; SPACE · JUMP &nbsp; Q / E · CAMERA</span><button class="restart" type="button">↻ Restart</button></footer>
    <div class="camera-controls" aria-label="Camera controls"><button data-key="KeyQ" aria-label="Rotate camera left">↶</button><button data-key="KeyE" aria-label="Rotate camera right">↷</button></div>
    <nav class="touch-controls" aria-label="Touch controls"><div class="dpad"><button data-key="ArrowUp" aria-label="Move forward">▲</button><button data-key="ArrowLeft" aria-label="Move left">◀︎</button><button data-key="ArrowDown" aria-label="Move backward">▼</button><button data-key="ArrowRight" aria-label="Move right">▶︎</button></div><button class="jump" data-key="Space" aria-label="Jump">JUMP</button></nav>
  </main>`;
  const canvas = root.querySelector("canvas")!;
  canvas.dataset.character = "procedural-loading";
  const message = root.querySelector<HTMLElement>(".message")!;
  const host = root.querySelector<HTMLElement>(".host-status")!;
  const checkpointCounter = root.querySelector("[data-checkpoints]")!;
  const announce = (text: string) => {
    if (message.textContent !== text) message.textContent = text;
  };
  root.querySelector(".target")!.textContent = target;
  const time = root.querySelector("[data-time]")!,
    falls = root.querySelector("[data-falls]")!,
    distance = root.querySelector("[data-distance]")!;
  const controller = new AbortController(),
    options = { signal: controller.signal };
  const keys = new Set<string>(),
    pointers = new Map<number, string>();
  let jumpQueued = false,
    won = false,
    checkpoint = 0,
    recoveries = 0,
    game: Game | undefined;
  const allowed = new Set([
    "KeyQ",
    "KeyE",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Space",
  ]);
  const clearInput = () => {
    keys.clear();
    pointers.clear();
    jumpQueued = false;
    root
      .querySelectorAll(".pressed")
      .forEach((e) => e.classList.remove("pressed"));
  };
  const pressed = (code: string) =>
    keys.has(code) || [...pointers.values()].includes(code);
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        !allowed.has(e.code) ||
        e.target instanceof HTMLButtonElement ||
        e.target instanceof HTMLAnchorElement
      )
        return;
      e.preventDefault();
      if (e.code === "Space" && !e.repeat) jumpQueued = true;
      keys.add(e.code);
    },
    options,
  );
  window.addEventListener(
    "keyup",
    (e) => {
      keys.delete(e.code);
    },
    options,
  );
  window.addEventListener("blur", clearInput, options);
  document.addEventListener("visibilitychange", clearInput, options);
  root.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((button) => {
    button.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, button.dataset.key!);
        button.classList.add("pressed");
        if (button.dataset.key === "Space") jumpQueued = true;
      },
      options,
    );
    const release = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (![...pointers.values()].includes(button.dataset.key!))
        button.classList.remove("pressed");
    };
    button.addEventListener("pointerup", release, options);
    button.addEventListener("pointercancel", release, options);
    button.addEventListener("lostpointercapture", release, options);
  });
  const restart = () => {
    clearInput();
    won = false;
    checkpoint = 0;
    recoveries = 0;
    message.textContent = "Reach the finish beacon";
    game?.restart();
    canvas.focus();
  };
  root.querySelector(".restart")!.addEventListener("click", restart, options);
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      clearInput();
      game?.destroy();
      game = undefined;
      message.textContent =
        "Graphics connection lost. Reload this page to resume.";
    },
    options,
  );
  try {
    game = createGame(
      canvas,
      () => {
        const jump = jumpQueued;
        jumpQueued = false;
        return {
          x:
            Number(pressed("KeyD") || pressed("ArrowRight")) -
            Number(pressed("KeyA") || pressed("ArrowLeft")),
          z:
            Number(pressed("KeyS") || pressed("ArrowDown")) -
            Number(pressed("KeyW") || pressed("ArrowUp")),
          jump,
          cameraTurn: Number(pressed("KeyE")) - Number(pressed("KeyQ")),
        };
      },
      (state) => {
        time.textContent = state.elapsed.toFixed(1).padStart(4, "0");
        falls.textContent = String(state.falls);
        checkpointCounter.textContent = `${state.checkpoint} / 2`;
        root.classList.toggle("checkpoint-flash", state.checkpointFlash > 0);
        root.classList.toggle("celebrating", state.won);
        if (state.recovery && state.falls !== recoveries) {
          recoveries = state.falls;
          announce(
            state.recovery === "obstacle"
              ? "Sweeper hit! Returning to your checkpoint…"
              : "Returning to your checkpoint…",
          );
        } else if (!state.recovery && state.protection > 0)
          announce(
            state.checkpoint
              ? "Checkpoint recovered. You’ve got this!"
              : "Back on the launch pad. Try again!",
          );
        if (state.checkpoint > checkpoint) {
          checkpoint = state.checkpoint;
          message.textContent = `Checkpoint ${checkpoint} secured!`;
        }
        if (state.won && !won) {
          won = true;
          message.textContent =
            "Orbit complete! Nice landing, cadet. Restart to fly again.";
        }
        distance.textContent = `${Math.hypot(state.x, state.z + 32).toFixed(1)}m`;
        canvas.setAttribute(
          "aria-description",
          state.recovery
            ? "Respawning"
            : state.grounded
              ? "On platform"
              : "Airborne",
        );
        if (!canvas.dataset.ready) canvas.dataset.ready = "true";
      },
      {
        character: animatedCharacterSource(characterConfig),
        onCharacterError: () => { canvas.dataset.character = "procedural-fallback"; },
      },
    );
    message.textContent = "Reach the finish beacon";
  } catch (error) {
    message.textContent =
      error instanceof Error
        ? error.message
        : "The game could not start. Please reload.";
  }
  return {
    setHostStatus(text) {
      host.textContent = text;
    },
    destroy() {
      clearInput();
      controller.abort();
      game?.destroy();
      root.replaceChildren();
    },
  };
}
