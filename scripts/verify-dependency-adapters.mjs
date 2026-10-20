import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Fail the build if an SDK upgrade or install restores either unverified package.
const root = new URL('../', import.meta.url);
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
for (const [alias, directory, name, consumer, version] of [
  ['is-node-process', 'runtime-context', '@magic-app/runtime-context', '@vercel/blob', '2.8.0'],
  ['promise-limit', 'task-queue', '@magic-app/task-queue', '@libsql/client', '0.18.0'],
]) {
  assert.equal(manifest.dependencies[consumer], version, `Review the ${consumer} adapter contract before upgrading`);
  assert.equal(manifest.dependencies[alias], `file:vendor/${directory}`);
  assert.equal(manifest.overrides[alias], `$${alias}`);
  const entries = Object.entries(lock.packages).filter(([path]) => path.endsWith(`node_modules/${alias}`));
  assert.equal(entries.length, 1, `Unexpected extra copy of ${alias}`);
  assert.equal(entries[0][1].name, name);
  assert.equal(entries[0][1].resolved, `file:vendor/${directory}`);
  const require = createRequire(createRequire(import.meta.url).resolve(consumer));
  const installed = await readFile(require.resolve(alias), 'utf8');
  assert.equal(installed, await readFile(new URL(`vendor/${directory}/index.cjs`, root), 'utf8'), `Wrong installed ${alias} implementation`);
}
