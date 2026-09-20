import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup } from "node:sqlite";
import { Store } from "../dist/store.js";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";

let store,
  server,
  origin,
  business,
  other,
  cookie,
  assistant,
  performerCookie,
  otherCookie,
  customerCookie;
const dir = mkdtempSync(join(tmpdir(), "magic-test-"));
const password = "Test-only-long-password-42";
const performer = {
  name: "Test Performer",
  bio: "Test biography",
  categories: ["magic"],
  photo: "",
  video: "",
  areas: "Test venue",
  active: true,
  membershipVerified: false,
};
const event = {
  name: "Integration celebration",
  date: "2027-05-04",
  time: "14:00",
  location: "Test venue",
  occasion: "Birthday",
  audience: 20,
  age: 7,
  indoor: true,
  power: true,
  space: 20,
  packageIds: ["magic"],
  performerIds: ["sam"],
};
async function request(path, method = "GET", body, auth = cookie, extra = {}) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      ...(auth ? { cookie: auth } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json(),
    headers: response.headers,
  };
}
async function login(email) {
  const r = await request("/login", "POST", { email, password }, null);
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
async function newRequest(overrides = {}) {
  const r = await request(
    "/public/test/requests",
    "POST",
    {
      customer: { name: "Test family", phone: "+96170000000" },
      event: { ...event, ...overrides },
    },
    customerCookie,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { ...r.data, token: r.data.path.split("#")[1] };
}
async function current(id) {
  return (await request("/manage/state")).data.bookings.find(
    (b) => b.id === id,
  );
}
async function action(id, verb, body) {
  const b = await current(id);
  return request(`/manage/bookings/${id}/${verb}`, "POST", {
    ...body,
    revision: b.revision,
  });
}
async function propose(id) {
  return action(id, "quotes", {
    options: [
      {
        name: "Magic only",
        packageIds: ["magic"],
        amount: 30000,
        deposit: 5000,
        notes: "Test terms",
      },
      {
        name: "Magic and bubbles",
        packageIds: ["magic", "bubbles"],
        amount: 45000,
        deposit: 10000,
        notes: "Test alternative",
      },
    ],
  });
}
async function accept(info) {
  const b = await current(info.id);
  return request(
    "/event/accept",
    "POST",
    { quoteId: b.quotes[0].id, revision: b.revision },
    null,
    { "x-event-token": info.token },
  );
}
before(async () => {
  store = new Store(join(dir, "test.sqlite"));
  business = store.createBusiness("Test stage", "test");
  other = store.createBusiness("Other stage", "other");
  store.put(business.id, "performers", { ...performer, id: "sam" });
  await createUser(
    store,
    business.id,
    "owner@example.test",
    password,
    "Owner",
    "admin",
  );
  await createUser(
    store,
    business.id,
    "assistant@example.test",
    password,
    "Assistant",
    "assistant",
  );
  await createUser(
    store,
    business.id,
    "performer@example.test",
    password,
    "Performer",
    "performer",
    "sam",
  );
  await createUser(
    store,
    other.id,
    "other@example.test",
    password,
    "Other owner",
  );
  server = createApp(store, "http://localhost:43219").listen(
    43219,
    "127.0.0.1",
  );
  await new Promise((resolve) => server.once("listening", resolve));
  origin = "http://localhost:43219";
  cookie = await login("owner@example.test");
  assistant = await login("assistant@example.test");
  performerCookie = await login("performer@example.test");
  otherCookie = await login("other@example.test");
  const customer = await request(
    "/customer/test/register",
    "POST",
    { name: "Test family", phone: "+96170000000", password },
    null,
  );
  assert.equal(customer.status, 201);
  customerCookie = customer.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});
test("private routes require a session and reject cross-origin writes", async () => {
  assert.equal(
    (await request("/manage/state", "GET", undefined, null)).status,
    401,
  );
  assert.equal(
    (
      await request("/logout", "POST", {}, cookie, {
        origin: "https://attacker.invalid",
      })
    ).status,
    403,
  );
});
test("public request persists without confirming and public catalog exposes no private data", async () => {
  const info = await newRequest();
  const b = await current(info.id);
  assert.equal(b.status, "requested");
  assert.equal(b.availability.sam, "pending");
  const catalog = (await request("/public/test", "GET", undefined, null)).data;
  assert.equal(catalog.customers, undefined);
  const page = (
    await request("/event", "GET", undefined, null, {
      "x-event-token": info.token,
    })
  ).data;
  assert.equal(page.booking.customerId, undefined);
  assert.equal(page.booking.notes, undefined);
  assert.equal(page.totals.expenses, undefined);
});
test("invalid, past, duplicate and cross-business selections are rejected", async () => {
  for (const patch of [
    { date: "2020-01-01" },
    { date: "2027-02-30" },
    { time: "25:00" },
    { packageIds: ["magic", "magic"] },
    { performerIds: ["missing"] },
    { space: -1 },
  ]) {
    const r = await request(
      "/public/test/requests",
      "POST",
      {
        customer: { name: "Test", phone: "+96170000001" },
        event: { ...event, ...patch },
      },
      customerCookie,
    );
    assert.ok([400, 404].includes(r.status));
  }
});
test("repeat customer bookings reuse the authenticated profile", async () => {
  const before = store.all(business.id, "customers").length;
  await newRequest();
  await newRequest();
  assert.equal(store.all(business.id, "customers").length, before);
});
test("full request → quote → acceptance → deposit → availability → confirmation flow", async () => {
  const info = await newRequest();
  assert.equal(
    (
      await action(info.id, "status", {
        status: "confirmed",
        reason: "Test approval",
      })
    ).status,
    400,
  );
  assert.equal((await propose(info.id)).status, 200);
  assert.equal((await accept(info)).status, 200);
  assert.equal(
    (
      await action(info.id, "status", {
        status: "confirmed",
        reason: "Test approval",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await action(info.id, "availability", {
        performerId: "sam",
        state: "available",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await action(info.id, "status", {
        status: "confirmed",
        reason: "Test approval",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/manage/money", "POST", {
        bookingId: info.id,
        kind: "payment",
        amount: 5000,
        category: "deposit",
        note: "Test receipt",
        date: "2026-09-18",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await action(info.id, "status", {
        status: "confirmed",
        reason: "Deposit and availability checked",
      })
    ).status,
    200,
  );
  assert.equal((await current(info.id)).status, "confirmed");
  assert.equal(
    (
      await action(info.id, "status", {
        status: "completed",
        reason: "Too early",
      })
    ).status,
    400,
  );
  const page = await request("/event", "GET", undefined, null, {
    "x-event-token": info.token,
  });
  assert.equal(page.data.totals.balance, 25000);
  const history = store
    .all(business.id, "audit")
    .filter((a) => a.entityId === info.id);
  assert.ok(history.some((a) => a.action === "quote.accepted"));
});
test("confirmed conflict includes travel and setup", async () => {
  const info = await newRequest({ time: "15:00" });
  await propose(info.id);
  await accept(info);
  await action(info.id, "availability", {
    performerId: "sam",
    state: "available",
  });
  await request("/manage/money", "POST", {
    bookingId: info.id,
    kind: "payment",
    amount: 5000,
    category: "deposit",
    note: "",
    date: "2026-09-18",
  });
  const result = await action(info.id, "status", {
    status: "confirmed",
    reason: "Conflict test",
  });
  assert.equal(result.status, 409);
  assert.match(result.data.error, /Conflicts/);
});
test("stale quote acceptance and stale staff writes fail", async () => {
  const info = await newRequest({ date: "2027-05-10" });
  await propose(info.id);
  const old = await current(info.id);
  await propose(info.id);
  const result = await request(
    "/event/accept",
    "POST",
    { quoteId: old.quotes[0].id, revision: old.revision },
    null,
    { "x-event-token": info.token },
  );
  assert.equal(result.status, 409);
  const stale = await request(
    `/manage/bookings/${info.id}/availability`,
    "POST",
    { revision: old.revision, performerId: "sam", state: "available" },
  );
  assert.equal(stale.status, 409);
});
test("venue edits revoke confirmation and date edits reset availability", async () => {
  const b = store
    .all(business.id, "bookings")
    .find((b) => b.status === "confirmed");
  const link = await request(`/manage/bookings/${b.id}/link`, "POST", {});
  const eventToken = link.data.path.split("#")[1];
  assert.equal(
    (
      await request(
        "/event/details",
        "POST",
        {
          revision: b.revision,
          location: "Changed venue",
          audience: 20,
          age: 7,
          indoor: true,
          power: true,
          space: 20,
        },
        null,
        { "x-event-token": eventToken },
      )
    ).status,
    200,
  );
  const changed = await current(b.id);
  assert.equal(changed.status, "accepted");
  const edited = await request(`/manage/bookings/${b.id}/details`, "PUT", {
    ...changed,
    date: "2027-05-12",
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.availability.sam, "pending");
});
test("business separation blocks ID guessing and exports contain only the owner business", async () => {
  const b = store.all(business.id, "bookings")[0];
  assert.equal(
    (await request(`/manage/bookings/${b.id}/link`, "POST", {}, otherCookie))
      .status,
    404,
  );
  const data = (await request("/manage/export", "GET", undefined, otherCookie))
    .data;
  assert.equal(data.business.id, other.id);
  assert.deepEqual(data.bookings, []);
});
test("performer views omit customers, money and quotes; assistant cannot price or export", async () => {
  const p = (await request("/manage/state", "GET", undefined, performerCookie))
    .data;
  assert.deepEqual(p.customers, []);
  assert.deepEqual(p.money, []);
  assert.ok(
    p.bookings.every((b) => b.customerId === "" && b.quotes.length === 0),
  );
  const b = p.bookings[0];
  assert.equal(
    (
      await request(
        `/manage/bookings/${b.id}/quotes`,
        "POST",
        { revision: b.revision, options: [] },
        assistant,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/manage/export", "GET", undefined, assistant)).status,
    403,
  );
});
test("admin cross-business support needs a reason and writes a disclosed audit entry", async () => {
  assert.equal(
    (
      await request("/manage/state", "GET", undefined, cookie, {
        "x-support-business": other.id,
      })
    ).status,
    400,
  );
  const result = await request("/manage/state", "GET", undefined, cookie, {
    "x-support-business": other.id,
    "x-support-reason": "Owner requested troubleshooting",
  });
  assert.equal(result.status, 200);
  assert.ok(result.data.audit.some((a) => a.action === "admin.support-access"));
  assert.equal(
    (
      await request("/manage/state", "GET", undefined, otherCookie, {
        "x-support-business": business.id,
        "x-support-reason": "Trying unauthorized access",
      })
    ).status,
    403,
  );
});
test("rotating a customer link invalidates the old link", async () => {
  const info = await newRequest();
  await request(`/manage/bookings/${info.id}/link`, "POST", {});
  assert.equal(
    (
      await request("/event", "GET", undefined, null, {
        "x-event-token": info.token,
      })
    ).status,
    404,
  );
});
test("completed-event reviews enforce performer identity, privacy and one submission", async () => {
  const info = await newRequest();
  const b = await current(info.id);
  store.put(business.id, "bookings", { ...b, status: "completed" });
  const review = {
    performerId: "",
    overall: 4,
    punctuality: 5,
    engagement: 4,
    communication: 5,
    text: "A happy test",
    privateFeedback: "Private details",
    photo: "https://example.com/test.png",
    photoConsent: false,
    publishConsent: true,
  };
  assert.equal(
    (
      await request(
        "/event/reviews",
        "POST",
        { ...review, performerId: "unbooked" },
        null,
        { "x-event-token": info.token },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/event/reviews", "POST", review, null, {
        "x-event-token": info.token,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("/event/reviews", "POST", review, null, {
        "x-event-token": info.token,
      })
    ).status,
    409,
  );
  const saved = store
    .all(business.id, "reviews")
    .find((r) => r.bookingId === info.id);
  await request(`/manage/reviews/${saved.id}/moderate`, "POST", {
    published: true,
    reason: "Permission checked",
  });
  const pub = (await request("/public/test", "GET", undefined, null)).data
    .reviews[0];
  assert.equal(pub.privateFeedback, undefined);
  assert.equal(pub.photo, "");
  assert.equal(pub.overall, 4);
});
test("spreadsheet preview is read-only and commit skips same-file and existing duplicates", async () => {
  const rows = [
    { name: "Imported A", phone: "+96171111222" },
    { name: "Duplicate", phone: "00961 71 111 222" },
    { name: "Imported B", phone: "+96173333444" },
  ];
  const before = store.all(business.id, "customers").length;
  const preview = await request("/manage/import/customers", "POST", {
    rows,
    commit: false,
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.rows.filter((r) => r.duplicate).length, 1);
  assert.equal(store.all(business.id, "customers").length, before);
  assert.equal(
    (await request("/manage/import/customers", "POST", { rows, commit: true }))
      .data.added,
    2,
  );
  assert.equal(
    (await request("/manage/import/customers", "POST", { rows, commit: true }))
      .data.added,
    0,
  );
});
test("money corrections are audited, cannot over-refund, and preserve original values", async () => {
  const entry = store.all(business.id, "money")[0];
  const corrected = await request(`/manage/money/${entry.id}/correct`, "POST", {
    amount: 4000,
    category: entry.category,
    note: "Fixed typo",
    date: entry.date,
    reason: "Receipt was entered incorrectly",
  });
  assert.equal(corrected.status, 200);
  assert.ok(
    store
      .all(business.id, "audit")
      .some(
        (a) =>
          a.entityId === entry.id &&
          a.before?.amount === 5000 &&
          a.after?.amount === 4000,
      ),
  );
  assert.equal(
    (
      await request("/manage/money", "POST", {
        bookingId: entry.bookingId,
        kind: "refund",
        amount: 10000,
        category: "refund",
        note: "",
        date: "2026-09-18",
      })
    ).status,
    400,
  );
});
test("persistent database survives reopening without changing stored records", () => {
  const path = join(dir, "persistence.sqlite");
  const s = new Store(path);
  const b = s.createBusiness("Persistent", "persistent");
  s.put(b.id, "customers", { id: "test", name: "Stored" });
  s.db.close();
  const reopened = new Store(path);
  assert.equal(reopened.get(b.id, "customers", "test").name, "Stored");
  reopened.db.close();
});
test("business provisioning is isolated and duplicate requests do not leave orphan accounts", async () => {
  const payload = {
    name: "New test stage",
    slug: "new-test-stage",
    email: "new-stage@example.test",
    password,
    timezone: "Asia/Beirut",
  };
  const added = await request("/manage/businesses", "POST", payload);
  assert.equal(added.status, 201);
  assert.equal(
    (await request("/manage/businesses", "POST", payload)).status,
    409,
  );
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS count FROM businesses WHERE slug=?")
      .get(payload.slug).count,
    1,
  );
  assert.deepEqual(store.all(added.data.id, "customers"), []);
  assert.equal(
    (await request("/default-business", "GET", undefined, null)).data.slug,
    "test",
  );
});
test("refund below deposit revokes confirmation, without deleting the original payment", async () => {
  const info = await newRequest({ date: "2027-08-20" });
  await propose(info.id);
  await accept(info);
  await action(info.id, "availability", {
    performerId: "sam",
    state: "available",
  });
  await request("/manage/money", "POST", {
    bookingId: info.id,
    kind: "payment",
    amount: 5000,
    category: "deposit",
    note: "Test receipt",
    date: "2026-09-18",
  });
  assert.equal(
    (
      await action(info.id, "status", {
        status: "confirmed",
        reason: "Test refund workflow",
      })
    ).status,
    200,
  );
  const refund = await request("/manage/money", "POST", {
    bookingId: info.id,
    kind: "refund",
    amount: 1000,
    category: "refund",
    note: "Partial refund",
    date: "2026-09-18",
  });
  assert.equal(refund.status, 201);
  assert.equal((await current(info.id)).status, "accepted");
  assert.equal(
    store.all(business.id, "money").filter((m) => m.bookingId === info.id)
      .length,
    2,
  );
});
test("live package edits preserve proposal terms through snapshots", async () => {
  const info = await newRequest({ date: "2027-09-12" });
  await propose(info.id);
  await accept(info);
  const original = store.get(business.id, "packages", "magic");
  assert.equal(
    (
      await request("/manage/packages/magic", "PUT", {
        ...original,
        duration: 120,
        setup: 100,
      })
    ).status,
    200,
  );
  const page = (
    await request("/event", "GET", undefined, null, {
      "x-event-token": info.token,
    })
  ).data;
  assert.equal(page.timetable.at(-1).at, "14:45");
  await request("/manage/packages/magic", "PUT", original);
});
test("consistent backup can be opened with the same records and audit history", async () => {
  const file = join(dir, "backup.sqlite");
  await backup(store.db, file);
  const restored = new Store(file);
  assert.equal(
    restored.all(business.id, "bookings").length,
    store.all(business.id, "bookings").length,
  );
  assert.equal(
    restored.all(business.id, "audit").length,
    store.all(business.id, "audit").length,
  );
  restored.db.close();
});
test("user access changes revoke sessions; passwords can be changed without leaking hashes", async () => {
  const disposable = await createUser(
    store,
    business.id,
    "disposable@example.test",
    password,
    "Disposable",
    "assistant",
  );
  const session = await login("disposable@example.test");
  assert.equal(
    (
      await request(`/manage/users/${disposable.id}`, "PUT", {
        name: "Updated name",
        email: "disposable@example.test",
        role: "assistant",
        performerId: "",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/manage/state", "GET", undefined, session)).status,
    401,
  );
  const updatedSession = await login("disposable@example.test");
  const result = await request(
    "/manage/password",
    "POST",
    { currentPassword: password, newPassword: "Another-test-only-password-52" },
    updatedSession,
  );
  assert.equal(result.status, 200);
  assert.equal(
    (await request("/manage/state", "GET", undefined, updatedSession)).status,
    401,
  );
  assert.ok(
    store
      .all(business.id, "audit")
      .filter((a) => a.action === "user.password-changed")
      .every((a) => a.after === null),
  );
});

test("editable public contact and character settings stay scoped and audited", async () => {
  const original = store.business(business.id);
  const edited = {
    ...original,
    contactEmail: "contact@example.test",
    logo: "/sam-logo.png",
    whatsapp: "0096171299716",
    characterNames: ["Polar Bear", "Panda", "Bunny"],
    otherShowNames: [
      "Animation",
      "Dog Show",
      "Acrobat",
      "BMX",
      "Clown",
      "Juggler",
      "Breakdance",
    ],
  };
  assert.equal(
    (await request("/manage/business", "PUT", edited, assistant)).status,
    403,
  );
  assert.equal((await request("/manage/business", "PUT", edited)).status, 200);
  const catalog = (await request("/public/test", "GET", undefined, null)).data;
  assert.equal(catalog.business.contactEmail, edited.contactEmail);
  assert.equal(catalog.business.logo, "/sam-logo.png");
  assert.equal(
    (
      await request("/manage/business", "PUT", {
        ...edited,
        logo: "javascript:alert(1)",
      })
    ).status,
    400,
  );
  assert.deepEqual(catalog.business.characterNames, edited.characterNames);
  assert.deepEqual(catalog.business.otherShowNames, edited.otherShowNames);
  assert.equal(store.business(other.id).contactEmail, undefined);
  assert.equal(
    (
      await request("/manage/business", "PUT", {
        ...edited,
        contactEmail: "invalid",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/manage/business", "PUT", {
        ...edited,
        characterNames: [],
      })
    ).status,
    200,
  );
  assert.deepEqual(store.business(business.id).characterNames, []);
  assert.equal(
    (
      await request("/manage/business", "PUT", {
        ...edited,
        characterNames: ["Winter Guest"],
        otherShowNames: ["Animation"],
      })
    ).status,
    200,
  );
  assert.deepEqual(store.business(business.id).characterNames, [
    "Winter Guest",
  ]);
  assert.deepEqual(store.business(business.id).otherShowNames, ["Animation"]);
  assert.ok(
    store
      .all(business.id, "audit")
      .some((a) => a.action === "business.updated"),
  );
  await request("/manage/business", "PUT", {
    ...original,
    contactEmail: "",
    characterNames: [],
    otherShowNames: [],
  });
});

test("contact history is private, scoped, revision checked and preserved", async () => {
  const a = {
    id: "history-family",
    name: "History family",
    phone: "+96171111111",
  };
  const b = { ...a, id: "different-family" };
  store.put(business.id, "customers", a);
  store.put(business.id, "customers", b);
  store.put(business.id, "customerExtras", { id: a.id, childrenAges: [5, 9] });
  store.put(business.id, "bookings", { id: "history-event", customerId: a.id });
  store.put(business.id, "bookings", {
    id: "different-event",
    customerId: b.id,
  });
  const path = `/manage/customers/${a.id}/history`;
  const note = {
    date: "2026-09-20",
    channel: "phone",
    direction: "inbound",
    summary: "Asked about bubble show",
    bookingId: "history-event",
    revision: 0,
  };
  for (const auth of [null, customerCookie]) {
    assert.equal((await request(path, "GET", undefined, auth)).status, 401);
    assert.equal((await request(path + "/new", "PUT", note, auth)).status, 401);
  }
  for (const method of ["GET", "PUT"]) {
    assert.equal(
      (
        await request(
          path + (method === "PUT" ? "/new" : ""),
          method,
          method === "PUT" ? note : undefined,
          performerCookie,
        )
      ).status,
      403,
    );
  }
  assert.equal(
    (await request(path, "GET", undefined, otherCookie)).status,
    404,
  );
  assert.equal(
    (
      await request(path + "/new", "PUT", {
        ...note,
        bookingId: "different-event",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(path + "/new", "PUT", { ...note, summary: " " })).status,
    400,
  );
  const created = await request(path + "/new", "PUT", note, assistant);
  assert.equal(created.status, 200);
  assert.equal(created.data.revision, 1);
  const key = path + "/" + created.data.id;
  assert.equal((await request(key, "PUT", note)).status, 409);
  assert.equal(
    (
      await request(
        `/manage/customers/${b.id}/history/${created.data.id}`,
        "PUT",
        created.data,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(key, "PUT", created.data, otherCookie)).status,
    404,
  );
  let edited = (
    await request(key, "PUT", {
      ...created.data,
      summary: "Corrected contact details",
    })
  ).data;
  assert.equal(edited.revision, 2);
  edited = (await request(key, "PUT", { ...edited, archived: true })).data;
  assert.equal(edited.archived, true);
  edited = (await request(key, "PUT", { ...edited, archived: false })).data;
  assert.equal(edited.archived, false);
  const history = (await request(path, "GET", undefined, assistant)).data;
  assert.deepEqual(history.childrenAges, [5, 9]);
  assert.equal(history.entries.length, 1);
  assert.deepEqual(
    (await request(`/manage/customers/${b.id}/history`)).data.entries,
    [],
  );
  assert.equal(
    (await request("/manage/export")).data.contactHistory[0].id,
    edited.id,
  );
  const audit = store
    .all(business.id, "audit")
    .filter((item) => item.action.startsWith("contact."));
  assert.deepEqual(audit.map((item) => item.action).sort(), [
    "contact.archived",
    "contact.corrected",
    "contact.recorded",
    "contact.restored",
  ]);
  store.db
    .prepare(
      "DELETE FROM records WHERE business_id=? AND kind='bookings' AND id IN ('history-event','different-event')",
    )
    .run(business.id);
  assert.equal(
    (await request(`/manage/customers/${a.id}`, "DELETE")).status,
    409,
  );
});
