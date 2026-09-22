import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { TestStore as Store } from "./store-fixture.mjs";
import {
  followupSchema,
  followupCandidates,
  generateFollowups,
} from "../dist/followups.js";
import { customerSchema } from "../dist/domain.js";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
const family = (id, changes = {}) => ({
  id,
  ...customerSchema.parse({
    name: id,
    phone: "+96170000000",
    offersConsent: true,
    children: [{ name: "Child", birthday: "2020-02-29" }],
    ...changes,
  }),
});
test("planner uses calendar days, leap birthdays and explicit offer consent", () => {
  const b = { name: "Test", timezone: "Asia/Beirut" },
    settings = followupSchema.parse({ schoolDate: "2027-03-20" });
  const customers = [
    family("yes"),
    family("no", { offersConsent: false }),
    family("blocked", { doNotContact: true }),
    family("school", { kind: "school", children: [] }),
  ];
  const reminders = followupCandidates(
    b,
    customers,
    [],
    settings,
    "2027-02-28",
  );
  assert.equal(reminders.length, 2);
  assert.equal(reminders[0].date, "2027-01-29");
  assert.match(reminders[0].draft, /2027-02-28/);
  assert.ok(!reminders.some((r) => ["no", "blocked"].includes(r.customerId)));
  assert.equal(
    followupCandidates(b, [family("leap")], [], settings, "2028-02-29")[0].date,
    "2028-01-30",
  );
});
test("planner does not chase cancelled or accepted proposals, or ancient events", () => {
  const b = { name: "Test", timezone: "Asia/Beirut" },
    c = family("family", { children: [] }),
    settings = followupSchema.parse({});
  const event = {
    id: "event",
    customerId: c.id,
    name: "Show",
    date: "2027-04-10",
    updatedAt: "2027-04-01T12:00:00Z",
    quotes: [{ id: "q1" }],
  };
  for (const status of ["cancelled", "accepted", "confirmed", "requested"])
    assert.equal(
      followupCandidates(b, [c], [{ ...event, status }], settings, "2027-04-05")
        .length,
      0,
    );
  assert.equal(
    followupCandidates(
      b,
      [c],
      [{ ...event, status: "quoted" }],
      settings,
      "2027-04-05",
    ).length,
    1,
  );
  assert.equal(
    followupCandidates(
      b,
      [c],
      [{ ...event, status: "completed" }],
      settings,
      "2027-06-30",
    ).length,
    0,
  );
  assert.equal(
    followupCandidates(
      b,
      [c],
      [{ ...event, status: "completed" }],
      settings,
      "2027-04-11",
    ).length,
    1,
  );
});
test("generated reminders are idempotent, tenant scoped and contact recording honors fresh consent", async () => {
  const store = new Store(":memory:"),
    origin = "http://localhost:46601",
    password = "Followup-fixture-password-42!";
  const b = await store.createBusiness("Test", "test"),
    other = await store.createBusiness("Other", "other");
  const today = DateTime.now().setZone(b.timezone).toISODate(),
    c = family("family", { children: [{ name: "Child", birthday: today }] });
  await store.put(b.id, "customers", c);
  await store.put(b.id, "followupSettings", {
    ...followupSchema.parse({ enabled: true }),
    id: "settings",
  });
  await createUser(store, b.id, "owner@test.test", password, "Owner");
  await createUser(store, other.id, "other@test.test", password, "Other");
  assert.equal((await generateFollowups(store, b, today)).added, 1);
  assert.equal((await generateFollowups(store, b, today)).added, 0);
  assert.equal((await generateFollowups(store, other, today)).added, 0);
  const reminder = (await store.all(b.id, "reminders"))[0],
    server = createApp(store, origin).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const request = async (path, body, cookie) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    const owner = (
        await request("/login", { email: "owner@test.test", password })
      ).cookie,
      outsider = (
        await request("/login", { email: "other@test.test", password })
      ).cookie;
    const payload = {
        revision: reminder.revision,
        channel: "phone",
        summary: "Spoke with the customer about the birthday.",
        date: today,
        confirmed: true,
      },
      path = `/manage/reminders/${reminder.id}/contact`;
    assert.equal((await request(path, payload, outsider)).status, 404);
    assert.equal(
      (await request(path, { ...payload, confirmed: false }, owner)).status,
      400,
    );
    await store.put(b.id, "customers", { ...c, offersConsent: false });
    assert.equal((await request(path, payload, owner)).status, 409);
    assert.equal((await store.all(b.id, "contactHistory")).length, 0);
    await store.put(b.id, "customers", c);
    assert.equal((await request(path, payload, owner)).status, 200);
    assert.equal((await request(path, payload, owner)).status, 409);
    assert.equal((await store.all(b.id, "contactHistory")).length, 1);
    assert.equal((await store.get(b.id, "reminders", reminder.id)).done, true);
    assert.equal((await generateFollowups(store, b, today)).added, 0);
  } finally {
    await new Promise((r) => server.close(r));
    store.db.close();
  }
});
