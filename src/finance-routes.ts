import { randomUUID } from "node:crypto";
import type { Express, Request } from "express";
import express from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import type { Booking, MoneyEntry, Package, User } from "./models.js";
import { requireThat } from "./domain.js";
import { userCanStaffAction } from "./staff-permissions.js";
import { writeRoutes } from "./write-routes.js";
import {
  financeInput,
  accountsFor,
  systemAccounts,
  type FinanceRecord,
  type Journal,
  type DataOf,
} from "./finance-model.js";
import {
  documentTotals,
  documentBalance,
  payrollTotal,
  stockState,
  validateJournal,
  eventCostForecast,
  ledgerBalances,
  checkedMoney,
} from "./finance-math.js";
import { guestServiceNames } from "./guest-services.js";
import { DateTime } from "luxon";

const payrollType = (type: string) =>
  ["employee", "payroll", "work"].includes(type);
const payrollAllowed = (user: User) => userCanStaffAction(user, "payroll");
const payrollAccount = (id: string) =>
  [
    "salary_payable",
    "salary_tax",
    "social",
    "advances",
    "payroll_cost",
  ].includes(id);
const recordDate = (r: FinanceRecord) => ("date" in r.data ? r.data.date : "");
const text = z.string().trim().min(4).max(500);
const html = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function publicFinancePrices(store: Store, bid: string) {
  return (await store.all<FinanceRecord>(bid, "finance"))
    .filter((r) => r.data.type === "price" && r.publishedAt && !r.archived)
    .map((r) => {
      const p = r.data as DataOf<"price">;
      return {
        serviceId: p.serviceId,
        priceMode: p.priceMode,
        price: r.totals?.total ?? p.salePrice,
        inclusive: true,
        taxApplied: !!p.taxId,
      };
    });
}
export function financeRoutes(app: Express, store: Store) {
  const writes = writeRoutes(app, store);
  const all = (bid: string) => store.all<FinanceRecord>(bid, "finance");
  const owned = async (req: Request, id: string) => {
    const r = await store.get<FinanceRecord>(req.business.id, "finance", id);
    requireThat(r, "Financial record not found.", 404);
    return r!;
  };
  const access = (req: Request, type = "") => {
    requireThat(
      userCanStaffAction(req.user, "money"),
      "Accounting access required.",
      403,
    );
    if (payrollType(type))
      requireThat(
        payrollAllowed(req.user),
        "Payroll permission required.",
        403,
      );
  };
  const recordAccess = async (req: Request, r: FinanceRecord) => {
    access(req, r.data.type);
    if (
      r.data.type === "journal" &&
      r.data.lines.some((l) => payrollAccount(l.accountId))
    )
      access(req, "payroll");
    if (r.data.type === "payment") {
      const d = r.data;
      const target = d.documentId
        ? await store.get<FinanceRecord>(
            req.business.id,
            "finance",
            d.documentId,
          )
        : undefined;
      if (d.employeeId || target?.data.type === "payroll")
        access(req, "payroll");
    }
  };
  const save = async (
    req: Request,
    r: FinanceRecord,
    old: FinanceRecord | undefined,
    action: string,
  ) => {
    r.revision = (old?.revision ?? 0) + 1;
    r.updatedAt = new Date().toISOString();
    await store.put(req.business.id, "finance", r);
    await store.audit(
      req.business.id,
      req.user.email,
      "finance." + action,
      r.id,
      old ?? null,
      r,
    );
    return r;
  };
  const openDate = (records: FinanceRecord[], date: string) => {
    const closed = records
      .filter((r) => r.data.type === "close" && !r.archived)
      .map((r) => (r.data as DataOf<"close">).through)
      .sort()
      .at(-1);
    requireThat(
      !closed || date > closed,
      "This accounting period is closed. Use a later correction date.",
      409,
    );
  };
  const journal = async (
    req: Request,
    r: FinanceRecord,
    lines: Journal["lines"],
    date: string,
    reversalOf?: string,
  ) => {
    validateJournal(lines);
    const accounts = accountsFor(await all(req.business.id));
    requireThat(
      lines.every((l) =>
        accounts.some(
          (a) => a.id === l.accountId && (a.active || !!reversalOf),
        ),
      ),
      "Choose active ledger accounts.",
    );
    const related =
      r.data.type === "payment" && r.data.documentId
        ? await store.get<FinanceRecord>(
            req.business.id,
            "finance",
            r.data.documentId,
          )
        : undefined;
    const entry: Journal = {
      id: randomUUID(),
      sourceId: r.id,
      date,
      memo: r.data.name,
      payroll:
        payrollType(r.data.type) ||
        related?.data.type === "payroll" ||
        lines.some((l) =>
          [
            "salary_payable",
            "salary_tax",
            "social",
            "advances",
            "payroll_cost",
          ].includes(l.accountId),
        ),
      lines,
      createdAt: new Date().toISOString(),
      ...(reversalOf ? { reversalOf } : {}),
    };
    await store.put(req.business.id, "financeJournal", entry);
    return entry;
  };
  app.get("/api/manage/finance", async (req, res) => {
    access(req);
    const records = await all(req.business.id),
      canPayroll = payrollAllowed(req.user);
    const protectedIds = new Set(
      records.filter((r) => payrollType(r.data.type)).map((r) => r.id),
    );
    const visible = records.filter(
      (r) =>
        canPayroll ||
        (!payrollType(r.data.type) &&
          !(
            r.data.type === "journal" &&
            r.data.lines.some((l) => payrollAccount(l.accountId))
          ) &&
          !(
            r.data.type === "payment" &&
            (r.data.employeeId || protectedIds.has(r.data.documentId))
          )),
    );
    const journals = (
      await store.all<Journal>(req.business.id, "financeJournal")
    ).filter((j) => canPayroll || !j.payroll);
    const money = await store.all<MoneyEntry>(req.business.id, "money"),
      packages = await store.all<Package>(req.business.id, "packages"),
      plans = await store.all<import("./act-plans.js").ActPlan>(
        req.business.id,
        "actPlans",
      );
    const attachmentRows = await store.db
      .prepare(
        "SELECT id,json_extract(data,'$.recordId') AS recordId,json_extract(data,'$.name') AS name,json_extract(data,'$.mime') AS mime FROM records WHERE business_id=? AND kind='financeAttachment'",
      )
      .all(req.business.id);
    const attachments = attachmentRows
      .map((r) => ({
        id: String(r.id),
        recordId: String(r.recordId),
        name: String(r.name),
        mime: String(r.mime),
      }))
      .filter((a) => visible.some((r) => r.id === a.recordId));
    const forecasts = (
      await store.all<Booking>(req.business.id, "bookings")
    ).map((booking) =>
      eventCostForecast(
        booking,
        money,
        visible,
        packages,
        plans.find((p) => p.id === booking.id),
      ),
    );
    res.set("Cache-Control", "private, no-store").json({
      forecasts,
      records: visible,
      journals,
      accounts: accountsFor(visible),
      attachments,
      canPayroll,
      currency: req.business.currency,
      ledgerScope:
        "New posted documents and journals only. Legacy records are not automatically posted.",
    });
  });
  writes.put("/api/manage/finance/:id", async (req, res) => {
    const input = z
      .object({ revision: z.number().int().min(0), data: financeInput })
      .strict()
      .parse(req.body);
    access(req, input.data.type);
    const key = String(req.params.id),
      systemKey =
        input.data.type === "account" &&
        systemAccounts.some((a) => "account-" + a[0] === key);
    const old =
        key === "new"
          ? undefined
          : systemKey
            ? await store.get<FinanceRecord>(req.business.id, "finance", key)
            : await owned(req, key),
      records = await all(req.business.id),
      data = input.data;
    requireThat(
      input.revision === (old?.revision ?? 0),
      "This record changed on another device. Reload before editing.",
      409,
    );
    requireThat(
      !old || old.data.type === data.type,
      "A record type cannot be changed.",
    );
    if (old) await recordAccess(req, old);
    if (
      data.type === "payment" &&
      (data.employeeId ||
        data.kind === "advance" ||
        records.some(
          (r) => r.id === data.documentId && r.data.type === "payroll",
        ))
    )
      access(req, "payroll");
    requireThat(
      !old || old.status === "draft",
      "Posted records need a reversal/corrected replacement, preserving their history.",
      409,
    );
    if (old?.publishedAt)
      requireThat(
        false,
        "Create a new price version to change a published price. Archive it only after publishing its replacement.",
        409,
      );
    if (data.type === "tax" || data.type === "close" || data.type === "company")
      requireThat(
        ["owner", "admin"].includes(req.user.role),
        "Only the owner can change company/tax rules or close periods.",
        403,
      );
    if (data.type === "company") {
      requireThat(
        !records.some(
          (r) => r.id !== old?.id && !r.archived && r.data.type === "company",
        ),
        "Edit the existing company profile instead of creating another.",
      );
      if (data.vatStatus === "registered")
        requireThat(
          data.vatNumber.length > 0 &&
            data.fiscalNumber.length > 0 &&
            data.address.length > 0,
          "Registered company details need VAT number, fiscal number and address.",
        );
    }
    if (
      data.type === "journal" &&
      data.lines.some((l) => payrollAccount(l.accountId))
    )
      access(req, "payroll");
    if (data.type === "reconciliation") {
      requireThat(
        accountsFor(records).some((a) => a.id === data.accountId && a.cash),
        "Choose a cash/bank/Whish account.",
      );
      if (data.reviewed) {
        const balance =
          ledgerBalances(
            await store.all<Journal>(req.business.id, "financeJournal"),
            "",
            data.date,
          ).find((b) => b.accountId === data.accountId)?.balance ?? 0;
        requireThat(
          balance === data.statementBalance,
          "The statement balance differs from the posted ledger. Resolve the difference before marking reviewed.",
        );
      }
    }
    if (data.type === "tax") {
      requireThat(
        !data.effectiveTo || data.effectiveTo >= data.effectiveFrom,
        "Check the tax validity dates.",
      );
      if (old)
        requireThat(
          !records.some(
            (r) =>
              r.status === "posted" &&
              r.data.type === "document" &&
              r.data.lines.some((l) => l.taxId === old.id),
          ),
          "This tax code was used. Create a new dated version.",
          409,
        );
    }
    if (data.type === "account") {
      requireThat(
        !data.code ||
          !records.some(
            (record) =>
              record.id !== old?.id &&
              record.data.type === "account" &&
              record.data.code?.toLowerCase() === data.code.toLowerCase(),
          ),
        "This account code is already assigned. Use a unique code or edit its existing account.",
      );
      requireThat(
        !data.cash || data.category === "asset",
        "Cash accounts must be assets.",
      );
      const sys = systemAccounts.find((a) => "account-" + a[0] === key);
      if (sys)
        requireThat(
          data.category === sys[2] && data.cash === sys[3],
          "Keep the system account category and cash setting.",
        );
      if (old) {
        const used = (
          await store.all<Journal>(req.business.id, "financeJournal")
        ).some((j) => j.lines.some((l) => l.accountId === key));
        requireThat(
          !used ||
            (old.data.type === "account" &&
              old.data.category === data.category &&
              old.data.cash === data.cash),
          "Used account classifications cannot change.",
        );
      }
    }
    const bookingId = "bookingId" in data ? data.bookingId : "";
    if (bookingId)
      requireThat(
        await store.get(req.business.id, "bookings", bookingId),
        "Choose an event belonging to this business.",
      );
    if (data.type === "rate" || data.type === "price") {
      const packages = await store.all<Package>(req.business.id, "packages");
      requireThat(
        packages.some((p) => p.id === data.serviceId) ||
          guestServiceNames(
            req.business.otherShowNames ?? [],
            req.business.hiddenGuestServices ?? [],
        req.business.slug,
          ).includes(data.serviceId),
        "Choose an existing service.",
      );
      if (data.type === "rate") {
        requireThat(
          await store.get(req.business.id, "performers", data.performerId),
          "Choose an artist belonging to this business.",
        );
        requireThat(
          !data.effectiveTo || data.effectiveTo >= data.effectiveFrom,
          "Check rate dates.",
        );
      }
      if (data.type === "price" && data.taxId)
        requireThat(
          records.some(
            (r) =>
              r.id === data.taxId &&
              r.data.type === "tax" &&
              !r.archived &&
              r.data.reviewed,
          ),
          "Choose a reviewed tax code.",
        );
    }
    if (data.type === "document") {
      requireThat(
        !data.dueDate || data.dueDate >= data.date,
        "Due date must not precede the document date.",
      );
      if (data.partyId)
        requireThat(
          records.some(
            (r) =>
              r.id === data.partyId && r.data.type === "party" && !r.archived,
          ),
          "Choose an active supplier/partner.",
        );
      if (data.kind === "bill")
        requireThat(!!data.partyId, "Supplier bills need a supplier.");
      if (data.kind === "credit")
        requireThat(!!data.originalId, "Choose the original posted invoice.");
      if (data.performerId) {
        const booking = await store.get<Booking>(
          req.business.id,
          "bookings",
          data.bookingId,
        );
        requireThat(
          data.kind === "bill" &&
            booking?.performerIds.includes(data.performerId),
          "Artist bills need the assigned artist and event.",
        );
      }
      documentTotals(data, records);
    }
    if (data.type === "payroll" || data.type === "work")
      requireThat(
        records.some(
          (r) =>
            r.id === data.employeeId &&
            r.data.type === "employee" &&
            !r.archived,
        ),
        "Choose an active employee.",
      );
    if (data.type === "payroll") {
      payrollTotal(data);
      requireThat(
        !records.some(
          (r) =>
            r.id !== old?.id &&
            r.status !== "reversed" &&
            !r.archived &&
            r.data.type === "payroll" &&
            r.data.employeeId === data.employeeId &&
            r.data.period === data.period,
        ),
        "A payroll run already exists for this employee and month.",
        409,
      );
    }
    if (data.type === "employee")
      requireThat(
        !data.endDate || data.endDate >= data.startDate,
        "Check employment dates.",
      );
    if (data.type === "work")
      requireThat(
        !data.toDate || data.toDate >= data.date,
        "Check work dates.",
      );
    if (data.type === "obligation")
      requireThat(
        data.to >= data.from && data.dueDate >= data.to,
        "Check the obligation period and due date.",
      );
    if (data.type === "item") {
      checkedMoney(data.openingQuantity * data.unitCost);
      requireThat(
        !data.ledgerTracked || data.kind === "consumable",
        "Automatic stock cost posting is for consumables. Equipment depreciation/disposal needs reviewed journal entries.",
      );
      if (old)
        requireThat(
          !records.some(
            (r) =>
              r.status === "posted" &&
              r.data.type === "stock" &&
              r.data.itemId === old.id,
          ) ||
            (old.data.type === "item" &&
              data.openingQuantity === old.data.openingQuantity &&
              data.unitCost === old.data.unitCost &&
              data.kind === old.data.kind &&
              data.ledgerTracked === old.data.ledgerTracked),
          "Used inventory opening values are fixed. Record a movement or a new item version.",
        );
    }
    if (data.type === "cost") {
      if (data.performerId)
        requireThat(
          await store.get(req.business.id, "performers", data.performerId),
          "Choose an existing artist.",
        );
      if (data.moneyId) {
        const entry = await store.get<MoneyEntry>(
          req.business.id,
          "money",
          data.moneyId,
        );
        requireThat(
          entry &&
            entry.kind === "expense" &&
            entry.bookingId === data.bookingId &&
            entry.amount === data.amount,
          "Linked actual expense must match the event and amount.",
        );
        requireThat(
          !records.some(
            (r) =>
              r.id !== old?.id &&
              !r.archived &&
              r.data.type === "cost" &&
              r.data.moneyId === data.moneyId,
          ),
          "That expense is already linked.",
        );
      }
    }
    if (data.type === "settlement") {
      requireThat(
        records.some((r) => r.id === data.partyId && r.data.type === "party"),
        "Choose a partner.",
      );
      requireThat(
        data.commission + data.partnerAmount <= data.bookingValue &&
          data.paid <= data.partnerAmount,
        "Check commission, partner amount and payments.",
      );
    }
    const now = new Date().toISOString();
    const record: FinanceRecord = {
      ...old,
      id: old?.id ?? (systemKey ? key : randomUUID()),
      revision: 0,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      archived: false,
      status: "draft",
      currency: old?.currency ?? req.business.currency,
      data,
    };
    if (data.type === "price") {
      const pack = await store.get<Package>(
        req.business.id,
        "packages",
        data.serviceId,
      );
      if (pack)
        record.packageBaseline = {
          price: pack.price,
          priceMode: pack.priceMode,
        };
    }
    if (data.type === "document") record.totals = documentTotals(data, records);
    if (data.type === "payroll") record.netPay = payrollTotal(data).net;
    res.json(await save(req, record, old, old ? "edited" : "created"));
  });
  writes.post("/api/manage/finance/:id/archive", async (req, res) => {
    const old = await owned(req, String(req.params.id));
    await recordAccess(req, old);
    const input = z
      .object({ revision: z.number().int(), archived: z.boolean() })
      .strict()
      .parse(req.body);
    requireThat(
      old.revision === input.revision,
      "This record changed. Reload first.",
      409,
    );
    requireThat(
      old.status === "draft" && !old.publishedAt,
      "Posted/published records must retain their history. Reverse or replace them.",
      409,
    );
    if (
      old.data.type === "close" ||
      old.data.type === "tax" ||
      old.data.type === "company"
    )
      requireThat(
        ["owner", "admin"].includes(req.user.role),
        "Owner access required.",
        403,
      );
    res.json(
      await save(
        req,
        { ...old, archived: input.archived },
        old,
        input.archived ? "archived" : "restored",
      ),
    );
  });
  writes.post("/api/manage/finance/:id/publish", async (req, res) => {
    access(req);
    requireThat(
      userCanStaffAction(req.user, "catalog"),
      "Catalogue editing permission required to publish prices.",
      403,
    );
    const old = await owned(req, String(req.params.id)),
      input = z.object({ revision: z.number().int() }).strict().parse(req.body);
    requireThat(
      old.revision === input.revision &&
        !old.archived &&
        !old.publishedAt &&
        old.data.type === "price",
      "Reload this draft price before publishing.",
      409,
    );
    const data = old.data as DataOf<"price">,
      records = await all(req.business.id);
    if (data.taxId) {
      const company = records.find(
        (r) => r.data.type === "company" && !r.archived,
      )?.data;
      requireThat(
        company?.type === "company" &&
          company.reviewed &&
          company.vatStatus === "registered",
        "Complete the reviewed registered company VAT profile before publishing VAT prices.",
      );
    }
    if (data.taxId) {
      const tax = records.find((r) => r.id === data.taxId);
      requireThat(
        tax?.data.type === "tax" && tax.data.reviewed && !tax.archived,
        "Review the applicable tax code first.",
      );
    }
    const publishedTotal = documentTotals(
      {
        type: "document",
        kind: "invoice",
        name: data.name,
        notes: "",
        partyId: "",
        bookingId: "",
        originalId: "",
        date: DateTime.now().setZone(req.business.timezone).toISODate()!,
        dueDate: "",
        reference: "",
        customerAddress: "",
        performerId: "",
        revenueTreatment: "deferred",
        performanceConfirmed: false,
        lines: [
          {
            description: data.name,
            quantity: 1,
            unitPrice: data.salePrice,
            discount: 0,
            taxId: data.taxId,
            inclusive: data.inclusive,
            recoverable: false,
            accountId: "",
          },
        ],
      },
      records,
    );
    if (data.priceMode !== "quote") {
      requireThat(
        publishedTotal.net > 0,
        "Enter a positive selling price or use quote required.",
      );
      const company = records.find(
        (r) => r.data.type === "company" && !r.archived,
      )?.data;
      const target =
        company?.type === "company" ? (company.minimumMarginBps ?? 0) : 0;
      if (
        data.cost !== null &&
        (publishedTotal.net < data.cost ||
          (publishedTotal.net - data.cost) * 10000 <
            publishedTotal.net * target)
      ) {
        requireThat(
          data.approvalReason.trim().length >= 8,
          "Record why this price is approved below cost / the target margin before publishing.",
        );
      }
    }
    const pack = await store.get<Package>(
      req.business.id,
      "packages",
      data.serviceId,
    );
    if (pack) {
      requireThat(
        pack.price === old.packageBaseline?.price &&
          pack.priceMode === old.packageBaseline.priceMode,
        "This catalogue price changed. Save a fresh draft before publishing.",
        409,
      );
      const next = {
        ...pack,
        price: publishedTotal.total,
        priceMode: data.priceMode,
      };
      await store.put(req.business.id, "packages", next);
      await store.audit(
        req.business.id,
        req.user.email,
        "package.price-published",
        pack.id,
        pack,
        next,
      );
    }
    for (const previous of records.filter(
      (r) =>
        r.data.type === "price" &&
        r.data.serviceId === data.serviceId &&
        r.publishedAt &&
        !r.archived,
    ))
      await save(
        req,
        { ...previous, archived: true },
        previous,
        "price.superseded",
      );
    res.json(
      await save(
        req,
        {
          ...old,
          totals: publishedTotal,
          publishedAt: new Date().toISOString(),
        },
        old,
        "price.published",
      ),
    );
  });
  writes.post("/api/manage/finance/:id/post", async (req, res) => {
    const old = await owned(req, String(req.params.id));
    await recordAccess(req, old);
    const input = z
      .object({ revision: z.number().int() })
      .strict()
      .parse(req.body);
    requireThat(
      old.revision === input.revision &&
        old.status === "draft" &&
        !old.archived,
      "This draft changed or was already posted. Reload first.",
      409,
    );
    const records = await all(req.business.id),
      data = old.data,
      next = { ...old };
    let lines: Journal["lines"] = [];
    const dr = (accountId: string, n: number) => {
        if (n) lines.push({ accountId, debit: n, credit: 0 });
      },
      cr = (accountId: string, n: number) => {
        if (n) lines.push({ accountId, debit: 0, credit: n });
      };
    const issuer = records.find(
      (r) => !r.archived && r.data.type === "company",
    )?.data;
    if (issuer?.type === "company") next.issuer = structuredClone(issuer);
    openDate(records, recordDate(old));
    if (data.type === "document") {
      next.totals = documentTotals(data, records);
      const t = next.totals;
      requireThat(t.total > 0, "Document total must be positive.");
      const company = records.find(
        (r) => r.data.type === "company" && !r.archived,
      )?.data;
      if (company?.type === "company") next.issuer = structuredClone(company);
      const party = records.find((r) => r.id === data.partyId)?.data;
      if (party?.type === "party") next.partySnapshot = structuredClone(party);
      if (t.tax > 0 && data.kind !== "bill")
        requireThat(
          company?.type === "company" &&
            company.reviewed &&
            company.vatStatus === "registered" &&
            data.customerAddress.length > 0,
          "VAT sales documents need reviewed company registration details and the customer address.",
        );
      const accounts = accountsFor(records);
      requireThat(
        data.lines.every(
          (l) =>
            !l.accountId ||
            accounts.some(
              (a) =>
                a.id === l.accountId &&
                a.active &&
                (data.kind === "bill"
                  ? ["asset", "expense"].includes(a.category)
                  : a.category === "income"),
            ),
        ),
        "Choose an active income account for sales, or an expense/asset account for purchases.",
      );
      if (data.kind === "invoice") {
        requireThat(
          data.revenueTreatment !== "earned" || data.performanceConfirmed,
          "Confirm the service was delivered before recognizing earned revenue.",
        );
        dr("receivable", t.total);
        data.lines.forEach((l, i) =>
          cr(
            data.revenueTreatment === "deferred"
              ? "deferred_revenue"
              : l.accountId || "sales",
            t.lines[i].net,
          ),
        );
        cr("output_vat", t.tax);
      }
      if (data.kind === "credit") {
        const original = records.find(
          (r) =>
            r.id === data.originalId &&
            r.status === "posted" &&
            r.data.type === "document" &&
            r.data.kind === "invoice",
        );
        requireThat(original, "Choose a posted original invoice.");
        requireThat(
          original!.data.type === "document" &&
            original!.data.bookingId === data.bookingId,
          "Use the same event as the original invoice.",
        );
        const prior = records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "document" &&
              r.data.kind === "credit" &&
              r.data.originalId === original!.id,
          )
          .reduce((n, r) => n + (r.totals?.total ?? 0), 0);
        const priorTax = records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "document" &&
              r.data.kind === "credit" &&
              r.data.originalId === original!.id,
          )
          .reduce((n, r) => n + (r.totals?.tax ?? 0), 0);
        requireThat(
          t.total + prior <= original!.totals!.total,
          "Credits exceed the original invoice.",
        );
        // Tax treatment must match the original rather than inventing a new tax credit.
        requireThat(
          data.lines.every(
            (l, i) =>
              original!.data.type === "document" &&
              l.taxId === original!.data.lines[i]?.taxId &&
              l.inclusive === original!.data.lines[i]?.inclusive &&
              l.accountId === original!.data.lines[i]?.accountId,
          ) && t.tax + priorTax <= original!.totals!.tax,
          "Credit tax treatment must match the original invoice.",
        );
        next.creditedDeferred =
          original!.data.type === "document" &&
          original!.data.revenueTreatment === "deferred" &&
          !original!.recognizedDate;
        data.lines.forEach((l, i) =>
          dr(
            next.creditedDeferred ? "deferred_revenue" : l.accountId || "sales",
            t.lines[i].net,
          ),
        );
        dr("output_vat", t.tax);
        cr("receivable", t.total);
      }
      if (data.kind === "bill") {
        let recoverable = 0;
        data.lines.forEach((l, i) => {
          if (l.recoverable) recoverable += t.lines[i].tax;
          dr(
            l.accountId || "direct_cost",
            t.lines[i].net + (l.recoverable ? 0 : t.lines[i].tax),
          );
        });
        if (recoverable)
          requireThat(
            company?.type === "company" &&
              company.reviewed &&
              company.vatStatus === "registered",
            "Review registered company VAT eligibility before claiming purchase VAT.",
          );
        dr("input_vat", recoverable);
        cr("payable", t.total);
      }
      if (data.bookingId && data.kind === "invoice") {
        const booking = await store.get<Booking>(
          req.business.id,
          "bookings",
          data.bookingId,
        );
        const quote = booking?.quotes.find(
          (q) => q.id === booking.acceptedQuoteId,
        );
        requireThat(
          quote && ["confirmed", "completed"].includes(booking!.status),
          "Event invoices require a confirmed/completed event with an accepted quote.",
        );
        requireThat(
          data.revenueTreatment !== "earned" || booking!.status === "completed",
          "Defer revenue until this event is marked completed.",
        );
        const issued = records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "document" &&
              r.data.kind === "invoice" &&
              r.data.bookingId === data.bookingId,
          )
          .reduce((n, r) => n + (r.totals?.total ?? 0), 0);
        requireThat(
          issued + t.total <= quote!.amount,
          "Invoices exceed the accepted event total. Amend the customer agreement first.",
        );
      }
      if (data.kind === "bill" && data.reference)
        requireThat(
          !records.some(
            (r) =>
              r.status === "posted" &&
              r.data.type === "document" &&
              r.data.kind === "bill" &&
              r.data.partyId === data.partyId &&
              r.data.reference === data.reference,
          ),
          "This supplier reference is already posted.",
          409,
        );
      const sequence = (await store.get<{ id: string; count: number }>(
        req.business.id,
        "financeCounter",
        data.kind,
      )) ?? { id: data.kind, count: 0 };
      sequence.count++;
      await store.put(req.business.id, "financeCounter", sequence);
      next.number = `${data.kind === "invoice" ? "INV" : data.kind === "bill" ? "BILL" : "CN"}-${String(sequence.count).padStart(6, "0")}`;
    } else if (data.type === "payroll") {
      requireThat(
        data.reviewed,
        "Review payroll deductions and contribution amounts first.",
      );
      const total = payrollTotal(data);
      next.netPay = total.net;
      requireThat(
        !records.some(
          (r) =>
            r.id !== old.id &&
            r.status === "posted" &&
            r.data.type === "payroll" &&
            r.data.employeeId === data.employeeId &&
            r.data.period === data.period,
        ),
        "Payroll is already posted for this month.",
      );
      const advances =
        records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "payment" &&
              r.data.kind === "advance" &&
              r.data.employeeId === data.employeeId,
          )
          .reduce((n, r) => n + (r.data as DataOf<"payment">).amount, 0) -
        records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "payroll" &&
              r.data.employeeId === data.employeeId,
          )
          .reduce(
            (n, r) => n + (r.data as DataOf<"payroll">).advanceRecovery,
            0,
          );
      requireThat(
        data.advanceRecovery <= advances,
        "Advance recovery exceeds recorded employee advances.",
      );
      dr("payroll_cost", total.employerCost);
      cr("salary_payable", total.net);
      cr("salary_tax", data.tax);
      cr("social", data.social + data.employerSocial);
      cr("advances", data.advanceRecovery);
    } else if (data.type === "journal") {
      lines = data.lines;
      requireThat(
        payrollAllowed(req.user) ||
          !lines.some((l) =>
            [
              "salary_payable",
              "salary_tax",
              "social",
              "advances",
              "payroll_cost",
            ].includes(l.accountId),
          ),
        "Payroll permission required for these accounts.",
        403,
      );
    } else if (data.type === "payment") {
      requireThat(data.amount > 0, "Payment amount must be positive.");
      const accounts = accountsFor(records);
      const key = "payment-" + data.kind,
        sequence = (await store.get<{ id: string; count: number }>(
          req.business.id,
          "financeCounter",
          key,
        )) ?? { id: key, count: 0 };
      sequence.count++;
      await store.put(req.business.id, "financeCounter", sequence);
      next.number =
        { receipt: "RCPT", payment: "PAY", transfer: "TRF", advance: "ADV" }[
          data.kind
        ] +
        "-" +
        String(sequence.count).padStart(6, "0");
      requireThat(
        accounts.some((a) => a.id === data.accountId && a.cash && a.active),
        "Choose an active cash/bank/Whish account.",
      );
      if (data.kind === "transfer") {
        requireThat(
          data.toAccountId !== data.accountId &&
            accounts.some(
              (a) => a.id === data.toAccountId && a.cash && a.active,
            ),
          "Choose a different active cash account.",
        );
        dr(data.toAccountId, data.amount);
        cr(data.accountId, data.amount);
        requireThat(
          !data.legacyMoneyId,
          "Internal transfers cannot link event payments.",
        );
      } else if (data.kind === "advance") {
        requireThat(
          payrollAllowed(req.user),
          "Payroll permission required.",
          403,
        );
        requireThat(
          records.some(
            (r) =>
              r.id === data.employeeId &&
              r.data.type === "employee" &&
              !r.archived,
          ),
          "Choose an employee.",
        );
        dr("advances", data.amount);
        cr(data.accountId, data.amount);
        requireThat(
          !data.legacyMoneyId,
          "Employee advances cannot link event payments.",
        );
      } else {
        const doc = records.find(
          (r) =>
            r.id === data.documentId &&
            r.status === "posted" &&
            (r.data.type === "document" || r.data.type === "payroll"),
        );
        requireThat(
          doc,
          "Choose a posted invoice, bill, credit or payroll run.",
        );
        if (doc!.data.type === "payroll") access(req, "payroll");
        const kind = doc!.data.type === "document" ? doc!.data.kind : "payroll";
        requireThat(
          (data.kind === "receipt") === (kind === "invoice"),
          "Receipts settle invoices; outgoing payments settle bills, credits or payroll.",
        );
        requireThat(
          data.amount <= documentBalance(doc!, records).balance,
          "Payment exceeds the outstanding document balance.",
        );
        if (kind === "invoice") {
          dr(data.accountId, data.amount);
          cr("receivable", data.amount);
        } else {
          dr(
            kind === "bill"
              ? "payable"
              : kind === "credit"
                ? "receivable"
                : "salary_payable",
            data.amount,
          );
          cr(data.accountId, data.amount);
        }
        if (doc!.data.type === "document" && doc!.data.bookingId) {
          const booking = await store.get<Booking>(
            req.business.id,
            "bookings",
            doc!.data.bookingId,
          );
          requireThat(booking, "Event not found.");
          const moneyKind =
            kind === "invoice"
              ? "payment"
              : kind === "credit"
                ? "refund"
                : "expense";
          if (data.legacyMoneyId) {
            const existing = await store.get<MoneyEntry>(
              req.business.id,
              "money",
              data.legacyMoneyId,
            );
            requireThat(
              existing &&
                existing.bookingId === booking!.id &&
                existing.kind === moneyKind &&
                existing.amount === data.amount,
              "Existing event transaction must match the amount, event and payment type.",
            );
            requireThat(
              !records.some(
                (r) =>
                  r.status === "posted" &&
                  r.legacyMoneyId === data.legacyMoneyId,
              ),
              "That event payment is already linked.",
            );
            next.legacyMoneyId = data.legacyMoneyId;
            next.legacyImported = true;
          } else {
            const m: MoneyEntry = {
              id: randomUUID(),
              bookingId: booking!.id,
              kind: moneyKind,
              amount: data.amount,
              category: "accounting",
              note: "Accounting " + (doc!.number ?? doc!.data.name),
              date: data.date,
              ...(doc!.data.performerId
                ? { performerId: doc!.data.performerId }
                : {}),
            };
            await store.put(req.business.id, "money", m);
            await store.audit(
              req.business.id,
              req.user.email,
              "money.finance-recorded",
              m.id,
              null,
              m,
            );
            next.legacyMoneyId = m.id;
          }
        } else
          requireThat(
            !data.legacyMoneyId,
            "Only event documents can link legacy event transactions.",
          );
      }
    } else if (data.type === "stock") {
      const item = records.find(
        (r) => r.id === data.itemId && r.data.type === "item" && !r.archived,
      );
      requireThat(item, "Choose an active inventory item.");
      const stock = stockState(item!, records);
      if (data.kind === "return")
        requireThat(
          stock.out >= data.quantity,
          "Return exceeds equipment currently out.",
        );
      if (
        ["out", "use", "damage"].includes(data.kind) ||
        (data.kind === "adjustment" && data.adjustmentSign === "remove")
      )
        requireThat(
          stock.onHand >= data.quantity,
          "Not enough stock available.",
        );
      requireThat(
        item!.data.type === "item" &&
          (data.kind !== "use" || item!.data.kind === "consumable"),
        "Use consumables; check reusable equipment out and back in.",
      );
      if (item!.data.type === "item")
        checkedMoney((stock.onHand + data.quantity) * item!.data.unitCost);
      if (data.kind === "restore_use") {
        const original = records.find(
          (r) =>
            r.id === data.reversesId &&
            r.status === "posted" &&
            r.data.type === "stock" &&
            r.data.kind === "use" &&
            r.data.itemId === data.itemId &&
            r.data.bookingId === data.bookingId,
        );
        const corrected = records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "stock" &&
              r.data.kind === "restore_use" &&
              r.data.reversesId === data.reversesId,
          )
          .reduce((n, r) => n + (r.data as DataOf<"stock">).quantity, 0);
        requireThat(
          original?.data.type === "stock" &&
            corrected + data.quantity <= original.data.quantity,
          "Choose an original use movement and do not restore more than was consumed.",
        );
      }
      if (data.kind === "return") {
        const eventOut = records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "stock" &&
              r.data.itemId === data.itemId &&
              r.data.bookingId === data.bookingId,
          )
          .reduce((n, r) => {
            const m = r.data as DataOf<"stock">;
            return (
              n +
              (m.kind === "out"
                ? m.quantity
                : m.kind === "return"
                  ? -m.quantity
                  : 0)
            );
          }, 0);
        requireThat(
          eventOut >= data.quantity,
          "Return equipment against the event it was checked out to.",
        );
      }
      if (
        item!.data.type === "item" &&
        item!.data.ledgerTracked &&
        data.kind === "use"
      ) {
        const value = data.quantity * item!.data.unitCost;
        requireThat(
          Number.isSafeInteger(value),
          "Inventory value exceeds supported precision.",
        );
        const balance =
          ledgerBalances(
            await store.all<Journal>(req.business.id, "financeJournal"),
            "",
            data.date,
          ).find((b) => b.accountId === "inventory")?.balance ?? 0;
        requireThat(
          balance >= value,
          "Post inventory opening balances/purchases to the inventory account before recording this consumption.",
        );
        dr("direct_cost", value);
        cr("inventory", value);
      }
      if (
        item!.data.type === "item" &&
        item!.data.ledgerTracked &&
        data.kind === "restore_use"
      ) {
        const value = data.quantity * item!.data.unitCost;
        dr("inventory", value);
        cr("direct_cost", value);
      }
      if (
        item!.data.type === "item" &&
        item!.data.ledgerTracked &&
        (data.kind === "damage" || data.kind === "adjustment")
      ) {
        const value = data.quantity * item!.data.unitCost;
        if (data.kind === "adjustment" && data.adjustmentSign === "add") {
          dr("inventory", value);
          cr("stock_variance", value);
        } else {
          const balance =
            ledgerBalances(
              await store.all<Journal>(req.business.id, "financeJournal"),
              "",
              data.date,
            ).find((b) => b.accountId === "inventory")?.balance ?? 0;
          requireThat(
            balance >= value,
            "Inventory write-off exceeds posted inventory value.",
          );
          dr("stock_variance", value);
          cr("inventory", value);
        }
      }
    } else
      requireThat(
        false,
        "This record is edited directly and does not need posting.",
      );
    if (lines.length) await journal(req, next, lines, recordDate(old));
    next.status = "posted";
    res.json(await save(req, next, old, "posted"));
  });
  writes.post("/api/manage/finance/:id/recognize", async (req, res) => {
    const old = await owned(req, String(req.params.id));
    await recordAccess(req, old);
    const input = z
        .object({
          revision: z.number().int(),
          date: z.iso.date(),
          reason: text,
        })
        .strict()
        .parse(req.body),
      records = await all(req.business.id);
    requireThat(
      old.revision === input.revision &&
        old.status === "posted" &&
        !old.recognizedDate &&
        old.data.type === "document" &&
        old.data.kind === "invoice" &&
        old.data.revenueTreatment === "deferred",
      "Choose a posted deferred invoice which has not been recognized.",
      409,
    );
    const data = old.data as DataOf<"document">;
    openDate(records, input.date);
    requireThat(
      input.date >= data.date,
      "Recognition cannot precede the invoice.",
    );
    if (data.bookingId) {
      const b = await store.get<Booking>(
        req.business.id,
        "bookings",
        data.bookingId,
      );
      requireThat(
        b?.status === "completed",
        "Complete the event before recognizing revenue.",
      );
    }
    const credits = records.filter(
      (r) =>
        r.status === "posted" &&
        r.data.type === "document" &&
        r.data.kind === "credit" &&
        r.data.originalId === old.id,
    );
    const lines: Journal["lines"] = [];
    let total = 0;
    requireThat(
      credits.every((c) => recordDate(c) <= input.date),
      "Recognition cannot precede existing credit notes.",
    );
    data.lines.forEach((l, i) => {
      const net = old.totals?.lines[i]?.net ?? 0;
      if (net) {
        total += net;
        lines.push({
          accountId: l.accountId || "sales",
          debit: 0,
          credit: net,
        });
      }
    });
    requireThat(total > 0, "No net revenue remains to recognize.");
    lines.unshift({ accountId: "deferred_revenue", debit: total, credit: 0 });
    await journal(req, old, lines, input.date);
    for (const credit of credits.filter((c) => c.creditedDeferred)) {
      if (credit.data.type !== "document") continue;
      const reclass: Journal["lines"] = credit.data.lines
        .map((l, i) => ({
          accountId: l.accountId || "sales",
          debit: credit.totals?.lines[i]?.net ?? 0,
          credit: 0,
        }))
        .filter((l) => l.debit > 0);
      reclass.push({
        accountId: "deferred_revenue",
        debit: 0,
        credit: credit.totals!.net,
      });
      await journal(req, credit, reclass, input.date);
      await save(
        req,
        { ...credit, recognizedDate: input.date },
        credit,
        "credit-revenue-reclassified",
      );
    }
    res.json(
      await save(
        req,
        { ...old, recognizedDate: input.date },
        old,
        "revenue-recognized: " + input.reason,
      ),
    );
  });
  writes.post("/api/manage/finance/:id/reverse", async (req, res) => {
    const old = await owned(req, String(req.params.id));
    await recordAccess(req, old);
    const input = z
      .object({ revision: z.number().int(), date: z.iso.date(), reason: text })
      .strict()
      .parse(req.body);
    requireThat(
      old.revision === input.revision && old.status === "posted",
      "Reload the posted record before reversing.",
      409,
    );
    const records = await all(req.business.id);
    openDate(records, input.date);
    requireThat(
      input.date >= recordDate(old),
      "A reversal cannot precede the original posting date.",
    );
    requireThat(
      old.data.type !== "stock",
      "Reverse inventory with a dated correcting stock movement.",
    );
    requireThat(
      !records.some(
        (r) =>
          r.status === "posted" &&
          ((r.data.type === "payment" && r.data.documentId === old.id) ||
            (r.data.type === "document" && r.data.originalId === old.id)),
      ),
      "Reverse linked payments/credits before the document.",
      409,
    );
    if (old.data.type === "payment" && old.data.kind === "receipt") {
      const parent = old.data.documentId;
      const creditIds = new Set(
        records
          .filter(
            (r) =>
              r.status === "posted" &&
              r.data.type === "document" &&
              r.data.kind === "credit" &&
              r.data.originalId === parent,
          )
          .map((r) => r.id),
      );
      requireThat(
        !records.some(
          (r) =>
            r.status === "posted" &&
            r.data.type === "payment" &&
            creditIds.has(r.data.documentId),
        ),
        "Reverse related credit refunds before reversing the original receipt.",
        409,
      );
    }
    if (old.data.type === "payment") {
      const p = old.data;
      if (
        p.employeeId ||
        records.some((r) => r.id === p.documentId && r.data.type === "payroll")
      )
        access(req, "payroll");
    }
    if (old.data.type === "payment" && old.data.kind === "advance") {
      const employee = old.data.employeeId;
      const remaining = records
        .filter(
          (r) =>
            r.id !== old.id &&
            r.status === "posted" &&
            r.data.type === "payment" &&
            r.data.kind === "advance" &&
            r.data.employeeId === employee,
        )
        .reduce((n, r) => n + (r.data as DataOf<"payment">).amount, 0);
      const recovered = records
        .filter(
          (r) =>
            r.status === "posted" &&
            r.data.type === "payroll" &&
            r.data.employeeId === employee,
        )
        .reduce((n, r) => n + (r.data as DataOf<"payroll">).advanceRecovery, 0);
      requireThat(
        remaining >= recovered,
        "Reverse payroll recovery before reversing this advance.",
      );
    }
    const entries = (
      await store.all<Journal>(req.business.id, "financeJournal")
    ).filter((j) => j.sourceId === old.id && !j.reversalOf);
    requireThat(
      entries.every((j) => j.date <= input.date),
      "A reversal cannot precede recognition or another source posting.",
    );
    for (const j of entries)
      await journal(
        req,
        old,
        j.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.credit,
          credit: l.debit,
        })),
        input.date,
        j.id,
      );
    if (old.legacyMoneyId && !old.legacyImported) {
      const m = await store.get<MoneyEntry>(
        req.business.id,
        "money",
        old.legacyMoneyId,
      );
      if (m) {
        const corrected = {
          ...m,
          amount: 0,
          note: m.note + " · Reversed in Accounting: " + input.reason,
        };
        await store.put(req.business.id, "money", corrected);
        await store.audit(
          req.business.id,
          req.user.email,
          "money.finance-reversed",
          m.id,
          m,
          corrected,
        );
      }
    }
    res.json(
      await save(
        req,
        { ...old, status: "reversed", reversedBy: input.reason },
        old,
        "reversed",
      ),
    );
  });
  app.get("/api/manage/finance/:id/print", async (req, res) => {
    const record = await owned(req, String(req.params.id));
    await recordAccess(req, record);
    requireThat(
      ["document", "payroll", "payment"].includes(record.data.type),
      "Choose a financial document.",
    );
    const d = record.data;
    const money = (n: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: record.currency,
      }).format(n / 100);
    let rows =
      d.type === "document"
        ? d.lines
            .map(
              (l, i) =>
                `<tr><td>${html(l.description)}</td><td>${l.quantity}</td><td>${html(money(l.unitPrice))}</td><td>${html(money(l.discount))}</td><td>${(record.totals?.lines[i]?.rateBps ?? 0) / 100}%</td><td>${html(money(record.totals?.lines[i]?.tax ?? 0))}</td><td>${html(money(record.totals?.lines[i]?.total ?? 0))}</td></tr>`,
            )
            .join("")
        : d.type === "payroll"
          ? Object.entries({
              basic: d.basic,
              allowances: d.allowances,
              overtime: d.overtime,
              salaryTax: d.tax,
              employeeNSSF: d.social,
              advanceRecovery: d.advanceRecovery,
              employerNSSF: d.employerSocial,
              ...payrollTotal(d),
            })
              .map(
                ([k, v]) =>
                  `<tr><td>${html(k)}</td><td>${html(money(v))}</td></tr>`,
              )
              .join("")
          : "";
    if (d.type === "payment")
      rows = `<tr><td>${html(d.kind)}</td><td>${html(money(d.amount))}</td></tr><tr><td>Reference</td><td>${html(d.reference)}</td></tr><tr><td>Account</td><td>${html(accountsFor(await all(req.business.id)).find((a) => a.id === d.accountId)?.name ?? d.accountId)}</td></tr>`;
    res
      .set({
        "Cache-Control": "private, no-store",
        "Content-Type": "text/html; charset=utf-8",
      })
      .send(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${html(record.number ?? d.name)}</title><body><h1>${html(record.issuer?.legalName ?? req.business.name)}</h1><p>${html(record.issuer?.address ?? "Company address not configured")}<br>MOF ${html(record.issuer?.fiscalNumber ?? "not configured")} · VAT ${html(record.issuer?.vatNumber ?? "not configured")} · Company registration ${html(record.issuer?.registrationNumber ?? "not configured")}</p><h2>${html(record.number ?? "DRAFT")} · ${html(d.name)}</h2><p>${html(record.status)} · ${html(recordDate(record))} · ${html(record.currency)}</p>${d.type === "document" ? `<p>Customer / supplier: ${html(d.name)}<br>${html(d.customerAddress || record.partySnapshot?.address || "Address not configured")}<br>Due ${html(d.dueDate)} · Reference ${html(d.reference)}</p>` : ""}<table border="1" cellpadding="10">${d.type === "document" ? "<thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Discount</th><th>VAT rate</th><th>VAT</th><th>Total</th></tr></thead>" : ""}<tbody>${rows}</tbody></table>${record.totals ? `<p>Net ${html(money(record.totals.net))} · VAT ${html(money(record.totals.tax))} · Total ${html(money(record.totals.total))}</p>` : ""}<p>${html(d.notes)}</p><p>${html(record.issuer?.invoiceFooter ?? "")}</p><p>Accounting record. Review company tax details before use as a statutory document. Use your browser’s Print / Save as PDF.</p></body></html>`,
      );
  });
  app.post(
    "/api/manage/finance/:id/attachment",
    express.raw({
      type: ["image/jpeg", "image/png", "application/pdf"],
      limit: "2mb",
    }),
    async (req, res) => {
      const record = await owned(req, String(req.params.id));
      await recordAccess(req, record);
      const mime = String(req.headers["content-type"]).split(";")[0],
        bytes = req.body as Buffer;
      requireThat(
        Buffer.isBuffer(bytes) && bytes.length > 0,
        "Choose a PDF, JPEG or PNG up to 2MB.",
      );
      requireThat(
        (mime === "application/pdf" &&
          bytes.subarray(0, 5).toString() === "%PDF-") ||
          (mime === "image/jpeg" &&
            bytes[0] === 255 &&
            bytes[1] === 216 &&
            bytes[2] === 255) ||
          (mime === "image/png" &&
            bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))),
        "File contents do not match its type.",
      );
      const attachment = {
        id: randomUUID(),
        recordId: record.id,
        name: "Receipt " + new Date().toISOString().slice(0, 10),
        mime,
        data: bytes.toString("base64"),
      };
      await store.transaction(async () => {
        await store.put(req.business.id, "financeAttachment", attachment);
        await store.audit(
          req.business.id,
          req.user.email,
          "finance.attachment-added",
          record.id,
          null,
          { id: attachment.id, bytes: bytes.length, mime },
        );
      });
      res.json({ id: attachment.id });
    },
  );
  app.get("/api/manage/finance-attachment/:id", async (req, res) => {
    access(req);
    const a = await store.get<{
      id: string;
      recordId: string;
      data: string;
      mime: string;
    }>(req.business.id, "financeAttachment", String(req.params.id));
    requireThat(a, "Attachment not found.", 404);
    const r = await owned(req, a!.recordId);
    await recordAccess(req, r);
    res
      .set({
        "Cache-Control": "private, no-store",
        "Content-Type": a!.mime,
        "Content-Disposition": `attachment; filename="receipt.${a!.mime === "application/pdf" ? "pdf" : a!.mime === "image/png" ? "png" : "jpg"}"`,
      })
      .send(Buffer.from(a!.data, "base64"));
  });
}
