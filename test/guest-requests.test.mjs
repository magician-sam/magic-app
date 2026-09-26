import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createApp } from "../dist/server.js";
import { createUser } from "../dist/auth.js";
test("one authenticated event supports mixed and guest-only requests without losing guest choices", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Guest request test", "test");
  const password = "Guest-test-password-42!";
  await createUser(store, business.id, "staff@example.test", password, "Owner");
  const origin = "http://localhost:43229";
  const server = createApp(store, origin).listen(43229, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let cookie, customerCookie;
  const event = { name: "Guest celebration", date: "2027-07-20", time: "14:00", location: "Test venue", occasion: "Birthday", audience: 20, age: 8, indoor: true, power: true, space: 30, performerIds: [] };
  async function request(path, method = "GET", body, auth = cookie) {
    const response = await fetch(origin + "/api" + path, { method, headers: { origin, "content-type": "application/json", ...(auth ? { cookie: auth } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  async function current(id) { return (await request("/manage/state")).data.bookings.find((b) => b.id === id); }
  async function newRequest(overrides) {
    const result = await request("/public/test/requests", "POST", { event: { ...event, ...overrides } }, customerCookie);
    assert.equal(result.status, 201, JSON.stringify(result.data)); return result.data;
  }
  try {
    cookie = (await request("/login", "POST", { email: "staff@example.test", password })).cookie;
    customerCookie = (await request("/customer/test/register", "POST", { name: "Test family", phone: "+96170112233", username: "test_family", password })).cookie;

  for (const packageIds of [["magic"], []]) {
    const requestedServices = ["Football Show", "Balloon Twisting"];
    const created = await newRequest({ packageIds, performerIds: [], requestedServices });
    const saved = await current(created.id);
    assert.deepEqual(saved.requestedServices, requestedServices);
    assert.deepEqual(saved.packageIds, packageIds);
    assert.equal(saved.status, "requested");
    const edited = await request(`/manage/bookings/${saved.id}/details`, "PUT", {
      ...saved, location: "Updated guest-act venue", revision: saved.revision,
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.data));
    assert.deepEqual((await current(created.id)).requestedServices, requestedServices);
  }
  for (const requestedServices of [[], ["Imaginary unknown show"], ["Football Show", "Football Show"]]) {
    const invalid = await request("/public/test/requests", "POST", {
      event: { ...event, packageIds: [], requestedServices },
    }, customerCookie);
    assert.equal(invalid.status, 400, JSON.stringify(invalid.data));
  }
  const anonymous = await request("/public/test/requests", "POST", {
    event: { ...event, packageIds: [], requestedServices: ["Football Show"] },
  }, null);
  assert.equal(anonymous.status, 401);
  } finally { await new Promise((resolve) => server.close(resolve)); await store.db.close(); }
});
