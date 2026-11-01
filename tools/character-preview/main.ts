import * as pc from "playcanvas";
import { gltfCharacterSource } from "@minimorph/game-engine";
const canvas = document.querySelector("canvas")!;
const status = document.querySelector<HTMLElement>("#status")!;
const app = new pc.Application(canvas, {
  graphicsDeviceOptions: {
    deviceTypes: ["webgl2"],
    alpha: false,
    antialias: false,
  },
});
app.setCanvasFillMode(
  pc.FILLMODE_NONE,
  canvas.clientWidth,
  canvas.clientHeight,
);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.graphicsDevice.maxPixelRatio = Math.min(devicePixelRatio, 1.5);
app.scene.ambientLight = new pc.Color(0.65, 0.7, 0.8);
const camera = new pc.Entity("Asset inspection camera");
camera.addComponent("camera", {
  clearColor: new pc.Color(0.025, 0.05, 0.08),
  fov: 40,
  nearClip: 0.05,
  farClip: 20,
});
app.root.addChild(camera);
const views: Record<string, number[]> = {
  front: [0, 1.1, -3.4],
  "three-quarter": [-2.2, 1.3, -3],
  side: [-3.4, 1.1, 0],
  back: [0, 1.1, 3.4],
};
function view(name: string) {
  const p = views[name];
  camera.setPosition(p[0], p[1], p[2]);
  camera.lookAt(0, 0.9, 0);
}
view("front");
for (const [rotation, intensity] of [
  [[25, -30, 0], 1.7],
  [[-20, 150, 0], 1.0],
] as const) {
  const light = new pc.Entity();
  light.addComponent("light", { type: "directional", intensity });
  light.setEulerAngles(rotation[0], rotation[1], rotation[2]);
  app.root.addChild(light);
}
const events = new AbortController();
const resize = () =>
  app.resizeCanvas(innerWidth, Math.round(innerHeight * 0.85));
window.addEventListener("resize", resize, { signal: events.signal });
resize();
document
  .querySelectorAll<HTMLButtonElement>("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => view(button.dataset.view!), {
      signal: events.signal,
    }),
  );
const source = gltfCharacterSource("/minimorph_v1.glb");
let visual: Awaited<ReturnType<typeof source.load>> | undefined;
void source
  .load(app, events.signal)
  .then((loaded) => {
    if (events.signal.aborted) {
      loaded.destroy();
      return;
    }
    visual = loaded;
    app.root.addChild(loaded.root);
    const renders = loaded.root.findComponents(
      "render",
    ) as pc.RenderComponent[];
    const meshes = renders.flatMap((render) => render.meshInstances);
    const bounds = meshes[0].aabb.clone();
    for (const mesh of meshes.slice(1)) bounds.add(mesh.aabb);
    canvas.dataset.height = String(bounds.halfExtents.y * 2);
    canvas.dataset.materials = String(
      new Set(meshes.map((mesh) => mesh.material)).size,
    );
    const fur = meshes.map((mesh) => mesh.material).find(
      (material) => material?.name === "Kitten_Fur_PBR",
    ) as pc.StandardMaterial | undefined;
    canvas.dataset.furTextures = String(Boolean(
      fur?.diffuseMap && fur.normalMap && fur.glossMap,
    ));
    canvas.dataset.meshes = String(meshes.length);
    canvas.dataset.loaded = "true";
    status.textContent =
      "Static GLB loaded via gltfCharacterSource. No rig or animation clips.";
  })
  .catch((error) => {
    status.textContent = String(error);
    canvas.dataset.error = "true";
  });
app.start();
window.addEventListener(
  "pagehide",
  () => {
    events.abort();
    visual?.destroy();
    app.destroy();
  },
  { once: true },
);
