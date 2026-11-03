import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { RunSegment } from './arena-runs';
export async function chooseAndStart(page: Page, name = 'Cosmic Sprint', controlled = false) {
  await page.getByRole('button', { name: `Play ${name}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Race preparation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start race', exact: true }).click();
  if (controlled) await page.clock.fastForward(3100);
  await expect(page.locator('canvas')).toHaveAttribute('data-phase', 'racing', { timeout: 15000 });
}
export async function playRun(page: Page, segments: readonly RunSegment[], onSegment?: (index: number) => Promise<void>) {
 const held = new Set<string>();
 for(const [index, segment] of segments.entries()) {
  for(const key of held) if(!segment.keys.includes(key)) {await page.keyboard.up(key); held.delete(key);}
  for(const key of segment.keys) if(!held.has(key)) {await page.keyboard.down(key);held.add(key);}
  if(segment.jump) await page.keyboard.press('Space');
  await page.clock.runFor(Math.round(segment.seconds*1000));
  await onSegment?.(index);
 }
 for(const key of held) await page.keyboard.up(key);
}
