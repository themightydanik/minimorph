interface TelegramWebApp {
  initData?: string;
  ready(): void; expand(): void;
  viewportStableHeight?: number;
  onEvent(name: string, callback: () => void): void;
  offEvent(name: string, callback: () => void): void;
}
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }
// This bridge never treats host-provided user information as authentication.
export function initializeTelegram(): { label: string; destroy(): void } {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.initData) return { label: 'Browser practice · no account required', destroy() {} };
  const resize = () => {
    const height = webApp.viewportStableHeight;
    if (height && height > 0) document.documentElement.style.setProperty('--app-height', `${height}px`);
  };
  try {
    webApp.ready(); webApp.expand(); webApp.onEvent('viewportChanged', resize); resize();
    return { label: 'Telegram · practice mode', destroy() { webApp.offEvent('viewportChanged', resize); document.documentElement.style.removeProperty('--app-height'); } };
  } catch { return { label: 'Telegram bridge unavailable · browser practice', destroy() {} }; }
}
export async function loadTelegramBridge(): Promise<void> {
  if (window.Telegram?.WebApp) return;
  // The official bridge is optional: unavailable networking must not block practice.
  await new Promise<void>(resolve => {
    const script = document.createElement('script'); script.src = 'https://telegram.org/js/telegram-web-app.js'; script.async = true;
    const timer = window.setTimeout(resolve, 3000);
    const done = () => { window.clearTimeout(timer); resolve(); };
    script.onload = done; script.onerror = done; document.head.append(script);
  });
}
