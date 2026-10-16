import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TestStore as Store } from "./store-fixture.mjs";
import { createApp } from "../dist/server.js";
import { createUser } from "../dist/auth.js";

test("public publishing is explicit, isolated, consent-aware and idempotent; private service proposals never broadcast", async () => {
  // Synthetic records only, with delivery providers explicitly disabled.
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.WEB_PUSH_PRIVATE_KEY;
  const store = new Store(":memory:");
  const business = await store.createBusiness("Offers test", "offer-test");
  const other = await store.createBusiness("Other", "other-offers");
  const password = "Synthetic-only-42!";
  await createUser(store, business.id, "owner@example.test", password, "Owner");
  await createUser(
    store,
    other.id,
    "other-owner@example.test",
    password,
    "Other",
  );
  const origin = "http://localhost:43361",
    server = createApp(store, origin).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = async (path, method = "GET", body, cookie = "") => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api` + path,
      {
        method,
        headers: { origin, "content-type": "application/json", cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    const staff = (
      await request("/login", "POST", { email: "owner@example.test", password })
    ).cookie;
    const outsider = (
      await request("/login", "POST", {
        email: "other-owner@example.test",
        password,
      })
    ).cookie;
    const first = await request("/customer/offer-test/register", "POST", {
      name: "First family",
      phone: "+96170112233",
      username: "first_family",
      password,
    });
    const second = await request("/customer/offer-test/register", "POST", {
      name: "Second family",
      phone: "+96170112244",
      username: "second_family",
      password,
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const profiles = await store.all(business.id, "customers");
    const firstCustomer = profiles.find((x) => x.name === "First family"),
      secondCustomer = profiles.find((x) => x.name === "Second family");
    await store.put(business.id, "customers", {
      ...firstCustomer,
      offersConsent: true,
    });
    await store.put(business.id, "customers", {
      ...secondCustomer,
      offersConsent: true,
      doNotContact: true,
    });
    const show = await store.get(business.id, "packages", "magic");
    const save = await request(
      "/manage/packages/magic",
      "PUT",
      { ...show, description: "Public announcement test" },
      staff,
    );
    assert.equal(save.status, 200, JSON.stringify(save.data));
    assert.equal(
      (await store.all(business.id, "bundleAnnouncements")).length,
      0,
      "ordinary saves are quiet",
    );
    const value = save.data;
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          value.id,
          value.name,
          value.description,
          value.priceMode,
          value.price,
          value.bundleIds ?? [],
        ]),
      )
      .digest("hex");
    assert.notEqual(
      (
        await request(
          "/manage/packages/magic/publish",
          "POST",
          { fingerprint },
          first.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/manage/packages/magic/publish",
          "POST",
          { fingerprint },
          outsider,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          "/manage/packages/magic/publish",
          "POST",
          { fingerprint: "0".repeat(64) },
          staff,
        )
      ).status,
      409,
    );
    const published = await Promise.all(
      [1, 2].map(() =>
        request(
          "/manage/packages/magic/publish",
          "POST",
          { fingerprint },
          staff,
        ),
      ),
    );
    assert.deepEqual(published.map((x) => x.data.published).sort(), [
      false,
      true,
    ]);
    const notices = await store.all(business.id, "customerNotifications");
    assert.equal(notices.length, 1);
    assert.equal(notices[0].customerId, firstCustomer.id);
    assert.match(notices[0].url, /\/show\/magic$/);
    const newBundle = await request(
      "/manage/packages/new",
      "PUT",
      {
        ...show,
        name: "Public magic and bubbles",
        priceMode: "fixed",
        price: 30000,
        bundleIds: ["magic", "bubbles"],
        bundleBreakMinutes: 5,
      },
      staff,
    );
    assert.equal(newBundle.status, 200, JSON.stringify(newBundle.data));
    const bundle = newBundle.data;
    const bundleFingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          bundle.id,
          bundle.name,
          bundle.description,
          bundle.priceMode,
          bundle.price,
          bundle.bundleIds ?? [],
        ]),
      )
      .digest("hex");
    assert.equal(
      (
        await request(
          `/manage/packages/${bundle.id}/publish`,
          "POST",
          { fingerprint: bundleFingerprint },
          staff,
        )
      ).status,
      200,
    );
    assert.ok(
      (await store.all(business.id, "customerNotifications")).some((n) =>
        n.url.endsWith("#offer/" + bundle.id),
      ),
    );
    const event = {
      name: "Private guest bundle",
      date: "2027-07-20",
      time: "14:00",
      location: "Test venue",
      occasion: "Birthday",
      audience: 20,
      age: 8,
      indoor: true,
      power: true,
      space: 30,
      packageIds: [],
      performerIds: [],
      requestedServices: ["Football Show", "Balloon Twisting"],
    };
    const created = await request(
      "/public/offer-test/requests",
      "POST",
      { event },
      first.cookie,
    );
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const booking = await store.get(business.id, "bookings", created.data.id);
    const quote = await request(
      `/manage/bookings/${booking.id}/quotes`,
      "POST",
      {
        revision: booking.revision,
        options: [
          {
            name: "Private discounted bundle",
            packageIds: [],
            amount: 12000,
            deposit: 3000,
            notes:
              "Requested services included; negotiated discount reflected in total.",
          },
        ],
      },
      staff,
    );
    assert.equal(quote.status, 200, JSON.stringify(quote.data));
    assert.equal(quote.data.quotes[0].amount, 12000);
    assert.equal(
      (await store.all(business.id, "bundleAnnouncements")).length,
      2,
      "private quote never enters public announcements",
    );
    const privateNotice = (
      await store.all(business.id, "customerNotifications")
    ).find((x) => x.bookingId === booking.id);
    assert.equal(privateNotice.customerId, firstCustomer.id);
    assert.match(privateNotice.url, new RegExp("#booking/" + booking.id + "$"));
    const secondAccount = await request(
      "/customer/offer-test/me",
      "GET",
      undefined,
      second.cookie,
    );
    assert.equal(secondAccount.data.notifications.length, 0);
    assert.equal(secondAccount.data.announcements.length, 0);
    assert.notEqual(
      (
        await request(
          `/customer/offer-test/bookings/${booking.id}/open`,
          "POST",
          {},
          second.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/customer/offer-test/bookings/${booking.id}/open`,
          "POST",
          {},
          first.cookie,
        )
      ).status,
      200,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.db.close();
  }
});
