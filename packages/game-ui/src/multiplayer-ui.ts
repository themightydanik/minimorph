import { courseProgress, compareRaceParticipants } from "@minimorph/game-simulation";
import { TOURNAMENT_ROUNDS } from "@minimorph/multiplayer-protocol";
import { TournamentFeedback } from "./tournament-feedback";
import type { SoundCue } from "./audio";
import { getArena } from "@minimorph/game-content";
import { MultiplayerClient } from "@minimorph/multiplayer-client";
import type { ConnectionState } from "@minimorph/multiplayer-client";
import type { RoomSnapshot } from "@minimorph/multiplayer-protocol";
import type { Game } from "@minimorph/game-engine";
import type { Input } from "@minimorph/game-simulation";
import { formatTime } from "./progression";
export function mountMultiplayer(
  root: HTMLElement,
  getGame: () => Game | undefined,
  input: () => Input,
  clear: () => void,
  onAudioPhase?: (phase: string, countdown?: number) => void,
  onCue?: (cue: SoundCue) => void,
) {
  const entry = document.createElement("div");
  entry.className = "online-entry";
  entry.innerHTML = `<span class="eyebrow">8 → 6 → 4 · THREE ROUNDS · ONE CHAMPION</span><div><label>FORMAT <select data-online-experience aria-label="Multiplayer format"><option value="tournament">Tournament</option><option value="race">Single race</option></select></label><label>NAME <input data-online-name maxlength="24" value="Cadet" autocomplete="nickname"></label><label data-race-arena hidden>ARENA <select data-online-arena><option value="cosmic-sprint">Cosmic Sprint</option><option value="orbit-chaos">Orbit Chaos</option><option value="gravity-mayhem">Gravity Mayhem</option></select></label></div><div class="online-actions"><button data-quick>Quick Match</button><button data-create>Create Room</button><button data-private>Private Room</button></div><div data-code-form hidden><label>INVITATION <input data-room-code maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="ABC234"></label><button data-join>Join by Code</button></div>`;
  root.querySelector(".mode-tabs")!.before(entry);
  const panel = document.createElement("section");
  panel.className = "multiplayer-panel screen";
  panel.setAttribute("aria-label", "Multiplayer Lobby");
  panel.hidden = true;
  panel.innerHTML = `<div class="panel"><span class="eyebrow">LIVE ORBIT CIRCUIT</span><h2 data-mp-title>Multiplayer Lobby</h2><p data-mp-status role="status"></p><p data-mp-code></p><div class="tournament-rail" data-tournament-rail hidden aria-label="Tournament progression"></div><p class="tournament-own" data-tournament-own hidden></p><p data-tournament-next hidden></p><div class="champion-reveal" data-tournament-champion hidden></div><p class="tournament-summary" data-tournament-summary hidden></p><ul data-mp-players></ul><div class="tournament-actions"><button class="primary" data-mp-start hidden>Start match</button><button data-mp-retry hidden>Retry connection</button><button class="primary" data-tournament-replay hidden>Play Again</button><button data-mp-back>Solo / Training</button></div></div>`;
  root.append(panel);
  const live = document.createElement("aside");
  live.className = "multiplayer-live";
  live.hidden = true;
  live.innerHTML =
    "<strong data-tournament-live hidden></strong><span data-tournament-threshold hidden></span><strong data-mp-rank></strong><span data-mp-network></span><details class='live-standings' data-live-standings hidden><summary>Round standings</summary><ol></ol></details><nav class='spectator-controls' aria-label='Spectator controls' hidden><strong>SPECTATING</strong><span data-spectator-name></span><button data-spectator-prev aria-label='Previous racer'>←</button><button data-spectator-next aria-label='Next racer'>→</button></nav><button data-mp-leave>Leave match</button>";
  root.append(live);
  let client: MultiplayerClient | undefined,
    active = false,
    lastMode: "quick" | "create" | "private" = "quick",
    lastCode = "",
    lastView = "";
  const feedback = new TournamentFeedback();
  let latest: RoomSnapshot | undefined,
    localId = "",
    lastRail = "",
    lastStandingRows = "",
    lastPhaseView = "";
  const controller = new AbortController(),
    opts = { signal: controller.signal };
  const status = panel.querySelector<HTMLElement>("[data-mp-status]")!,
    list = panel.querySelector<HTMLElement>("[data-mp-players]")!,
    title = panel.querySelector<HTMLElement>("[data-mp-title]")!;
  const start = panel.querySelector<HTMLButtonElement>("[data-mp-start]")!,
    retry = panel.querySelector<HTMLButtonElement>("[data-mp-retry]")!;
  const env = (import.meta as ImportMeta & { env?: Record<string, string> })
    .env;
  const serverUrl = env?.VITE_MULTIPLAYER_WS_URL ?? "";
  const replay = panel.querySelector<HTMLButtonElement>(
    "[data-tournament-replay]",
  )!;
  const experience = entry.querySelector<HTMLSelectElement>(
    "[data-online-experience]",
  )!;
  function followName() {
    const s = latest;
    if (!s) return;
    const candidates = s.participants.filter(
      (p) => s.tournament?.activeIds.includes(p.id) && p.status === "racing",
    );
    const followed =
      candidates.find((p) => p.id === client?.followedId) ??
      candidates[0] ??
      s.participants.find((p) => p.id === s.tournament?.championId);
    live.querySelector("[data-spectator-name]")!.textContent =
      followed?.name ?? "Waiting for the next round";
    root.dataset.followedPlayer = followed?.id ?? "";
  }
  function hideSolo() {
    root
      .querySelectorAll<HTMLElement>(
        ".selection,.prepare,.results,.pause,.countdown",
      )
      .forEach((e) => (e.hidden = true));
  }
  function connection(state: ConnectionState, message: string) {
    if (!active) return;
    if (state === "reconnecting" || state === "unavailable") clear();
    root.dataset.phase =
      state === "racing"
        ? "racing"
        : state === "starting"
          ? "countdown"
          : state === "finished"
            ? "finished"
            : state === "tournament-results" || state === "completed"
              ? "finished"
              : "prepare";
    root.dataset.onlineState = state;
    panel.dataset.state = state;
    const racing = state === "racing";
    panel.hidden = racing;
    live.hidden = !racing;
    hideSolo();
    root
      .querySelectorAll<HTMLElement>(".telemetry,.mission,.race-progress")
      .forEach((e) => (e.style.visibility = racing ? "visible" : "hidden"));
    if (
      message &&
      (!latest?.tournament ||
        state === "reconnecting" ||
        state === "unavailable" ||
        state === "connecting")
    )
      status.textContent = message;
    retry.hidden = state !== "unavailable";
    if (state === "unavailable") {
      start.hidden = true;
      replay.hidden = true;
      title.textContent = "Online connection unavailable";
    }
    if (state === "reconnecting") title.textContent = "Reconnecting…";
  }
  function snapshot(s: RoomSnapshot, id: string) {
    if (!active) return;
    latest = s;
    localId = id;
    const t = s.tournament,
      me = s.participants.find((p) => p.id === id);
    const epoch = `${s.roomId}:${t?.edition ?? 0}:${t?.round ?? 0}`;
    getGame()?.setOnline(client, s.arenaId, epoch);
    const spectating =
      !!t && (me?.status !== "racing" || !t.activeIds.includes(id));
    root.dataset.spectating = String(spectating);
    root.dataset.tournamentRound = String(t?.round ?? 0);
    root.dataset.tournamentEdition = String(t?.edition ?? 0);
    if (spectating || s.phase !== "racing") clear();
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      ".touch-controls button",
    ))
      button.disabled = spectating;
    for (const cue of feedback.observe(s, id)) onCue?.(cue);
    onAudioPhase?.(
      s.phase === "tournament-results" ||
        s.phase === "completed" ||
        s.phase === "round-results"
        ? "finished"
        : s.phase === "intermission" || s.phase === "preparing"
          ? "paused"
          : s.phase,
      s.phase === "countdown"
        ? Math.max(0, Math.ceil((s.startAt! - s.serverTime) / 1000))
        : 0,
    );
    root.dataset.onlineRoom = s.roomId;
    root.dataset.onlinePhase = s.phase;
    title.textContent =
      s.phase === "finished"
        ? "Race results"
        : s.phase === "countdown"
          ? String(
              Math.max(0, Math.ceil((s.startAt! - s.serverTime) / 1000)),
            ) || "GO!"
          : "Multiplayer Lobby";
    panel.querySelector("[data-mp-code]")!.textContent = s.code
      ? `INVITE CODE · ${s.code}`
      : "";
    start.disabled = false;
    start.hidden = !(s.phase === "waiting" && s.ownerId === id && s.code);
    const arena = getArena(s.arenaId),
      viewed = spectating
        ? (s.participants.find((p) => p.id === client?.followedId) ??
          s.participants.find(
            (p) => t?.activeIds.includes(p.id) && p.status === "racing",
          ))
        : me,
      section = arena.sections?.find(
        (v) => viewed && -viewed.state.z >= v.start && -viewed.state.z < v.end,
      );
    root.querySelector("[data-arena-name]")!.textContent = arena.name;
    root.querySelector("[data-arena-hint]")!.textContent =
      section?.name ?? "ONLINE RACE";
    root.querySelector("[data-section-hint]")!.textContent =
      section?.hint ?? "";
    const ordered = t
      ? t.orderIds.map((id) => s.participants.find((p) => p.id === id)!)
      : s.participants
          .slice()
          .sort((a, b) => compareRaceParticipants(a, b, arena));
    const position = ordered.findIndex((p) => p.id === id) + 1;
    const percent = Math.round(100 * courseProgress(arena,
      viewed?.state ?? { ...arena.spawn, checkpoint: 0, won: false }));
    root.querySelector("[data-progress-label]")!.textContent = `${percent}%`;
    root.querySelector<HTMLElement>("[data-progress-bar]")!.style.width =
      `${percent}%`;
    live.querySelector("[data-mp-rank]")!.textContent = spectating
      ? "SPECTATING · follow the remaining racers"
      : me?.status === "finished"
        ? "FINISHED · awaiting final results"
        : `${me?.name ?? "YOU"} · POSITION ${position} / ${ordered.length}${t ? "" : " · ESTIMATE"}`;
    live.querySelector("[data-mp-network]")!.textContent =
      `${Math.round(client?.rtt ?? 0)} ms · ${Math.round(s.elapsed)} s`;
    status.textContent =
      s.phase === "waiting"
        ? s.code
          ? `${s.participants.length} / 8 humans · Owner starts; bots fill empty slots.`
          : `${s.participants.length} / 8 humans · Bots join in ${Math.max(0, Math.ceil((s.waitUntil - s.serverTime) / 1000))}s.`
        : s.phase === "countdown"
          ? "One server. One start. Get ready."
          : s.phase === "finished"
            ? "Final positions verified by the server."
            : "";
    const rows =
      (t?.placements.length ? t.placements : s.result?.rows)?.map((r) => ({
        id: r.id,
        name: r.name,
        bot: r.bot,
        text: `${r.place}. ${r.name} · ${r.bot ? "BOT" : "HUMAN"} · ${r.status === "finished" ? formatTime(r.time!) : "DNF"}${t?.placements.length && "roundReached" in r ? ` · ROUND ${r.roundReached}` : ""}${t && t.round < 3 ? (t.qualifiedIds.includes(r.id) ? " · QUALIFIED" : " · ELIMINATED") : ""}`,
      })) ??
      s.participants
        .filter((p) => !t || t.activeIds.includes(p.id))
        .sort(
          (a, b) =>
            Number(b.id === id) - Number(a.id === id) || a.color - b.color,
        )
        .map((p) => ({
          id: p.id,
          name: p.name,
          bot: p.bot,
          text: `${p.name} · ${p.bot ? p.skill?.toUpperCase() + " BOT" : "HUMAN"}${p.connected ? "" : " · reconnecting"}`,
        }));
    const view = JSON.stringify(rows);
    if (view !== lastView) {
      lastView = view;
      list.replaceChildren(
        ...rows.map((r) => {
          const li = document.createElement("li");
          li.textContent = r.text;
          li.classList.toggle("local-result", r.id === id);
          li.classList.toggle(
            "qualified-result",
            !!t?.qualifiedIds.includes(r.id),
          );
          li.classList.toggle(
            "eliminated-result",
            !!t?.eliminatedIds.includes(r.id),
          );
          return li;
        }),
      );
    }
    renderTournament(s, id);
  }
  function renderTournament(s: RoomSnapshot, id: string) {
    const t = s.tournament;
    for (const selector of [
      "[data-tournament-rail]",
      "[data-tournament-own]",
      "[data-tournament-next]",
      "[data-tournament-live]",
      "[data-tournament-threshold]",
      "[data-live-standings]",
    ])
      root.querySelector<HTMLElement>(selector)!.hidden = !t;
    replay.hidden =
      !t || !["tournament-results", "completed"].includes(s.phase);
    replay.disabled = false;
    const champion = panel.querySelector<HTMLElement>(
        "[data-tournament-champion]",
      )!,
      summary = panel.querySelector<HTMLElement>("[data-tournament-summary]")!;
    champion.hidden = summary.hidden =
      !t || !["tournament-results", "completed"].includes(s.phase);
    const spectator = live.querySelector<HTMLElement>(".spectator-controls")!;
    spectator.hidden = !t || root.dataset.spectating !== "true";
    if (!t) {
      panel.querySelector<HTMLElement>("[data-mp-code]")!.hidden = false;
      panel.querySelector("[data-mp-back]")!.textContent = "Solo / Training";
      return;
    }
    const finalView = ["tournament-results", "completed"].includes(s.phase);
    panel.querySelector<HTMLElement>("[data-tournament-rail]")!.hidden =
      finalView;
    panel.querySelector<HTMLElement>("[data-mp-code]")!.hidden = finalView;
    const definition = TOURNAMENT_ROUNDS[t.round - 1],
      own = s.participants.find((p) => p.id === id),
      last = t.history.at(-1),
      count = Math.max(
        0,
        Math.ceil(
          ((s.phase === "countdown" ? s.startAt : t.transitionAt) ??
            s.serverTime) - s.serverTime,
        ) / 1000,
      );
    panel.querySelector("[data-mp-back]")!.textContent = [
      "tournament-results",
      "completed",
    ].includes(s.phase)
      ? "Main Menu"
      : "Solo / Training";
    title.textContent =
      s.phase === "waiting"
        ? "Tournament Lobby"
        : s.phase === "round-results"
          ? "Round results"
          : s.phase === "intermission"
            ? "Next orbit"
            : s.phase === "preparing"
              ? `Preparing round ${t.round}`
              : s.phase === "tournament-results" || s.phase === "completed"
                ? "Tournament champion"
                : s.phase === "countdown"
                  ? `Round ${t.round} · ${Math.ceil(count)} — GET READY`
                  : "Tournament";
    const railKey = `${s.roomId}:${t.edition}:${t.round}`;
    if (railKey !== lastRail) {
      lastRail = railKey;
      panel.querySelector("[data-tournament-rail]")!.replaceChildren(
        ...TOURNAMENT_ROUNDS.map((r, i) => {
          const chip = document.createElement("span");
          chip.textContent = `${i + 1} · ${getArena(r.arenaId).name} · ${r.capacity} → ${i === 2 ? "CHAMPION" : r.qualify}`;
          chip.classList.toggle("current", i + 1 === t.round);
          return chip;
        }),
      );
    }
    const ownRound = [...t.history]
        .reverse()
        .find((r) => r.rows.some((p) => p.id === id)),
      ownRow = ownRound?.rows.find((p) => p.id === id);
    const ownText = panel.querySelector<HTMLElement>("[data-tournament-own]")!,
      ownResult = last?.rows.find((p) => p.id === id),
      ownPlacement = t.placements.find((p) => p.id === id);
    ownText.textContent = ownPlacement
      ? `YOUR TOURNAMENT PLACE · ${ownPlacement.place} / ${t.placements.length}`
      : own?.status === "eliminated"
        ? `ELIMINATED · ROUND ${ownRound?.round ?? t.round} · PLACE ${ownRow?.place ?? "—"} · SPECTATING`
        : ownResult && last!.qualifiedIds.includes(id)
          ? `QUALIFIED · place ${ownResult.place}${ownResult.status === "dnf" ? " · timeout progress ranking" : ""}`
          : s.phase === "waiting"
            ? "Three rounds. One room. One champion."
            : `ROUND ${t.round} · ${t.round === 3 ? "First finish wins" : `Top ${definition.qualify} advance`}`;
    ownText.classList.toggle("eliminated-result", own?.status === "eliminated");
    const next =
      t.round < 3 ? getArena(TOURNAMENT_ROUNDS[t.round].arenaId).name : "";
    panel.querySelector("[data-tournament-next]")!.textContent =
      s.phase === "round-results" || s.phase === "intermission"
        ? `NEXT · ${next} · ${s.phase === "round-results" ? "RESULTS" : "INTERMISSION"} ${Math.ceil(count)}s`
        : s.phase === "preparing"
          ? `Resetting the course · ${Math.ceil(count)}s`
          : s.phase === "completed" || s.phase === "tournament-results"
            ? s.ownerId === id
              ? "Play Again starts a new tournament in this room."
              : "The owner can rematch this room. Play Again finds a new tournament."
            : `${t.activeIds.length} racers · ${t.round === 3 ? "FINAL" : `TOP ${definition.qualify} QUALIFY`}`;
    const humans = s.participants.filter((p) => !p.bot).length,
      bots = s.participants.length - humans,
      rosterLabel = `${humans} ${humans === 1 ? "human" : "humans"} · ${bots} ${bots === 1 ? "bot" : "bots"}`;
    if (s.phase === "waiting")
      status.textContent = s.code
        ? `${rosterLabel} · Owner starts.`
        : `${rosterLabel} · Starts in ${Math.max(0, Math.ceil((s.waitUntil - s.serverTime) / 1000))}s.`;
    else if (s.phase === "round-results" || s.phase === "intermission")
      status.textContent = `${t.qualifiedIds.length} QUALIFIED · ${t.activeIds.length - t.qualifiedIds.length} ELIMINATED`;
    live.querySelector("[data-tournament-live]")!.textContent =
      `ROUND ${t.round} / 3 · ${getArena(s.arenaId).name}${t.round === 3 ? " · FINAL" : ""}`;
    const championName = s.participants.find(
      (p) => p.id === t.championId,
    )?.name;
    live.querySelector("[data-tournament-threshold]")!.textContent =
      `${t.round === 3 ? (championName ? `CHAMPION · ${championName}` : "FIRST FINISH WINS") : `TOP ${definition.qualify} · ${t.qualifiedIds.length} QUALIFIED`} · ${Math.max(0, Math.ceil(((t.raceDeadline ?? s.serverTime) - s.serverTime) / 1000))}s LEFT`;
    const standings = live.querySelector<HTMLOListElement>(
      "[data-live-standings] ol",
    )!;
    const standingKey = JSON.stringify([t.orderIds, t.qualifiedIds]);
    if (standingKey !== lastStandingRows) {
      lastStandingRows = standingKey;
      standings.replaceChildren(
        ...t.orderIds
          .map((id) => s.participants.find((p) => p.id === id)!)
          .map((p, i) => {
            const row = document.createElement("li");
            row.textContent = `${i + 1}. ${p.name}${p.bot ? " · BOT" : ""}${t.qualifiedIds.includes(p.id) ? " · QUALIFIED" : ""}`;
            return row;
          }),
      );
    }
    champion.textContent = `★ ${championName ?? "Champion pending"} ★`;
    summary.textContent = t.history
      .map(
        (r) =>
          `ROUND ${r.round}: ${getArena(r.arenaId).name} · ${r.round < 3 ? `${r.qualifiedIds.length} qualified` : "final"}`,
      )
      .join(" / ");
    const phaseView = `${s.roomId}:${t.edition}:${t.round}:${s.phase}`;
    if (phaseView !== lastPhaseView) {
      lastPhaseView = phaseView;
      list.scrollTop = 0;
      panel.querySelector<HTMLElement>(".panel")!.scrollTop = 0;
    }
    const message = root.querySelector(".message");
    if (message)
      message.textContent = finalView
        ? `Tournament complete · ${championName ?? "Champion"} takes the crown`
        : root.dataset.spectating === "true"
          ? "Spectating · switch racers with the arrow buttons"
          : t.round === 3
            ? "Final round · first finish wins"
            : `Top ${definition.qualify} qualify · find your racing line`;
    followName();
  }
  function connect(mode: "quick" | "create" | "private", code = "") {
    clear();
    client?.stop();
    active = true;
    lastMode = mode;
    lastCode = code;
    hideSolo();
    panel.hidden = false;
    live.hidden = true;
    lastView = "";
    latest = undefined;
    list.replaceChildren();
    title.textContent = "Multiplayer Lobby";
    retry.hidden = true;
    start.hidden = true;
    if (!serverUrl) {
      connection(
        "unavailable",
        "Online play is not available on this host yet. Solo and Training remain playable.",
      );
      return;
    }
    const name = root
      .querySelector<HTMLInputElement>("[data-online-name]")!
      .value.trim();
    if (!/^[\p{L}\p{N} _.-]{1,24}$/u.test(name)) {
      connection(
        "unavailable",
        "Use 1–24 letters, numbers, spaces or . _ - for your name.",
      );
      return;
    }
    client = new MultiplayerClient(serverUrl, input, {
      onState: connection,
      onSnapshot: snapshot,
      onWelcome: (s, id) => {
        feedback.seed(s, id);
        getGame()?.setOnline(
          client,
          s.arenaId,
          `${s.roomId}:${s.tournament?.edition ?? 0}:${s.tournament?.round ?? 0}`,
        );
        hideSolo();
      },
    });
    client.connect({
      v: 2,
      type: "join",
      mode,
      name,
      experience: experience.value as "race" | "tournament",
      arenaId: root.querySelector<HTMLSelectElement>("[data-online-arena]")!
        .value,
      ...(code ? { code } : {}),
    });
  }
  function leave() {
    client?.stop();
    client = undefined;
    active = false;
    onAudioPhase?.("selection");
    clear();
    panel.hidden = true;
    live.hidden = true;
    delete root.dataset.onlineState;
    delete root.dataset.onlineRoom;
    delete root.dataset.onlinePhase;
    delete root.dataset.spectating;
    delete root.dataset.tournamentRound;
    delete root.dataset.tournamentEdition;
    delete root.dataset.followedPlayer;
    latest = undefined;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      ".touch-controls button",
    ))
      button.disabled = false;
    root
      .querySelectorAll<HTMLElement>(".telemetry,.mission,.race-progress")
      .forEach((e) => (e.style.visibility = ""));
    getGame()?.setOnline(undefined);
    root.querySelector<HTMLElement>(".selection")!.hidden = false;
    root.dataset.phase = "selection";
  }
  entry
    .querySelector("[data-quick]")!
    .addEventListener("click", () => connect("quick"), opts);
  entry
    .querySelector("[data-create]")!
    .addEventListener("click", () => connect("create"), opts);
  entry.querySelector("[data-private]")!.addEventListener(
    "click",
    () => {
      const form = entry.querySelector<HTMLElement>("[data-code-form]")!;
      form.hidden = !form.hidden;
    },
    opts,
  );
  entry.querySelector("[data-join]")!.addEventListener(
    "click",
    () => {
      const code = entry
        .querySelector<HTMLInputElement>("[data-room-code]")!
        .value.trim()
        .toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(code)) {
        entry
          .querySelector<HTMLInputElement>("[data-room-code]")!
          .setCustomValidity("Enter a six-character invitation code.");
        entry
          .querySelector<HTMLInputElement>("[data-room-code]")!
          .reportValidity();
        return;
      }
      connect("private", code);
    },
    opts,
  );
  entry
    .querySelector("[data-room-code]")!
    .addEventListener(
      "input",
      () =>
        entry
          .querySelector<HTMLInputElement>("[data-room-code]")!
          .setCustomValidity(""),
      opts,
    );
  experience.addEventListener(
    "change",
    () => {
      entry.querySelector<HTMLElement>("[data-race-arena]")!.hidden =
        experience.value !== "race";
    },
    opts,
  );
  live.querySelector("[data-spectator-prev]")!.addEventListener(
    "click",
    () => {
      client?.spectate(-1);
      followName();
    },
    opts,
  );
  live.querySelector("[data-spectator-next]")!.addEventListener(
    "click",
    () => {
      client?.spectate(1);
      followName();
    },
    opts,
  );
  replay.addEventListener(
    "click",
    () => {
      if (latest?.ownerId === localId) {
        replay.disabled = true;
        clear();
        client?.replayMatch();
      } else {
        leave();
        connect("quick");
      }
    },
    opts,
  );
  start.addEventListener(
    "click",
    () => {
      start.disabled = true;
      client?.startMatch();
    },
    opts,
  );
  retry.addEventListener("click", () => connect(lastMode, lastCode), opts);
  panel.querySelector("[data-mp-back]")!.addEventListener("click", leave, opts);
  live.querySelector("[data-mp-leave]")!.addEventListener("click", leave, opts);
  return {
    get tournament() {
      return !!latest?.tournament;
    },
    get active() {
      return active;
    },
    leave,
    destroy() {
      client?.stop();
      controller.abort();
      panel.remove();
      live.remove();
      entry.remove();
    },
  };
}
