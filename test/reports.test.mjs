import test from "node:test";
import assert from "node:assert/strict";
import { reportPeriod } from "../dist/reports.js";

test("report cash dates are independent of event dates and include boundary transactions", () => {
  const events = [
    { id: "january", date: "2027-01-15" },
    { id: "february", date: "2027-02-15" },
  ];
  const entries = [
    {
      bookingId: "february",
      date: "2027-01-01",
      kind: "payment",
      amount: 10001,
    },
    { bookingId: "january", date: "2027-01-31", kind: "refund", amount: 2000 },
    { bookingId: "january", date: "2027-01-20", kind: "expense", amount: 3000 },
    { bookingId: "january", date: "2027-02-01", kind: "payment", amount: 5000 },
  ];
  const r = reportPeriod(events, entries, "2027-01-01", "2027-01-31");
  assert.deepEqual(
    r.events.map((b) => b.id),
    ["january"],
  );
  assert.equal(r.transactions.length, 3);
  assert.equal(r.payments, 10001);
  assert.equal(r.netPayments, 8001);
  assert.equal(r.cashAfterExpenses, 5001);
  assert.equal(entries.length, 4);
  assert.equal(reportPeriod(events, entries).transactions.length, 4);
  assert.equal(reportPeriod(events, entries, "", "2027-01-01").payments, 10001);
  assert.equal(reportPeriod(events, entries, "2027-02-01").payments, 5000);
  assert.equal(
    reportPeriod(events, entries, "2028-01-01").cashAfterExpenses,
    0,
  );
});

test("report date validation rejects reversed or impossible ranges and accepts leap day", () => {
  for (const range of [
    ["2027-02-29", ""],
    ["bad", ""],
    ["2027-03-01", "2027-02-01"],
    ["", "2027-13-01"],
  ]) {
    assert.throws(() => reportPeriod([], [], ...range));
  }
  assert.equal(
    reportPeriod([], [], "2028-02-29", "2028-02-29").events.length,
    0,
  );
});
