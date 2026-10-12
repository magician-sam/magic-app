import test from "node:test";
import assert from "node:assert/strict";
import { TestStore } from "./store-fixture.mjs";
import { createApp } from "../dist/server.js";
import { createUser, hash, passwordMatches } from "../dist/auth.js";

test("email recovery is single-use, scoped, revokes sessions and accepts seven-character passwords", async () => {
  const store = new TestStore(":memory:");
  const business = await store.createBusiness("Recovery", "recovery");
  await store.createBusiness("Other", "other");
  const owner = await createUser(store, business.id, "owner@example.test", "old-password", "Owner");
  const artist = await createUser(store, business.id, "artist@example.test", "artist-password", "Artist", "artist");
  const outbox = [];
  let fail = false;
  const origin = "http://localhost:43229";
  const server = createApp(store, origin, async (email, link) => {
    if (fail) throw new Error("Synthetic mail failure");
    outbox.push({ email, link });
    return true;
  }).listen(43229, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = async (path, body, cookie = "", method = "POST", requestOrigin = origin) => {
    const response = await fetch(origin + "/api" + path, {
      method, headers: { origin: requestOrigin, "content-type": "application/json", cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  const clearLimits = () => store.db.prepare("DELETE FROM rate_limits").run();
  const code = () => new URL(outbox.at(-1).link).hash.split("=")[1];
  try {
    const registration = { name: "Parent", phone: "+96170111222", email: "parent@example.test", username: "parent", password: "seven77" };
    assert.equal((await request("/customer/recovery/register", { ...registration, password: "six666" })).status, 400);
    const customer = await request("/customer/recovery/register", registration);
    assert.equal(customer.status, 201);
    const account = await store.db.prepare("SELECT * FROM customer_accounts WHERE username='parent'").get();
    const details = { slug: "recovery", username: "parent", email: "parent@example.test" };
    const missing = await request("/reset/request", { ...details, username: "missing" });
    const wrongEmail = await request("/reset/request", { ...details, email: "attacker@example.test" });
    assert.deepEqual(wrongEmail.data, missing.data);
    assert.equal(outbox.length, 0);
    const issued = await request("/reset/request", details);
    assert.deepEqual(issued.data, missing.data);
    assert.equal(outbox.at(-1).email, registration.email);
    const first = code();
    assert.equal(new URL(outbox.at(-1).link).pathname, "/b/recovery");
    assert.equal(new URL(outbox.at(-1).link).search, "");
    const stored = await store.all(business.id, "emailResets");
    assert.equal(stored[0].id, hash(first));
    assert.equal(JSON.stringify(stored).includes(first), false);
    await request("/reset/request", details);
    assert.equal(outbox.length, 1, "Cooldown prevents duplicate email");
    await clearLimits();
    await request("/reset/request", { ...details, slug: "other" });
    assert.equal(outbox.length, 1, "Other business cannot request this account");
    assert.equal((await request("/reset/complete", { code: first, password: "six666" })).status, 400);
    assert.equal((await request("/reset/complete", { code: "f".repeat(64), password: "seven77" })).status, 400);
    assert.equal((await request("/reset/complete", { code: first, password: "new7777" })).status, 200);
    assert.equal((await request("/customer/recovery/me", undefined, customer.cookie, "GET")).status, 401);
    assert.equal((await request("/reset/complete", { code: first, password: "reuse77" })).status, 400);
    assert.equal((await request("/customer/recovery/login", { username: "parent", password: "new7777" })).status, 200);
    assert.equal(await passwordMatches("new7777", (await store.db.prepare("SELECT password FROM customer_accounts WHERE id=?").get(account.id)).password), true);

    await clearLimits();
    const staffLogin = await request("/login", { email: owner.email, password: "old-password" });
    await request("/reset/request", { email: owner.email });
    const staffCode = code();
    assert.equal(new URL(outbox.at(-1).link).pathname, "/manage");
    assert.equal((await request("/reset/complete", { code: staffCode, password: "staff77" })).status, 200);
    assert.equal((await request("/manage/state", undefined, staffLogin.cookie, "GET")).status, 401);
    assert.equal((await request("/login", { email: owner.email, password: "staff77" })).status, 200);

    await clearLimits();
    await request("/reset/request", { email: artist.email });
    const expired = code();
    const reset = (await store.all(business.id, "emailResets"))[0];
    await store.put(business.id, "emailResets", { ...reset, expires: Date.now() - 1 });
    assert.equal((await request("/reset/complete", { code: expired, password: "artist7" })).status, 400);
    await store.db.prepare("DELETE FROM records WHERE kind='emailResets'").run();
    fail = true;
    assert.equal((await request("/reset/request", { email: artist.email })).status, 200);
    assert.equal((await store.all(business.id, "emailResets")).length, 0, "Failed delivery leaves no usable reset");
    fail = false;
    await request("/reset/request", { email: artist.email });
    const stale = code();
    await store.db.prepare("UPDATE users SET password=? WHERE id=?").run("changed-by-admin", artist.id);
    assert.equal((await request("/reset/complete", { code: stale, password: "artist7" })).status, 400);
    await clearLimits();
    assert.equal((await request("/reset/request", { email: owner.email }, "", "POST", "https://other.test")).status, 403);
    for (let i = 0; i < 5; i++) assert.equal((await request("/reset/request", { email: "missing@example.test" })).status, 200);
    assert.equal((await request("/reset/request", { email: owner.email })).status, 429);
    const audit = await store.all(business.id, "audit");
    assert.equal(JSON.stringify(audit).includes(first), false);
    assert.equal(JSON.stringify(audit).includes("new7777"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});
