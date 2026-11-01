export interface MdsBridge {
  init(callback: (message: { event?: string }) => void): void;
  cmd(command: string, callback: (result: { status?: boolean; response?: { chain?: { block?: number } } }) => void): void;
}
declare global { interface Window { MDS?: MdsBridge } }
// Presence of a session parameter is only a host hint, never an authentication claim.
export function hasMdsSession(search: string): boolean {
  return /^0x[0-9a-f]+$/i.test(new URLSearchParams(search).get('uid') ?? '') && new URLSearchParams(search).get('uid') !== '0x00';
}
export function connectMds(bridge: MdsBridge, report: (message: string) => void): () => void {
  let active = true, requested = false;
  const timeout = window.setTimeout(() => { if (active) report('MDS unavailable · practice still works'); }, 8000);
  try {
    bridge.init(message => {
      if (!active || requested || message.event !== 'inited') return;
      requested = true;
      try {
        bridge.cmd('status', result => {
          if (!active) return;
          window.clearTimeout(timeout);
          const block = result.response?.chain?.block;
          report(result.status && typeof block === 'number' ? `Minima node · block ${block} · read only` : 'Node status unavailable · practice still works');
        });
      } catch { window.clearTimeout(timeout); report('Node status unavailable · practice still works'); }
    });
  } catch { window.clearTimeout(timeout); report('MDS unavailable · practice still works'); }
  // The official SDK has a page-lifetime polling loop and no shutdown API.
  // Stop our callbacks here; page navigation terminates its own polling.
  return () => { active = false; window.clearTimeout(timeout); };
}
