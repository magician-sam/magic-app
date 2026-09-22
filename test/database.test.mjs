import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { TestStore as Store } from "./store-fixture.mjs";
import {
  snapshot,
  restoreSnapshot,
  encryptSnapshot,
  decryptSnapshot,
} from "../dist/snapshots.js";
import { writeRoutes } from "../dist/write-routes.js";
import { createApp } from "../dist/server.js";
import { createUser } from "../dist/auth.js";

test("concurrent transactions preserve increments and isolate rollback", async () => {
  const s = new Store(":memory:");
  try {
    const b = await s.createBusiness("Concurrency", "concurrency");
    await s.put(b.id, "counter", { id: "one", value: 0 });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        s.transaction(async () => {
          const value = await s.get(b.id, "counter", "one");
          await new Promise((r) => setTimeout(r, 1));
          await s.transaction(() =>
            s.put(b.id, "counter", { id: "one", value: value.value + 1 }),
          );
          if (i === 4) throw new Error("injected failure");
        }),
      ),
    );
    assert.equal(results.filter((x) => x.status === "rejected").length, 1);
    assert.equal((await s.get(b.id, "counter", "one")).value, 11);
  } finally {
    s.db.close();
  }
});

test("encrypted backups preserve IDs and secrets, reject tampering and refuse overwrite", async () => {
  const source = new Store(":memory:"),
    target = new Store(":memory:"),
    failed = new Store(":memory:");
  try {
    const b = await source.createBusiness("Backup", "backup");
    await createUser(
      source,
      b.id,
      "test@backup.test",
      "Fixture-password-42!",
      "Test owner",
    );
    await source.put(b.id, "money", { id: "exact-cents", amount: 12345 });
    const original = await snapshot(source),
      passphrase = "Fixture backup passphrase only";
    const encrypted = encryptSnapshot(original, passphrase);
    assert.ok(!encrypted.includes(Buffer.from("test@backup.test")));
    assert.throws(() =>
      decryptSnapshot(encrypted, "Another fixture passphrase"),
    );
    const damaged = Buffer.from(encrypted);
    damaged[damaged.length - 1] ^= 1;
    assert.throws(() => decryptSnapshot(damaged, passphrase));
    await restoreSnapshot(target, decryptSnapshot(encrypted, passphrase));
    assert.deepEqual((await snapshot(target)).tables, original.tables);
    await assert.rejects(restoreSnapshot(target, original), /empty/);
    const corrupt = structuredClone(original);
    corrupt.tables.records[0].business_id = "missing";
    await assert.rejects(restoreSnapshot(failed, corrupt));
    assert.equal(
      (
        await failed.db
          .prepare("SELECT count(*) AS count FROM businesses")
          .get()
      ).count,
      0,
    );
  } finally {
    source.db.close();
    target.db.close();
    failed.db.close();
  }
});

test("HTTP success is withheld when the final database commit fails", async () => {
  const s = new Store(":memory:"),
    app = express();
  await s.db.exec(
    "CREATE TABLE deferred_test(id TEXT REFERENCES businesses(id) DEFERRABLE INITIALLY DEFERRED)",
  );
  writeRoutes(app, s).post("/commit", async (_req, res) => {
    await s.db
      .prepare("INSERT INTO deferred_test(id) VALUES(?)")
      .run("missing");
    res.status(201).json({ ok: true });
  });
  app.use((error, _req, res, _next) => {
    void _next;
    res.status(500).json({ failed: Boolean(error) });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/commit`, {
      method: "POST",
    });
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { failed: true });
    assert.equal(
      (await s.db.prepare("SELECT count(*) AS count FROM deferred_test").get())
        .count,
      0,
    );
  } finally {
    await new Promise((r) => server.close(r));
    s.db.close();
  }
});

test("failed login limits survive app recreation and failed route rollback", async () => {
  const s = new Store(":memory:"),
    origin = "http://localhost:45500";
  const servers = [
    createApp(s, origin).listen(0, "127.0.0.1"),
    createApp(s, origin).listen(0, "127.0.0.1"),
  ];
  await Promise.all(
    servers.map((server) => new Promise((r) => server.once("listening", r))),
  );
  try {
    for (let i = 0; i < 11; i++) {
      const r = await fetch(
        `http://127.0.0.1:${servers[i % 2].address().port}/api/login`,
        {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            email: "missing@test.test",
            password: "Wrong-password-42!",
          }),
        },
      );
      assert.equal(r.status, i < 10 ? 401 : 429);
      await r.json();
    }
  } finally {
    await Promise.all(
      servers.map((server) => new Promise((r) => server.close(r))),
    );
    s.db.close();
  }
});
