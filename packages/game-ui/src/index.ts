import { createResultsUI } from "./results";
import { arenas, getArena } from "@minimorph/game-content";
import { localProgression, formatTime } from "./progression";
import type { RaceSnapshot, PlayerState } from "@minimorph/game-engine";
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
    <header><a class="brand" href="#">MINIMORPH<span>ORBIT CIRCUIT / SEASON 01</span></a><span class="target"></span></header>
    <section class="mission"><span class="eyebrow">CADET TRAINING</span><h1 data-arena-name>Cosmic Sprint</h1><p data-arena-hint>Small paws. Giant leaps.</p></section>
    <aside class="telemetry" aria-label="Run statistics"><span>FLIGHT TIME <strong data-time>00.0</strong></span><span>RECOVERIES <strong data-falls>0</strong></span><span>CHECKPOINTS <strong data-checkpoints>0 / 2</strong></span><span>TO BEACON <strong data-distance>34m</strong></span></aside>
    <div class="message" role="status" aria-live="polite">Preparing your orbit…</div>
    <div class="race-progress" aria-label="Course progress"><span data-progress-label>0%</span><div><i data-progress-bar></i></div></div>
    <section class="screen selection" aria-label="Arena selection">
      <div class="selection-heading"><span class="eyebrow">THE ORBIT CIRCUIT</span><h2>Small paws.<br> Giant competition.</h2><p>Three arenas. One determined cadet. Choose your next launch.</p></div>
      <div class="level-grid"></div><p class="storage-status"></p>
    </section>
    <section class="screen prepare" aria-label="Race preparation" hidden><div class="panel"><span class="eyebrow">MISSION BRIEFING</span><h2 data-prepare-title></h2><p data-prepare-description></p><div class="route-list"></div><p class="brief-controls">WASD / arrows to move · Space to jump<br>Touch controls on mobile · Q / E to orbit camera</p><button class="primary" data-start>Start race</button><button data-back>Choose arena</button></div></section>
    <div class="countdown" aria-live="polite" hidden><strong>3</strong><span>READY TO LAUNCH</span></div>
    <section class="screen results" aria-label="Race results" hidden><div class="panel"><span class="eyebrow">ORBIT COMPLETE</span><h2>Nice landing,<br> cadet.</h2><p class="result-badge"></p><div class="result-stats"><span>YOUR TIME<strong data-result-time></strong></span><span>BEST TIME<strong data-best-time></strong></span><span>RECOVERIES<strong data-result-falls></strong></span></div><button class="primary" data-next>Next arena</button><button data-replay>Race again</button><button data-back>Choose arena</button><p class="storage-status"></p></div></section>
    <section class="screen pause" aria-label="Race paused" hidden><div class="panel"><span class="eyebrow">TAKE A BREATHER</span><h2>Flight paused.</h2><p>Your timer is stopped. Resume when you are ready.</p><button class="primary" data-resume>Resume race</button><button data-back>Choose arena</button></div></section>
    <section class="screen fatal" role="alert" hidden><div class="panel"><h2>Graphics connection lost.</h2><p>Reload this page to resume. Your saved progress is safe.</p></div></section>
    <footer><span class="host-status"></span><span class="keyboard-help">WASD / ARROWS · MOVE &nbsp; SPACE · JUMP &nbsp; Q / E · CAMERA</span><button class="arena-menu" type="button">Arenas</button><button class="restart" type="button">↻ Restart</button></footer>
    <div class="camera-controls" aria-label="Camera controls"><button data-key="KeyQ" aria-label="Rotate camera left">↶</button><button data-key="KeyE" aria-label="Rotate camera right">↷</button></div>
    <nav class="touch-controls" aria-label="Touch controls"><div class="dpad"><button data-key="ArrowUp" aria-label="Move forward">▲</button><button data-key="ArrowLeft" aria-label="Move left">◀︎</button><button data-key="ArrowDown" aria-label="Move backward">▼</button><button data-key="ArrowRight" aria-label="Move right">▶︎</button></div><button class="jump" data-key="Space" aria-label="Jump">JUMP</button></nav>
  </main>`;
  const progression = localProgression();
  const results = createResultsUI(root);
  let lastPlayer: Readonly<PlayerState> | undefined;
  let lastPhase: RaceSnapshot["phase"] | undefined;
  const canvas = root.querySelector("canvas")!;
  root.dataset.phase = "selection";
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
    obstacleHits = 0,
    respawns = 0,
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
  const screens = ["selection", "prepare", "results", "pause"] as const;
  const screenElements = screens.map(name => ({ name, element: root.querySelector<HTMLElement>(`.${name}`)! }));
  const arenaName = root.querySelector("[data-arena-name]")!, arenaHint = root.querySelector("[data-arena-hint]")!;
  const progressLabel = root.querySelector("[data-progress-label]")!, progressBar = root.querySelector<HTMLElement>("[data-progress-bar]")!;
  const countdown = root.querySelector<HTMLElement>(".countdown")!, countdownNumber = countdown.querySelector("strong")!, countdownHint = countdown.querySelector("span")!;
  const setText = (element: Element, text: string) => { if (element.textContent !== text) element.textContent = text; };
  let lastArena = "", lastProgress = -1;
  function renderLevels() {
    root.querySelector(".level-grid")!.innerHTML = arenas.map((arena, i) => {
      const unlocked = progression.isUnlocked(arena.id);
      const best = progression.value.best[arena.id];
      return `<button class="level-card" data-level="${arena.id}" style="--arena-color:${arena.palette.accent};--arena-deck:${arena.palette.alternate}" ${unlocked ? "" : "disabled"} aria-label="${unlocked ? "Play" : "Locked"} ${arena.name}"><span class="level-number">0${i + 1}</span><span class="level-difficulty">${arena.difficulty}</span><strong>${arena.name}</strong><span class="level-description">${arena.description}</span><span class="level-record">${unlocked ? best ? `BEST ${formatTime(best)}` : "READY FOR YOUR FIRST RUN" : "COMPLETE THE PREVIOUS ARENA TO UNLOCK"}</span></button>`;
    }).join("");
    root.querySelectorAll<HTMLElement>(".storage-status").forEach(e => { e.textContent = e.closest(".results") ? progression.persistent ? "Saved on this device." : "Session only · storage unavailable." : progression.persistent ? "Best times and unlocked arenas are saved on this device." : "Storage unavailable · progress stays available for this session."; });
  }
  function selectArena(id: string) {
    if (!progression.isUnlocked(id)) return;
    clearInput(); won = false; checkpoint = recoveries = obstacleHits = respawns = 0;
    announce("Reach the finish beacon");
    game?.selectLevel(id);
    canvas.focus();
  }
  function handleSession(snapshot: RaceSnapshot & { progress: number }) {
    const arena = getArena(snapshot.arenaId);
    if (lastArena !== snapshot.arenaId) {
      root.style.setProperty("--arena-accent", arena.palette.accent);
      setText(arenaName, arena.name); setText(arenaHint, arena.subtitle);
      lastArena = snapshot.arenaId;
    }
    const percent = Math.round(snapshot.progress * 100);
    if (percent !== lastProgress) { setText(progressLabel, `${percent}%`); progressBar.style.width = `${percent}%`; lastProgress = percent; }
    const showCountdown = snapshot.phase === "countdown" || snapshot.go;
    if (countdown.hidden === showCountdown) countdown.hidden = !showCountdown;
    setText(countdownNumber, snapshot.go ? "GO!" : String(snapshot.countdown));
    setText(countdownHint, snapshot.go ? "MAKE YOUR ORBIT" : "READY TO LAUNCH");
    if (lastPhase !== snapshot.phase) {
      root.dataset.phase = snapshot.phase;
      for (const { name, element } of screenElements) element.hidden = snapshot.phase !== (name === "pause" ? "paused" : name === "results" ? "finished" : name);
      if (["selection", "prepare", "paused", "finished"].includes(snapshot.phase)) clearInput();
      if (snapshot.phase === "selection") renderLevels();
      if (snapshot.phase === "prepare") {
        root.querySelector("[data-prepare-title]")!.textContent = arena.name;
        root.querySelector("[data-prepare-description]")!.textContent = arena.description;
        root.querySelector(".route-list")!.textContent = arena.routes.map(r => r.name).join(" / ");
      }
      if (snapshot.phase === "finished" && lastPlayer?.won) {
        const improved = progression.complete(arena.id, lastPlayer.elapsed);
        const next = arenas[arenas.indexOf(arena) + 1];
        results.render({ elapsed: lastPlayer.elapsed, falls: lastPlayer.falls, bestTime: progression.value.best[arena.id] ?? lastPlayer.elapsed, personalBest: improved, nextArenaName: next?.name });
        renderLevels();
      }
      lastPhase = snapshot.phase;
    }
  }
  renderLevels();
  root.querySelector(".level-grid")!.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-level]");
    if (button && !button.disabled) selectArena(button.dataset.level!);
  }, options);
  root.querySelector("[data-start]")!.addEventListener("click", () => { clearInput(); game?.start(); canvas.focus(); }, options);
  root.querySelector("[data-resume]")!.addEventListener("click", () => { clearInput(); game?.resume(); canvas.focus(); }, options);
  root.querySelector("[data-replay]")!.addEventListener("click", () => restart(), options);
  root.querySelectorAll("[data-back], .arena-menu, .brand").forEach(button => button.addEventListener("click", event => { event.preventDefault(); clearInput(); game?.chooseLevel(); }, options));
  root.querySelector("[data-next]")!.addEventListener("click", () => {
    const current = arenas.findIndex(a => a.id === canvas.dataset.arena);
    const next = arenas[current + 1]; if (next) selectArena(next.id);
  }, options);
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
  window.addEventListener("blur", () => { clearInput(); game?.pause(); }, options);
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
    recoveries = obstacleHits = respawns = 0;
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
      root.querySelector<HTMLElement>(".fatal")!.hidden = false;
      message.textContent = "Graphics connection lost. Reload this page to resume.";
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
        lastPlayer = state;
        const arena = getArena(canvas.dataset.arena ?? arenas[0].id);
        time.textContent = formatTime(state.elapsed);
        falls.textContent = String(state.falls);
        checkpointCounter.textContent = `${state.checkpoint} / ${arena.checkpoints.length}`;
        root.classList.toggle("checkpoint-flash", state.checkpointFlash > 0);
        root.classList.toggle("celebrating", state.won);
        if (state.obstacleHits > obstacleHits && !state.recovery) {
          const hazard = arena.mechanisms.find(o => o.id === state.lastHazard);
          announce(hazard?.kind === "laser" ? "Laser hit! Regain your footing." : "Bumped! Steer back onto the deck.");
        }
        obstacleHits = state.obstacleHits;
        if (state.recovery && state.falls !== recoveries) {
          recoveries = state.falls;
          announce(
            state.recovery === "obstacle"
              ? "Sweeper hit! Returning to your checkpoint…"
              : "Returning to your checkpoint…",
          );
        } else if (!state.recovery && state.respawns > respawns)
          announce(
            state.checkpoint
              ? "Checkpoint recovered. You’ve got this!"
              : "Back on the launch pad. Try again!",
          );
        respawns = state.respawns;
        if (state.checkpoint > checkpoint) {
          checkpoint = state.checkpoint;
          message.textContent = `Checkpoint ${checkpoint} secured!`;
        }
        if (state.won && !won) {
          won = true;
          message.textContent =
            "Orbit complete! Nice landing, cadet. Restart to fly again.";
        }
        distance.textContent = `${Math.hypot(state.x - arena.finish.x, state.z - arena.finish.z).toFixed(1)}m`;
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
        raceFlow: true,
        onSession: handleSession,
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
