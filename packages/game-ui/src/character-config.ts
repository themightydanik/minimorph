/** Replace this URL/version when the artist supplies the next in-place GLB.
 * Contract: feet at origin, Y up, facing -Z, ~1.8 units, six named clips.
 * Vite fingerprints and packages the local asset for Telegram and offline MDS.
 */
export const characterConfig = {
  url: new URL('../../../assets/characters/minimorph/animation/minimorph_animated_v1.glb', import.meta.url).href,
  version: 'minimorph-animated-v1-temporary',
  scale: 1,
  yaw: 0,
  loadTimeoutMs: 20000,
};
