import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { tokenWallet, tokenPercent } from "../dist/tokens.js";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";

test("referral tokens count each paid friend once, spend partly and return after cancellation", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Magic", "token-test");
  const magic = await store.get(business.id, "packages", "magic");
  assert.deepEqual(Object.values(tokenPercent), [10, 20, 30, 40, 100]);
  const booking = (id, customerId, status = "completed") => ({
    id, customerId, name: id, status, packageIds: ["magic"], packageSnapshot: [magic],
    quotes: [{ id: `${id}-q`, name: "Magic", packageIds: ["magic"],
      packageSnapshot: [magic], amount: 10000, deposit: 0, notes: "" }],
    acceptedQuoteId: status === "completed" ? `${id}-q` : "",
    revision: 1, updatedAt: new Date().toISOString(),
  });
  for (const friend of ["one", "two", "three"]) {
    await store.put(business.id, "customerExtras", { id: friend, childrenAges: [], referredBy: "sam" });
    await store.put(business.id, "bookings", booking(`show-${friend}`, friend));
    await store.put(business.id, "money", { id: `paid-${friend}`, bookingId: `show-${friend}`,
      kind: "payment", amount: 10000 });
  }
  await store.put(business.id, "bookings", booking("repeat-show", "one"));
  await store.put(business.id, "money", { id: "paid-repeat", bookingId: "repeat-show", kind: "payment", amount: 10000 });
  assert.equal((await tokenWallet(store, business.id, "sam")).balance, 3);
  await store.put(business.id, "tokenAdjustments", { id: "bonus", customerId: "sam", amount: 1,
    reason: "Additional show", at: new Date().toISOString(), actor: "owner" });
  assert.equal((await tokenWallet(store, business.id, "sam")).balance, 4);
  await store.put(business.id, "rewardAwards", { id: "two-token-offer", customerId: "sam",
    kind: "token", tokenCost: 2, sourceEventIds: [], sourceCustomers: {},
    settings: {}, percent: 20, issuedAt: new Date().toISOString(), voided: false });
  const offer = booking("sam-offer", "sam", "quoted");
  offer.quotes[0].reward = { awardId: "two-token-offer", kind: "token", originalAmount: 10000,
    originalDeposit: 0, discount: 2000, percent: 20, terms: "", returnOnCancel: true };
  await store.put(business.id, "bookings", offer);
  assert.equal((await tokenWallet(store, business.id, "sam")).balance, 2);
  await store.put(business.id, "bookings", { ...offer, status: "cancelled" });
  assert.equal((await tokenWallet(store, business.id, "sam")).balance, 4);
  await store.put(business.id, "money", { id: "refund-one", bookingId: "show-one", kind: "refund", amount: 10000 });
  assert.equal((await tokenWallet(store, business.id, "sam")).balance, 4);
  await store.put(business.id, "money", { id: "refund-two", bookingId: "show-two", kind: "refund", amount: 10000 });
  assert.equal((await tokenWallet(store, business.id, "sam")).balance, 3);
});

test("staff applies two tokens for 20% off one magic quote and keeps the remaining token", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Magic", "token-route");
  const password = "Token-test-password-42!";
  await createUser(store, business.id, "owner@example.test", password, "Owner");
  const app = createApp(store, "http://localhost:43231");
  const server = app.listen(43231, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const request = async (path, method = "GET", body, cookie = "") => {
      const response = await fetch(`http://localhost:43231/api${path}`, {
        method, headers: { origin: "http://localhost:43231", "content-type": "application/json", cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
    };
    const cookie = (await request("/login", "POST", { email: "owner@example.test", password })).cookie;
    await store.put(business.id, "customers", { id: "sam", name: "Sam" });
    await store.put(business.id, "tokenAdjustments", { id: "manual", customerId: "sam", amount: 3,
      reason: "Testing", at: new Date().toISOString(), actor: "owner" });
    const magic = await store.get(business.id, "packages", "magic");
    await store.put(business.id, "bookings", {
      id: "offer", customerId: "sam", status: "quoted", revision: 1,
      quotes: [{ id: "magic-q", name: "Magic", amount: 10000, deposit: 0, packageIds: ["magic"], packageSnapshot: [magic], notes: "" }],
      acceptedQuoteId: "", updatedAt: new Date().toISOString(),
    });
    const applied = await request("/manage/bookings/offer/token-reward", "POST",
      { quoteId: "magic-q", revision: 1, tokens: 2 }, cookie);
    assert.equal(applied.status, 200);
    assert.equal(applied.data.booking.quotes[0].amount, 8000);
    assert.equal(applied.data.wallet.balance, 1);
    assert.equal((await request("/manage/bookings/offer/token-reward", "POST",
      { quoteId: "magic-q", revision: 1, tokens: 1 }, cookie)).status, 409);
    await store.put(business.id, "tokenAdjustments", { id: "another-four", customerId: "sam", amount: 4,
      reason: "Four more verified shows", at: new Date().toISOString(), actor: "owner" });
    await store.put(business.id, "bookings", {
      id: "free-offer", customerId: "sam", status: "quoted", revision: 1,
      quotes: [{ id: "free-q", name: "Magic", amount: 10000, deposit: 0, packageIds: ["magic"], packageSnapshot: [magic], notes: "" }],
      acceptedQuoteId: "", updatedAt: new Date().toISOString(),
    });
    const free = await request("/manage/bookings/free-offer/token-reward", "POST",
      { quoteId: "free-q", revision: 1, tokens: 5 }, cookie);
    assert.equal(free.status, 200);
    assert.equal(free.data.booking.quotes[0].amount, 0);
    assert.equal(free.data.booking.quotes[0].reward.percent, 100);
    assert.equal(free.data.wallet.balance, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

