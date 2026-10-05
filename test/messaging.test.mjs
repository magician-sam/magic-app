import test from "node:test";
import assert from "node:assert/strict";
import { campaignAudience } from "../dist/messaging.js";
import { TestStore as Store } from "./store-fixture.mjs";
import { createApp } from "../dist/server.js";
import { createUser } from "../dist/auth.js";
import { customerSchema } from "../dist/domain.js";

test("marketing audiences exclude missing consent, blocked contacts and duplicate phones", () => {
  const input = { title: "Invite", channel: "whatsapp", purpose: "app_invite", message: "Hi", audience: "all", customerIds: [], plannedAt: "" };
  const customers = [
    { id: "a", name: "A", phone: "+96170000111", offersConsent: true },
    { id: "b", name: "B", phone: "0096170000111", offersConsent: true },
    { id: "c", name: "C", phone: "+96170000222", offersConsent: false },
    { id: "d", name: "D", phone: "+96170000333", offersConsent: true, doNotContact: true },
  ];
  const result = campaignAudience(customers, input);
  assert.equal(result.recipients.length, 1);
  assert.deepEqual(result.exclusions, { noConsent: 1, doNotContact: 1, duplicatePhone: 1, invalidPhone: 0 });
  assert.equal(campaignAudience(customers, { ...input, purpose: "reminder" }).recipients.length, 2);
  assert.throws(() => campaignAudience(customers, { ...input, audience: "selected", customerIds: ["foreign"] }));
});

test("messaging saves drafts privately, sends nothing, and rechecks contact permission before preparing", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Message test", "message-test");
  const other = await store.createBusiness("Other", "message-other");
  const password = "Test-private-messaging-42!";
  await createUser(store, business.id, "message-owner@example.test", password, "Owner", "owner");
  await createUser(store, business.id, "message-manager@example.test", password, "Manager", "manager");
  await createUser(store, other.id, "message-other@example.test", password, "Other", "owner");
  const customer = { id: "family", ...customerSchema.parse({ name: "Test family", phone: "+96170000000", offersConsent: true }) };
  await store.put(business.id, "customers", customer);
  const app = createApp(store, "http://localhost");
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, cookie) {
    const response = await fetch(base + "/api" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: "http://localhost", ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  async function login(email) { return (await request("/login", { email, password })).headers.get("set-cookie").split(";")[0]; }
  try {
    const owner = await login("message-owner@example.test"), manager = await login("message-manager@example.test"), foreign = await login("message-other@example.test");
    const input = { title: "App invitation", channel: "whatsapp", purpose: "app_invite", message: "Hi {name}, visit {app_link} — {company}", audience: "all", customerIds: [], plannedAt: "" };
    assert.equal((await request("/manage/messaging", null, manager)).status, 403);
    const created = await request("/manage/messaging/drafts", input, owner);
    assert.equal(created.status, 200); assert.equal(created.data.recipients.length, 1);
    assert.equal((await store.all(business.id, "notificationJobs")).length, 0);
    assert.equal((await request(`/manage/messaging/${created.data.id}/prepare/family`, {}, foreign)).status, 404);
    const ready = await request(`/manage/messaging/${created.data.id}/prepare/family`, {}, owner);
    assert.equal(ready.status, 200); assert.match(ready.data.url, /^https:\/\/wa.me\/96170000000\?text=/);
    assert.ok(ready.data.text.includes("http://localhost/b/message-test"));
    assert.equal(created.data.recipients[0].markedSentAt, undefined);
    await store.put(business.id, "customers", { ...customer, offersConsent: false });
    assert.equal((await request(`/manage/messaging/${created.data.id}/prepare/family`, {}, owner)).status, 409);
    assert.equal((await request("/manage/messaging/drafts", input, owner)).status, 400);
    const sms = await request("/manage/messaging/drafts", { ...input, channel: "sms", purpose: "reminder" }, owner);
    assert.equal(sms.status, 200);
    assert.match((await request(`/manage/messaging/${sms.data.id}/prepare/family`, {}, owner)).data.url, /^sms:\+96170000000\?body=/);
  } finally { await new Promise(resolve => server.close(resolve)); store.db.close(); }
});
