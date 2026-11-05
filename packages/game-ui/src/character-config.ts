/** Owner-approved PR #9 activation of the exact PR #8 candidate.
 * Rollback URL: animation/minimorph_animated_v1.glb (original kept intact).
 * Contract: feet at origin, Y up, facing -Z, ~1.8 units, six named clips.
 * Vite fingerprints and packages the local asset for Telegram and offline MDS.
 */
export const characterConfig = {
  url: new URL('../../../assets/characters/minimorph/optimization/minimorph_candidate_v1.glb', import.meta.url).href,
  version: 'minimorph-optimized-v1',
  scale: 1,
  yaw: 0,
  loadTimeoutMs: 20000,
};
