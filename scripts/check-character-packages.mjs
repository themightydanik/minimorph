import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const approval = JSON.parse(await readFile(new URL('../assets/characters/minimorph/optimization/production-approval.json', import.meta.url)));
const audio = JSON.parse(await readFile(new URL('../assets/audio/manifest.json', import.meta.url)));
const sha = data => createHash('sha256').update(data).digest('hex');
assert.equal(approval.approvedForProduction, true);
assert.equal(sha(await readFile(new URL('../' + approval.original, import.meta.url))), approval.originalSha256);
assert.equal(sha(await readFile(new URL('../' + approval.candidate, import.meta.url))), approval.candidateSha256);
for (const target of ['telegram', 'minima']) {
  const directory = new URL(`../apps/${target}/dist/assets/`, import.meta.url);
  const models = (await readdir(directory)).filter(name => name.endsWith('.glb'));
  assert.equal(models.length, 1, `${target}: exactly one production character GLB`);
  assert.ok(models[0].startsWith('minimorph_candidate_v1-'));
  assert.equal(sha(await readFile(new URL(models[0], directory))), approval.candidateSha256);
  const files = await readdir(directory);
  for (const [name, info] of Object.entries(audio.assets)) {
    const filename = files.find(file => file.startsWith(name + '-') && file.endsWith('.wav'));
    assert.ok(filename, `${target}: missing audio ${name}`);
    assert.equal(sha(await readFile(new URL(filename, directory))), info.sha256);
  }
  console.log(`${target}: 13 original audio assets verified`);
  console.log(`${target}: exact owner-approved character bundled; original intact for rollback`);
}
