import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
import { auditContext, deviceContext } from "../dist/audit-context.js";

test("concurrent authenticated requests retain their own audit identity and device", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Audit office", "audit-office");
  const users = await Promise.all(["first", "second"].map(name => createUser(store, business.id, name + "@audit.test", "Fixture-password-42!", name)));
  const server = createApp(store, "https://audit.test").listen(0, "127.0.0.1");
  await new Promise(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const cookies = await Promise.all(users.map(async user => {
      const response = await fetch(base + "/api/login", { method: "POST", headers: { origin: "https://audit.test", "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: "Fixture-password-42!" }) });
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie").split(";")[0];
    }));
    await Promise.all(users.map(async (user, index) => {
      const response = await fetch(base + "/api/manage/full-database-export", { headers: { cookie: cookies[index], "X-Magic-Device-Id": `device-office-${index}-123456`, "X-Magic-Device-Name": `Office ${index}`, "X-Magic-User-Id": "forged-user" } });
      assert.equal(response.status, 200);
      await response.json();
    }));
    const entries = (await store.all(business.id, "audit")).filter(entry => entry.action === "database.backup-downloaded");
    assert.equal(entries.length, 2);
    for (const [index, user] of users.entries()) {
      const entry = entries.find(item => item.actor === user.email);
      assert.equal(entry.context.userId, user.id);
      assert.equal(entry.context.role, "owner");
      assert.equal(entry.context.deviceId, `device-office-${index}-123456`);
      assert.equal(entry.context.deviceName, `Office ${index}`);
      assert.equal(entry.context.deviceSource, "browser-reported");
      assert.equal(entry.context.path, "/api/manage/full-database-export");
    }
    assert.notEqual(entries[0].context.requestId, entries[1].context.requestId);
    await store.audit(business.id, "system", "outside-request", "test", null, null);
    assert.equal((await store.all(business.id, "audit")).at(-1).context, undefined);
    assert.equal(auditContext.getStore(), undefined);
  } finally { await new Promise(resolve => server.close(resolve)); store.db.close(); }
});

test("invalid device data is omitted; device identity cannot authenticate", () => {
  const req = { get: key => ({ "X-Magic-Device-Id": "fake", "X-Magic-Device-Name": "bad\nname", "User-Agent": "x".repeat(500) })[key] };
  const context = deviceContext(req);
  assert.equal(context.deviceId, undefined);
  assert.equal(context.deviceName, undefined);
  assert.equal(context.deviceSource, "unidentified");
  assert.equal(context.userAgent.length, 300);
});

test("office tasks enforce role, business isolation, revisions and retained archive history", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Task office", "task-office");
  const other = await store.createBusiness("Other office", "other-office");
  const work = await createUser(store, business.id, "work@task.test", "Fixture-password-42!", "Work", "manager");
  await createUser(store, business.id, "accounting@task.test", "Fixture-password-42!", "Accounting", "accountant");
  await createUser(store, business.id, "sales@task.test", "Fixture-password-42!", "Sales", "sales");
  const outsider = await createUser(store, other.id, "other@task.test", "Fixture-password-42!", "Other");
  const server = createApp(store, "https://task.test").listen(0, "127.0.0.1");
  await new Promise(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async email => {
    const response = await fetch(base + "/api/login", { method: "POST", headers: { origin: "https://task.test", "content-type": "application/json" }, body: JSON.stringify({ email, password: "Fixture-password-42!" }) });
    return response.headers.get("set-cookie").split(";")[0];
  };
  try {
    const cookie = await login(work.email);
    const send = (key, data) => fetch(base + "/api/manage/office-tasks/" + key, { method: "PUT", headers: { cookie, origin: "https://task.test", "content-type": "application/json", "X-Magic-Device-Id": "office-device-123456" }, body: JSON.stringify(data) });
    const input = { title: "Prepare event equipment", notes: "Check props", status: "open", priority: "high", dueDate: "2026-10-10", assignedUserId: work.id, bookingId: "", revision: 0 };
    assert.equal((await send("new", { ...input, assignedUserId: outsider.id })).status, 400);
    assert.equal((await send("new", { ...input, bookingId: "other-business-event" })).status, 400);
    const created = await send("new", input);
    assert.equal(created.status, 200);
    const task = await created.json();
    const changes = await Promise.all([send(task.id, { ...input, revision: 1, status: "done" }), send(task.id, { ...input, revision: 1, status: "in_progress" })]);
    assert.deepEqual(changes.map(response => response.status).sort(), [200, 409]);
    assert.equal((await send(task.id, { ...input, revision: 2, status: "archived" })).status, 200);
    assert.equal((await store.get(business.id, "officeTasks", task.id)).status, "archived");
    const audit = (await store.all(business.id, "audit")).filter(entry => entry.entityId === task.id);
    assert.equal(audit.length, 3);
    assert.equal(audit.at(-1).before.revision, 2);
    assert.equal(audit.at(-1).context.deviceId, "office-device-123456");
    const otherCookie = await login(outsider.email);
    const isolated = await (await fetch(base + "/api/manage/office-tasks", { headers: { cookie: otherCookie } })).json();
    assert.deepEqual(isolated.tasks, []);
    assert.equal((await fetch(base + "/api/manage/office-tasks", { headers: { cookie: await login("sales@task.test") } })).status, 403);
    assert.equal((await fetch(base + "/api/manage/office-tasks", { headers: { cookie: await login("accounting@task.test") } })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); store.db.close(); }
});
