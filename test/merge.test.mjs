import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../dist/store.js";
import { createApp } from "../dist/server.js";
import { createUser } from "../dist/auth.js";
import { customerSchema } from "../dist/domain.js";

let store, server, base, business, other, owner, assistant, outsider, customer;
const origin = "http://localhost:43309",
  password = "Test-only-password-12345";
async function request(path, body, auth = owner, method = "POST") {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      ...(auth ? { cookie: auth } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  store = new Store(":memory:");
  business = store.createBusiness("Merge stage", "merge");
  other = store.createBusiness("Other stage", "other");
  for (const [email, bid, role] of [
    ["owner@merge.test", business.id, "owner"],
    ["assistant@merge.test", business.id, "assistant"],
    ["owner@other.test", other.id, "owner"],
  ])
    await createUser(store, bid, email, password, "Test", role);
  server = createApp(store, origin).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = (
    await request("/login", { email: "owner@merge.test", password }, null)
  ).cookie;
  assistant = (
    await request("/login", { email: "assistant@merge.test", password }, null)
  ).cookie;
  outsider = (
    await request("/login", { email: "owner@other.test", password }, null)
  ).cookie;
  customer = (
    await request(
      "/customer/merge/register",
      { name: "Account holder", phone: "+96171111111", password },
      null,
    )
  ).cookie;
});
after(async () => {
  await new Promise((r) => server.close(r));
  store.db.close();
});
function pair(prefix) {
  for (const suffix of ["target", "source"])
    store.put(business.id, "customers", {
      ...customerSchema.parse({
        name: `${prefix} ${suffix}`,
        phone: "+96171222222",
        notes: suffix,
        offersConsent: suffix === "target",
        doNotContact: suffix === "source",
        followUp: suffix === "target" ? "2027-03-01" : "2027-02-01",
      }),
      id: `${prefix}-${suffix}`,
    });
  return { targetId: `${prefix}-target`, sourceId: `${prefix}-source` };
}
test("customer merge requires owner, business isolation and confirmed identity", async () => {
  const ids = pair("private");
  for (const auth of [assistant, customer, null])
    assert.ok(
      [401, 403].includes(
        (await request("/manage/customer-merge/preview", ids, auth)).status,
      ),
    );
  assert.equal(
    (await request("/manage/customer-merge/preview", ids, outsider)).status,
    404,
  );
  assert.equal(
    (
      await request("/manage/customer-merge/preview", {
        ...ids,
        sourceId: ids.targetId,
      })
    ).status,
    400,
  );
  const p = await request("/manage/customer-merge/preview", ids);
  assert.equal(
    (
      await request("/manage/customer-merge/confirm", {
        ...ids,
        revision: p.data.revision,
      })
    ).status,
    400,
  );
});
test("merge preserves old agreements and money, moves associations and archives originals", async () => {
  const ids = pair("history");
  const b = {
    id: "merge-event",
    customerId: ids.sourceId,
    revision: 7,
    status: "completed",
    quotes: [{ id: "q", amount: 12345 }],
    acceptedQuoteId: "q",
    updatedAt: "old",
  };
  store.put(business.id, "bookings", b);
  store.put(business.id, "money", {
    id: "merge-payment",
    bookingId: b.id,
    amount: 12345,
    kind: "payment",
  });
  store.put(business.id, "reminders", {
    id: "merge-reminder",
    customerId: ids.sourceId,
    bookingId: b.id,
  });
  store.put(business.id, "contactHistory", {
    id: "merge-note",
    customerId: ids.sourceId,
    bookingId: b.id,
    summary: "Private note",
    revision: 2,
  });
  const p = await request("/manage/customer-merge/preview", ids);
  assert.deepEqual(p.data.counts, { bookings: 1, reminders: 1, history: 1 });
  assert.equal(
    store.get(business.id, "bookings", b.id).customerId,
    ids.sourceId,
  );
  const result = await request("/manage/customer-merge/confirm", {
    ...ids,
    revision: p.data.revision,
    identityConfirmed: true,
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const next = store.get(business.id, "bookings", b.id);
  assert.equal(next.customerId, ids.targetId);
  assert.equal(next.revision, 8);
  assert.deepEqual(next.quotes, b.quotes);
  assert.equal(next.status, "completed");
  assert.equal(store.get(business.id, "money", "merge-payment").amount, 12345);
  assert.equal(store.get(business.id, "customers", ids.sourceId), undefined);
  assert.equal(result.data.customer.doNotContact, true);
  assert.equal(result.data.customer.offersConsent, false);
  assert.equal(result.data.customer.followUp, "2027-02-01");
  assert.equal(
    store.get(business.id, "contactHistory", "merge-note").revision,
    3,
  );
  assert.equal(
    store.get(business.id, "reminders", "merge-reminder").customerId,
    ids.targetId,
  );
  const exported = (await request("/manage/export", undefined, owner, "GET"))
    .data;
  assert.equal(exported.customerMerges[0].before.source.id, ids.sourceId);
  assert.ok(exported.audit.some((a) => a.action === "customer.merged"));
  assert.equal(
    (
      await request("/manage/customer-merge/confirm", {
        ...ids,
        revision: p.data.revision,
        identityConfirmed: true,
      })
    ).status,
    404,
  );
});
test("merge rejects stale customer, booking and contact-note previews without partial writes", async () => {
  for (const kind of ["customers", "bookings", "contactHistory"]) {
    const ids = pair("stale-" + kind);
    const p = await request("/manage/customer-merge/preview", ids);
    if (kind === "customers")
      store.put(business.id, kind, {
        ...store.get(business.id, kind, ids.sourceId),
        notes: "Changed",
      });
    else
      store.put(business.id, kind, {
        id: "changed-" + kind,
        customerId: ids.sourceId,
        revision: 1,
      });
    assert.equal(
      (
        await request("/manage/customer-merge/confirm", {
          ...ids,
          revision: p.data.revision,
          identityConfirmed: true,
        })
      ).status,
      409,
    );
    assert.ok(store.get(business.id, "customers", ids.sourceId));
  }
});
test("login-linked and reward-linked customers cannot be merged", async () => {
  const ids = pair("protected");
  const account = store.db
    .prepare("SELECT customer_id FROM customer_accounts WHERE business_id=?")
    .get(business.id);
  let p = await request("/manage/customer-merge/preview", {
    ...ids,
    sourceId: account.customer_id,
  });
  assert.match(p.data.reasons.join(" "), /login/);
  assert.equal(
    (
      await request("/manage/customer-merge/confirm", {
        ...ids,
        sourceId: account.customer_id,
        revision: p.data.revision,
        identityConfirmed: true,
      })
    ).status,
    409,
  );
  store.put(business.id, "rewardAwards", {
    id: "protected-award",
    customerId: "someone",
    sourceCustomers: { "old-event": ids.sourceId },
  });
  p = await request("/manage/customer-merge/preview", ids);
  assert.match(p.data.reasons.join(" "), /reward/);
  assert.equal(
    (
      await request("/manage/customer-merge/confirm", {
        ...ids,
        revision: p.data.revision,
        identityConfirmed: true,
      })
    ).status,
    409,
  );
});
test("merge transaction rolls back all changes when a later write fails", async () => {
  const ids = pair("rollback");
  store.put(business.id, "bookings", {
    id: "rollback-event",
    customerId: ids.sourceId,
    revision: 1,
  });
  const p = await request("/manage/customer-merge/preview", ids);
  store.db.exec(
    `CREATE TRIGGER reject_merge_archive BEFORE INSERT ON records WHEN NEW.kind='customerMerges' BEGIN SELECT RAISE(ABORT,'test rollback'); END;`,
  );
  assert.equal(
    (
      await request("/manage/customer-merge/confirm", {
        ...ids,
        revision: p.data.revision,
        identityConfirmed: true,
      })
    ).status,
    500,
  );
  store.db.exec("DROP TRIGGER reject_merge_archive");
  assert.equal(
    store.get(business.id, "bookings", "rollback-event").customerId,
    ids.sourceId,
  );
  assert.equal(
    store.get(business.id, "bookings", "rollback-event").revision,
    1,
  );
  assert.ok(store.get(business.id, "customers", ids.sourceId));
});
