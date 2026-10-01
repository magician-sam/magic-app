import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
import { snapshot, restoreSnapshot } from "../dist/snapshots.js";

test("full backups preserve every app table and restore older snapshots", async () => {
  const source = new Store(":memory:"), target = new Store(":memory:"), legacyTarget = new Store(":memory:");
  try {
    const business = await source.createBusiness("Complete backup", "complete-backup");
    await createUser(source, business.id, "owner@backup.test", "Fixture-password-42!", "Owner");
    await source.db.prepare("INSERT INTO customer_accounts VALUES(?,?,?,?,?)").run("account", business.id, "customer", "customer", "fixture-password-hash");
    await source.db.prepare("INSERT INTO referral_codes VALUES(?,?,?)").run("SAM123", business.id, "account");
    await source.db.prepare("INSERT INTO interest_clicks VALUES(?,?,?,?,?)").run(business.id, "show_open", "science", "2026-10-01", 7);
    await source.db.prepare("INSERT INTO rate_limits VALUES(?,?,?)").run("fixture-limit", 3, 2000000000);
    const data = await snapshot(source);
    const actual = (await source.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).map(x => x.name).sort();
    assert.deepEqual(Object.keys(data.tables).sort(), actual);
    assert.equal(data.version, 2);
    await restoreSnapshot(target, data);
    assert.deepEqual((await snapshot(target)).tables, data.tables);
    const legacy = structuredClone(data);
    legacy.version = 1;
    for (const key of ["referral_codes", "interest_clicks", "rate_limits"]) delete legacy.tables[key];
    await restoreSnapshot(legacyTarget, legacy);
    assert.equal((await snapshot(legacyTarget)).tables.users.length, 1);
    assert.equal((await snapshot(legacyTarget)).tables.referral_codes.length, 0);
    const invalid = structuredClone(data);
    delete invalid.tables.referral_codes;
    const rejected = new Store(":memory:");
    try { await assert.rejects(restoreSnapshot(rejected, invalid), /table list/); }
    finally { rejected.db.close(); }
  } finally { source.db.close(); target.db.close(); legacyTarget.db.close(); }
});

test("full database download requires owner and a dedicated business database", async () => {
  const store = new Store(":memory:"), restored = new Store(":memory:");
  const business = await store.createBusiness("Private backup", "private-backup");
  await createUser(store, business.id, "owner@backup.test", "Fixture-password-42!", "Owner");
  await createUser(store, business.id, "manager@backup.test", "Fixture-password-42!", "Manager", "manager");
  const server = createApp(store, "https://backup.test").listen(0, "127.0.0.1");
  await new Promise(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async email => {
    const response = await fetch(base + "/api/login", { method: "POST", headers: { origin: "https://backup.test", "content-type": "application/json" }, body: JSON.stringify({ email, password: "Fixture-password-42!" }) });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  try {
    assert.equal((await fetch(base + "/api/manage/full-database-export")).status, 401);
    const manager = await login("manager@backup.test");
    assert.equal((await fetch(base + "/api/manage/full-database-export", { headers: { cookie: manager } })).status, 403);
    const owner = await login("owner@backup.test");
    const response = await fetch(base + "/api/manage/full-database-export", { headers: { cookie: owner } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(response.headers.get("content-disposition"), /attachment/);
    const data = await response.json();
    assert.equal(Object.keys(data.tables).length, 12);
    assert.equal(data.tables.users.length, 2);
    await restoreSnapshot(restored, data);
    assert.equal((await snapshot(restored)).tables.users.length, 2);
    assert.ok((await restored.all(business.id, "audit")).some(x => x.action === "database.backup-downloaded"));
    await store.createBusiness("Another private business", "second-business");
    assert.equal((await fetch(base + "/api/manage/full-database-export", { headers: { cookie: owner } })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); store.db.close(); restored.db.close(); }
});
