import { mountGame } from "@minimorph/game-ui";
import "@minimorph/game-ui/style.css";
import { initializeTelegram, loadTelegramBridge } from "./telegram";
declare const __EDITOR_ENABLED__: boolean;
if (__EDITOR_ENABLED__ && /^\/editor\/?$/.test(window.location.pathname)) {
  void Promise.all([
    import("@minimorph/game-engine/editor"),
    import("@minimorph/game-ui/playtest"),
    import("./arena-draft-editor"),
  ]).then(([{ mountLevelEditor }, { mountPlaytest }, { mountArenaDraftEditor }]) => {
    const host = document.querySelector<HTMLElement>("#app")!;
    const choice = document.createElement("div");
    choice.style.cssText = "position:fixed;z-index:999;right:12px;top:12px;background:#111b35;color:white;padding:8px;border-radius:8px";
    choice.innerHTML = '<label>Editor mode <select><option value="cosmic">Cosmic Sprint 3D editor</option><option value="all">All tracks · top-down editor</option></select></label>';
    document.body.append(choice);
    const select = choice.querySelector("select")!;
    let current: { destroy(): void } | undefined;
    const mount = () => {
      current?.destroy();
      current = select.value === "cosmic" ? mountLevelEditor(host, mountPlaytest) : mountArenaDraftEditor(host, mountPlaytest);
    };
    select.addEventListener("change", mount);
    mount();
    window.addEventListener("pagehide", () => { current?.destroy(); choice.remove(); }, { once: true });
  });
} else {
  const game = mountGame(
    document.querySelector<HTMLElement>("#app")!,
    "TELEGRAM / FREE PLAY",
  );
  game.setHostStatus("Browser practice · connecting to Telegram…");
  let destroyed = false;
  let host: ReturnType<typeof initializeTelegram> | undefined;
  void loadTelegramBridge().then(() => {
    if (!destroyed) {
      host = initializeTelegram();
      game.setHostStatus(host.label);
    }
  });
  window.addEventListener(
    "pagehide",
    () => {
      destroyed = true;
      host?.destroy();
      game.destroy();
    },
    { once: true },
  );
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) window.location.reload();
  });
}
