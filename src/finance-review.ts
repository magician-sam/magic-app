import type { FinanceRecord, Journal } from "./finance-model.js";
import { documentBalance, ledgerBalances } from "./finance-math.js";

type Account = {
  id: string;
  name: string;
  code: string;
  category: string;
  active: boolean;
  cash: boolean;
};
type Cell = string | number;
export function reviewCsv(rows: Cell[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value);
            if (typeof value === "string" && /^[\s\uFEFF]*[=+@-]/.test(text))
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}

/** Current chart mapping, dated journals and current document balances are separate. */
export function financeReviewTables(
  records: FinanceRecord[],
  journals: Journal[],
  accounts: Account[],
  currency: string,
  from = "",
  to = "",
) {
  const selected = journals.filter(
    (journal) => (!from || journal.date >= from) && (!to || journal.date <= to),
  );
  const opening = ledgerBalances(
    journals.filter((journal) => !!from && journal.date < from),
  );
  const movement = ledgerBalances(selected);
  const closing = ledgerBalances(
    journals.filter((journal) => !to || journal.date <= to),
  );
  const account = (id: string) => accounts.find((item) => item.id === id);
  const ids = [
    ...new Set([
      ...accounts.map((item) => item.id),
      ...closing.map((item) => item.accountId),
    ]),
  ];
  const ledger: Cell[][] = [
    [
      "Date",
      "Journal ID",
      "Source record ID",
      "Source number",
      "Source name",
      "Linked document ID",
      "Event ID",
      "Party ID",
      "Reference",
      "Account ID",
      "Account code (current mapping)",
      "Account name",
      "Debit cents",
      "Credit cents",
      "Currency",
    ],
  ];
  for (const journal of selected) {
    const source = records.find((record) => record.id === journal.sourceId);
    const linkedId =
      source?.data.type === "payment"
        ? source.data.documentId
        : source?.data.type === "document"
          ? source.data.originalId
          : "";
    const linked = records.find((record) => record.id === linkedId);
    const document =
      source?.data.type === "document"
        ? source
        : linked?.data.type === "document"
          ? linked
          : undefined;
    for (const line of journal.lines)
      ledger.push([
        journal.date,
        journal.id,
        journal.sourceId,
        source?.number || "",
        source?.data.name || journal.memo,
        linkedId,
        document?.data.type === "document" ? document.data.bookingId : "",
        document?.data.type === "document" ? document.data.partyId : "",
        source && "reference" in source.data ? source.data.reference : "",
        line.accountId,
        account(line.accountId)?.code || "",
        account(line.accountId)?.name || line.accountId,
        line.debit,
        line.credit,
        currency,
      ]);
  }
  const chart: Cell[][] = [
    [
      "Account ID (stable)",
      "Account code",
      "Account name",
      "Category",
      "Cash / bank account",
      "Active",
    ],
  ];
  for (const item of accounts)
    chart.push([
      item.id,
      item.code,
      item.name,
      item.category,
      String(item.cash),
      String(item.active),
    ]);
  const trial: Cell[][] = [
    [
      "Account ID",
      "Account code (current mapping)",
      "Account name",
      "Opening debit/(credit) cents",
      "Period debit cents",
      "Period credit cents",
      "Closing debit/(credit) cents",
      "Currency",
    ],
  ];
  for (const id of ids)
    trial.push([
      id,
      account(id)?.code || "",
      account(id)?.name || id,
      opening.find((item) => item.accountId === id)?.balance || 0,
      movement.find((item) => item.accountId === id)?.debit || 0,
      movement.find((item) => item.accountId === id)?.credit || 0,
      closing.find((item) => item.accountId === id)?.balance || 0,
      currency,
    ]);
  const documents: Cell[][] = [
    [
      "Record ID",
      "Document number",
      "Name",
      "Type",
      "Status",
      "Archived",
      "Date",
      "Due date",
      "Event ID",
      "Party ID",
      "Reference",
      "Total cents",
      "Current balance cents (not historical)",
      "Currency",
    ],
  ];
  for (const record of records) {
    if (!(record.data.type === "document" || record.data.type === "payroll"))
      continue;
    const data = record.data;
    if ((from && data.date < from) || (to && data.date > to)) continue;
    documents.push([
      record.id,
      record.number || "",
      data.name,
      data.type === "document" ? data.kind : "payroll",
      record.status,
      String(record.archived),
      data.date,
      data.dueDate,
      data.type === "document" ? data.bookingId : "",
      data.type === "document" ? data.partyId : data.employeeId,
      data.type === "document" ? data.reference : "",
      record.totals?.total ?? record.netPay ?? 0,
      record.status === "posted"
        ? documentBalance(record, records).balance
        : "",
      record.currency,
    ]);
  }
  return { chart, ledger, trial, documents };
}
