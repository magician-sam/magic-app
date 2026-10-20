import type { FinanceRecord } from "./finance-model.js";
import { documentBalance } from "./finance-math.js";

/** Read-only workflow projections. The existing ledger remains authoritative. */
export function financeDocumentState(
  record: FinanceRecord,
  records: FinanceRecord[],
  today: string,
) {
  if (record.archived || record.status !== "posted") return null;
  if (!(
    record.data.type === "payroll" ||
    (record.data.type === "document" && record.data.kind !== "credit")
  ))
    return null;
  const balance = Math.max(0, documentBalance(record, records).balance);
  const dueDate = record.data.dueDate;
  return {
    balance,
    dueDate,
    overdue: balance > 0 && !!dueDate && dueDate < today,
  };
}

export function financeWorkflowSummary(
  records: FinanceRecord[],
  today: string,
) {
  const active = records.filter((record) => !record.archived);
  const group = (kind: "invoice" | "bill" | "payroll") => {
    const items = active.filter((record) =>
      kind === "payroll"
        ? record.data.type === "payroll"
        : record.data.type === "document" &&
          (kind === "invoice"
            ? record.data.kind !== "bill"
            : record.data.kind === "bill"),
    );
    const open = items
      .map((record) => ({
        record,
        state: financeDocumentState(record, records, today),
      }))
      .filter(
        (
          item,
        ): item is typeof item & { state: NonNullable<typeof item.state> } =>
          !!item.state && item.state.balance > 0,
      );
    return {
      drafts: items.filter((record) => record.status === "draft").length,
      open: open.length,
      due: open.reduce((sum, item) => sum + item.state.balance, 0),
      overdue: open.filter((item) => item.state.overdue).length,
    };
  };
  const upcoming = active
    .map((record) => ({
      record,
      state: financeDocumentState(record, records, today),
    }))
    .filter(
      (item): item is typeof item & { state: NonNullable<typeof item.state> } =>
        !!item.state && item.state.balance > 0,
    )
    .sort(
      (a, b) =>
        (a.state.dueDate || "9999").localeCompare(b.state.dueDate || "9999") ||
        a.record.id.localeCompare(b.record.id),
    );
  return {
    invoices: group("invoice"),
    bills: group("bill"),
    payroll: group("payroll"),
    upcoming,
  };
}
