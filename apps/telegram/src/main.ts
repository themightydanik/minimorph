import { mountGame } from "@minimorph/game-ui";
import "@minimorph/game-ui/style.css";
import { initializeTelegram, loadTelegramBridge } from "./telegram";
declare const __EDITOR_ENABLED__: boolean;
if (__EDITOR_ENABLED__ && /^\/editor\/?$/.test(window.location.pathname)) {
  void Promise.all([
    import("@minimorph/game-engine/editor"),
    import("@minimorph/game-ui/playtest"),
  ]).then(([{ mountLevelEditor }, { mountPlaytest }]) => {
    const editor = mountLevelEditor(
      document.querySelector<HTMLElement>("#app")!,
      mountPlaytest,
    );
    window.addEventListener("pagehide", () => editor.destroy(), { once: true });
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
