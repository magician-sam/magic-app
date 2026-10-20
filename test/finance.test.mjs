import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
import {
  documentTotals,
  documentBalance,
  payrollTotal,
  validateJournal,
  stockState,
  ledgerBalances,
  eventCostForecast,
} from "../dist/finance-math.js";
import { snapshot, restoreSnapshot } from "../dist/snapshots.js";
import {
  catalogueName,
  catalogueSearchTerms,
} from "../dist/catalogue-settings.js";
import { matchesMultilingual } from "../dist/multilingual-search.js";

test("catalogue display edits retain service identities, gallery history, prices and multilingual discovery", async () => {
  const f = await fixture();
  try {
    const original = await f.store.get(f.business.id, "packages", "magic");
    const input = {
      revision: 0,
      name: "Circus artists",
      nameFr: "Artistes de cirque",
      nameAr: "فنانون السيرك",
      description: "Shows for your celebration",
      descriptionAr: "التلاعب بالكرات",
      cover: "https://example.test/juggler.jpg",
    };
    const path =
      "/manage/catalogue-appearance/" + encodeURIComponent("service:Juggling");
    assert.equal((await f.request(path, "PUT", input, "sales")).status, 403);
    const saved = await f.ok(path, "PUT", input);
    assert.equal(saved.revision, 1);
    assert.equal((await f.request(path, "PUT", input)).status, 409);
    await f.ok(
      "/manage/catalogue-appearance/" + encodeURIComponent("category:shows"),
      "PUT",
      {
        revision: 0,
        name: "Entertainment",
        cover: "/portfolio/sam-magic-live-2.jpg",
      },
    );
    await f.ok(
      "/manage/catalogue-appearance/" + encodeURIComponent("show:magic"),
      "PUT",
      {
        revision: 0,
        name: "Sam’s wonder show",
        cover: "/portfolio/sam-magic-live-1.jpg",
      },
    );
    const pub = await f.ok("/public/synthetic-finance");
    assert.equal(
      catalogueName(pub.business, "service:Juggling", "Juggling", "fr"),
      "Artistes de cirque",
    );
    assert.equal(
      catalogueName(pub.business, "service:Juggling", "Juggling", "ar"),
      "فنانون السيرك",
    );
    assert.equal(
      matchesMultilingual(
        ["Juggling", ...catalogueSearchTerms(pub.business, "service:Juggling")],
        "سيرك",
      ),
      true,
    );
    assert.deepEqual(
      pub.packages.find((p) => p.id === "magic"),
      original,
    );
    assert.equal(
      matchesMultilingual(
        catalogueSearchTerms(pub.business, "service:Juggling"),
        "كرات",
      ),
      true,
    );
    const price = await f.save({
      type: "price",
      name: "Juggling price",
      notes: "Private artist agreement",
      serviceId: "Juggling",
      priceMode: "from",
      salePrice: 20000,
      cost: 10000,
      taxId: "",
      inclusive: false,
    });
    await f.ok("/manage/finance/" + price.id + "/publish", "POST", {
      revision: price.revision,
    });
    const updated = await f.ok("/public/synthetic-finance");
    assert.equal(
      updated.publicPrices.find((p) => p.serviceId === "Juggling").price,
      20000,
    );
    assert.equal(
      JSON.stringify(updated).includes("Private artist agreement"),
      false,
    );
    const snap = await snapshot(f.store),
      restored = new Store(":memory:");
    try {
      await restoreSnapshot(restored, snap);
      assert.deepEqual(
        (await restored.business(f.business.id)).catalogueAppearance,
        pub.business.catalogueAppearance,
      );
    } finally {
      await restored.db.close();
    }
  } finally {
    await f.close();
  }
});

test("catalogue editor rejects unsafe photos, foreign IDs and price bypass; resetting restores fallback labels", async () => {
  const f = await fixture();
  try {
    const path =
      "/manage/catalogue-appearance/" + encodeURIComponent("category:places");
    for (const cover of [
      "javascript:alert(1)",
      "http://example.test/photo.jpg",
      "https://user:secret@example.test/photo.jpg",
      "//example.test/photo.jpg",
      "/api/manage/finance",
    ])
      assert.equal(
        (await f.request(path, "PUT", { revision: 0, name: "Places", cover }))
          .status,
        400,
      );
    assert.equal(
      (
        await f.request(path, "PUT", {
          revision: 0,
          name: "Places",
          cover: "",
          salePrice: 123,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(
          "/manage/catalogue-appearance/" + encodeURIComponent("show:foreign"),
          "PUT",
          { revision: 0, name: "Bad ID", cover: "" },
        )
      ).status,
      404,
    );
    const edited = await f.ok(path, "PUT", {
      revision: 0,
      name: "Play & celebrate",
      cover: "",
    });
    await f.ok(path, "PUT", { revision: edited.revision, name: "", cover: "" });
    const business = (await f.ok("/public/synthetic-finance")).business;
    assert.equal(
      catalogueName(business, "category:places", "Playgrounds & venues"),
      "Playgrounds & venues",
    );
  } finally {
    await f.close();
  }
});

const line = (changes = {}) => ({
  description: "Synthetic service",
  quantity: 1,
  unitPrice: 10000,
  discount: 0,
  taxId: "",
  inclusive: false,
  recoverable: false,
  accountId: "",
  ...changes,
});
const doc = (changes = {}) => ({
  type: "document",
  name: "Synthetic customer",
  notes: "",
  kind: "invoice",
  partyId: "",
  bookingId: "",
  originalId: "",
  date: "2026-10-18",
  dueDate: "2026-10-25",
  reference: "",
  revenueTreatment: "earned",
  performanceConfirmed: true,
  lines: [line()],
  ...changes,
});
test("published prices require positive values and a reason below the configured direct margin", async () => {
  const f = await fixture();
  try {
    await f.save({
      type: "company",
      name: "Test profile",
      notes: "",
      legalName: "Synthetic business",
      address: "",
      fiscalNumber: "",
      vatNumber: "",
      registrationNumber: "",
      nssfNumber: "",
      vatStatus: "unregistered",
      reviewed: true,
      invoiceFooter: "",
      minimumMarginBps: 3000,
    });
    const data = {
      type: "price",
      name: "Test margin",
      notes: "",
      serviceId: "magic",
      priceMode: "fixed",
      salePrice: 10000,
      cost: 8000,
      taxId: "",
      inclusive: false,
    };
    const draft = await f.save(data);
    assert.equal(
      (
        await f.request("/manage/finance/" + draft.id + "/publish", "POST", {
          revision: draft.revision,
        })
      ).status,
      400,
    );
    const approved = await f.ok("/manage/finance/" + draft.id, "PUT", {
      revision: draft.revision,
      data: { ...data, approvalReason: "Reviewed introductory promotion" },
    });
    assert.equal(
      (
        await f.ok("/manage/finance/" + approved.id + "/publish", "POST", {
          revision: approved.revision,
        })
      ).data.approvalReason,
      "Reviewed introductory promotion",
    );
    const zero = await f.save({
      ...data,
      salePrice: 0,
      approvalReason: "Approved promotional price",
    });
    assert.equal(
      (
        await f.request("/manage/finance/" + zero.id + "/publish", "POST", {
          revision: zero.revision,
        })
      ).status,
      400,
    );
    const missing = await f.save({ ...data, cost: null });
    assert.ok(
      await f.ok("/manage/finance/" + missing.id + "/publish", "POST", {
        revision: missing.revision,
      }),
    );
  } finally {
    await f.close();
  }
});
test("financial rounding separates inclusive tax, discount and private payroll totals", () => {
  const taxes = [
    {
      id: "tax",
      archived: false,
      data: {
        type: "tax",
        name: "Synthetic test rate",
        rateBps: 1000,
        effectiveFrom: "2026-01-01",
        effectiveTo: "",
        reviewed: true,
      },
    },
  ];
  assert.deepEqual(
    documentTotals(
      doc({
        lines: [line({ unitPrice: 11000, taxId: "tax", inclusive: true })],
      }),
      taxes,
    ).lines[0],
    {
      net: 10000,
      tax: 1000,
      total: 11000,
      rateBps: 1000,
      taxName: "Synthetic test rate",
      inclusive: true,
    },
  );
  assert.equal(
    documentTotals(
      doc({
        lines: [
          line({ quantity: 3, unitPrice: 99, discount: 2, taxId: "tax" }),
        ],
      }),
      taxes,
    ).total,
    325,
  );
  assert.throws(
    () => documentTotals(doc({ lines: [line({ discount: 10001 })] }), []),
    /discount/,
  );
  assert.throws(
    () => documentTotals(doc({ lines: [line({ taxId: "unknown" })] }), []),
    /active tax/,
  );
  assert.throws(
    () =>
      documentTotals(doc({ lines: [line({ taxId: "tax" })] }), [
        { ...taxes[0], data: { ...taxes[0].data, reviewed: false } },
      ]),
    /reviewed/,
  );
  assert.deepEqual(
    payrollTotal({
      basic: 100000,
      allowances: 10000,
      overtime: 5000,
      tax: 10000,
      social: 5000,
      employerSocial: 15000,
      advanceRecovery: 5000,
    }),
    { gross: 115000, net: 95000, employerCost: 130000 },
  );
  assert.throws(
    () =>
      payrollTotal({
        basic: 1,
        allowances: 0,
        overtime: 0,
        tax: 2,
        social: 0,
        employerSocial: 0,
        advanceRecovery: 0,
      }),
    /deductions/,
  );
  assert.throws(
    () =>
      validateJournal([
        { accountId: "cash", debit: 10, credit: 0 },
        { accountId: "sales", debit: 0, credit: 9 },
      ]),
    /balance/,
  );
});
test("credit refunds cannot exceed actual customer overpayment or create a refund from an unpaid invoice", () => {
  const invoice = {
      id: "inv",
      status: "posted",
      createdAt: "1",
      data: doc(),
      totals: { total: 10000 },
    },
    credit = {
      id: "cn",
      status: "posted",
      createdAt: "2",
      data: doc({ kind: "credit", originalId: "inv" }),
      totals: { total: 2000 },
    };
  assert.equal(documentBalance(credit, [invoice, credit]).balance, 0);
  const receipt = {
    id: "pay",
    status: "posted",
    data: { type: "payment", documentId: "inv", amount: 10000 },
  };
  assert.equal(
    documentBalance(credit, [invoice, credit, receipt]).balance,
    2000,
  );
  const refund = {
    id: "refund",
    status: "posted",
    data: { type: "payment", documentId: "cn", amount: 2000 },
  };
  assert.equal(
    documentBalance(invoice, [invoice, credit, receipt, refund]).balance,
    0,
  );
  assert.equal(
    documentBalance(credit, [invoice, credit, receipt, refund]).balance,
    0,
  );
});
test("event forecasts include unpaid artist commitments, never count bill payments twice, and retain unknown costs", () => {
  const booking = {
    id: "b",
    quotes: [{ id: "q", amount: 20000 }],
    acceptedQuoteId: "q",
    performerIds: ["artist"],
    packageIds: ["magic"],
    date: "2026-11-01",
  };
  const plan = {
    id: "b",
    rows: [{ packageId: "magic", performerId: "artist", agreedPay: 10000 }],
  };
  const payment = {
    id: "paid",
    bookingId: "b",
    performerId: "artist",
    kind: "expense",
    amount: 5000,
  };
  let result = eventCostForecast(booking, [payment], [], [], plan);
  assert.equal(result.forecastCost, 10000);
  assert.equal(result.provisionalContribution, 10000);
  assert.equal(result.contribution, null);
  const bill = {
    id: "bill",
    status: "posted",
    archived: false,
    data: doc({ kind: "bill", bookingId: "b", performerId: "artist" }),
    totals: documentTotals(doc(), []),
  };
  const linkedPayment = {
    id: "receipt",
    status: "posted",
    data: { type: "payment" },
    legacyMoneyId: "paid",
  };
  result = eventCostForecast(
    booking,
    [payment],
    [bill, linkedPayment],
    [],
    plan,
  );
  assert.equal(result.forecastCost, 10000);
  assert.equal(result.actualCost, 10000);
  const invoice = {
    id: "inv",
    status: "posted",
    archived: false,
    data: doc({ bookingId: "b" }),
    totals: documentTotals(doc({ lines: [line({ unitPrice: 20000 })] }), []),
  };
  result = eventCostForecast(
    booking,
    [payment],
    [bill, linkedPayment, invoice],
    [],
    plan,
  );
  assert.equal(result.contribution, 10000);
  assert.equal(result.margin, 50);
  const unknown = {
    id: "unknown",
    status: "draft",
    archived: false,
    data: {
      type: "cost",
      bookingId: "b",
      name: "Transport quote needed",
      amount: null,
      performerId: "",
      moneyId: "",
    },
  };
  assert.match(
    eventCostForecast(booking, [], [unknown], [], plan).missing.join(","),
    /Transport/,
  );
});

async function fixture() {
  const store = new Store(":memory:"),
    business = await store.createBusiness(
      "Synthetic finance",
      "synthetic-finance",
    );
  const users = {};
  for (const [name, role] of [
    ["owner", "owner"],
    ["accounts", "accountant"],
    ["sales", "sales"],
    ["manager", "manager"],
  ])
    users[name] = await createUser(
      store,
      business.id,
      name + "@finance.test",
      "Fixture-password-42!",
      name,
      role,
    );
  const server = createApp(store, "https://finance.test").listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve) => server.on("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const cookies = {};
  for (const name of Object.keys(users)) {
    const r = await fetch(base + "/api/login", {
      method: "POST",
      headers: {
        origin: "https://finance.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: name + "@finance.test",
        password: "Fixture-password-42!",
      }),
    });
    assert.equal(r.status, 200);
    cookies[name] = r.headers.get("set-cookie").split(";")[0];
  }
  async function request(path, method = "GET", body, user = "owner") {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        cookie: cookies[user],
        origin: "https://finance.test",
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    return { status: response.status, data };
  }
  async function ok(path, method, body, user) {
    const r = await request(path, method, body, user);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  }
  const save = (data) =>
    ok("/manage/finance/new", "PUT", { revision: 0, data });
  const post = (r) =>
    ok("/manage/finance/" + r.id + "/post", "POST", { revision: r.revision });
  return {
    store,
    business,
    users,
    request,
    ok,
    save,
    post,
    base,
    cookies,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await store.db.close();
    },
  };
}
test("editable accounting documents post balanced entries, payments link once, reversals and locks retain history", async () => {
  const f = await fixture();
  try {
    const party = await f.save({
      type: "party",
      name: "Synthetic supplier",
      notes: "",
      relationship: "supplier",
      phone: "",
      email: "",
    });
    let invoice = await f.save(doc());
    invoice = await f.post(invoice);
    assert.match(invoice.number, /INV-/);
    assert.equal(invoice.totals.total, 10000);
    const mutate = await f.request("/manage/finance/" + invoice.id, "PUT", {
      revision: invoice.revision,
      data: doc({ name: "Tampered" }),
    });
    assert.equal(mutate.status, 409);
    const paymentData = {
      type: "payment",
      name: "Synthetic receipt",
      notes: "",
      kind: "receipt",
      date: "2026-10-18",
      amount: 4000,
      accountId: "cash",
      toAccountId: "",
      documentId: invoice.id,
      employeeId: "",
      legacyMoneyId: "",
      reference: "",
    };
    let payment = await f.save(paymentData);
    payment = await f.post(payment);
    assert.equal(
      documentBalance(invoice, (await f.ok("/manage/finance")).records).balance,
      6000,
    );
    const over = await f.save({ ...paymentData, amount: 6001 });
    assert.equal(
      (
        await f.request("/manage/finance/" + over.id + "/post", "POST", {
          revision: over.revision,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request("/manage/finance/" + invoice.id + "/reverse", "POST", {
          revision: invoice.revision,
          date: "2026-10-18",
          reason: "Synthetic correction",
        })
      ).status,
      409,
    );
    await f.ok("/manage/finance/" + payment.id + "/reverse", "POST", {
      revision: payment.revision,
      date: "2026-10-18",
      reason: "Synthetic correction",
    });
    assert.equal(
      documentBalance(invoice, (await f.ok("/manage/finance")).records).balance,
      10000,
    );
    const bill = await f.post(
      await f.save(
        doc({
          kind: "bill",
          name: "Supplier bill",
          partyId: party.id,
          reference: "SYN-001",
          lines: [line({ unitPrice: 2000 })],
        }),
      ),
    );
    const duplicate = await f.save(
      doc({
        kind: "bill",
        name: "Duplicate",
        partyId: party.id,
        reference: "SYN-001",
      }),
    );
    assert.equal(
      (
        await f.request("/manage/finance/" + duplicate.id + "/post", "POST", {
          revision: duplicate.revision,
        })
      ).status,
      409,
    );
    const transfer = await f.post(
      await f.save({
        ...paymentData,
        name: "Bank transfer",
        kind: "transfer",
        amount: 500,
        documentId: "",
        toAccountId: "bank",
      }),
    );
    assert.equal(transfer.status, "posted");
    const state = await f.ok("/manage/finance");
    assert.equal(
      state.journals.reduce(
        (n, j) => n + j.lines.reduce((n, l) => n + l.debit - l.credit, 0),
        0,
      ),
      0,
    );
    assert.equal(
      ledgerBalances(state.journals).find((b) => b.accountId === "sales")
        .balance,
      -10000,
    );
    assert.equal(documentBalance(bill, state.records).balance, 2000);
    const lock = await f.save({
      type: "close",
      name: "October lock",
      notes: "",
      through: "2026-10-18",
    });
    const late = await f.save({ ...paymentData, date: "2026-10-18" });
    assert.equal(
      (
        await f.request("/manage/finance/" + late.id + "/post", "POST", {
          revision: late.revision,
        })
      ).status,
      409,
    );
    await f.ok("/manage/finance/" + lock.id + "/archive", "POST", {
      revision: lock.revision,
      archived: true,
    });
    const competing = await f.save(doc({ name: "Concurrent invoice" }));
    const results = await Promise.all([
      f.request("/manage/finance/" + competing.id + "/post", "POST", {
        revision: competing.revision,
      }),
      f.request("/manage/finance/" + competing.id + "/post", "POST", {
        revision: competing.revision,
      }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  } finally {
    await f.close();
  }
});
test("public prices never expose artist costs, and price publication preserves prior event snapshots", async () => {
  const f = await fixture();
  try {
    const before = await f.store.get(f.business.id, "packages", "magic");
    const snapshotPackage = structuredClone(before);
    const rate = await f.save({
      type: "price",
      name: "Magic selling price",
      notes: "Private margin details",
      serviceId: "magic",
      priceMode: "fixed",
      salePrice: 25000,
      cost: 12345,
      taxId: "",
      inclusive: false,
    });
    await f.ok("/manage/finance/" + rate.id + "/publish", "POST", {
      revision: rate.revision,
    });
    const pub = await f.ok("/public/synthetic-finance");
    assert.equal(pub.packages.find((p) => p.id === "magic").price, 25000);
    assert.equal(pub.publicPrices[0].price, 25000);
    assert.equal(JSON.stringify(pub).includes("12345"), false);
    assert.equal(JSON.stringify(pub).includes("Private margin"), false);
    assert.deepEqual(snapshotPackage, before);
    assert.equal(
      (
        await f.request("/manage/finance/" + rate.id + "/publish", "POST", {
          revision: rate.revision,
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.request("/manage/finance", "GET", undefined, "sales")).status,
      403,
    );
    const foreign = await f.store.createBusiness(
      "Other company",
      "other-company",
    );
    const secret = await f.store.put(foreign.id, "finance", {
      id: "foreign",
      revision: 1,
      status: "draft",
      data: doc(),
    });
    assert.equal(
      (
        await f.request("/manage/finance/" + secret.id, "PUT", {
          revision: 1,
          data: doc(),
        })
      ).status,
      404,
    );
    const saved = await f.save({
      type: "account",
      name: "Petty cash",
      notes: "",
      category: "asset",
      cash: true,
    });
    const edit = await f.ok("/manage/finance/" + saved.id, "PUT", {
      revision: saved.revision,
      data: { ...saved.data, name: "Office cash" },
    });
    assert.equal(edit.data.name, "Office cash");
    assert.equal(
      (
        await f.request("/manage/finance/" + saved.id, "PUT", {
          revision: saved.revision,
          data: saved.data,
        })
      ).status,
      409,
    );
  } finally {
    await f.close();
  }
});
test("payroll, advance recovery, stock counts, attachments and backup preserve privacy and restore correctly", async () => {
  const f = await fixture();
  try {
    let employee = await f.save({
      type: "employee",
      name: "Synthetic employee",
      notes: "Private employment file",
      position: "Crew",
      email: "",
      phone: "",
      startDate: "2026-10-01",
      endDate: "",
      salary: 100000,
      taxReference: "",
      socialReference: "",
      contractNotes: "",
    });
    const pay = {
      type: "payroll",
      name: "Synthetic October salary",
      notes: "",
      employeeId: employee.id,
      period: "2026-10",
      date: "2026-10-18",
      dueDate: "2026-10-25",
      basic: 100000,
      allowances: 0,
      overtime: 0,
      tax: 10000,
      social: 5000,
      employerSocial: 10000,
      advanceRecovery: 0,
      reviewed: true,
    };
    const payroll = await f.post(await f.save(pay));
    assert.equal(payroll.netPay, 85000);
    const duplicate = await f.request("/manage/finance/new", "PUT", {
      revision: 0,
      data: pay,
    });
    assert.equal(duplicate.status, 409);
    const payment = await f.post(
      await f.save({
        type: "payment",
        name: "Salary paid",
        notes: "",
        kind: "payment",
        date: "2026-10-18",
        amount: 85000,
        accountId: "bank",
        toAccountId: "",
        documentId: payroll.id,
        employeeId: "",
        legacyMoneyId: "",
        reference: "",
      }),
    );
    let user = await f.store.db
      .prepare("SELECT data FROM users WHERE id=?")
      .get(f.users.accounts.id);
    user = JSON.parse(user.data);
    user.permissions = { payroll: false };
    await f.store.db
      .prepare("UPDATE users SET data=? WHERE id=?")
      .run(JSON.stringify(user), user.id);
    const restricted = await f.ok(
      "/manage/finance",
      "GET",
      undefined,
      "accounts",
    );
    assert.equal(
      restricted.records.some(
        (r) =>
          r.id === employee.id || r.id === payroll.id || r.id === payment.id,
      ),
      false,
    );
    assert.equal(restricted.journals.length, 0);
    assert.equal(
      (
        await f.request(
          "/manage/finance/" + payroll.id + "/reverse",
          "POST",
          {
            revision: payroll.revision,
            date: "2026-10-18",
            reason: "Should be denied",
          },
          "accounts",
        )
      ).status,
      403,
    );
    const fileResponse = await fetch(
      f.base + "/api/manage/finance/" + employee.id + "/attachment",
      {
        method: "POST",
        headers: {
          cookie: f.cookies.owner,
          origin: "https://finance.test",
          "content-type": "application/pdf",
        },
        body: Buffer.from("%PDF-1.4 synthetic private fixture"),
      },
    );
    assert.equal(fileResponse.status, 200);
    const attachment = await fileResponse.json();
    assert.equal(
      (
        await fetch(
          f.base + "/api/manage/finance-attachment/" + attachment.id,
          { headers: { cookie: f.cookies.accounts } },
        )
      ).status,
      403,
    );
    assert.equal(
      (await fetch(f.base + "/api/manage/finance-attachment/" + attachment.id))
        .status,
      401,
    );
    const item = await f.save({
      type: "item",
      name: "Synthetic balloons",
      notes: "",
      kind: "consumable",
      openingQuantity: 10,
      unitCost: 100,
      lowStock: 3,
      location: "Store",
      condition: "New",
      purchasedOn: "",
      usefulLifeMonths: 0,
    });
    const movement = {
      type: "stock",
      name: "Balloons used",
      notes: "",
      itemId: item.id,
      bookingId: "",
      date: "2026-10-18",
      kind: "use",
      quantity: 4,
      adjustmentSign: "remove",
    };
    const used = await f.post(await f.save(movement));
    assert.equal(used.status, "posted");
    assert.equal(
      stockState(item, (await f.ok("/manage/finance")).records).onHand,
      6,
    );
    const excessive = await f.save({ ...movement, quantity: 7 });
    assert.equal(
      (
        await f.request("/manage/finance/" + excessive.id + "/post", "POST", {
          revision: excessive.revision,
        })
      ).status,
      400,
    );
    const backup = await snapshot(f.store),
      restored = new Store(":memory:");
    try {
      await restoreSnapshot(restored, backup);
      assert.deepEqual((await snapshot(restored)).tables, backup.tables);
    } finally {
      await restored.db.close();
    }
    employee = await f.ok("/manage/finance/" + employee.id, "PUT", {
      revision: employee.revision,
      data: { ...employee.data, position: "Senior crew" },
    });
    assert.equal(employee.data.position, "Senior crew");
  } finally {
    await f.close();
  }
});

test("reviewed company identity and tax snapshots survive edits; dated credit uses original rate; reconciliation validates books", async () => {
  const f = await fixture();
  try {
    let profile = await f.save({
      type: "company",
      name: "Synthetic company tax profile",
      notes: "",
      legalName: "Synthetic registered company",
      address: "Synthetic address",
      fiscalNumber: "TEST-FISCAL",
      vatNumber: "TEST-VAT",
      registrationNumber: "TEST-REG",
      nssfNumber: "TEST-NSSF",
      vatStatus: "registered",
      reviewed: true,
      invoiceFooter: "Synthetic only",
    });
    const tax = await f.save({
      type: "tax",
      name: "Synthetic 10% rule",
      notes: "Not a Lebanese rate",
      rateBps: 1000,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-10-18",
      reviewed: true,
    });
    const invoice = await f.post(
      await f.save(
        doc({
          customerAddress: "Synthetic customer address",
          lines: [line({ taxId: tax.id })],
        }),
      ),
    );
    assert.equal(invoice.totals.total, 11000);
    assert.equal(invoice.issuer.legalName, "Synthetic registered company");
    profile = await f.ok("/manage/finance/" + profile.id, "PUT", {
      revision: profile.revision,
      data: { ...profile.data, legalName: "Changed company name" },
    });
    assert.equal(profile.data.legalName, "Changed company name");
    assert.equal(
      (await f.ok("/manage/finance")).records.find((r) => r.id === invoice.id)
        .issuer.legalName,
      "Synthetic registered company",
    );
    assert.equal(
      (
        await f.request("/manage/finance/" + tax.id, "PUT", {
          revision: tax.revision,
          data: { ...tax.data, rateBps: 2000 },
        })
      ).status,
      409,
    );
    const paid = await f.post(
      await f.save({
        type: "payment",
        name: "Invoice settled",
        notes: "",
        kind: "receipt",
        date: "2026-10-18",
        amount: 11000,
        accountId: "cash",
        toAccountId: "",
        documentId: invoice.id,
        employeeId: "",
        legacyMoneyId: "",
        reference: "",
      }),
    );
    const credit = await f.post(
      await f.save(
        doc({
          kind: "credit",
          originalId: invoice.id,
          date: "2026-10-19",
          dueDate: "2026-10-25",
          customerAddress: "Synthetic customer address",
          lines: [line({ unitPrice: 5000, taxId: tax.id })],
        }),
      ),
    );
    assert.equal(credit.totals.tax, 500);
    await f.post(
      await f.save({
        type: "payment",
        name: "Credit refunded",
        notes: "",
        kind: "payment",
        date: "2026-10-19",
        amount: 5500,
        accountId: "cash",
        toAccountId: "",
        documentId: credit.id,
        employeeId: "",
        legacyMoneyId: "",
        reference: "",
      }),
    );
    assert.equal(
      (
        await f.request("/manage/finance/" + paid.id + "/reverse", "POST", {
          revision: paid.revision,
          date: "2026-10-20",
          reason: "Blocked pending refund reversal",
        })
      ).status,
      409,
    );
    const reconcile = {
      type: "reconciliation",
      name: "Cash count",
      notes: "",
      accountId: "cash",
      date: "2026-10-19",
      statementBalance: 5500,
      reference: "Synthetic count",
      reviewed: true,
    };
    assert.equal((await f.save(reconcile)).data.reviewed, true);
    assert.equal(
      (
        await f.request("/manage/finance/new", "PUT", {
          revision: 0,
          data: { ...reconcile, statementBalance: 1 },
        })
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("event payment linking is retry safe, imports never erase legacy cash, and restricted payroll journals stay private", async () => {
  const f = await fixture();
  try {
    const now = new Date().toISOString(),
      event = {
        id: "event",
        customerId: "c",
        name: "Synthetic event",
        date: "2026-11-01",
        time: "16:00",
        location: "Test",
        occasion: "Birthday",
        audience: 20,
        age: 8,
        indoor: true,
        power: true,
        space: 30,
        source: "test",
        notes: "",
        packageIds: ["magic"],
        performerIds: [],
        availability: {},
        status: "confirmed",
        quotes: [
          {
            id: "q",
            name: "Agreed",
            packageIds: ["magic"],
            amount: 10000,
            deposit: 0,
            notes: "",
            packageSnapshot: [
              await f.store.get(f.business.id, "packages", "magic"),
            ],
          },
        ],
        acceptedQuoteId: "q",
        travel: 0,
        breakMinutes: 0,
        checklist: [],
        venueNotes: "",
        backupPerformerIds: [],
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
    await f.store.put(f.business.id, "bookings", event);
    await f.store.put(f.business.id, "money", {
      id: "legacy",
      bookingId: "event",
      kind: "payment",
      amount: 5000,
      category: "deposit",
      note: "Existing transaction",
      date: "2026-10-18",
    });
    const invoice = await f.post(
      await f.save(
        doc({
          bookingId: "event",
          revenueTreatment: "deferred",
          performanceConfirmed: false,
        }),
      ),
    );
    const imported = await f.post(
      await f.save({
        type: "payment",
        name: "Link existing deposit",
        notes: "",
        kind: "receipt",
        date: "2026-10-18",
        amount: 5000,
        accountId: "cash",
        toAccountId: "",
        documentId: invoice.id,
        employeeId: "",
        legacyMoneyId: "legacy",
        reference: "",
      }),
    );
    assert.equal((await f.store.all(f.business.id, "money")).length, 1);
    assert.equal(
      (
        await f.request("/manage/money/legacy/correct", "POST", {
          amount: 1000,
          category: "deposit",
          note: "",
          date: "2026-10-18",
          reason: "Blocked because posted",
        })
      ).status,
      409,
    );
    await f.ok("/manage/finance/" + imported.id + "/reverse", "POST", {
      revision: imported.revision,
      date: "2026-10-18",
      reason: "Undo bookkeeping import only",
    });
    assert.equal(
      (await f.store.get(f.business.id, "money", "legacy")).amount,
      5000,
    );
    let row = await f.store.db
        .prepare("SELECT data FROM users WHERE id=?")
        .get(f.users.accounts.id),
      accountant = JSON.parse(row.data);
    accountant.permissions = { payroll: false };
    await f.store.db
      .prepare("UPDATE users SET data=? WHERE id=?")
      .run(JSON.stringify(accountant), accountant.id);
    const journal = await f.save({
      type: "journal",
      name: "Private payroll adjustment",
      notes: "",
      date: "2026-10-18",
      lines: [
        { accountId: "payroll_cost", debit: 1000, credit: 0 },
        { accountId: "salary_payable", debit: 0, credit: 1000 },
      ],
    });
    await f.post(journal);
    const visible = await f.ok("/manage/finance", "GET", undefined, "accounts");
    assert.equal(
      visible.records.some((r) => r.id === journal.id),
      false,
    );
    assert.equal(
      visible.journals.some((j) => j.sourceId === journal.id),
      false,
    );
    const after = await f.store.get(f.business.id, "bookings", "event");
    assert.deepEqual(after.quotes, event.quotes);
    assert.equal(after.quotes[0].amount, 10000);
  } finally {
    await f.close();
  }
});
test("deferred invoices and pre-performance credits recognize once, and all reversals reconcile", async () => {
  const f = await fixture();
  try {
    const invoice = await f.post(
      await f.save(
        doc({ revenueTreatment: "deferred", performanceConfirmed: false }),
      ),
    );
    const credit = await f.post(
      await f.save(
        doc({
          kind: "credit",
          originalId: invoice.id,
          lines: [line({ unitPrice: 2000 })],
        }),
      ),
    );
    let state = await f.ok("/manage/finance"),
      balances = ledgerBalances(state.journals);
    assert.equal(
      balances.find((b) => b.accountId === "deferred_revenue").balance,
      -8000,
    );
    assert.equal(
      balances.find((b) => b.accountId === "sales"),
      undefined,
    );
    const recognized = await f.ok(
      "/manage/finance/" + invoice.id + "/recognize",
      "POST",
      {
        revision: invoice.revision,
        date: "2026-10-19",
        reason: "Synthetic performance completed",
      },
    );
    assert.equal(recognized.recognizedDate, "2026-10-19");
    state = await f.ok("/manage/finance");
    balances = ledgerBalances(state.journals);
    assert.equal(
      balances.find((b) => b.accountId === "deferred_revenue").balance,
      0,
    );
    assert.equal(balances.find((b) => b.accountId === "sales").balance, -8000);
    assert.equal(
      (
        await f.request(
          "/manage/finance/" + recognized.id + "/recognize",
          "POST",
          {
            revision: recognized.revision,
            date: "2026-10-19",
            reason: "Duplicate request",
          },
        )
      ).status,
      409,
    );
    const reclassCredit = state.records.find((r) => r.id === credit.id);
    await f.ok("/manage/finance/" + credit.id + "/reverse", "POST", {
      revision: reclassCredit.revision,
      date: "2026-10-19",
      reason: "Correct credit after performance",
    });
    balances = ledgerBalances((await f.ok("/manage/finance")).journals);
    assert.equal(
      balances.find((b) => b.accountId === "deferred_revenue").balance,
      0,
    );
    assert.equal(balances.find((b) => b.accountId === "sales").balance, -10000);
    await f.ok("/manage/finance/" + invoice.id + "/reverse", "POST", {
      revision: recognized.revision,
      date: "2026-10-19",
      reason: "Correct original invoice",
    });
    assert.equal(
      ledgerBalances((await f.ok("/manage/finance")).journals).every(
        (b) => b.balance === 0,
      ),
      true,
    );
  } finally {
    await f.close();
  }
});
test("ledger-tracked consumables consume and restore stock and cost once; equipment remains an asset while out", async () => {
  const f = await fixture();
  try {
    const item = await f.save({
      type: "item",
      name: "Tracked balloons",
      notes: "",
      kind: "consumable",
      openingQuantity: 10,
      unitCost: 100,
      lowStock: 2,
      location: "Store",
      condition: "New",
      purchasedOn: "",
      usefulLifeMonths: 0,
      ledgerTracked: true,
    });
    const movement = {
      type: "stock",
      name: "Consumption",
      notes: "",
      itemId: item.id,
      bookingId: "",
      date: "2026-10-18",
      kind: "use",
      quantity: 4,
      adjustmentSign: "remove",
      reversesId: "",
    };
    const blocked = await f.save(movement);
    assert.equal(
      (
        await f.request("/manage/finance/" + blocked.id + "/post", "POST", {
          revision: blocked.revision,
        })
      ).status,
      400,
    );
    await f.post(
      await f.save({
        type: "journal",
        name: "Reviewed inventory opening",
        notes: "",
        date: "2026-10-18",
        lines: [
          { accountId: "inventory", debit: 1000, credit: 0 },
          { accountId: "equity", debit: 0, credit: 1000 },
        ],
      }),
    );
    const used = await f.post(blocked);
    let state = await f.ok("/manage/finance");
    assert.equal(
      ledgerBalances(state.journals).find((b) => b.accountId === "direct_cost")
        .balance,
      400,
    );
    assert.equal(stockState(item, state.records).onHand, 6);
    const restore = await f.post(
      await f.save({
        ...movement,
        name: "Restore two unused balloons",
        kind: "restore_use",
        quantity: 2,
        reversesId: used.id,
      }),
    );
    assert.equal(restore.status, "posted");
    state = await f.ok("/manage/finance");
    assert.equal(stockState(item, state.records).onHand, 8);
    assert.equal(
      ledgerBalances(state.journals).find((b) => b.accountId === "direct_cost")
        .balance,
      200,
    );
    const tooMany = await f.save({
      ...movement,
      kind: "restore_use",
      quantity: 3,
      reversesId: used.id,
    });
    assert.equal(
      (
        await f.request("/manage/finance/" + tooMany.id + "/post", "POST", {
          revision: tooMany.revision,
        })
      ).status,
      400,
    );
    const equipment = await f.save({
      type: "item",
      name: "Speaker",
      notes: "",
      kind: "equipment",
      openingQuantity: 2,
      unitCost: 10000,
      lowStock: 0,
      location: "Store",
      condition: "Good",
      purchasedOn: "",
      usefulLifeMonths: 60,
      ledgerTracked: false,
    });
    await f.post(
      await f.save({
        ...movement,
        itemId: equipment.id,
        name: "Speaker out",
        kind: "out",
        quantity: 1,
      }),
    );
    state = await f.ok("/manage/finance");
    assert.deepEqual(stockState(equipment, state.records), {
      onHand: 1,
      out: 1,
      used: 0,
      value: 20000,
    });
  } finally {
    await f.close();
  }
});

test("account codes are editable mappings with uniqueness and permissions, preserving posted IDs and journals", async () => {
  const f = await fixture();
  try {
    const opening = await f.post(
      await f.save({
        type: "journal",
        name: "Synthetic opening",
        notes: "",
        date: "2026-10-01",
        lines: [
          { accountId: "receivable", debit: 10000, credit: 0 },
          { accountId: "sales", debit: 0, credit: 10000 },
        ],
      }),
    );
    const before = await f.ok("/manage/finance");
    const data = {
      type: "account",
      name: "Customer control",
      notes: "Synthetic code only",
      category: "asset",
      cash: false,
      code: "TEST-AR",
    };
    assert.equal(
      (
        await f.request(
          "/manage/finance/account-receivable",
          "PUT",
          { revision: 0, data },
          "sales",
        )
      ).status,
      403,
    );
    const saved = await f.ok("/manage/finance/account-receivable", "PUT", {
      revision: 0,
      data,
    });
    let state = await f.ok("/manage/finance");
    assert.equal(
      state.accounts.find((a) => a.id === "receivable").code,
      "TEST-AR",
    );
    assert.deepEqual(state.journals, before.journals);
    assert.equal(
      state.records.find((r) => r.id === opening.id).status,
      "posted",
    );
    const duplicate = await f.request("/manage/finance/new", "PUT", {
      revision: 0,
      data: { ...data, name: "Duplicate", code: "test-ar" },
    });
    assert.equal(duplicate.status, 400);
    assert.match(JSON.stringify(duplicate.data), /already assigned/);
    const invalid = await f.request("/manage/finance/new", "PUT", {
      revision: 0,
      data: { ...data, code: "=SUM(A1)" },
    });
    assert.equal(invalid.status, 400);
    const updated = await f.ok("/manage/finance/" + saved.id, "PUT", {
      revision: saved.revision,
      data: { ...data, code: "TEST-AR-2" },
    });
    assert.equal(updated.revision, saved.revision + 1);
    assert.equal(
      (
        await f.request("/manage/finance/" + saved.id, "PUT", {
          revision: saved.revision,
          data,
        })
      ).status,
      409,
    );
    const custom = await f.save({
      ...data,
      name: "Other control",
      code: "TEST-OTHER",
    });
    state = await f.ok("/manage/finance");
    assert.equal(
      state.accounts.find((a) => a.id === custom.id).code,
      "TEST-OTHER",
    );
    assert.equal(
      state.accounts.find((a) => a.id === "receivable").code,
      "TEST-AR-2",
    );
    assert.deepEqual(state.journals, before.journals);
    assert.equal(
      (
        await f.request("/manage/finance/account-receivable", "PUT", {
          revision: updated.revision,
          data: { ...data, category: "income" },
        })
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
