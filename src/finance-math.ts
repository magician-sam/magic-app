import type {
  FinanceRecord,
  DataOf,
  DocumentTotal,
  Journal,
} from "./finance-model.js";
import type { Booking, MoneyEntry, Package } from "./models.js";
import type { ActPlan } from "./act-plans.js";
export class FinanceValidationError extends Error {}
export function checkedMoney(n: number) {
  if (!Number.isSafeInteger(n) || Math.abs(n) > 100_000_000_00)
    throw new FinanceValidationError("Amount exceeds the supported range.");
  return n;
}
// Integer rational rounding keeps inclusive/exclusive calculations deterministic.
const ratio = (n: number, m: number, d: number) =>
  Number((BigInt(n) * BigInt(m) + BigInt(Math.floor(d / 2))) / BigInt(d));
export function documentTotals(
  data: DataOf<"document">,
  records: FinanceRecord[],
): DocumentTotal {
  const original =
    data.kind === "credit"
      ? records.find(
          (r) =>
            r.id === data.originalId &&
            r.status === "posted" &&
            r.data.type === "document" &&
            r.data.kind === "invoice",
        )
      : undefined;
  const lines = data.lines.map((line, index) => {
    const gross = checkedMoney(line.unitPrice * line.quantity - line.discount);
    if (gross < 0)
      throw new FinanceValidationError(
        "A line discount cannot exceed its price.",
      );
    const historical =
      original?.data.type === "document" &&
      original.data.lines[index]?.taxId === line.taxId
        ? original.totals?.lines[index]
        : undefined;
    const rule = line.taxId
      ? records.find(
          (r) => r.id === line.taxId && !r.archived && r.data.type === "tax",
        )
      : undefined;
    if (line.taxId && !rule && !historical)
      throw new FinanceValidationError("Choose an active tax code.");
    const tax = rule?.data.type === "tax" ? rule.data : undefined;
    if (
      !historical &&
      tax &&
      (!tax.reviewed ||
        tax.effectiveFrom > data.date ||
        (tax.effectiveTo && tax.effectiveTo < data.date))
    )
      throw new FinanceValidationError(
        "Tax code must be reviewed and valid on the document date.",
      );
    const rateBps = historical?.rateBps ?? tax?.rateBps ?? 0;
    const net = line.inclusive ? ratio(gross, 10000, 10000 + rateBps) : gross;
    const taxAmount = line.inclusive ? gross - net : ratio(net, rateBps, 10000);
    return {
      net,
      tax: taxAmount,
      total: checkedMoney(net + taxAmount),
      rateBps,
      taxName: historical?.taxName ?? tax?.name ?? "No VAT applied",
      inclusive: line.inclusive,
    };
  });
  return {
    net: checkedMoney(lines.reduce((n, l) => n + l.net, 0)),
    tax: checkedMoney(lines.reduce((n, l) => n + l.tax, 0)),
    total: checkedMoney(lines.reduce((n, l) => n + l.total, 0)),
    lines,
  };
}
export function payrollTotal(p: DataOf<"payroll">) {
  const gross = checkedMoney(p.basic + p.allowances + p.overtime),
    net = checkedMoney(gross - p.tax - p.social - p.advanceRecovery);
  if (net < 0)
    throw new FinanceValidationError("Payroll deductions exceed gross pay.");
  return { gross, net, employerCost: checkedMoney(gross + p.employerSocial) };
}
export function validateJournal(lines: Journal["lines"]) {
  if (
    lines.length < 2 ||
    lines.some(
      (l) =>
        l.debit < 0 ||
        l.credit < 0 ||
        !Number.isSafeInteger(l.debit) ||
        !Number.isSafeInteger(l.credit) ||
        l.debit > 0 === l.credit > 0,
    )
  )
    throw new FinanceValidationError(
      "Each journal line needs one positive debit or credit.",
    );
  const debit = checkedMoney(lines.reduce((n, l) => n + l.debit, 0)),
    credit = checkedMoney(lines.reduce((n, l) => n + l.credit, 0));
  if (!debit || debit !== credit)
    throw new FinanceValidationError(
      "Journal debits and credits must balance.",
    );
}
export function documentBalance(
  record: FinanceRecord,
  records: FinanceRecord[],
) {
  const paid = records
    .filter(
      (r) =>
        r.status === "posted" &&
        r.data.type === "payment" &&
        r.data.documentId === record.id,
    )
    .reduce((n, r) => n + (r.data as DataOf<"payment">).amount, 0);
  const credits =
    record.data.type === "document" && record.data.kind === "invoice"
      ? records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "document" &&
              r.data.kind === "credit" &&
              r.data.originalId === record.id,
          )
          .reduce((n, r) => n + (r.totals?.total ?? 0), 0)
      : 0;
  if (record.data.type === "document" && record.data.kind === "credit") {
    const originalId = record.data.originalId,
      original = records.find((r) => r.id === originalId);
    const originalPaid = records
      .filter(
        (r) =>
          r.status === "posted" &&
          r.data.type === "payment" &&
          r.data.documentId === originalId,
      )
      .reduce((n, r) => n + (r.data as DataOf<"payment">).amount, 0);
    const siblings = records
      .filter(
        (r) =>
          r.status === "posted" &&
          r.data.type === "document" &&
          r.data.kind === "credit" &&
          r.data.originalId === originalId,
      )
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    const allCredits = siblings.reduce((n, r) => n + (r.totals?.total ?? 0), 0);
    let capacity = Math.max(
      0,
      originalPaid + allCredits - (original?.totals?.total ?? 0),
    );
    for (const sibling of siblings) {
      const allocated = Math.min(capacity, sibling.totals?.total ?? 0);
      if (sibling.id === record.id)
        return { paid, credits: 0, balance: Math.max(0, allocated - paid) };
      capacity -= allocated;
    }
    return { paid, credits: 0, balance: 0 };
  }
  const creditIds = new Set(
    records
      .filter(
        (r) =>
          r.status === "posted" &&
          r.data.type === "document" &&
          r.data.kind === "credit" &&
          r.data.originalId === record.id,
      )
      .map((r) => r.id),
  );
  const refunded = records
    .filter(
      (r) =>
        r.status === "posted" &&
        r.data.type === "payment" &&
        creditIds.has(r.data.documentId),
    )
    .reduce((n, r) => n + (r.data as DataOf<"payment">).amount, 0);
  return {
    paid,
    credits,
    balance:
      (record.totals?.total ?? record.netPay ?? 0) - paid - credits + refunded,
  };
}
export function stockState(item: FinanceRecord, records: FinanceRecord[]) {
  if (item.data.type !== "item")
    throw new FinanceValidationError("Choose an inventory item.");
  let onHand = item.data.openingQuantity,
    out = 0,
    used = 0;
  for (const r of records.filter(
    (r) =>
      r.status === "posted" &&
      r.data.type === "stock" &&
      r.data.itemId === item.id,
  )) {
    const m = r.data as DataOf<"stock">;
    if (m.kind === "restore_use") {
      onHand += m.quantity;
      used -= m.quantity;
    } else if (
      m.kind === "in" ||
      (m.kind === "adjustment" && m.adjustmentSign === "add")
    )
      onHand += m.quantity;
    else if (m.kind === "return") {
      onHand += m.quantity;
      out -= m.quantity;
    } else {
      onHand -= m.quantity;
      if (m.kind === "out") out += m.quantity;
      if (m.kind === "use") used += m.quantity;
    }
  }
  return {
    onHand,
    out,
    used,
    value: checkedMoney((onHand + out) * item.data.unitCost),
  };
}
export function ledgerBalances(journals: Journal[], from = "", to = "") {
  const balances = new Map<string, { debit: number; credit: number }>();
  for (const journal of journals.filter(
    (j) => (!from || j.date >= from) && (!to || j.date <= to),
  ))
    for (const l of journal.lines) {
      const r = balances.get(l.accountId) ?? { debit: 0, credit: 0 };
      r.debit += l.debit;
      r.credit += l.credit;
      balances.set(l.accountId, r);
    }
  return [...balances].map(([accountId, b]) => ({
    accountId,
    ...b,
    balance: b.debit - b.credit,
  }));
}

export function eventCostForecast(
  booking: Booking,
  money: MoneyEntry[],
  records: FinanceRecord[],
  packages: Package[],
  plan?: ActPlan,
) {
  const active = records.filter((r) => !r.archived && r.status !== "reversed"),
    missing: string[] = [];
  const quote = booking.quotes.find((q) => q.id === booking.acceptedQuoteId);
  const rows = active.filter(
    (r) => r.data.type === "cost" && r.data.bookingId === booking.id,
  );
  const linked = new Set(
    active
      .filter((r) => r.status === "posted" && r.legacyMoneyId)
      .map((r) => r.legacyMoneyId),
  );
  const expenses = money.filter(
    (m) =>
      m.bookingId === booking.id && m.kind === "expense" && !linked.has(m.id),
  );
  let actual = expenses.reduce((n, m) => n + m.amount, 0),
    forecast = expenses
      .filter((m) => !m.performerId)
      .reduce((n, m) => n + m.amount, 0);
  const bills = active.filter(
    (r) =>
      r.status === "posted" &&
      r.data.type === "document" &&
      r.data.kind === "bill" &&
      r.data.bookingId === booking.id,
  );
  const billCost = (bill: FinanceRecord) =>
    bill.data.type === "document"
      ? bill.data.lines.reduce(
          (n, l, i) =>
            n +
            (accountsForForecast(records, l.accountId) === "asset"
              ? 0
              : (bill.totals?.lines[i]?.net ?? 0) +
                (l.recoverable ? 0 : (bill.totals?.lines[i]?.tax ?? 0))),
          0,
        )
      : 0;
  const artistIds = new Set(
    [
      ...(plan?.rows.map((r) => r.performerId) ?? []),
      ...booking.performerIds,
      ...expenses.map((m) => m.performerId ?? ""),
      ...bills.map((r) => (r.data as DataOf<"document">).performerId),
    ].filter(Boolean),
  );
  for (const artistId of artistIds) {
    const assignments =
      plan?.rows.filter((r) => r.performerId === artistId) ?? [];
    let agreed = assignments.reduce((n, r) => n + r.agreedPay, 0);
    const billed = bills
      .filter(
        (r) => r.data.type === "document" && r.data.performerId === artistId,
      )
      .reduce((n, r) => n + billCost(r), 0);
    const paid =
      expenses
        .filter((m) => m.performerId === artistId)
        .reduce((n, m) => n + m.amount, 0) + billed;
    actual += billed;
    if (!assignments.length) {
      for (const serviceId of booking.packageIds) {
        const rates = active
          .filter(
            (r) =>
              r.data.type === "rate" &&
              r.data.serviceId === serviceId &&
              r.data.performerId === artistId &&
              r.data.effectiveFrom <= booking.date &&
              (!r.data.effectiveTo || r.data.effectiveTo >= booking.date),
          )
          .sort(
            (a, b) =>
              (b.data as DataOf<"rate">).effectiveFrom.localeCompare(
                (a.data as DataOf<"rate">).effectiveFrom,
              ) || b.updatedAt.localeCompare(a.updatedAt),
          );
        const rate = rates[0]?.data as DataOf<"rate"> | undefined;
        const service =
          booking.packageSnapshot?.find((p) => p.id === serviceId) ??
          packages.find((p) => p.id === serviceId);
        if (rate && rate.unit === "show") agreed += rate.cost;
        else if (rate && rate.unit === "hour" && service)
          agreed += Math.round((rate.cost * service.duration) / 60);
        else missing.push("Confirm artist cost for " + serviceId);
      }
      if (!booking.packageIds.length) missing.push("Confirm artist commitment");
    }
    forecast += Math.max(agreed, paid);
  }
  if (!artistIds.size) {
    for (const serviceId of booking.packageIds) {
      const price = active
        .filter(
          (r) => r.data.type === "price" && r.data.serviceId === serviceId,
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (price?.data.type === "price" && price.data.cost !== null)
        forecast += price.data.cost;
      else missing.push("Missing direct cost for " + serviceId);
    }
  }
  for (const row of rows) {
    const c = row.data as DataOf<"cost">;
    if (c.amount === null) {
      missing.push(c.name);
      continue;
    }
    if (!c.moneyId) {
      forecast += c.amount;
      if (c.stage === "actual") actual += c.amount;
    }
  }
  for (const bill of bills.filter(
    (r) => r.data.type === "document" && !r.data.performerId,
  )) {
    const cost = billCost(bill);
    forecast += cost;
    actual += cost;
  }
  for (const movement of active.filter(
    (r) =>
      r.status === "posted" &&
      r.data.type === "stock" &&
      r.data.bookingId === booking.id &&
      ["use", "restore_use"].includes(r.data.kind),
  )) {
    const m = movement.data as DataOf<"stock">,
      item = records.find((r) => r.id === m.itemId);
    if (item?.data.type === "item") {
      const used =
        m.quantity * item.data.unitCost * (m.kind === "restore_use" ? -1 : 1);
      forecast += used;
      actual += used;
    }
  }
  const invoices = active.filter(
      (r) =>
        r.status === "posted" &&
        r.data.type === "document" &&
        r.data.bookingId === booking.id &&
        r.data.kind === "invoice",
    ),
    credits = active.filter(
      (r) =>
        r.status === "posted" &&
        r.data.type === "document" &&
        r.data.bookingId === booking.id &&
        r.data.kind === "credit",
    );
  const invoicedGross = invoices.reduce(
      (n, r) => n + (r.totals?.total ?? 0),
      0,
    ),
    net =
      invoices.reduce((n, r) => n + (r.totals?.net ?? 0), 0) -
      credits.reduce((n, r) => n + (r.totals?.net ?? 0), 0);
  const taxKnown =
    !!quote && invoicedGross === quote.amount && invoices.length > 0;
  if (booking.requestedServices?.length && !rows.length)
    missing.push("Confirm requested guest service costs");
  if (!quote) missing.push("Customer price not agreed");
  return {
    bookingId: booking.id,
    customerTotal: quote?.amount ?? null,
    netSales: taxKnown ? net : null,
    actualCost: checkedMoney(actual),
    forecastCost: checkedMoney(forecast),
    contribution: taxKnown ? net - forecast : null,
    provisionalContribution: quote ? quote.amount - forecast : null,
    margin: taxKnown && net > 0 ? ((net - forecast) / net) * 100 : null,
    missing: [...new Set(missing)],
    taxKnown,
  };
}
function accountsForForecast(records: FinanceRecord[], id: string) {
  if (!id) return "expense";
  return (
    (records.find((r) => r.id === id)?.data as DataOf<"account"> | undefined)
      ?.category ??
    ([
      "cash",
      "bank",
      "whish",
      "input_vat",
      "advances",
      "receivable",
      "inventory",
      "equipment",
      "accumulated_depreciation",
    ].includes(id)
      ? "asset"
      : "expense")
  );
}
