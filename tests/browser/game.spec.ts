import { test, expect } from '@playwright/test';
for (const [target, port] of [['telegram', 5173], ['minima', 5174]] as const) {
  test(`${target}: renders, moves, jumps, recovers, restarts and resizes`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    // Browser practice must remain usable if the optional Telegram SDK is offline.
    await page.route('https://telegram.org/**', route => route.abort());
    await page.goto(`http://127.0.0.1:${port}`);
    const canvas = page.locator('canvas'); await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.host-status')).toContainText('Browser practice');
    const distance = page.locator('[data-distance]'); await expect(distance).toHaveText('34.0m');
    if (testInfo.project.name === 'mobile') {
      const forward = page.getByRole('button', { name: 'Move forward', exact: true });
      const box = (await forward.boundingBox())!;
      const jumpBox = (await page.getByRole('button', { name: 'Jump', exact: true }).boundingBox())!;
      const session = await page.context().newCDPSession(page);
      const direction = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [direction] });
      await expect(distance).not.toHaveText('34.0m');
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [direction, { x: jumpBox.x + jumpBox.width / 2, y: jumpBox.y + jumpBox.height / 2, id: 2 }] });
      await expect(canvas).toHaveAttribute('aria-description', 'Airborne');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else {
      await canvas.click(); await page.keyboard.down('KeyW'); await expect(distance).not.toHaveText('34.0m'); await page.keyboard.up('KeyW');
      await page.keyboard.press('Space');
    }
    await expect(canvas).toHaveAttribute('aria-description', 'Airborne');
    await expect(canvas).toHaveAttribute('aria-description', 'On platform');
    await canvas.focus(); await page.keyboard.down('KeyD');
    await expect(page.locator('[data-falls]')).toHaveText('1', { timeout: 7000 }); await page.keyboard.up('KeyD');
    await page.getByRole('button', { name: 'Restart' }).click();
    await expect(page.locator('[data-falls]')).toHaveText('0'); await expect(distance).toHaveText('34.0m');
    await page.setViewportSize({ width: 900, height: 450 });
    await expect.poll(() => canvas.evaluate(c => (c as HTMLCanvasElement).width / (c as HTMLCanvasElement).height)).toBeCloseTo(2, 1);
    await page.screenshot({ path: `test-results/${target}-${testInfo.project.name}.png` });
    expect(errors).toEqual([]);
  });
}
test('Telegram bridge initializes without using host data as authentication', async ({ page }) => {
  await page.addInitScript(() => {
    window.Telegram = { WebApp: { initData: 'mock-host-data', ready() { document.documentElement.dataset.tgReady = 'true'; }, expand() {}, viewportStableHeight: 640, onEvent() {}, offEvent() {} } };
  });
  await page.goto('http://127.0.0.1:5173');
  await expect(page.locator('html')).toHaveAttribute('data-tg-ready', 'true');
  await expect(page.locator('.host-status')).toHaveText('Telegram · practice mode');
});
test('MDS shell uses the bridge for status only (mock, not a live node)', async ({ page }) => {
  await page.route('**/mds.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.MDS = { init(cb) { cb({event:'inited'}); }, cmd(command, cb) { if(command !== 'status') throw new Error('Unexpected command'); cb({status:true,response:{chain:{block:123}}}); } };` }));
  await page.goto('http://127.0.0.1:5174/?uid=0x123abc');
  await expect(page.locator('.host-status')).toHaveText('Minima node · block 123 · read only');
});
