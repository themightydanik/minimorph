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
) {
  const entry = document.createElement("div");
  entry.className = "online-entry";
  entry.innerHTML = `<span class="eyebrow">SOLO / TRAINING BELOW · OR RACE ONLINE</span><div><label>NAME <input data-online-name maxlength="24" value="Cadet" autocomplete="nickname"></label><label>ARENA <select data-online-arena><option value="cosmic-sprint">Cosmic Sprint</option><option value="orbit-chaos">Orbit Chaos</option><option value="gravity-mayhem">Gravity Mayhem</option></select></label></div><div class="online-actions"><button data-quick>Quick Match</button><button data-create>Create Room</button><button data-private>Private Room</button></div><div data-code-form hidden><label>INVITATION <input data-room-code maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="ABC234"></label><button data-join>Join by Code</button></div>`;
  root.querySelector(".mode-tabs")!.before(entry);
  const panel = document.createElement("section");
  panel.className = "multiplayer-panel screen";
  panel.setAttribute("aria-label", "Multiplayer Lobby");
  panel.hidden = true;
  panel.innerHTML = `<div class="panel"><span class="eyebrow">LIVE ORBIT CIRCUIT</span><h2 data-mp-title>Multiplayer Lobby</h2><p data-mp-status role="status"></p><p data-mp-code></p><ul data-mp-players></ul><button class="primary" data-mp-start hidden>Start match</button><button data-mp-retry hidden>Retry connection</button><button data-mp-back>Solo / Training</button></div>`;
  root.append(panel);
  const live = document.createElement("aside");
  live.className = "multiplayer-live";
  live.hidden = true;
  live.innerHTML =
    "<strong data-mp-rank></strong><span data-mp-network></span><button data-mp-leave>Leave match</button>";
  root.append(live);
  let client: MultiplayerClient | undefined,
    active = false,
    lastMode: "quick" | "create" | "private" = "quick",
    lastCode = "",
    lastView = "";
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
    if (message) status.textContent = message;
    retry.hidden = state !== "unavailable";
    if (state === "unavailable") {
      start.hidden = true;
      title.textContent = "Online connection unavailable";
    }
    if (state === "reconnecting") title.textContent = "Reconnecting…";
  }
  function snapshot(s: RoomSnapshot, id: string) {
    if (!active) return;
    onAudioPhase?.(s.phase, s.phase === "countdown" ? Math.max(0, Math.ceil((s.startAt! - s.serverTime) / 1000)) : 0);
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
    start.hidden = !(s.phase === "waiting" && s.ownerId === id && s.code);
    const me = s.participants.find((p) => p.id === id);
    const arena = getArena(s.arenaId),
      section = arena.sections?.find(
        (v) => me && -me.state.z >= v.start && -me.state.z < v.end,
      );
    root.querySelector("[data-arena-name]")!.textContent = arena.name;
    root.querySelector("[data-arena-hint]")!.textContent =
      section?.name ?? "ONLINE RACE";
    root.querySelector("[data-section-hint]")!.textContent =
      section?.hint ?? "";
    const ordered = [...s.participants].sort(
      (a, b) =>
        (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) ||
        b.state.checkpoint - a.state.checkpoint ||
        a.state.z - b.state.z ||
        a.id.localeCompare(b.id),
    );
    const position = ordered.findIndex((p) => p.id === id) + 1;
    const percent = me?.state.won
      ? 100
      : Math.round(
          100 *
            Math.min(
              1,
              Math.max(
                0,
                (arena.spawn.z - (me?.state.z ?? arena.spawn.z)) /
                  (arena.spawn.z - arena.finish.z),
              ),
            ),
        );
    root.querySelector("[data-progress-label]")!.textContent = `${percent}%`;
    root.querySelector<HTMLElement>("[data-progress-bar]")!.style.width =
      `${percent}%`;
    live.querySelector("[data-mp-rank]")!.textContent =
      me?.status === "finished"
        ? "FINISHED · awaiting final results"
        : `${me?.name ?? "YOU"} · POSITION ${position} / ${s.participants.length} · ESTIMATE`;
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
      s.result?.rows.map((r) => ({
        id: r.id,
        name: r.name,
        bot: r.bot,
        text: `${r.place}. ${r.name} · ${r.bot ? "BOT" : "HUMAN"} · ${r.status === "finished" ? formatTime(r.time!) : "DNF"}`,
      })) ??
      s.participants.map((p) => ({
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
          return li;
        }),
      );
    }
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
      onWelcome: (s) => {
        getGame()?.setOnline(client, s.arenaId);
        hideSolo();
      },
    });
    client.connect({
      v: 2,
      type: "join",
      mode,
      name,
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
  start.addEventListener("click", () => client?.startMatch(), opts);
  retry.addEventListener("click", () => connect(lastMode, lastCode), opts);
  panel.querySelector("[data-mp-back]")!.addEventListener("click", leave, opts);
  live.querySelector("[data-mp-leave]")!.addEventListener("click", leave, opts);
  return {
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
