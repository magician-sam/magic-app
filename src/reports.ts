import type { Booking, MoneyEntry } from "./models.js";

export function reportPeriod(
  bookings: Booking[],
  money: MoneyEntry[],
  from = "",
  to = "",
) {
  for (const value of [from, to]) {
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value + "T12:00:00Z")) ||
        new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value)
    ) {
      throw new Error("Choose valid report dates.");
    }
  }
  if (from && to && from > to)
    throw new Error("The start date must be on or before the end date.");
  const includes = (date: string) =>
    (!from || date >= from) && (!to || date <= to);
  const events = bookings.filter((b) => includes(b.date));
  // Cash is selected by transaction date, independently of the event date.
  const transactions = money.filter((m) => includes(m.date));
  const sum = (kind: MoneyEntry["kind"]) =>
    transactions
      .filter((m) => m.kind === kind)
      .reduce((s, m) => s + m.amount, 0);
  const payments = sum("payment"),
    refunds = sum("refund"),
    expenses = sum("expense");
  return {
    events,
    transactions,
    payments,
    refunds,
    expenses,
    netPayments: payments - refunds,
    cashAfterExpenses: payments - refunds - expenses,
  };
}
