import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createApp } from "../dist/server.js";

test("short referral codes stay stable and old full-length codes still work", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Magic test", "magic-test");
  const origin = "http://localhost:43228";
  const server = createApp(store, origin).listen(43228, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = async (path, method = "GET", body, cookie = "") => {
    const response = await fetch(origin + "/api" + path, {
      method,
      headers: { origin, "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  try {
    const password = "Long-test-password-42!";
    const inviter = await request("/customer/magic-test/register", "POST", {
      name: "Inviting parent", phone: "+96170111222", password,
    });
    assert.equal(inviter.status, 201);
    const profile = await request("/customer/magic-test/me", "GET", undefined, inviter.cookie);
    assert.match(profile.data.referralCode, /^[A-F0-9]{10}$/);
    const code = profile.data.referralCode;
    assert.equal((await request("/customer/magic-test/me", "GET", undefined, inviter.cookie)).data.referralCode, code);
    const account = await store.db.prepare("SELECT id,customer_id FROM customer_accounts WHERE business_id=?").get(business.id);
    const friend = await request("/customer/magic-test/register", "POST", {
      name: "Referred friend", phone: "+96170111223", password, referralCode: code,
    });
    assert.equal(friend.status, 201, JSON.stringify(friend.data));
    const friendAccount = await store.db.prepare("SELECT customer_id FROM customer_accounts WHERE username=?").get(friend.data.username);
    assert.equal((await store.get(business.id, "customerExtras", String(friendAccount.customer_id))).referredBy, String(account.customer_id));
    const legacy = await request("/customer/magic-test/register", "POST", {
      name: "Legacy link friend", phone: "+96170111224", password, referralCode: String(account.id),
    });
    assert.equal(legacy.status, 201);
    const invalid = await request("/customer/magic-test/register", "POST", {
      name: "Invalid friend", phone: "+96170111225", password, referralCode: "BADCODE123",
    });
    assert.equal(invalid.status, 400);
  } finally {
    server.close();
  }
});
