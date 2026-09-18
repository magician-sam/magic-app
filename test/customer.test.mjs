import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../dist/store.js";
import { createApp } from "../dist/server.js";
import { createUser } from "../dist/auth.js";
import { customerRewards } from "../dist/rewards.js";

test("customer accounts isolate staff, businesses and other families; profile and password edits preserve history", async () => {
  const store = new Store(":memory:");
  const business = store.createBusiness("Customer test", "families");
  store.createBusiness("Other", "elsewhere");
  const password = "Customer-test-password-42!";
  await createUser(store, business.id, "staff@example.test", password, "Owner");
  const origin = "http://localhost:43220";
  const server = createApp(store, origin).listen(43220, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = async (path, method = "GET", body, cookie = "") => {
    const r = await fetch(origin + "/api" + path, {
      method,
      headers: { origin, "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    const register = (name, extra = {}) =>
      request("/customer/families/register", "POST", {
        name,
        phone: "+96170111222",
        password,
        ...extra,
      });
    const a = await register("First parent");
    assert.equal(a.status, 201);
    const b = await register("Second parent");
    assert.equal(b.status, 201);
    assert.equal(
      (await request("/manage/state", "GET", undefined, a.cookie)).status,
      401,
    );
    assert.equal(
      (await request("/customer/elsewhere/me", "GET", undefined, a.cookie))
        .status,
      401,
    );
    const staff = await request("/login", "POST", {
      email: "staff@example.test",
      password,
    });
    assert.equal(
      (await request("/customer/families/me", "GET", undefined, staff.cookie))
        .status,
      401,
    );
    const basePackage = (await request("/public/families")).data.packages[2];
    const extra = await request(
      "/manage/packages/new",
      "PUT",
      {
        ...basePackage,
        name: "Bubble extra",
        duration: 15,
        category: "character",
        checkoutExtra: true,
        fastOrder: false,
        previewVideo: "https://example.test/approved-preview",
      },
      staff.cookie,
    );
    assert.equal(extra.status, 200);
    assert.equal(
      (
        await request(
          "/manage/packages/new",
          "PUT",
          { ...basePackage, previewVideo: "javascript:alert(1)" },
          staff.cookie,
        )
      ).status,
      400,
    );
    const event = {
      name: "My private party",
      date: "2027-10-01",
      time: "14:00",
      location: "Family venue",
      occasion: "Birthday",
      audience: 10,
      age: 8,
      indoor: true,
      power: true,
      space: 30,
      packageIds: ["magic", extra.data.id],
    };
    assert.equal(
      (await request("/public/families/requests", "POST", { event })).status,
      401,
    );
    const question = {
      id: "colour",
      label: "Party colour",
      type: "text",
      required: true,
      active: true,
      options: [],
    };
    assert.equal(
      (await request("/manage/custom-fields", "POST", question, a.cookie))
        .status,
      401,
    );
    assert.equal(
      (await request("/manage/custom-fields", "POST", question, staff.cookie))
        .status,
      200,
    );
    assert.equal(
      (await request("/public/families/requests", "POST", { event }, a.cookie))
        .status,
      400,
    );
    const booking = await request(
      "/public/families/requests",
      "POST",
      {
        event,
        customAnswers: { colour: "Purple" },
        customer: { name: "Impersonation", phone: "12345678" },
      },
      a.cookie,
    );
    assert.equal(booking.status, 201);
    const snapshotExtra = store
      .get(business.id, "bookings", booking.data.id)
      .packageSnapshot.find((p) => p.id === extra.data.id);
    assert.equal(snapshotExtra.duration, 15);
    assert.equal(snapshotExtra.checkoutExtra, true);
    assert.equal(snapshotExtra.category, "character");
    assert.equal(
      (
        await request(
          "/manage/custom-fields",
          "POST",
          { ...question, label: "New question", active: false },
          staff.cookie,
        )
      ).status,
      200,
    );
    let saved = store.get(business.id, "bookings", booking.data.id);
    assert.deepEqual(saved.customAnswers, [
      { id: "colour", label: "Party colour", value: "Purple" },
    ]);
    assert.equal(
      (
        await request(
          `/manage/bookings/${saved.id}/custom-answers`,
          "PUT",
          { revision: saved.revision, values: { colour: "Blue" } },
          staff.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/manage/bookings/${saved.id}/custom-answers`,
          "PUT",
          { revision: saved.revision, values: { colour: "Red" } },
          staff.cookie,
        )
      ).status,
      409,
    );
    saved = store.get(business.id, "bookings", saved.id);
    assert.equal(saved.customAnswers[0].value, "Blue");
    const mine = await request(
      "/customer/families/me",
      "GET",
      undefined,
      a.cookie,
    );
    assert.equal(mine.data.bookings.length, 1);
    assert.equal(mine.data.profile.name, "First parent");
    const theirs = await request(
      "/customer/families/me",
      "GET",
      undefined,
      b.cookie,
    );
    assert.deepEqual(theirs.data.bookings, []);
    assert.equal(
      (
        await request(
          `/customer/families/bookings/${booking.data.id}/open`,
          "POST",
          {},
          b.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/customer/families/bookings/${booking.data.id}/open`,
          "POST",
          {},
          a.cookie,
        )
      ).status,
      200,
    );
    const edit = {
      name: "Renamed parent",
      phone: "+96170111222",
      username: "happy-parent",
      email: "parent@example.test",
      childrenAges: [4, 8],
      role: "admin",
      notes: "must not overwrite staff notes",
    };
    assert.equal(
      (await request("/customer/families/profile", "PUT", edit, a.cookie))
        .status,
      200,
    );
    const profile = await request(
      "/customer/families/me",
      "GET",
      undefined,
      a.cookie,
    );
    assert.equal(profile.data.rewards.profilePoints, 20);
    assert.deepEqual(profile.data.profile.childrenAges, [4, 8]);
    assert.equal(profile.data.bookings.length, 1);
    assert.equal(profile.data.profile.phoneVerified, false);
    assert.equal(
      (await request("/customer/families/profile", "PUT", edit, b.cookie))
        .status,
      409,
    );
    const ref = await register("Referred parent", {
      referralCode: profile.data.referralCode,
    });
    assert.equal(ref.status, 201);
    const settings = await request(
      "/manage/reward-settings",
      "GET",
      undefined,
      staff.cookie,
    );
    assert.equal(settings.data.discountPercent, 15);
    assert.equal(settings.data.enabled, false);
    assert.equal(
      (
        await request(
          "/manage/reward-settings",
          "PUT",
          { ...settings.data, enabled: true },
          staff.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/manage/reward-settings",
          "PUT",
          { ...settings.data, discountPercent: 22, emailPoints: 25 },
          staff.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/customer/families/me", "GET", undefined, a.cookie)).data
        .rewards.profilePoints,
      35,
    );
    const customer = store
      .all(business.id, "customers")
      .find((x) => x.name === "Renamed parent");
    assert.equal(customer.notes, "");
    assert.equal(
      customerRewards(store, business.id, customer).qualifyingEvents,
      0,
    );
    assert.equal(
      (
        await request(
          "/manage/customers/" + customer.id,
          "DELETE",
          {},
          staff.cookie,
        )
      ).status,
      409,
    );
    const secondSession = await request("/customer/families/login", "POST", {
      username: "happy-parent",
      password,
    });
    assert.equal(secondSession.status, 200);
    assert.equal(
      (
        await request(
          "/customer/families/password",
          "POST",
          { currentPassword: "wrong", password: "New-customer-password-42!" },
          a.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/customer/families/password",
          "POST",
          { currentPassword: password, password: "New-customer-password-42!" },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/customer/families/me",
          "GET",
          undefined,
          secondSession.cookie,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/customer/families/login", "POST", {
          username: "happy-parent",
          password,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/customer/families/login", "POST", {
          username: "happy-parent",
          password: "New-customer-password-42!",
        })
      ).status,
      200,
    );
    const exported = (
      await request("/manage/export", "GET", undefined, staff.cookie)
    ).data;
    assert.equal(exported.customerExtras.length, 3);
    assert.equal(JSON.stringify(exported).includes('"password":'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});

test("reward progress counts fully paid completed events and reverses after refunds", () => {
  const store = new Store(":memory:");
  try {
    const business = store.createBusiness("Rewards", "rewards");
    const customer = { id: "parent", email: "" };
    store.put(business.id, "rewardSettings", {
      id: "program",
      enabled: true,
      qualification: "referrals",
      terms: "One standard magic show, subject to availability.",
    });
    store.put(business.id, "customerExtras", {
      id: "friend",
      referredBy: "parent",
      childrenAges: [],
    });
    store.put(business.id, "bookings", {
      id: "event",
      customerId: "friend",
      status: "completed",
      acceptedQuoteId: "q",
      quotes: [{ id: "q", amount: 10000, deposit: 0 }],
    });
    assert.equal(
      customerRewards(store, business.id, customer).qualifyingEvents,
      0,
    );
    store.put(business.id, "money", {
      id: "paid",
      bookingId: "event",
      kind: "payment",
      amount: 10000,
    });
    assert.equal(
      customerRewards(store, business.id, customer).qualifyingEvents,
      1,
    );
    store.put(business.id, "money", {
      id: "refund",
      bookingId: "event",
      kind: "refund",
      amount: 100,
    });
    assert.equal(
      customerRewards(store, business.id, customer).qualifyingEvents,
      0,
    );
  } finally {
    store.db.close();
  }
});
