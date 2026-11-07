import { animatedCharacterSource, createGame } from "@minimorph/game-engine";
import type { Game } from "@minimorph/game-engine";
import type { ArenaConfig } from "@minimorph/game-content";
import { characterConfig } from "./character-config";
import { mountJoystick } from "./joystick";
/** Real local game, without mounting menu, progression, storage or multiplayer. */
export function mountPlaytest(
  host: HTMLElement,
  arena: ArenaConfig,
  environmentUrls: { [key: string]: string },
  onExit: () => void,
) {
  host.innerHTML = `<section class="editor-playtest"><canvas tabindex="0" aria-label="Local Playtest"></canvas><div class="playtest-hud"><button data-exit-playtest>Exit Playtest</button><button data-restart-playtest>Restart</button><output data-playtest-status role="status">Loading Minimorph…</output></div><nav class="playtest-touch"><div class="joystick" role="group" aria-label="Movement joystick"><span class="joystick-knob"></span></div><div class="touch-actions"><button data-playtest-action="dive">DIVE</button><button data-playtest-action="jump">JUMP</button></div></nav></section>`;
  const abort = new AbortController(),
    options = { signal: abort.signal },
    canvas = host.querySelector<HTMLCanvasElement>("canvas")!,
    status = host.querySelector<HTMLOutputElement>("[data-playtest-status]")!;
  canvas.id = `minimorph-playtest-${crypto.randomUUID()}`;
  const keys = new Set<string>(),
    touches = new Map<number, string>();
  let jump = false,
    dive = false,
    ready = false,
    turn = 0,
    lastRead = performance.now(),
    pointer: number | undefined,
    lastX = 0,
    game: Game | undefined;
  const joystick = mountJoystick(
    host.querySelector(".joystick")!,
    abort.signal,
  );
  const clear = () => {
    keys.clear();
    touches.clear();
    jump = dive = false;
    turn = 0;
    joystick.reset();
  };
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
          "ShiftLeft",
          "ShiftRight",
          "KeyQ",
          "KeyE",
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.add(e.code);
        if (!e.repeat && e.code === "Space") jump = true;
        if (!e.repeat && e.code.startsWith("Shift")) dive = true;
      }
    },
    options,
  );
  window.addEventListener("keyup", (e) => keys.delete(e.code), options);
  window.addEventListener("blur", clear, options);
  const pressed = (code: string) => keys.has(code);
  for (const button of host.querySelectorAll<HTMLButtonElement>(
    "[data-playtest-action]",
  )) {
    button.addEventListener(
      "pointerdown",
      (e) => {
        button.setPointerCapture(e.pointerId);
        touches.set(e.pointerId, button.dataset.playtestAction!);
        if (button.dataset.playtestAction === "jump") jump = true;
        else dive = true;
      },
      options,
    );
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(
        event,
        (e) => touches.delete((e as PointerEvent).pointerId),
        options,
      );
  }
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      pointer = e.pointerId;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    },
    options,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (pointer === e.pointerId) {
        turn -= e.clientX - lastX;
        lastX = e.clientX;
      }
    },
    options,
  );
  for (const event of ["pointerup", "pointercancel"])
    canvas.addEventListener(
      event,
      () => {
        pointer = undefined;
      },
      options,
    );
  host
    .querySelector("[data-exit-playtest]")!
    .addEventListener("click", onExit, options);
  host.querySelector("[data-restart-playtest]")!.addEventListener(
    "click",
    () => {
      clear();
      game?.restart();
      canvas.focus();
    },
    options,
  );
  try {
    game = createGame(
      canvas,
      () => {
        const now = performance.now(),
          dt = Math.max(0.016, (now - lastRead) / 1000),
          stick = joystick.read(),
          input = {
            x:
              Number(pressed("KeyD") || pressed("ArrowRight")) -
                Number(pressed("KeyA") || pressed("ArrowLeft")) || stick.x,
            z:
              Number(pressed("KeyS") || pressed("ArrowDown")) -
                Number(pressed("KeyW") || pressed("ArrowUp")) || stick.z,
            jump: ready && jump,
            dive:
              ready &&
              (dive ||
                pressed("ShiftLeft") ||
                pressed("ShiftRight") ||
                [...touches.values()].includes("dive")),
            cameraTurn:
              Number(pressed("KeyE")) -
              Number(pressed("KeyQ")) +
              Math.max(-4, Math.min(4, (turn * 0.006) / dt / 1.5)),
          };
        jump = dive = false;
        turn = 0;
        lastRead = now;
        return ready ? input : { x: 0, z: 0, jump: false };
      },
      (state) => {
        canvas.dataset.playtestX = String(state.x);
        canvas.dataset.playtestY = String(state.y);
        canvas.dataset.playtestZ = String(state.z);
        if (ready)
          status.textContent = `${state.won ? "Finished · " : ""}${state.elapsed.toFixed(1)} s${state.recovery ? " · Respawning" : ""}`;
      },
      {
        localArena: arena,
        environmentUrls,
        initialArena: arena.id,
        raceFlow: false,
        character: animatedCharacterSource(characterConfig),
        onArenaLoad: (s) => {
          ready = s.ready;
          if (!ready)
            status.textContent = s.error
              ? `Asset error: ${s.error}`
              : `Loading scene ${s.loaded}/${s.total}…`;
        },
        onCharacterError: () => {
          status.textContent = "Character failed to load. Exit and retry.";
        },
      },
    );
    canvas.focus();
  } catch (error) {
    abort.abort();
    game?.destroy();
    throw error;
  }
  return {
    destroy() {
      abort.abort();
      clear();
      game?.destroy();
      host.replaceChildren();
    },
  };
}
