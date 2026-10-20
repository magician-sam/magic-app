import test from "node:test";
import assert from "node:assert/strict";
import {
  financeDocumentState,
  financeWorkflowSummary,
} from "../dist/finance-workflow.js";

const record = (id, type, data = {}, status = "posted") => ({
  id,
  status,
  archived: false,
  currency: "USD",
  data: { type, name: id, notes: "", ...data },
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  revision: 1,
});
const document = (id, kind, total, dueDate = "", status = "posted") => ({
  ...record(
    id,
    "document",
    { kind, date: "2026-10-01", dueDate, originalId: "" },
    status,
  ),
  totals: { total, net: total, tax: 0, lines: [] },
});

test("workflow balances use posted payments and credits, separating drafts and overdue work", () => {
  const invoice = document("invoice", "invoice", 10000, "2026-10-10");
  const credit = {
    ...document("credit", "credit", 2000),
    data: { ...document("credit", "credit", 2000).data, originalId: "invoice" },
  };
  const payment = record("receipt", "payment", {
    documentId: "invoice",
    amount: 3000,
    direction: "in",
  });
  const ignoredPayment = record(
    "draft-receipt",
    "payment",
    { documentId: "invoice", amount: 4000, direction: "in" },
    "draft",
  );
  const rows = [
    invoice,
    credit,
    payment,
    ignoredPayment,
    document("draft-invoice", "invoice", 99999, "2026-10-01", "draft"),
    document("draft-credit", "credit", 1000, "", "draft"),
  ];
  const summary = financeWorkflowSummary(rows, "2026-10-21");
  assert.deepEqual(summary.invoices, {
    drafts: 2,
    open: 1,
    due: 5000,
    overdue: 1,
  });
  assert.deepEqual(summary.bills, { drafts: 0, open: 0, due: 0, overdue: 0 });
  assert.deepEqual(financeDocumentState(invoice, rows, "2026-10-21"), {
    balance: 5000,
    dueDate: "2026-10-10",
    overdue: true,
  });
  assert.equal(summary.upcoming.length, 1);
  assert.equal(financeDocumentState(credit, rows, "2026-10-21"), null);
});

test("settled, archived and reversed documents do not become collection tasks; due today is not overdue", () => {
  const settled = document("paid", "invoice", 1000, "2026-10-01");
  const rows = [
    settled,
    record("receipt", "payment", {
      documentId: "paid",
      amount: 1000,
      direction: "in",
    }),
    document("today", "bill", 3000, "2026-10-21"),
    document("undated", "invoice", 500),
    { ...document("archived", "bill", 99999, "2026-10-01"), archived: true },
    document("reversed", "invoice", 99999, "2026-10-01", "reversed"),
  ];
  const summary = financeWorkflowSummary(rows, "2026-10-21");
  assert.equal(financeDocumentState(settled, rows, "2026-10-21").balance, 0);
  assert.equal(summary.bills.due, 3000);
  assert.equal(summary.bills.overdue, 0);
  assert.equal(summary.invoices.due, 500);
  assert.deepEqual(
    summary.upcoming.map((item) => item.record.id),
    ["today", "undated"],
  );
});

test("payroll remains a separate payable and partial salary payments preserve the remainder", () => {
  const salary = {
    ...record("salary", "payroll", { dueDate: "2026-10-20" }),
    netPay: 12000,
  };
  const rows = [
    salary,
    record("salary-payment", "payment", {
      documentId: "salary",
      amount: 3000,
      direction: "out",
    }),
    record("draft-salary", "payroll", { dueDate: "2026-10-01" }, "draft"),
  ];
  const summary = financeWorkflowSummary(rows, "2026-10-21");
  assert.deepEqual(summary.payroll, {
    drafts: 1,
    open: 1,
    due: 9000,
    overdue: 1,
  });
  assert.equal(summary.bills.due, 0);
  assert.equal(summary.invoices.due, 0);
});
