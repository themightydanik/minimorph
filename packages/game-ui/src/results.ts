import { formatTime } from './progression';
export interface RaceResult {
  elapsed: number;
  falls: number;
  bestTime: number;
  personalBest: boolean;
  nextArenaName?: string;
}
/** Presentation only: session transitions and persistence stay in their own components. */
export function createResultsUI(root: HTMLElement) {
  const time = root.querySelector('[data-result-time]')!;
  const best = root.querySelector('[data-best-time]')!;
  const falls = root.querySelector('[data-result-falls]')!;
  const badge = root.querySelector('.result-badge')!;
  const next = root.querySelector<HTMLButtonElement>('[data-next]')!;
  return {
    render(result: RaceResult) {
      time.textContent = formatTime(result.elapsed);
      best.textContent = formatTime(result.bestTime);
      falls.textContent = String(result.falls);
      badge.textContent = result.personalBest ? 'PERSONAL BEST · A NEW ORBIT RECORD' : 'COURSE CLEARED · KEEP YOUR MOMENTUM';
      next.hidden = !result.nextArenaName;
      next.textContent = result.nextArenaName ? `Next: ${result.nextArenaName}` : 'Circuit complete';
    },
  };
}
