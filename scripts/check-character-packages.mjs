import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const approval = JSON.parse(await readFile(new URL('../assets/characters/minimorph/optimization/production-approval.json', import.meta.url)));
const cosmic = JSON.parse(await readFile(new URL('../assets/arenas/cosmic-sprint/inventory.json', import.meta.url)));
const audio = JSON.parse(await readFile(new URL('../assets/audio/manifest.json', import.meta.url)));
const sha = data => createHash('sha256').update(data).digest('hex');
assert.equal(approval.approvedForProduction, true);
assert.equal(sha(await readFile(new URL('../' + approval.original, import.meta.url))), approval.originalSha256);
assert.equal(sha(await readFile(new URL('../' + approval.candidate, import.meta.url))), approval.candidateSha256);
for (const target of ['telegram', 'minima']) {
  const directory = new URL(`../apps/${target}/dist/assets/`, import.meta.url);
  const models = (await readdir(directory)).filter(name => name.endsWith('.glb'));
  const characters = models.filter(name => name.startsWith('minimorph_candidate_v1-'));
  assert.equal(characters.length, 1, `${target}: exactly one production character GLB`);
  assert.equal(sha(await readFile(new URL(characters[0], directory))), approval.candidateSha256);
  const environment = models.filter(name => !characters.includes(name));
  assert.equal(environment.length, 14, `${target}: only the 14 referenced Cosmic models are bundled`);
  for (const filename of environment) {
    const entry = cosmic.assets.find(asset => filename.startsWith(asset.runtime.replace('.glb', '-') ));
    assert.ok(entry, `${target}: unknown environment model ${filename}`);
    assert.equal(sha(await readFile(new URL(filename, directory))), entry.runtimeSha256);
  }
  console.log(`${target}: 14 local Cosmic GLBs verified against pinned runtime hashes`);
  const files = await readdir(directory);
  for (const [name, info] of Object.entries(audio.assets)) {
    const filename = files.find(file => file.startsWith(name + '-') && file.endsWith('.wav'));
    assert.ok(filename, `${target}: missing audio ${name}`);
    assert.equal(sha(await readFile(new URL(filename, directory))), info.sha256);
  }
  console.log(`${target}: 13 original audio assets verified`);
  console.log(`${target}: exact owner-approved character bundled; original intact for rollback`);
}
