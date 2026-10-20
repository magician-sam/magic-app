import test from "node:test";
import assert from "node:assert/strict";
import { financeReviewTables, reviewCsv } from "../dist/finance-review.js";

const accounts = [
  {
    id: "receivable",
    code: "TEST-AR",
    name: "Customers",
    category: "asset",
    active: true,
    cash: false,
  },
  {
    id: "sales",
    code: "TEST-SALES",
    name: "Sales",
    category: "income",
    active: true,
    cash: false,
  },
  {
    id: "cash",
    code: "TEST-CASH",
    name: "Cash",
    category: "asset",
    active: true,
    cash: true,
  },
];
const record = (id, type, data = {}, status = "posted") => ({
  id,
  number: id.toUpperCase(),
  status,
  archived: false,
  currency: "USD",
  data: { type, name: id, notes: "Private note excluded", ...data },
});
const invoice = {
  ...record("invoice", "document", {
    kind: "invoice",
    date: "2026-10-01",
    dueDate: "2026-10-15",
    bookingId: "event",
    partyId: "customer",
    reference: "PO-1",
  }),
  totals: { total: 10000 },
};
const payment = record("receipt", "payment", {
  documentId: "invoice",
  amount: 3000,
  direction: "in",
  date: "2026-11-01",
  reference: "RCPT",
});
const journals = [
  {
    id: "j-opening",
    sourceId: "invoice",
    date: "2026-10-01",
    memo: "Invoice",
    lines: [
      { accountId: "receivable", debit: 10000, credit: 0 },
      { accountId: "sales", debit: 0, credit: 10000 },
    ],
  },
  {
    id: "j-receipt",
    sourceId: "receipt",
    date: "2026-11-01",
    memo: "Receipt",
    lines: [
      { accountId: "cash", debit: 3000, credit: 0 },
      { accountId: "receivable", debit: 0, credit: 3000 },
    ],
  },
];

test("accountant trial balance reconciles opening, period movement and closing with stable account/source links", () => {
  const tables = financeReviewTables(
    [invoice, payment],
    journals,
    accounts,
    "USD",
    "2026-11-01",
    "2026-11-30",
  );
  assert.deepEqual(
    tables.trial.find((row) => row[0] === "receivable"),
    ["receivable", "TEST-AR", "Customers", 10000, 0, 3000, 7000, "USD"],
  );
  assert.deepEqual(
    tables.trial.find((row) => row[0] === "sales"),
    ["sales", "TEST-SALES", "Sales", -10000, 0, 0, -10000, "USD"],
  );
  assert.equal(
    tables.trial.slice(1).reduce((sum, row) => sum + row[6], 0),
    0,
  );
  assert.equal(tables.ledger.length, 3);
  assert.deepEqual(tables.ledger[1].slice(0, 9), [
    "2026-11-01",
    "j-receipt",
    "receipt",
    "RECEIPT",
    "receipt",
    "invoice",
    "event",
    "customer",
    "RCPT",
  ]);
  assert.equal(tables.chart.length, 4);
  assert.equal(
    tables.documents.length,
    1,
    "issue date filter excludes October invoice",
  );
  assert.equal(JSON.stringify(tables).includes("Private note excluded"), false);
  const october = financeReviewTables(
    [invoice, payment],
    journals,
    accounts,
    "USD",
    "2026-10-01",
    "2026-10-31",
  );
  assert.equal(
    october.documents[1][12],
    7000,
    "document balance explicitly remains current, including later payments",
  );
  assert.equal(
    october.trial.find((row) => row[0] === "receivable")[6],
    10000,
    "closing ledger is as of period end",
  );
});

test("review exports retain correction journals and unknown historical accounts; drafts have no posted balance", () => {
  const reversed = { ...invoice, status: "reversed" };
  const correction = {
    id: "correction",
    sourceId: "invoice",
    date: "2026-12-01",
    memo: "Correction",
    lines: [
      { accountId: "legacy", debit: 100, credit: 0 },
      { accountId: "sales", debit: 0, credit: 100 },
    ],
  };
  const tables = financeReviewTables(
    [
      reversed,
      record(
        "draft",
        "document",
        {
          kind: "bill",
          date: "2026-12-01",
          dueDate: "",
          partyId: "",
          bookingId: "",
          reference: "",
        },
        "draft",
      ),
    ],
    [...journals, correction],
    accounts,
    "USD",
  );
  assert.equal(tables.ledger.length, 7);
  assert.equal(tables.trial.find((row) => row[0] === "legacy")[6], 100);
  assert.equal(tables.documents[1][12], "");
  assert.equal(tables.documents[2][12], "");
});

test("CSV preserves multilingual names and quoting while neutralizing spreadsheet formulas without changing numeric signs", () => {
  const csv = reviewCsv([
    ["Account", "Name", "Amount"],
    ["411", 'عميل, "Client"', -120],
    ['=HYPERLINK("x")', "  +SUM(1,2)", 0],
    ["@cmd", "-word", 12],
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"عميل, ""Client"""'));
  assert.ok(csv.includes('"-120"'));
  assert.ok(csv.includes("\"'=HYPERLINK"));
  assert.ok(csv.includes("\"'  +SUM"));
  assert.ok(csv.includes('"\'@cmd","\'-word"'));
});
