import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { build } from 'esbuild';
import createTaskQueue from 'promise-limit';
import { isNodeProcess } from 'is-node-process';
import { createClient } from '@libsql/client/http';

const root = new URL('../', import.meta.url);
const pause = () => new Promise(resolve => setImmediate(resolve));

test('both SDKs resolve the original local adapters through ESM and CommonJS', async () => {
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(manifest.dependencies['@vercel/blob'], '2.8.0');
  assert.equal(manifest.dependencies['@libsql/client'], '0.18.0');
  for (const [alias, directory, name, consumer] of [
    ['is-node-process', 'runtime-context', '@magic-app/runtime-context', '@vercel/blob'],
    ['promise-limit', 'task-queue', '@magic-app/task-queue', '@libsql/client'],
  ]) {
    const entry = lock.packages[`node_modules/${alias}`];
    assert.equal(entry.name, name);
    assert.equal(entry.resolved, `file:vendor/${directory}`);
    assert.equal(entry.license, 'UNLICENSED');
    assert.equal(manifest.overrides[alias], `$${alias}`);
    const requireFromConsumer = createRequire(createRequire(import.meta.url).resolve(consumer));
    const installed = await readFile(requireFromConsumer.resolve(alias), 'utf8');
    assert.equal(installed, await readFile(new URL(`vendor/${directory}/index.cjs`, root), 'utf8'));
    assert.equal(typeof requireFromConsumer(alias), alias === 'promise-limit' ? 'function' : 'object');
  }
  assert.equal(isNodeProcess(), true);
});

test('runtime adapter distinguishes browsers, partial process shims and actual Node/Electron environments', async () => {
  const code = await readFile(new URL('vendor/runtime-context/index.cjs', root), 'utf8');
  for (const [process, expected] of [
    [undefined, false], [null, false], [{ env: {} }, false],
    [{ versions: { node: '24.0.0' } }, false],
    [{ release: { name: 'node' }, versions: { node: '' } }, false],
    [{ release: { name: 'node' }, versions: { node: '24.0.0', electron: 'fixture' } }, true],
  ]) {
    const exports = {};
    runInNewContext(code, { exports, process });
    assert.equal(exports.isNodeProcess(), expected);
  }
});

test('task queue starts FIFO, limits concurrency and preserves every result under load', async () => {
  const limit = createTaskQueue(3), starts = [], releases = [];
  const jobs = Array.from({ length: 120 }, (_, index) => limit(async () => {
    starts.push(index);
    await new Promise(resolve => releases.push(resolve));
    return index * 2;
  }));
  await pause();
  assert.equal(starts.length, 3);
  assert.equal(limit.queue, 117);
  for (let completed = 0; completed < 120; completed += 1) {
    assert.equal(starts.length, Math.min(120, completed + 3));
    releases[completed]();
    await pause();
  }
  assert.deepEqual(starts, Array.from({ length: 120 }, (_, index) => index));
  assert.deepEqual(await Promise.all(jobs), starts.map(index => index * 2));
  assert.equal(limit.queue, 0);
});

test('task failures release capacity and do not lose queued database work', async () => {
  const limit = createTaskQueue(1), syncError = new Error('synchronous fixture'), asyncError = new Error('asynchronous fixture');
  const results = await Promise.allSettled([
    limit(() => { throw syncError; }),
    limit(() => Promise.reject(asyncError)),
    limit(() => ({ then: resolve => resolve(42) })),
    limit(() => 'last task'),
  ]);
  assert.equal(results[0].reason, syncError);
  assert.equal(results[1].reason, asyncError);
  assert.equal(results[2].value, 42);
  assert.equal(results[3].value, 'last task');
  await assert.rejects(limit(null), TypeError);
  assert.equal(await limit(() => 7), 7);
});

test('zero, omitted and infinite concurrency allow parallel work; invalid limits fail clearly', async () => {
  for (const value of [0, undefined, Infinity]) {
    const limit = createTaskQueue(value), releases = [];
    const tasks = Array.from({ length: 10 }, () => limit(() => new Promise(resolve => releases.push(resolve))));
    await pause();
    assert.equal(releases.length, 10);
    releases.forEach(resolve => resolve());
    await Promise.all(tasks);
  }
  for (const value of [-1, NaN, '2', null]) assert.throws(() => createTaskQueue(value), RangeError);
});

test('real libSQL HTTP client queues requests, preserves SQL results and recovers after a failed query', async () => {
  let active = 0, peak = 0;
  const calls = [];
  const client = createClient({ url: 'https://database.example.test', concurrency: 2, fetch: async request => {
    assert.equal(new URL(request.url).hostname, 'database.example.test');
    const body = await request.json();
    active += 1;
    peak = Math.max(peak, active);
    await pause();
    const results = body.requests.map(operation => {
      if (operation.type === 'close') return { type: 'ok', response: { type: 'close' } };
      assert.equal(operation.type, 'execute');
      const sql = operation.stmt.sql;
      calls.push(sql);
      if (sql === 'SELECT fail') return { type: 'error', error: { message: 'synthetic SQL failure', code: 'SQL_INPUT_ERROR' } };
      return { type: 'ok', response: { type: 'execute', result: {
        cols: [{ name: 'value', decltype: 'INTEGER' }],
        rows: [[{ type: 'integer', value: sql.slice(7) }]], affected_row_count: 0,
      } } };
    });
    active -= 1;
    return Response.json({ baton: null, base_url: null, results });
  } });
  try {
    const statements = Array.from({ length: 12 }, (_, index) => `SELECT ${index}`);
    statements.splice(4, 0, 'SELECT fail');
    const results = await Promise.allSettled(statements.map(sql => client.execute(sql)));
    assert.equal(peak, 2);
    assert.deepEqual(calls, statements);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.match(results[4].reason.message, /synthetic SQL failure/);
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') assert.equal(result.value.rows[0].value, Number(statements[index].slice(7)));
    });
    assert.equal((await client.execute('SELECT 99')).rows[0].value, 99);
  } finally { client.close(); }
});

test('real Blob server SDK uploads stream bodies with the replacement runtime helper', async () => {
  const expected = { url: 'https://fixture.public.blob.vercel-storage.com/synthetic.txt', downloadUrl: 'https://fixture.public.blob.vercel-storage.com/synthetic.txt?download=1', pathname: 'synthetic.txt', contentType: 'text/plain', contentDisposition: 'attachment; filename="synthetic.txt"' };
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ method: request.method, path: request.url, body: Buffer.concat(chunks).toString() });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(expected));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const prior = process.env.VERCEL_BLOB_API_URL;
  process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    const { put } = await import('@vercel/blob');
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('synthetic upload only')); controller.close(); } });
    const result = await put('synthetic.txt', body, { access: 'public', token: 'vercel_blob_rw_fixture_not-a-real-token', addRandomSuffix: false });
    assert.equal(result.url, expected.url);
    assert.deepEqual(requests, [{ method: 'PUT', path: '/?pathname=synthetic.txt', body: 'synthetic upload only' }]);
  } finally {
    if (prior === undefined) delete process.env.VERCEL_BLOB_API_URL;
    else process.env.VERCEL_BLOB_API_URL = prior;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('browser Blob upload bundles without the removed npm package and sends the expected synthetic request', async () => {
  const bundled = await build({ stdin: { contents: "import { put } from '@vercel/blob/client'; globalThis.fixturePut = put;", resolveDir: new URL('.', root).pathname.replace(/^\/([A-Z]:)/i, '$1') }, bundle: true, platform: 'browser', format: 'iife', write: false, metafile: true, logLevel: 'silent' });
  assert.ok(Object.keys(bundled.metafile.inputs).some(path => path.includes('is-node-process/index.cjs')));
  assert.ok(!Object.keys(bundled.metafile.inputs).some(path => path.includes('is-node-process/lib/')));
  const requests = [];
  const context = { crypto: globalThis.crypto, btoa, atob, Blob, Request, Response, Headers, ReadableStream, TextEncoder, TextDecoder, AbortController, AbortSignal, DOMException, URL, URLSearchParams, setTimeout, clearTimeout, console,
    fetch: async (url, init) => { requests.push({ url, init }); return Response.json({ url: 'https://fixture.example.test/photo.jpg', pathname: 'photo.jpg', contentType: 'image/jpeg', contentDisposition: 'attachment' }); },
  };
  runInNewContext(bundled.outputFiles[0].text, context);
  const result = await context.fixturePut('photo.jpg', new Blob(['synthetic photo'], { type: 'image/jpeg' }), { access: 'public', token: 'vercel_blob_client_fixture_not-a-real-token' });
  assert.equal(result.pathname, 'photo.jpg');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.method, 'PUT');
  assert.equal(new URL(requests[0].url).searchParams.get('pathname'), 'photo.jpg');
});
