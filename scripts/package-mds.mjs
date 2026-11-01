import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync } from 'fflate';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = `${root}apps/minima/dist`;
const config = JSON.parse(await readFile(`${dist}/dapp.conf`, 'utf8'));
assert.equal(config.permission, 'read');
for (const key of ['name', 'version', 'description', 'icon', 'category']) assert.ok(config[key], `Missing ${key}`);
// Object insertion order is ZIP entry order. No wrapper directory.
const entries = { 'dapp.conf': new Uint8Array(await readFile(`${dist}/dapp.conf`)) };
async function collect(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) await collect(`${directory}/${entry.name}`, name + '/');
    else if (name !== 'dapp.conf') entries[name] = new Uint8Array(await readFile(`${directory}/${entry.name}`));
  }
}
await collect(dist);
for (const name of ['index.html', 'mds.js', 'MDS-LICENSE.txt', config.icon]) assert.ok(entries[name], `Missing ${name}`);
const html = new TextDecoder().decode(entries['index.html']);
assert.ok(!/(?:src|href)=["']\//.test(html), 'MDS assets must use relative paths');
const zip = zipSync(entries, { level: 6 });
const firstNameLength = zip[26] | zip[27] << 8;
assert.equal(new TextDecoder().decode(zip.slice(30, 30 + firstNameLength)), 'dapp.conf');
const extracted = unzipSync(zip);
assert.deepEqual(Object.keys(extracted), Object.keys(entries));
for (const name of Object.keys(entries)) assert.deepEqual(extracted[name], entries[name]);
await mkdir(`${root}artifacts`, { recursive: true });
await writeFile(`${root}artifacts/minimorph-${config.version}.mds.zip`, zip);
console.log(`Validated ${Object.keys(entries).length} entries; dapp.conf first; read permission; relative assets. artifacts/minimorph-${config.version}.mds.zip (${zip.length} bytes)`);
