import { test, expect } from "@playwright/test";
test("real character GLB loads through the shared PlayCanvas source", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("http://127.0.0.1:5175");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-loaded", "true");
  expect(Number(await canvas.getAttribute("data-height"))).toBeCloseTo(1.8, 2);
  await expect(canvas).toHaveAttribute("data-meshes", "1");
  await expect(canvas).toHaveAttribute("data-materials", "1");
  await expect(canvas).toHaveAttribute("data-pbr-textures", "true");
  await expect(canvas).toHaveAttribute("data-pbr-channels", "g/b");
  expect(Math.abs(Number(await canvas.getAttribute("data-ground")))).toBeLessThan(0.005);
  const lit = await canvas.evaluate(
    (element) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const sample = document.createElement("canvas");
          sample.width = 64;
          sample.height = 64;
          const context = sample.getContext("2d")!;
          context.drawImage(element as HTMLCanvasElement, 0, 0, 64, 64);
          const values = context.getImageData(0, 0, 64, 64).data;
          let count = 0;
          for (let i = 0; i < values.length; i += 4)
            if (Math.max(values[i], values[i + 1], values[i + 2]) > 65) count++;
          resolve(count);
        }),
      ),
  );
  expect(lit).toBeGreaterThan(100);
  for (const name of ["Front", "Three-quarter", "Side", "Back"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.screenshot({
      path: `test-results/character-${name.toLowerCase()}-${info.project.name}.png`,
    });
  }
  expect(errors).toEqual([]);
});
