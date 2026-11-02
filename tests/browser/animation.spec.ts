import { test, expect } from '@playwright/test';
test('experimental skeletal GLB switches and plays actual animation clips', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:5175/animation.html');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-loaded', 'true');
  await expect(canvas).toHaveAttribute('data-animation-clips', '6');
  await expect(canvas).toHaveAttribute('data-bones', '20');
  await expect(canvas).toHaveAttribute('data-clip', 'Idle');
  await expect.poll(async () => Number(await canvas.getAttribute('data-animation-time'))).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-playing', 'false');
  const paused = Number(await canvas.getAttribute('data-animation-time'));
  await page.waitForTimeout(200);
  expect(Number(await canvas.getAttribute('data-animation-time'))).toBeCloseTo(paused, 3);
  const neutralHand = await canvas.getAttribute('data-hand-position');
  await page.locator('#clip').selectOption('Run');
  await expect(canvas).toHaveAttribute('data-clip', 'Run');
  await expect.poll(async () => await canvas.getAttribute('data-hand-position')).not.toBe(neutralHand);
  await page.locator('#speed').focus();
  await page.locator('#speed').press('End');
  await expect(canvas).toHaveAttribute('data-animation-speed', '2');
  for (const name of ['Jump', 'Fall', 'Land', 'Victory']) {
    await page.locator('#clip').selectOption(name);
    await expect(canvas).toHaveAttribute('data-clip', name);
    if (name !== 'Fall') await expect(page.locator('#loop')).toBeDisabled();
  }
  await page.getByRole('button', { name: 'Neutral pose' }).click();
  await expect(canvas).toHaveAttribute('data-clip', 'Neutral');
  await expect(canvas).toHaveAttribute('data-playing', 'false');
  await page.screenshot({ path: `test-results/animation-neutral-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
