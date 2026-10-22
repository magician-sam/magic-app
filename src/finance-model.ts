import { z } from "zod";

const text = z.string().trim().max(2000),
  key = z.string().max(100),
  day = z.iso.date(),
  optionalDay = z.union([day, z.literal("")]);
const amount = z.number().int().min(0).max(100_000_000_00);
const base = { name: text.min(1), notes: text };
const line = z
  .object({
    description: text.min(1),
    quantity: z.number().int().min(1).max(10000),
    unitPrice: amount,
    discount: amount,
    taxId: key,
    inclusive: z.boolean(),
    recoverable: z.boolean(),
    accountId: key.default(""),
  })
  .strict();
export const financeInput = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("account"),
      category: z.enum(["asset", "liability", "equity", "income", "expense"]),
      cash: z.boolean(),
      code: z
        .string()
        .trim()
        .max(40)
        .regex(
          /^$|^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/,
          "Use letters, numbers, dots, underscores or dashes for an account code.",
        )
        .default(""),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("company"),
      legalName: text.min(1),
      address: text,
      fiscalNumber: z.string().max(120),
      vatNumber: z.string().max(120),
      registrationNumber: z.string().max(120),
      nssfNumber: z.string().max(120),
      vatStatus: z.enum(["unreviewed", "unregistered", "registered"]),
      reviewed: z.boolean(),
      invoiceFooter: text,
      minimumMarginBps: z.number().int().min(0).max(9999).default(0),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("reconciliation"),
      accountId: key.min(1),
      date: day,
      statementBalance: z
        .number()
        .int()
        .min(-100_000_000_00)
        .max(100_000_000_00),
      reference: text,
      reviewed: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("tax"),
      rateBps: z.number().int().min(0).max(10000),
      effectiveFrom: day,
      effectiveTo: optionalDay,
      reviewed: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("price"),
      serviceId: key.min(1),
      priceMode: z.enum(["quote", "from", "fixed"]),
      salePrice: amount,
      cost: amount.nullable(),
      taxId: key,
      inclusive: z.boolean(),
      approvalReason: text.default(""),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("rate"),
      serviceId: key.min(1),
      performerId: key.min(1),
      cost: amount,
      unit: z.enum(["show", "hour", "day"]),
      effectiveFrom: day,
      effectiveTo: optionalDay,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("party"),
      relationship: z.enum(["supplier", "partner"]),
      phone: z.string().max(80),
      email: z.union([z.email(), z.literal("")]),
      address: text.default(""),
      taxNumber: z.string().max(120).default(""),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("document"),
      kind: z.enum(["invoice", "bill", "credit"]),
      partyId: key,
      bookingId: key,
      originalId: key,
      date: day,
      dueDate: optionalDay,
      reference: z.string().max(160),
      customerAddress: text.default(""),
      performerId: key.default(""),
      revenueTreatment: z.enum(["deferred", "earned"]).default("deferred"),
      performanceConfirmed: z.boolean().default(false),
      lines: z.array(line).min(1).max(50),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("employee"),
      position: z.string().max(120),
      email: z.union([z.email(), z.literal("")]),
      phone: z.string().max(80),
      startDate: day,
      endDate: optionalDay,
      salary: amount,
      payBasis: z.enum(["monthly", "hourly"]).default("monthly"),
      hourlyRate: amount.default(0),
      taxReference: z.string().max(120),
      socialReference: z.string().max(120),
      contractNotes: text,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("work"),
      employeeId: key.min(1),
      kind: z.enum(["attendance", "leave"]),
      date: day,
      toDate: optionalDay,
      hours: z.number().min(0).max(10000),
      startTime: z
        .union([z.literal(""), z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)])
        .default(""),
      endTime: z
        .union([z.literal(""), z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)])
        .default(""),
      breakMinutes: z.number().int().min(0).max(1440).default(0),
      approved: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("payroll"),
      employeeId: key.min(1),
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      date: day,
      dueDate: optionalDay,
      basic: amount,
      payBasis: z.enum(["monthly", "hourly"]).default("monthly"),
      paidHours: z.number().min(0).max(10000).default(0),
      hourlyRate: amount.default(0),
      workIds: z.array(key.min(1)).max(500).default([]),
      calculationNotes: text.default(""),
      allowances: amount,
      overtime: amount,
      tax: amount,
      social: amount,
      employerSocial: amount,
      advanceRecovery: amount,
      reviewed: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("obligation"),
      kind: z.enum([
        "VAT",
        "salary_tax",
        "NSSF",
        "company_tax",
        "stamp_duty",
        "entertainment",
        "artists_fund",
        "nonresident",
        "other",
      ]),
      from: day,
      to: day,
      dueDate: day,
      amount: amount,
      currency: z.enum(["USD", "LBP"]).default("LBP"),
      status: z.enum(["draft", "reviewed", "filed", "settled"]),
      reference: z.string().max(160),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("item"),
      kind: z.enum(["consumable", "equipment", "fixed_asset"]),
      openingQuantity: z.number().int().min(0).max(1000000),
      unitCost: amount,
      lowStock: z.number().int().min(0).max(1000000),
      location: z.string().max(240),
      condition: z.string().max(240),
      purchasedOn: optionalDay,
      usefulLifeMonths: z.number().int().min(0).max(1200),
      ledgerTracked: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("stock"),
      itemId: key.min(1),
      bookingId: key,
      date: day,
      kind: z.enum([
        "in",
        "use",
        "restore_use",
        "out",
        "return",
        "damage",
        "adjustment",
      ]),
      quantity: z.number().int().min(1).max(1000000),
      adjustmentSign: z.enum(["add", "remove"]),
      reversesId: key.default(""),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("cost"),
      bookingId: key.min(1),
      category: z.enum([
        "artist",
        "transport",
        "fuel",
        "supplies",
        "rental",
        "staff",
        "fees",
        "other",
      ]),
      performerId: key,
      amount: amount.nullable(),
      stage: z.enum(["estimated", "committed", "actual"]),
      moneyId: key,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("settlement"),
      bookingId: key,
      partyId: key.min(1),
      role: z.enum(["principal", "agent"]),
      bookingValue: amount,
      commission: amount,
      partnerAmount: amount,
      paid: amount,
      date: day,
      reviewed: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("journal"),
      date: day,
      lines: z
        .array(
          z
            .object({ accountId: key.min(1), debit: amount, credit: amount })
            .strict(),
        )
        .min(2)
        .max(50),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("payment"),
      kind: z.enum(["receipt", "payment", "transfer", "advance"]),
      date: day,
      amount: amount,
      accountId: key.min(1),
      toAccountId: key,
      documentId: key,
      employeeId: key,
      legacyMoneyId: key,
      reference: z.string().max(160),
    })
    .strict(),
  z.object({ ...base, type: z.literal("close"), through: day }).strict(),
]);
export type FinanceData = z.infer<typeof financeInput>;
export type FinanceType = FinanceData["type"];
export type DataOf<T extends FinanceType> = Extract<FinanceData, { type: T }>;
export interface DocumentTotal {
  net: number;
  tax: number;
  total: number;
  lines: {
    net: number;
    tax: number;
    total: number;
    rateBps: number;
    taxName: string;
    inclusive: boolean;
  }[];
}
export interface FinanceRecord {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  status: "draft" | "posted" | "reversed";
  number?: string;
  data: FinanceData;
  totals?: DocumentTotal;
  netPay?: number;
  publishedAt?: string;
  packageBaseline?: { price: number; priceMode: string };
  currency: string;
  reversedBy?: string;
  legacyMoneyId?: string;
  legacyImported?: boolean;
  attachmentIds?: string[];
  issuer?: DataOf<"company">;
  partySnapshot?: DataOf<"party">;
  recognizedDate?: string;
  creditedDeferred?: boolean;
}
export interface Journal {
  id: string;
  sourceId: string;
  date: string;
  memo: string;
  payroll: boolean;
  lines: { accountId: string; debit: number; credit: number }[];
  reversalOf?: string;
  createdAt: string;
}
export const financeTypes: FinanceType[] = [
  "account",
  "company",
  "reconciliation",
  "tax",
  "price",
  "rate",
  "party",
  "document",
  "employee",
  "work",
  "payroll",
  "obligation",
  "item",
  "stock",
  "cost",
  "settlement",
  "journal",
  "payment",
  "close",
];
export const systemAccounts = [
  ["cash", "Cash", "asset", true],
  ["bank", "Bank", "asset", true],
  ["whish", "Whish", "asset", true],
  ["receivable", "Customer receivables", "asset", false],
  ["input_vat", "Recoverable VAT", "asset", false],
  ["advances", "Employee advances", "asset", false],
  ["inventory", "Consumable inventory", "asset", false],
  ["equipment", "Equipment & fixed assets", "asset", false],
  ["depreciation", "Depreciation expense", "expense", false],
  ["accumulated_depreciation", "Accumulated depreciation", "asset", false],
  ["stock_variance", "Stock adjustments & losses", "expense", false],
  ["payable", "Supplier payables", "liability", false],
  ["output_vat", "VAT payable", "liability", false],
  ["salary_payable", "Salaries payable", "liability", false],
  ["salary_tax", "Salary tax payable", "liability", false],
  ["social", "NSSF payable", "liability", false],
  ["deferred_revenue", "Deferred event revenue", "liability", false],
  ["sales", "Sales", "income", false],
  ["direct_cost", "Direct event costs", "expense", false],
  ["payroll_cost", "Payroll costs", "expense", false],
  ["overhead", "Office overhead", "expense", false],
  ["equity", "Opening equity", "equity", false],
] as const;
export function accountsFor(records: FinanceRecord[]) {
  return [
    ...systemAccounts.map(([id, name, category, cash]) => ({
      id: String(id),
      name,
      category,
      cash,
      code:
        (
          records.find(
            (r) => r.id === "account-" + id && r.data.type === "account",
          )?.data as DataOf<"account"> | undefined
        )?.code ?? "",
      active: !records.find((r) => r.id === "account-" + id)?.archived,
      ...(records.find((r) => r.id === "account-" + id)?.data.type === "account"
        ? { name: records.find((r) => r.id === "account-" + id)!.data.name }
        : {}),
    })),
    ...records
      .filter((r) => r.data.type === "account" && !r.id.startsWith("account-"))
      .map((r) => ({
        id: r.id,
        name: r.data.name,
        category: (r.data as DataOf<"account">).category,
        cash: (r.data as DataOf<"account">).cash,
        code: (r.data as DataOf<"account">).code ?? "",
        active: !r.archived,
      })),
  ];
}
