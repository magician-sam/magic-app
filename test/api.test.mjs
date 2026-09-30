import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { snapshot, restoreSnapshot } from "../dist/snapshots.js";
import { TestStore as Store } from "./store-fixture.mjs";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
import { guestServiceNames } from "../dist/guest-services.js";

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
const testRoot = resolve(process.env.MAGIC_TEST_ROOT ?? "test-temp");
mkdirSync(testRoot, { recursive: true });
const dir = mkdtempSync(join(testRoot, "magic-test-"));
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
  return await request(`/manage/bookings/${id}/${verb}`, "POST", {
    ...body,
    revision: b.revision,
  });
}
async function propose(id) {
  return await action(id, "quotes", {
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
  return await request(
    "/event/accept",
    "POST",
    { quoteId: b.quotes[0].id, revision: b.revision },
    null,
    { "x-event-token": info.token },
  );
}
before(async () => {
  store = new Store(join(dir, "test.sqlite"));
  business = await store.createBusiness("Test stage", "test");
  other = await store.createBusiness("Other stage", "other");
  await store.put(business.id, "performers", { ...performer, id: "sam" });
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
  assert.ok(resolve(dir).startsWith(testRoot + sep));
  // The libSQL native test driver retains a Windows file handle until process exit.
  // test-drivers.mjs removes its bounded temporary directory after the worker exits.
  if (process.env.TEST_LIBSQL === "1" && process.platform === "win32") return;
  rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
test("visitors can enquire about guest services and only staff can see their details", async () => {
  const input = {
    service: "Decoration",
    name: "Test visitor",
    phone: "+96170123456",
    date: "2027-05-04",
    location: "Beirut",
    notes: "Dinosaur birthday",
  };
  const created = await request("/public/test/enquiries", "POST", input, null);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.ok(created.data.id);
  const owner = (await request("/manage/state")).data;
  assert.equal(owner.enquiries.find((item) => item.id === created.data.id).service, "Decoration");
  const performerState = (await request("/manage/state", "GET", undefined, performerCookie)).data;
  assert.deepEqual(performerState.enquiries, []);
  const otherState = (await request("/manage/state", "GET", undefined, otherCookie)).data;
  assert.deepEqual(otherState.enquiries, []);
  assert.equal((await request(`/manage/enquiries/${created.data.id}/contacted`, "POST", {}, performerCookie)).status, 403);
  assert.equal((await request(`/manage/enquiries/${created.data.id}/contacted`, "POST", {})).status, 200);
  assert.equal((await request("/manage/state")).data.enquiries.find((item) => item.id === created.data.id).status, "contacted");
  assert.equal((await request("/public/test/enquiries", "POST", { ...input, phone: "123" }, null)).status, 400);
});
test("enquiries can be edited, handled, archived, restored and permanently deleted safely", async () => {
  const input = { service: "Decoration", name: "Temporary enquiry test", phone: "+96170123456", date: "", location: "Test venue", notes: "Private test details" };
  const created = await request("/public/test/enquiries", "POST", input, null);
  assert.equal(created.status, 201);
  const key = created.data.id;
  const path = `/manage/enquiries/${key}`;
  assert.equal((await request(path, "PUT", { ...input, revision: 0 }, performerCookie)).status, 403);
  assert.equal((await request(path, "PUT", { ...input, revision: 0 }, otherCookie)).status, 404);
  const edited = await request(path, "PUT", { ...input, location: "Edited venue", revision: 0 });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.revision, 1);
  assert.equal((await request(path, "PUT", { ...input, revision: 0 })).status, 409);
  assert.equal((await request(path + "/contacted", "POST", { revision: 1 })).status, 200);
  const archived = await request(path + "/archive", "POST", { archived: true, revision: 2 });
  assert.equal(archived.status, 200);
  assert.ok(archived.data.archivedAt);
  assert.equal((await request(path + "/archive", "POST", { archived: false, revision: 2 })).status, 409);
  const restored = await request(path + "/archive", "POST", { archived: false, revision: 3 });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.archivedAt, undefined);
  assert.equal(restored.data.status, "contacted");
  assert.equal(restored.data.location, "Edited venue");
  assert.equal((await request(path, "DELETE", { name: input.name, revision: 4 }, assistant)).status, 403);
  assert.equal((await request(path, "DELETE", { name: input.name, revision: 4 }, otherCookie)).status, 404);
  assert.equal((await request(path, "DELETE", { name: "Wrong name", revision: 4 })).status, 400);
  assert.equal((await request(path, "DELETE", { name: input.name, revision: 3 })).status, 409);
  assert.equal((await request(path, "DELETE", { name: input.name, revision: 4 })).status, 200);
  assert.equal(await store.get(business.id, "enquiries", key), undefined);
  const audit = (await store.all(business.id, "audit")).filter((entry) => entry.entityId === key);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "enquiry.permanently-deleted");
  assert.equal(audit[0].before, null);
  assert.equal(audit[0].after, null);
});
test("gallery publication requires valid approved images and remains business scoped", async () => {
  const original = await store.get(business.id, "packages", "magic");
  const gallery = [
    {
      url: "https://example.com/show.jpg",
      caption: "Sample show",
      approved: true,
    },
  ];
  const path = "/manage/packages/magic";
  assert.equal(
    (
      await request(path, "PUT", {
        ...original,
        gallery: [{ ...gallery[0], approved: false }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(path, "PUT", {
        ...original,
        gallery: [{ ...gallery[0], url: "javascript:alert(1)" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(path, "PUT", {
        ...original,
        gallery: [gallery[0], gallery[0]],
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(path, "PUT", { ...original, gallery }, performerCookie))
      .status,
    403,
  );
  assert.equal(
    (await request(path, "PUT", { ...original, gallery, coverPhotoNumber: 2, hiddenPhotoUrls: ["/portfolio/sam-magic-1.jpg"], hiddenVideoUrls: ["/portfolio/sam-science-live-1.mp4"] })).status,
    200,
  );
  assert.deepEqual(
    (await request("/public/test", "GET", undefined, null)).data.packages.find(
      (p) => p.id === "magic",
    ).gallery,
    gallery,
  );
  const published = (await request("/public/test", "GET", undefined, null)).data.packages.find((p) => p.id === "magic");
  assert.equal(published.coverPhotoNumber, 2);
  assert.deepEqual(published.hiddenPhotoUrls, ["/portfolio/sam-magic-1.jpg"]);
  assert.deepEqual(published.hiddenVideoUrls, ["/portfolio/sam-science-live-1.mp4"]);
  assert.equal(
    (await store.get(other.id, "packages", "magic")).gallery,
    undefined,
  );
  assert.equal(
    (await request(path, "PUT", { ...original, gallery: [] })).status,
    200,
  );
  assert.deepEqual(
    (await store.get(business.id, "packages", "magic")).gallery,
    [],
  );
});

test("photo upload requires owner login and an attached photo store", async () => {
  const previous = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const send = async (auth) => {
      const response = await fetch(origin + "/api/manage/upload-photo", {
        method: "POST",
        headers: {
          origin,
          "content-type": "image/jpeg",
          ...(auth ? { cookie: auth } : {}),
        },
        body: jpeg,
      });
      return response.status;
    };
    assert.equal(await send(null), 401);
    assert.equal(await send(performerCookie), 403);
    assert.equal(await send(cookie), 503);
    assert.equal((await request("/manage/upload-video", "POST", {}, null)).status, 401);
    assert.equal((await request("/manage/upload-video", "POST", {}, performerCookie)).status, 403);
    assert.equal((await request("/manage/upload-video", "POST", {})).status, 503);
  } finally {
    if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous;
  }
});

test("owner manages show categories and linked shows safely", async () => {
  const path = "/manage/show-categories";
  assert.equal((await request(path, "POST", { action: "add", name: "Puppetry" }, assistant)).status, 403);
  const added = await request(path, "POST", { action: "add", name: "Puppetry" });
  assert.equal(added.status, 200);
  assert.ok(added.data.categories.includes("Puppetry"));
  assert.equal((await request(path, "POST", { action: "add", name: "puppetry" })).status, 400);
  const original = await store.get(business.id, "packages", "magic");
  const show = await request("/manage/packages/new", "PUT", {
    ...original,
    name: "Puppet Show",
    category: "Puppetry",
    gallery: [],
    previewVideos: [],
    bundleIds: [],
  });
  assert.equal(show.status, 200);
  assert.ok((await request("/public/test", "GET", undefined, null)).data.packages.some((item) => item.id === show.data.id));
  assert.equal((await request(path, "POST", { action: "remove", oldName: "Puppetry" })).status, 409);
  const renamed = await request(path, "POST", { action: "rename", oldName: "Puppetry", name: "Stage Stories" });
  assert.equal(renamed.status, 200);
  assert.equal((await store.get(business.id, "packages", show.data.id)).category, "Stage Stories");
  assert.equal((await request("/public/test", "GET", undefined, null)).data.packages.find((item) => item.id === show.data.id).category, "Stage Stories");
  assert.equal((await request(path, "POST", { action: "remove", oldName: "Stage Stories" })).status, 409);
  assert.equal((await request("/manage/packages/" + show.data.id, "PUT", { ...show.data, category: "magic", active: false })).status, 200);
  const removed = await request(path, "POST", { action: "remove", oldName: "Stage Stories" });
  assert.equal(removed.status, 200);
  assert.ok(!removed.data.categories.includes("Stage Stories"));
  assert.equal((await store.get(other.id, "packages", "magic")).category, "magic");
  await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='packages' AND id=?").run(business.id, show.data.id);
  for (const announcement of (await store.all(business.id, "bundleAnnouncements")).filter((item) => item.packageId === show.data.id))
    await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='bundleAnnouncements' AND id=?").run(business.id, announcement.id);
});

test("owner can replace or hide homepage photos while preserving a visible hero", async () => {
  const path = "/manage/site-media/momentMagic";
  assert.equal((await request(path, "PUT", { value: "https://example.com/new-magic.jpg" }, assistant)).status, 403);
  assert.equal((await request(path, "PUT", { value: "http://example.com/no.jpg" })).status, 400);
  assert.equal((await request(path, "PUT", { value: "https://example.com/new-magic.jpg" })).status, 200);
  assert.equal((await request("/public/test", "GET", undefined, null)).data.business.siteMedia.momentMagic, "https://example.com/new-magic.jpg");
  assert.equal((await request("/manage/site-media/heroMagic", "PUT", { value: "" })).status, 200);
  assert.equal((await request("/manage/site-media/heroScience", "PUT", { value: "" })).status, 200);
  assert.equal((await request("/manage/site-media/heroCharacters", "PUT", { value: "" })).status, 400);
  assert.equal((await request("/manage/site-media/heroMagic", "PUT", { value: null })).status, 200);
  assert.equal((await request("/manage/site-media/heroScience", "PUT", { value: null })).status, 200);
  assert.equal((await request(path, "PUT", { value: null })).status, 200);
  assert.equal((await request("/public/test", "GET", undefined, null)).data.business.siteMedia.momentMagic, undefined);
});

test("bundles retain booking snapshots and reject overlapping shows in requests and quotes", async () => {
  // This scenario shares the suite fixture; preserve rate counters for the existing scenarios.
  const counters = await store.db.prepare("SELECT * FROM rate_limits").all();
  const original = await store.get(business.id, "packages", "magic");
  const body = {
    ...original,
    name: "Magic and bubbles offer",
    priceMode: "fixed",
    price: 30000,
    bundleIds: ["magic", "bubbles"],
    bundleBreakMinutes: 5,
  };
  const saved = await request("/manage/packages/new", "PUT", body);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const id = saved.data.id;
  const alerts = await store.all(business.id, "bundleAnnouncements");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].packageId, id);
  const accountAlerts = await request("/customer/test/me", "GET", undefined, customerCookie);
  assert.equal(accountAlerts.status, 200);
  assert.deepEqual(accountAlerts.data.announcements, []);
  const catalog = (await request("/public/test", "GET", undefined, null)).data;
  const bundle = catalog.packages.find((p) => p.id === id);
  assert.equal(bundle.bundleSnapshot.length, 2);
  assert.equal(bundle.price, 30000);
  assert.equal(await store.get(other.id, "packages", id), undefined);
  const bad = await request(
    "/public/test/requests",
    "POST",
    {
      customer: { name: "Test family", phone: "+96170000000" },
      event: { ...event, packageIds: [id, "magic"] },
    },
    customerCookie,
  );
  assert.equal(bad.status, 400);
  const info = await newRequest({ packageIds: [id] });
  const booking = await current(info.id);
  assert.equal(booking.packageSnapshot[0].price, 30000);
  assert.deepEqual(booking.packageSnapshot[0].bundleIds, ["magic", "bubbles"]);
  const quote = await action(info.id, "quotes", {
    options: [
      {
        name: "Duplicate",
        packageIds: [id, "bubbles"],
        amount: 30000,
        deposit: 0,
        notes: "",
      },
    ],
  });
  assert.equal(quote.status, 400);
  assert.equal(
    (await request("/manage/packages/" + id, "PUT", { ...body, price: 25000 }))
      .status,
    200,
  );
  assert.equal((await current(info.id)).packageSnapshot[0].price, 30000);
  await request("/manage/packages/" + id, "PUT", { ...body, active: false });
  await store.db.prepare("DELETE FROM rate_limits").run();
  for (const row of counters)
    await store.db
      .prepare("INSERT INTO rate_limits(id,count,expires) VALUES(?,?,?)")
      .run(row.id, row.count, row.expires);
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
  const before = (await store.all(business.id, "customers")).length;
  await newRequest();
  await newRequest();
  assert.equal((await store.all(business.id, "customers")).length, before);
});
test("full request → quote → choice → availability → confirmation → payment flow", async () => {
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
    200,
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
  const history = (await store.all(business.id, "audit")).filter(
    (a) => a.entityId === info.id,
  );
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
  const b = (await store.all(business.id, "bookings")).find(
    (b) => b.status === "confirmed",
  );
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
  const b = (await store.all(business.id, "bookings"))[0];
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
  assert.ok(p.packages.every((item) => item.price === 0));
  assert.ok(p.performers.every((item) => item.id === "sam"));
  assert.ok(
    p.bookings.every((b) => b.customerId === "" && b.quotes.length === 0 && !b.packageSnapshot && !b.customAnswers),
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
test("artist job responses are attributed, scoped, and reset after a schedule change", async () => {
  const template = (await store.all(business.id, "bookings")).find((b) => b.performerIds.includes("sam"));
  const info = { ...template, id: "artist-response-case", name: "Artist response test", date: "2028-11-09", status: "requested", availability: { sam: "pending" }, availabilityResponses: {}, revision: 1 };
  await store.put(business.id, "bookings", info);
  const path = `/manage/bookings/${info.id}/availability`;
  const first = await current(info.id);
  const confirmed = await request(path, "POST", {
    revision: first.revision,
    performerId: "sam",
    state: "available",
  }, performerCookie);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.availability.sam, "available");
  assert.equal(confirmed.data.availabilityResponses.sam.by, "performer@example.test");
  assert.ok(!Number.isNaN(Date.parse(confirmed.data.availabilityResponses.sam.at)));

  const declined = await request(path, "POST", {
    revision: confirmed.data.revision,
    performerId: "sam",
    state: "declined",
  }, performerCookie);
  assert.equal(declined.status, 200);
  assert.equal(declined.data.availability.sam, "declined");
  assert.equal((await request(path, "POST", {
    revision: declined.data.revision,
    performerId: "someone-else",
    state: "available",
  }, performerCookie)).status, 400);
  assert.equal((await request(path, "POST", {
    revision: first.revision,
    performerId: "sam",
    state: "available",
  }, performerCookie)).status, 409);

  const details = { ...declined.data, date: "2028-11-10", packageIds: ["magic"], performerIds: ["sam"] };
  const edited = await request(`/manage/bookings/${info.id}/details`, "PUT", {
    ...details,
    revision: declined.data.revision,
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.availability.sam, "pending");
  assert.deepEqual(edited.data.availabilityResponses, {});
});
test("owner controls each artist's company calendar without exposing booking details", async () => {
  const template = (await store.all(business.id, "bookings")).find((b) => b.performerIds.includes("sam"));
  await store.put(business.id, "bookings", { ...template, id: "private-company-calendar-case", name: "Private client celebration", date: "2029-02-03", time: "17:00", performerIds: [], notes: "Private planning", availability: {}, status: "confirmed" });
  const artist = (await request("/manage/state")).data.users.find((u) => u.email === "performer@example.test");
  assert.equal((await request("/manage/state", "GET", undefined, performerCookie)).data.companyCalendar.length, 0);
  const grant = await request(`/manage/users/${artist.id}`, "PUT", { ...artist, viewCompanyCalendar: true });
  assert.equal(grant.status, 200);
  performerCookie = await login("performer@example.test");
  const state = (await request("/manage/state", "GET", undefined, performerCookie)).data;
  assert.equal(state.user.viewCompanyCalendar, true);
  assert.ok(state.companyCalendar.some((entry) => entry.date === "2029-02-03" && entry.status === "confirmed"));
  assert.equal(JSON.stringify(state.companyCalendar).includes("Private client celebration"), false);
  assert.equal(JSON.stringify(state.companyCalendar).includes("Private planning"), false);
  assert.equal(state.bookings.some((b) => b.id === "private-company-calendar-case"), false);
  assert.equal((await request(`/manage/bookings/private-company-calendar-case/checks`, "GET", undefined, performerCookie)).status, 403);
  const revoke = await request(`/manage/users/${artist.id}`, "PUT", { ...grant.data, viewCompanyCalendar: false });
  assert.equal(revoke.status, 200);
  performerCookie = await login("performer@example.test");
  assert.deepEqual((await request("/manage/state", "GET", undefined, performerCookie)).data.companyCalendar, []);
});
test("artist conflict alerts do not reveal another customer's event name", async () => {
  const template = (await store.all(business.id, "bookings")).find((b) => b.performerIds.includes("sam"));
  const shared = { ...template, date: "2029-04-04", time: "16:00", status: "confirmed", performerIds: ["sam"], availability: { sam: "available" } };
  await store.put(business.id, "bookings", { ...shared, id: "artist-conflict-own", name: "My assigned show" });
  await store.put(business.id, "bookings", { ...shared, id: "artist-conflict-private", name: "Private client celebration" });
  const path = "/manage/bookings/artist-conflict-own/checks";
  const ownerIssues = (await request(path)).data.issues.join(" ");
  const artistIssues = (await request(path, "GET", undefined, performerCookie)).data.issues.join(" ");
  assert.match(ownerIssues, /Private client celebration/);
  assert.match(artistIssues, /Scheduling conflict with another event/);
  assert.equal(artistIssues.includes("Private client celebration"), false);
});
test("artist can complete an assigned past job once and owner sees the report", async () => {
  const template = (await store.all(business.id, "bookings")).find((b) => b.performerIds.includes("sam"));
  const booking = { ...template, id: "artist-completion-case", date: "2020-01-03", performerIds: ["sam"], availability: { sam: "available" }, status: "confirmed", artistCompletion: {}, revision: 1 };
  await store.put(business.id, "bookings", booking);
  const path = `/manage/bookings/${booking.id}/artist-completion`;
  assert.equal((await request(`/manage/bookings/${booking.id}/availability`, "POST", { revision: 1, performerId: "sam", state: "declined" }, performerCookie)).status, 409);
  assert.equal((await request(path, "POST", { revision: 1, notes: "Done", problems: "", extraExpense: 0 })).status, 403);
  const saved = await request(path, "POST", { revision: 1, notes: "Happy crowd", problems: "Sound check was late", extraExpense: 1200 }, performerCookie);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.artistCompletion.sam.notes, "Happy crowd");
  assert.equal(saved.data.artistCompletion.sam.extraExpense, 1200);
  assert.equal((await request(path, "POST", { revision: saved.data.revision, notes: "Again", problems: "", extraExpense: 0 }, performerCookie)).status, 409);
  const ownerView = await current(booking.id);
  assert.equal(ownerView.artistCompletion.sam.problems, "Sound check was late");
  assert.ok((await store.all(business.id, "audit")).some((a) => a.action === "bookings.artist.job-completed" && a.entityId === booking.id));
});
test("artist advances and final pay stay within the agreed staffing fee", async () => {
  const template = (await store.all(business.id, "bookings")).find((b) => b.performerIds.includes("sam"));
  const booking = { ...template, id: "artist-pay-case", date: "2029-03-02", performerIds: ["sam"], status: "confirmed" };
  await store.put(business.id, "bookings", booking);
  await store.put(business.id, "actPlans", { id: booking.id, rows: [{ packageId: "magic", performerId: "sam", agreedPay: 10000 }], notes: "" });
  const entry = { bookingId: booking.id, kind: "expense", performerId: "sam", category: "performer payment", note: "Advance", date: "2026-09-29", amount: 3000 };
  assert.equal((await request("/manage/money", "POST", entry, performerCookie)).status, 403);
  assert.equal((await request("/manage/money", "POST", { ...entry, performerId: "missing" })).status, 400);
  const advance = await request("/manage/money", "POST", entry);
  assert.equal(advance.status, 201, JSON.stringify(advance.data));
  assert.equal((await request("/manage/money", "POST", { ...entry, amount: 7000, note: "Final" })).status, 201);
  assert.equal((await request("/manage/money", "POST", { ...entry, amount: 1 })).status, 400);
  assert.equal((await request(`/manage/money/${advance.data.id}/correct`, "POST", { amount: 3001, category: entry.category, note: "Correction", date: entry.date, reason: "Wrong amount" })).status, 400);
  const ownerState = (await request("/manage/state")).data;
  assert.ok(ownerState.actPlans.some((plan) => plan.id === booking.id));
  assert.equal(ownerState.money.filter((row) => row.bookingId === booking.id && row.performerId === "sam").reduce((sum, row) => sum + row.amount, 0), 10000);
  assert.equal(JSON.stringify((await request("/manage/state", "GET", undefined, performerCookie)).data).includes("agreedPay"), false);
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
  await store.put(business.id, "bookings", { ...b, status: "completed" });
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
  const saved = (await store.all(business.id, "reviews")).find(
    (r) => r.bookingId === info.id,
  );
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
  const before = (await store.all(business.id, "customers")).length;
  const preview = await request("/manage/import/customers", "POST", {
    rows,
    commit: false,
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.rows.filter((r) => r.duplicate).length, 1);
  assert.equal((await store.all(business.id, "customers")).length, before);
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
  const entry = (await store.all(business.id, "money"))[0];
  const corrected = await request(`/manage/money/${entry.id}/correct`, "POST", {
    amount: 4000,
    category: entry.category,
    note: "Fixed typo",
    date: entry.date,
    reason: "Receipt was entered incorrectly",
  });
  assert.equal(corrected.status, 200);
  assert.ok(
    (await store.all(business.id, "audit")).some(
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
test("persistent database survives reopening without changing stored records", async () => {
  const path = join(dir, "persistence.sqlite");
  const s = new Store(path);
  const b = await s.createBusiness("Persistent", "persistent");
  await s.put(b.id, "customers", { id: "test", name: "Stored" });
  s.db.close();
  const reopened = new Store(path);
  assert.equal((await reopened.get(b.id, "customers", "test")).name, "Stored");
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
    (
      await store.db
        .prepare("SELECT COUNT(*) AS count FROM businesses WHERE slug=?")
        .get(payload.slug)
    ).count,
    1,
  );
  assert.deepEqual(await store.all(added.data.id, "customers"), []);
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
    (await store.all(business.id, "money")).filter(
      (m) => m.bookingId === info.id,
    ).length,
    2,
  );
});
test("live package edits preserve proposal terms through snapshots", async () => {
  const info = await newRequest({ date: "2027-09-12" });
  await propose(info.id);
  await accept(info);
  const original = await store.get(business.id, "packages", "magic");
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
  const restored = new Store(file);
  await restoreSnapshot(restored, await snapshot(store));
  assert.equal(
    (await restored.all(business.id, "bookings")).length,
    (await store.all(business.id, "bookings")).length,
  );
  assert.equal(
    (await restored.all(business.id, "audit")).length,
    (await store.all(business.id, "audit")).length,
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
    (await store.all(business.id, "audit"))
      .filter((a) => a.action === "user.password-changed")
      .every((a) => a.after === null),
  );
});

test("editable public contact and character settings stay scoped and audited", async () => {
  const original = await store.business(business.id);
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
  assert.equal((await store.business(other.id)).contactEmail, undefined);
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
  assert.deepEqual((await store.business(business.id)).characterNames, []);
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
  assert.deepEqual((await store.business(business.id)).characterNames, [
    "Winter Guest",
  ]);
  assert.deepEqual((await store.business(business.id)).otherShowNames, [
    "Animation",
  ]);
  assert.ok(
    (await store.all(business.id, "audit")).some(
      (a) => a.action === "business.updated",
    ),
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
  await store.put(business.id, "customers", a);
  await store.put(business.id, "customers", b);
  await store.put(business.id, "customerExtras", {
    id: a.id,
    childrenAges: [5, 9],
  });
  await store.put(business.id, "bookings", {
    id: "history-event",
    customerId: a.id,
  });
  await store.put(business.id, "bookings", {
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
  const audit = (await store.all(business.id, "audit")).filter((item) =>
    item.action.startsWith("contact."),
  );
  assert.deepEqual(audit.map((item) => item.action).sort(), [
    "contact.archived",
    "contact.corrected",
    "contact.recorded",
    "contact.restored",
  ]);
  await store.db
    .prepare(
      "DELETE FROM records WHERE business_id=? AND kind='bookings' AND id IN ('history-event','different-event')",
    )
    .run(business.id);
  assert.equal(
    (await request(`/manage/customers/${a.id}`, "DELETE")).status,
    409,
  );
});

test("question ordering is scoped, checked against stale lists and preserves answer history", async () => {
  const field = {
    label: "First question",
    type: "text",
    required: false,
    active: true,
    options: [],
  };
  await request("/manage/custom-fields", "POST", {
    ...field,
    id: "order-first",
  });
  await request("/manage/custom-fields", "POST", {
    ...field,
    id: "order-second",
    label: "Second question",
  });
  const original = (await request("/manage/custom-fields")).data;
  const previous = original.map((f) => f.id),
    ids = previous.slice().reverse();
  const body = { previous, ids };
  assert.equal(
    (await request("/manage/custom-fields/order", "PUT", body, assistant))
      .status,
    403,
  );
  assert.equal(
    (await request("/manage/custom-fields/order", "PUT", body, otherCookie))
      .status,
    409,
  );
  assert.equal(
    (
      await request("/manage/custom-fields/order", "PUT", {
        previous,
        ids: previous.map(() => previous[0]),
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/manage/custom-fields/order", "PUT", body)).status,
    200,
  );
  assert.equal(
    (await request("/manage/custom-fields/order", "PUT", body)).status,
    409,
  );
  assert.deepEqual(
    (await request("/manage/custom-fields")).data.map((f) => f.id),
    ids,
  );
  await request("/manage/custom-fields", "POST", {
    ...field,
    id: "order-first",
    label: "Renamed",
    position: 999,
  });
  assert.deepEqual(
    (await request("/manage/custom-fields")).data.map((f) => f.id),
    ids,
  );
  const publicFields = (await request("/public/test", "GET", undefined, null))
    .data.customFields;
  assert.deepEqual(
    publicFields.map((f) => f.id),
    ids.filter((id) => original.find((f) => f.id === id).active),
  );
  const created = await newRequest();
  const booking = await current(created.id);
  assert.deepEqual(
    booking.customAnswers.map((a) => a.id),
    publicFields.map((f) => f.id),
  );
  await request("/manage/custom-fields/order", "PUT", {
    previous: ids,
    ids: previous,
  });
  assert.deepEqual(
    (await current(created.id)).customAnswers,
    booking.customAnswers,
  );
  assert.ok(
    (await store.all(business.id, "audit")).some(
      (a) => a.action === "questions.reordered",
    ),
  );
});

test("running order requires agreed shows, resets availability, preserves price and rejects stale edits", async () => {
  const info = await newRequest({ date: "2028-05-04" });
  await propose(info.id);
  await accept(info);
  let b = await current(info.id);
  const input = {
    revision: b.revision,
    runningOrder: [{ packageId: "magic", breakAfter: 0 }],
    teardown: 35,
  };
  const path = `/manage/bookings/${info.id}/running-order`;
  assert.equal((await request(path, "PUT", input, assistant)).status, 403);
  assert.equal((await request(path, "PUT", input, otherCookie)).status, 404);
  assert.equal(
    (
      await request(path, "PUT", {
        ...input,
        runningOrder: [{ packageId: "bubbles", breakAfter: 0 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(path, "PUT", {
        ...input,
        runningOrder: [{ packageId: "magic", breakAfter: 5 }],
      })
    ).status,
    400,
  );
  assert.equal((await request(path, "PUT", input)).status, 200);
  assert.equal((await request(path, "PUT", input)).status, 409);
  const changed = await current(info.id);
  assert.equal(changed.availability.sam, "pending");
  assert.equal(changed.status, "accepted");
  assert.deepEqual(changed.quotes, b.quotes);
  assert.equal(changed.acceptedQuoteId, b.acceptedQuoteId);
  assert.equal(changed.teardown, 35);
  assert.ok(
    (await request(`/manage/bookings/${info.id}/checks`)).data.timetable.some(
      (r) => r.label === "Pack down" && r.duration === 35,
    ),
  );
  await action(info.id, "status", {
    status: "cancelled",
    reason: "Test closure",
  });
  b = await current(info.id);
  assert.equal(
    (await request(path, "PUT", { ...input, revision: b.revision })).status,
    400,
  );
});

test("private per-show staffing plans preserve money and prevent access or stale edits", async () => {
  const info = await newRequest({ date: "2028-06-04" });
  await propose(info.id);
  await accept(info);
  let b = await current(info.id);
  const path = `/manage/bookings/${info.id}/act-plan`;
  const body = {
    revision: b.revision,
    rows: [{ packageId: "magic", performerId: "sam", agreedPay: 12345 }],
    notes: "Private agreed fee",
  };
  for (const auth of [assistant, performerCookie]) {
    assert.equal((await request(path, "GET", undefined, auth)).status, 403);
    assert.equal((await request(path, "PUT", body, auth)).status, 403);
  }
  assert.equal(
    (await request(path, "GET", undefined, customerCookie)).status,
    401,
  );
  assert.equal(
    (await request(path, "GET", undefined, otherCookie)).status,
    404,
  );
  assert.equal(
    (
      await request(path, "PUT", {
        ...body,
        rows: [{ ...body.rows[0], performerId: "unknown" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(path, "PUT", {
        ...body,
        rows: [{ ...body.rows[0], packageId: "bubbles" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(path, "PUT", {
        ...body,
        rows: [body.rows[0], body.rows[0]],
      })
    ).status,
    400,
  );
  const beforeMoney = await store.all(business.id, "money");
  assert.equal((await request(path, "PUT", body)).status, 200);
  assert.equal((await request(path, "PUT", body)).status, 409);
  assert.deepEqual(await store.all(business.id, "money"), beforeMoney);
  const plan = (await request(path)).data.plan;
  assert.equal(plan.rows[0].agreedPay, 12345);
  const schedulePath = `/manage/bookings/${info.id}/checks`;
  const performerSchedule = await request(
    schedulePath,
    "GET",
    undefined,
    performerCookie,
  );
  assert.equal(performerSchedule.status, 200);
  assert.equal(performerSchedule.data.assignments.length, 1);
  assert.equal(performerSchedule.data.assignments[0].packageId, "magic");
  assert.equal(performerSchedule.data.assignments[0].date, "2028-06-04");
  assert.equal(
    JSON.stringify(performerSchedule.data).includes("agreedPay"),
    false,
  );
  assert.equal(
    JSON.stringify(performerSchedule.data).includes("Private agreed fee"),
    false,
  );
  assert.equal(
    (await request(schedulePath, "GET", undefined, otherCookie)).status,
    404,
  );
  assert.equal(
    (await request(schedulePath, "GET", undefined, customerCookie)).status,
    401,
  );
  b = await current(info.id);
  assert.equal(b.availability.sam, "pending");
  assert.equal(b.status, "accepted");
  assert.equal(
    JSON.stringify(
      (await request("/manage/state", "GET", undefined, performerCookie)).data,
    ).includes("Private agreed fee"),
    false,
  );
  const page = (
    await request("/event", "GET", undefined, null, {
      "x-event-token": info.token,
    })
  ).data;
  assert.equal(JSON.stringify(page).includes("Private agreed fee"), false);
  assert.ok(
    (await request("/manage/export")).data.actPlans.some(
      (p) => p.id === info.id,
    ),
  );
  assert.equal(
    (
      await request(path, "PUT", {
        ...body,
        revision: b.revision,
        rows: [],
        notes: "",
      })
    ).status,
    200,
  );
  assert.deepEqual((await request(path)).data.plan.rows, []);
  await action(info.id, "status", {
    status: "cancelled",
    reason: "Test closure",
  });
  b = await current(info.id);
  assert.equal(
    (await request(path, "PUT", { ...body, revision: b.revision })).status,
    400,
  );
  assert.ok(
    (await store.all(business.id, "audit")).some(
      (a) => a.action === "staffing-plan.updated",
    ),
  );
});

test("owner can manage guest-show photos without changing another business", async () => {
  const path = "/manage/guest-galleries/Clown";
  const body = {
    gallery: [{ url: "https://example.com/clown-show.jpg", caption: "A real clown show", approved: true }],
    hiddenPhotoUrls: ["/portfolio/guest/clown-1.jpg"],
    videos: ["https://example.com/clown-show.mp4"],
    hiddenVideoUrls: [],
  };
  assert.equal((await request(path, "PUT", body, assistant)).status, 403);
  assert.equal((await request(path, "PUT", { ...body, gallery: [{ ...body.gallery[0], url: "http://example.com/clown.jpg" }] })).status, 400);
  assert.equal((await request(path, "PUT", body)).status, 200);
  const publicGallery = (await request("/public/test", "GET", undefined, null)).data.guestGalleries.find((item) => item.id === "clown");
  assert.deepEqual(publicGallery.gallery, body.gallery);
  assert.deepEqual(publicGallery.hiddenPhotoUrls, body.hiddenPhotoUrls);
  assert.deepEqual(publicGallery.videos, body.videos);
  assert.equal((await store.all(other.id, "guestGalleries")).length, 0);
});

test("Backstage can delete an unused customer account but protects event history", async () => {
  const created = await request("/customer/test/register", "POST", {
    name: "Unused customer for removal",
    phone: "+96170123456",
    password,
  }, null);
  assert.equal(created.status, 201);
  const customer = (await store.all(business.id, "customers")).find((item) => item.name === "Unused customer for removal");
  assert.ok(customer);
  assert.equal((await request(`/manage/customers/${customer.id}`, "DELETE", { name: "Wrong name" })).status, 400);
  assert.equal((await request(`/manage/customers/${customer.id}`, "DELETE", { name: customer.name })).status, 200);
  assert.equal(await store.get(business.id, "customers", customer.id), undefined);
  assert.equal(await store.db.prepare("SELECT id FROM customer_accounts WHERE business_id=? AND customer_id=?").get(business.id, customer.id), undefined);
  assert.equal(await store.get(business.id, "customerExtras", customer.id), undefined);

  const booking = await newRequest({ date: "2028-11-13" });
  const linked = (await store.all(business.id, "bookings")).find((item) => item.id === booking.id);
  const historical = await store.get(business.id, "customers", linked.customerId);
  assert.equal((await request(`/manage/customers/${historical.id}`, "DELETE", { name: historical.name })).status, 409);
  assert.ok(await store.get(business.id, "customers", historical.id));
});

test("acceptance confirms with zero or partial payment and creates customer updates", async () => {
  await store.db.prepare("DELETE FROM rate_limits").run();
  const info = await newRequest({ date: "2028-09-18" });
  assert.equal((await action(info.id, "availability", { performerId: "sam", state: "available" })).status, 200);
  const acceptance = await action(info.id, "accept", {
    agreedAmount: 30000,
    receivedAmount: 0,
    paymentTerms: "Full amount after the event",
    reason: "Sam and the family agreed",
  });
  assert.equal(acceptance.status, 200, JSON.stringify(acceptance.data));
  assert.equal((await current(info.id)).status, "confirmed");
  assert.equal((await current(info.id)).paymentTerms, "Full amount after the event");
  assert.equal((await store.all(business.id, "money")).filter((item) => item.bookingId === info.id).length, 0);
  const customerEvent = await request("/event", "GET", undefined, null, { "x-event-token": info.token });
  assert.equal(customerEvent.data.booking.paymentTerms, "Full amount after the event");
  assert.equal(customerEvent.data.totals.balance, 30000);
  assert.equal((await request("/customer/test/me", "GET", undefined, customerCookie)).data.notifications[0].kind, "confirmed");
  assert.equal((await action(info.id, "accept", { agreedAmount: 30000, receivedAmount: 0, paymentTerms: "After event", reason: "Duplicate" })).status, 409);

  const second = await newRequest({ date: "2028-09-19" });
  assert.equal((await action(second.id, "availability", { performerId: "sam", state: "available" })).status, 200);
  assert.equal((await action(second.id, "accept", { agreedAmount: 40000, receivedAmount: 10000, paymentTerms: "Balance after the event", reason: "Date and performer checked" })).status, 200);
  assert.equal((await store.all(business.id, "money")).find((item) => item.bookingId === second.id)?.amount, 10000);
});

test("cancelled event can be permanently removed unless it has financial history", async () => {
  await store.db.prepare("DELETE FROM rate_limits").run();
  const info = await newRequest({ date: "2028-11-01" });
  assert.equal((await action(info.id, "status", { status: "cancelled", declined: true, reason: "Unable to attend" })).status, 200);
  assert.equal((await request(`/manage/bookings/${info.id}/permanent`, "DELETE", { name: "Wrong name" })).status, 400);
  assert.equal((await request(`/manage/bookings/${info.id}/permanent`, "DELETE", { name: "Integration celebration" }, assistant)).status, 403);
  assert.equal((await request(`/manage/bookings/${info.id}/permanent`, "DELETE", { name: "Integration celebration" })).status, 200);
  assert.equal(await store.get(business.id, "bookings", info.id), undefined);
  assert.equal((await request("/event", "GET", undefined, null, { "x-event-token": info.token })).status, 404);
  assert.ok(!(await request("/customer/test/me", "GET", undefined, customerCookie)).data.notifications.some((item) => item.bookingId === info.id));

  const paid = await newRequest({ date: "2028-11-02" });
  await store.put(business.id, "money", { id: "delete-guard-payment", bookingId: paid.id, kind: "payment", amount: 1000, category: "test", note: "test", date: "2026-09-27" });
  assert.equal((await action(paid.id, "status", { status: "cancelled", reason: "Test cancellation" })).status, 200);
  assert.equal((await request(`/manage/bookings/${paid.id}/permanent`, "DELETE", { name: "Integration celebration" })).status, 409);
});

test("a guest-only event can be confirmed without assigning a Sam show performer", async () => {
  await store.db.prepare("DELETE FROM rate_limits").run();
  const settings = await store.business(business.id);
  assert.equal((await request("/manage/business", "PUT", { ...settings, otherShowNames: ["Animation"] })).status, 200);
  const info = await newRequest({ date: "2028-12-15", packageIds: [], requestedServices: ["Animation"], performerIds: [] });
  const accepted = await action(info.id, "accept", {
    agreedAmount: 25000,
    receivedAmount: 0,
    paymentTerms: "Payment after the event",
    reason: "Guest act and venue confirmed",
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal((await current(info.id)).status, "confirmed");
});

test("staff roles enforce direct-route permissions and redact write responses", async () => {
  await store.db.prepare("DELETE FROM rate_limits").run();
  const users = {}, sessions = {};
  for (const role of ["manager", "sales", "accountant"]) {
    const created = await request("/manage/users", "POST", { name: role + " test", email: role + "@example.test", password, role });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    users[role] = created.data;
    sessions[role] = await login(role + "@example.test");
  }
  const info = await newRequest({ date: "2029-05-20", notes: "Private preparation", surpriseDetails: { guestName: "Guest", secret: "PRIVATE-SURPRISE", proposal: true, howWeMet: "Personal story", specialMoment: "Private moment" } });
  const enquiry = await request("/public/test/enquiries", "POST", { service: "Decoration", name: "Role enquiry test", phone: "+96170123456", date: "", location: "", notes: "" }, null);
  assert.equal(enquiry.status, 201);
  const enquiryPath = `/manage/enquiries/${enquiry.data.id}`;
  assert.equal((await request(enquiryPath, "PUT", { service: "Decoration", name: "Role enquiry test", phone: "+96170123456", date: "", location: "Sales updated", notes: "", revision: 0 }, sessions.sales)).status, 200);
  assert.equal((await request(enquiryPath + "/archive", "POST", { archived: true, revision: 1 }, sessions.manager)).status, 200);
  assert.equal((await request(enquiryPath + "/archive", "POST", { archived: false, revision: 2 }, sessions.sales)).status, 200);
  for (const session of Object.values(sessions)) assert.equal((await request(enquiryPath, "DELETE", { name: "Role enquiry test", revision: 3 }, session)).status, 403);
  assert.equal((await request(enquiryPath, "PUT", {}, sessions.accountant)).status, 403);
  await propose(info.id);
  let salesDraft = await current(info.id);
  assert.equal((await request(`/manage/bookings/${info.id}/quotes`, "POST", {
    revision: salesDraft.revision,
    options: [{ name: "Sales proposal", packageIds: ["magic"], amount: 30000, deposit: 5000, notes: "Payment terms" }],
  }, sessions.sales)).status, 200);
  await accept(info);
  let b = await current(info.id);
  const base = `/manage/bookings/${info.id}`;
  const planPath = base + "/act-plan";
  assert.equal((await request(planPath, "PUT", { revision: b.revision, rows: [{ packageId: "magic", performerId: "sam", agreedPay: 10000 }], notes: "PRIVATE-STAFFING" }, sessions.manager)).status, 200);
  const newArtist = await request("/manage/performers/new", "PUT", { ...performer, name: "Manager-created artist" }, sessions.manager);
  assert.equal(newArtist.status, 200);
  assert.equal((await request(`/manage/performers/${newArtist.data.id}`, "DELETE", {}, sessions.manager)).status, 403);
  await store.put(business.id, "money", { id: "staff-private-cost", bookingId: info.id, kind: "expense", amount: 2000, category: "cost", note: "PRIVATE-COST", date: "2026-09-30" });
  await store.put(business.id, "money", { id: "staff-deposit", bookingId: info.id, kind: "payment", amount: 5000, category: "deposit", note: "PRIVATE-PAYMENT-NOTE", date: "2026-09-30" });
  const salesState = (await request("/manage/state", "GET", undefined, sessions.sales)).data;
  assert.equal(salesState.money.some((entry) => entry.kind === "expense"), false);
  assert.equal(salesState.money.find((entry) => entry.id === "staff-deposit").note, "");
  assert.deepEqual(salesState.actPlans, []);
  assert.deepEqual(salesState.users, []);
  assert.deepEqual(salesState.audit, []);
  assert.equal(salesState.bookings.find((entry) => entry.id === info.id).surpriseDetails, undefined);
  for (const auth of Object.values(sessions)) {
    for (const [path, method] of [["/manage/export", "GET"], ["/manage/users", "POST"], ["/manage/business", "PUT"], [base + "/permanent", "DELETE"], ["/manage/unknown-future-endpoint", "POST"]]) {
      assert.equal((await request(path, method, method === "GET" ? undefined : {}, auth)).status, 403, path);
    }
    assert.equal((await request("/manage/state", "GET", undefined, auth, { "x-support-business": other.id })).status, 403);
  }
  for (const [path, method] of [[planPath, "GET"], [base + "/accept", "POST"], ["/manage/money", "POST"], ["/manage/packages/magic", "PUT"]]) {
    assert.equal((await request(path, method, method === "GET" ? undefined : {}, sessions.sales)).status, 403, path);
  }
  b = await current(info.id);
  const details = { ...b, name: "Sales updated event" };
  delete details.surpriseDetails;
  const edited = await request(base + "/details", "PUT", details, sessions.sales);
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.surpriseDetails, undefined);
  assert.equal((await current(info.id)).surpriseDetails.secret, "PRIVATE-SURPRISE");
  b = await current(info.id);
  assert.equal((await request(base + "/details", "PUT", { ...b, surpriseDetails: undefined, performerIds: [] }, sessions.sales)).status, 403);
  assert.equal((await request(base + "/details", "PUT", { ...b, surpriseDetails: undefined, checklist: [{ text: "Alter checklist", done: true }] }, sessions.sales)).status, 403);
  assert.equal((await request("/manage/money", "POST", {}, sessions.manager)).status, 403);
  assert.equal((await request(base + "/accept", "POST", { revision: b.revision, agreedAmount: 30000, receivedAmount: 1000, paymentTerms: "After event", reason: "Checked" }, sessions.manager)).status, 403);
  assert.equal((await request(base + "/availability", "POST", { revision: b.revision, performerId: "sam", state: "available" }, sessions.manager)).status, 200);
  b = await current(info.id);
  assert.equal((await request(base + "/accept", "POST", { revision: b.revision, agreedAmount: 30000, receivedAmount: 0, paymentTerms: "Balance after event", reason: "Venue and artist checked" }, sessions.manager)).status, 200);
  const preparation = (await current(info.id)).checklist;
  for (const task of ["Arrange transport", "Prepare costumes", "Pack props and equipment"]) {
    assert.ok(preparation.some((item) => item.text === task && !item.done));
  }
  const accounts = (await request("/manage/state", "GET", undefined, sessions.accountant)).data;
  const accountBooking = accounts.bookings.find((entry) => entry.id === info.id);
  assert.equal(accountBooking.notes, "");
  assert.equal(accountBooking.surpriseDetails, undefined);
  assert.deepEqual(accountBooking.checklist, []);
  assert.equal(accounts.actPlans.find((entry) => entry.id === info.id).notes, "");
  assert.equal((await request(planPath, "GET", undefined, sessions.accountant)).data.plan.notes, "");
  for (const [path, method] of [[base + "/details", "PUT"], [base + "/quotes", "POST"], [planPath, "PUT"], ["/manage/customers/new", "PUT"]]) {
    assert.equal((await request(path, method, {}, sessions.accountant)).status, 403, path);
  }
  const payment = await request("/manage/money", "POST", { bookingId: info.id, kind: "payment", amount: 1000, category: "deposit", note: "Recorded by accountant", date: "2026-09-30" }, sessions.accountant);
  assert.equal(payment.status, 201, JSON.stringify(payment.data));
  assert.equal((await request(`/manage/money/${payment.data.id}/correct`, "POST", { amount: 900, category: "deposit", note: "Corrected receipt", date: "2026-09-30", reason: "Checked receipt" }, sessions.accountant)).status, 200);
  const latest = await current(info.id);
  const noticeBody = { bookingId: info.id, revision: latest.revision, label: "Coming up", state: "dismissed" };
  assert.equal((await request("/manage/notices", "PUT", noticeBody, sessions.manager)).status, 200);
  const managerNotices = (await request("/manage/state", "GET", undefined, sessions.manager)).data.noticeStates;
  assert.ok(managerNotices.some((notice) => notice.bookingId === info.id && notice.dismissedAt && notice.readAt));
  assert.equal((await request("/manage/state")).data.noticeStates.some((notice) => notice.id === managerNotices[0].id), false);
  assert.equal((await request("/manage/notices", "PUT", { ...noticeBody, state: "restore", userId: users.manager.id }, sessions.sales)).status, 200);
  assert.ok((await request("/manage/state", "GET", undefined, sessions.manager)).data.noticeStates.find((notice) => notice.bookingId === info.id).dismissedAt);
  assert.equal((await request("/manage/notices", "PUT", { ...noticeBody, revision: latest.revision - 1 }, sessions.manager)).status, 409);
  assert.equal((await request("/manage/notices", "PUT", noticeBody, sessions.accountant)).status, 403);
  const unassigned = { ...latest, id: "notice-unassigned-event", performerIds: [] };
  await store.put(business.id, "bookings", unassigned);
  const artistSession = await login("performer@example.test");
  assert.equal((await request("/manage/notices", "PUT", { ...noticeBody, bookingId: unassigned.id }, artistSession)).status, 403);
  assert.equal((await request("/manage/notices", "PUT", { ...noticeBody, state: "read" }, artistSession)).status, 200);
  assert.equal((await request("/manage/notices", "PUT", { ...noticeBody, state: "restore" }, sessions.manager)).status, 200);
  assert.equal((await request("/manage/state", "GET", undefined, sessions.manager)).data.noticeStates.find((notice) => notice.bookingId === info.id).dismissedAt, "");
  assert.equal((await request("/manage/notices", "PUT", { ...noticeBody, state: "unread" }, sessions.manager)).status, 200);
  assert.equal((await request("/manage/state", "GET", undefined, sessions.manager)).data.noticeStates.find((notice) => notice.bookingId === info.id).readAt, "");
  const revised = await request(`/manage/users/${users.sales.id}`, "PUT", { ...users.sales, role: "accountant" });
  assert.equal(revised.status, 200);
  assert.equal((await request("/manage/state", "GET", undefined, sessions.sales)).status, 401);
});

test("guest shows can be added, hidden and restored without losing old requests", async () => {
  const path = "/manage/guest-services";
  assert.equal((await request(path, "POST", { action: "hide", name: "Clown" }, assistant)).status, 403);
  assert.equal((await request(path, "POST", { action: "hide", name: "Clown" })).status, 200);
  let publicBusiness = (await request("/public/test", "GET", undefined, null)).data.business;
  assert.ok(!guestServiceNames(publicBusiness.otherShowNames, publicBusiness.hiddenGuestServices).includes("Clown"));
  assert.equal((await request("/public/test/requests", "POST", { event: { ...event, packageIds: [], performerIds: [], requestedServices: ["Clown"] } }, customerCookie)).status, 400);
  assert.equal((await request(path, "POST", { action: "restore", name: "Clown" })).status, 200);
  assert.equal((await request(path, "POST", { action: "add", name: "Shadow Puppets" })).status, 200);
  publicBusiness = (await request("/public/test", "GET", undefined, null)).data.business;
  assert.ok(guestServiceNames(publicBusiness.otherShowNames, publicBusiness.hiddenGuestServices).includes("Shadow Puppets"));
  assert.equal((await request(path, "POST", { action: "hide", name: "Shadow Puppets" })).status, 200);
  publicBusiness = (await request("/public/test", "GET", undefined, null)).data.business;
  assert.ok(!guestServiceNames(publicBusiness.otherShowNames, publicBusiness.hiddenGuestServices).includes("Shadow Puppets"));
});
