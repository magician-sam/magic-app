import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../dist/store.js";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
import { rewardView } from "../dist/reward-ledger.js";

test("reward issuance, quote discounts, refunds, reuse protection and rule snapshots", async () => {
  const store = new Store(":memory:");
  const business = store.createBusiness("Rewards", "rewards");
  const other = store.createBusiness("Other", "other");
  const password = "Reward-test-password-42!";
  await createUser(store, business.id, "owner@example.test", password, "Owner");
  await createUser(store, other.id, "other@example.test", password, "Other");
  await createUser(
    store,
    business.id,
    "assistant@example.test",
    password,
    "Assistant",
    "assistant",
  );
  const origin = "http://localhost:43222";
  const server = createApp(store, origin).listen(43222, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let cookie;
  const request = async (
    path,
    method = "GET",
    body,
    auth = cookie,
    extra = {},
  ) => {
    const r = await fetch(origin + "/api" + path, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        ...(auth ? { cookie: auth } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    cookie = (
      await request("/login", "POST", { email: "owner@example.test", password })
    ).cookie;
    const otherCookie = (
      await request("/login", "POST", { email: "other@example.test", password })
    ).cookie;
    const assistant = (
      await request("/login", "POST", {
        email: "assistant@example.test",
        password,
      })
    ).cookie;
    const account = await request("/customer/rewards/register", "POST", {
      name: "Reward family",
      phone: "+96170010000",
      password,
      username: "reward-family",
    });
    const customerId = store.all(business.id, "customers")[0].id;
    const pack = store.get(business.id, "packages", "magic");
    const settings = {
      enabled: true,
      qualification: "personal",
      loyaltyEvery: 2,
      eventsForFree: 2,
      freeShowPackageId: "magic",
      terms: "One standard magic show; local area, subject to availability.",
    };
    assert.equal(
      (await request("/manage/reward-settings", "PUT", settings)).status,
      200,
    );
    const booking = (id, status = "quoted", cid = customerId) => ({
      id,
      customerId: cid,
      name: id,
      date: "2027-10-01",
      time: "14:00",
      location: "Test venue",
      occasion: "Birthday",
      audience: 20,
      age: 8,
      indoor: true,
      power: true,
      space: 30,
      source: "direct",
      notes: "",
      packageIds: ["magic"],
      packageSnapshot: [pack],
      performerIds: [],
      availability: {},
      status,
      quotes: [
        {
          id: id + "-q",
          name: "Magic option",
          packageIds: ["magic"],
          packageSnapshot: [pack],
          amount: 10001,
          deposit: 10000,
          notes: "Quote terms",
        },
      ],
      acceptedQuoteId: status === "completed" ? id + "-q" : "",
      travel: 30,
      breakMinutes: 10,
      checklist: [],
      venueNotes: "",
      backupPerformerIds: [],
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    for (const key of ["earned-1", "earned-2"]) {
      store.put(business.id, "bookings", booking(key, "completed"));
      store.put(business.id, "money", {
        id: key + "-paid",
        bookingId: key,
        kind: "payment",
        amount: 10001,
      });
    }
    const issue = (kind, auth = cookie) =>
      request(
        `/manage/customers/${customerId}/rewards`,
        "POST",
        { kind, reviewed: true },
        auth,
      );
    assert.equal((await issue("loyalty", assistant)).status, 403);
    assert.equal((await issue("loyalty", otherCookie)).status, 404);
    const award = await issue("loyalty");
    assert.equal(award.status, 201);
    assert.equal(award.data.percent, 15);
    assert.equal((await issue("loyalty")).status, 409);
    await request("/manage/reward-settings", "PUT", {
      ...settings,
      loyaltyPercent: 30,
    });
    assert.equal(
      store.get(business.id, "rewardAwards", award.data.id).percent,
      15,
    );
    for (const key of ["target", "second"])
      store.put(business.id, "bookings", booking(key));
    const apply = (key, awardId = award.data.id, revision = 1, auth = cookie) =>
      request(
        `/manage/bookings/${key}/reward`,
        "POST",
        { awardId, quoteId: key + "-q", revision },
        auth,
      );
    assert.equal(
      (await apply("target", award.data.id, 1, otherCookie)).status,
      404,
    );
    const applied = await apply("target");
    assert.equal(applied.status, 200);
    assert.equal(applied.data.quotes[0].amount, 8501);
    assert.equal(applied.data.quotes[0].deposit, 8501);
    assert.equal(applied.data.quotes[0].reward.discount, 1500);
    assert.equal((await apply("second")).status, 409);
    assert.equal((await apply("target")).status, 409);
    assert.equal(
      (
        await request(`/manage/rewards/${award.data.id}/void`, "POST", {
          reason: "Should not remove reserved reward",
        })
      ).status,
      409,
    );
    const link = (
      await request("/manage/bookings/target/link", "POST", {})
    ).data.path.split("#")[1];
    const accept = () =>
      request(
        "/event/accept",
        "POST",
        { quoteId: "target-q", revision: 2 },
        null,
        { "x-event-token": link },
      );
    store.put(business.id, "money", {
      id: "refund",
      bookingId: "earned-1",
      kind: "refund",
      amount: 100,
    });
    assert.equal((await accept()).status, 409);
    assert.equal(
      store.get(business.id, "bookings", "target").quotes[0].amount,
      8501,
    );
    store.put(business.id, "money", {
      id: "refund",
      bookingId: "earned-1",
      kind: "refund",
      amount: 0,
    });
    assert.equal((await accept()).status, 200);
    const view = () =>
      rewardView(
        store,
        business.id,
        store.get(business.id, "rewardAwards", award.data.id),
      );
    assert.equal(view().status, "used");
    assert.equal((await apply("second")).status, 409);
    const profile = (
      await request("/customer/rewards/me", "GET", undefined, account.cookie)
    ).data;
    assert.equal(profile.rewards.awards[0].status, "used");
    assert.equal(profile.rewards.awards[0].sourceEventIds, undefined);
    assert.equal(
      (
        await request("/manage/bookings/target/status", "POST", {
          revision: 3,
          status: "cancelled",
          reason: "Test cancellation",
        })
      ).status,
      200,
    );
    assert.equal(view().status, "available");
    assert.equal((await apply("second")).status, 200);
    // Replacing a quote releases the reservation; reapplication cannot silently stack discounts.
    assert.equal(
      (
        await request("/manage/bookings/second/quotes", "POST", {
          revision: 2,
          options: [
            {
              name: "Replacement",
              amount: 10001,
              deposit: 0,
              packageIds: ["magic"],
              notes: "Restored base price",
            },
          ],
        })
      ).status,
      200,
    );
    assert.equal(view().status, "available");
    assert.equal(
      (
        await request(`/manage/rewards/${award.data.id}/void`, "POST", {
          reason: "Replace issued benefit",
        })
      ).status,
      200,
    );
    assert.equal(view().status, "voided");
    assert.equal((await issue("loyalty")).data.percent, 30);
    const free = await issue("free_show");
    assert.equal(free.status, 201);
    const freeBooking = booking("free");
    freeBooking.quotes[0].packageIds = ["magic", "bubbles"];
    store.put(business.id, "bookings", freeBooking);
    assert.equal((await apply("free", free.data.id)).status, 400);
    freeBooking.quotes[0].packageIds = ["magic"];
    store.put(business.id, "bookings", freeBooking);
    const freeApplied = await apply("free", free.data.id);
    assert.equal(freeApplied.status, 200);
    assert.equal(freeApplied.data.quotes[0].amount, 0);
    assert.equal(freeApplied.data.quotes[0].deposit, 0);
    // A referred customer's paid event earns the referrer a reward, not the friend.
    store.put(business.id, "customers", { id: "friend", name: "Friend" });
    store.put(business.id, "customerExtras", {
      id: "friend",
      referredBy: customerId,
      childrenAges: [],
    });
    store.put(
      business.id,
      "bookings",
      booking("friend-event", "completed", "friend"),
    );
    store.put(business.id, "money", {
      id: "friend-payment",
      bookingId: "friend-event",
      kind: "payment",
      amount: 10001,
    });
    await request("/manage/reward-settings", "PUT", {
      ...settings,
      returnOnCancel: false,
    });
    const referral = await issue("referral");
    assert.equal(referral.status, 201);
    assert.deepEqual(referral.data.sourceEventIds, ["friend-event"]);
    assert.equal((await issue("referral")).status, 409);
    store.put(
      business.id,
      "bookings",
      booking("wrong-family", "quoted", "friend"),
    );
    assert.equal((await apply("wrong-family", referral.data.id)).status, 404);
    const alternative = booking("alternative");
    alternative.quotes.push({ ...alternative.quotes[0], id: "undiscounted" });
    store.put(business.id, "bookings", alternative);
    assert.equal((await apply("alternative", referral.data.id)).status, 200);
    const alternativeToken = (
      await request("/manage/bookings/alternative/link", "POST", {})
    ).data.path.split("#")[1];
    assert.equal(
      (
        await request(
          "/event/accept",
          "POST",
          { quoteId: "undiscounted", revision: 2 },
          null,
          { "x-event-token": alternativeToken },
        )
      ).status,
      200,
    );
    assert.equal(
      rewardView(store, business.id, referral.data).status,
      "available",
    );
    store.put(business.id, "bookings", booking("no-return"));
    store.put(business.id, "money", {
      id: "overpaid",
      bookingId: "no-return",
      kind: "payment",
      amount: 10001,
    });
    assert.equal((await apply("no-return", referral.data.id)).status, 409);
    assert.equal(store.get(business.id, "bookings", "no-return").revision, 1);
    store.put(business.id, "money", {
      id: "overpaid",
      bookingId: "no-return",
      kind: "payment",
      amount: 0,
    });
    assert.equal((await apply("no-return", referral.data.id)).status, 200);
    const noReturnToken = (
      await request("/manage/bookings/no-return/link", "POST", {})
    ).data.path.split("#")[1];
    assert.equal(
      (
        await request(
          "/event/accept",
          "POST",
          { quoteId: "no-return-q", revision: 2 },
          null,
          { "x-event-token": noReturnToken },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/manage/bookings/no-return/status", "POST", {
          revision: 3,
          status: "cancelled",
          reason: "Retain used reward by configured policy",
        })
      ).status,
      200,
    );
    assert.equal(rewardView(store, business.id, referral.data).status, "used");
    // Even a contact without an account/bookings retains its issued reward history.
    store.put(business.id, "customers", {
      id: "history-only",
      name: "Historical contact",
    });
    store.put(business.id, "rewardAwards", {
      ...referral.data,
      id: "historic-award",
      customerId: "history-only",
      voided: true,
    });
    assert.equal(
      (await request("/manage/customers/history-only", "DELETE")).status,
      409,
    );
    const audit = store.all(business.id, "audit");
    assert.ok(audit.some((a) => a.action === "reward.issued"));
    assert.ok(audit.some((a) => a.action === "reward.applied-to-proposal"));
    assert.ok(audit.some((a) => a.action === "reward.voided"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});
