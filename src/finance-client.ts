import type { Dashboard } from "./models.js";
import type {
  FinanceData,
  FinanceType,
  FinanceRecord,
  Journal,
  DataOf,
} from "./finance-model.js";
import {
  documentTotals,
  documentBalance,
  payrollTotal,
  stockState,
  ledgerBalances,
  type eventCostForecast,
} from "./finance-math.js";
import { guestServiceNames } from "./guest-services.js";
import { catalogueName } from "./catalogue-settings.js";

type Api = <T = Record<string, unknown>>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
interface View {
  forecasts: ReturnType<typeof eventCostForecast>[];
  records: FinanceRecord[];
  journals: Journal[];
  accounts: {
    id: string;
    name: string;
    category: string;
    cash: boolean;
    active: boolean;
  }[];
  attachments: { id: string; recordId: string; name: string; mime: string }[];
  canPayroll: boolean;
  currency: string;
  ledgerScope: string;
}
type Field = {
  key: string;
  label: string;
  kind?:
    | "text"
    | "textarea"
    | "money"
    | "number"
    | "date"
    | "month"
    | "check"
    | "select"
    | "percent";
  options?: [string, string][];
  required?: boolean;
  nullable?: boolean;
  signed?: boolean;
};
let section = "home";
let userId = "";
let reportFrom = "";
let reportTo = "";
const e = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const titles: Record<FinanceType, string> = {
  account: "Account",
  company: "Company tax profile",
  reconciliation: "Account reconciliation",
  tax: "Tax code",
  price: "Selling price",
  rate: "Artist rate",
  party: "Supplier / partner",
  document: "Invoice / bill / credit",
  employee: "Employee",
  work: "Attendance / leave",
  payroll: "Payroll run",
  obligation: "Government obligation",
  item: "Inventory / asset",
  stock: "Stock movement",
  cost: "Event cost",
  settlement: "Partner settlement",
  journal: "Journal adjustment",
  payment: "Payment / transfer",
  close: "Period lock",
};
const postingTypes = ["document", "payroll", "stock", "journal", "payment"];
export function openCatalogueSellingPrice(
  state: Dashboard,
  api: Api,
  reload: () => Promise<void>,
  headers: () => Record<string, string>,
  serviceId: string,
) {
  const host = document.createElement("div");
  host.hidden = true;
  document.body.append(host);
  mountFinanceDesk(host, state, api, reload, headers, serviceId);
}
export function mountFinanceDesk(
  root: Element,
  state: Dashboard,
  api: Api,
  reload: () => Promise<void>,
  headers: () => Record<string, string>,
  initialServiceId?: string,
) {
  if (userId !== state.user.id) {
    section = "home";
    userId = state.user.id;
  }
  const panel = document.createElement("section");
  panel.dataset.accounting = "desk";
  panel.className = "finance-desk";
  root.append(panel);
  let view: View;
  let dialog: HTMLDialogElement | undefined;
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: view?.currency ?? state.business.currency,
    }).format(n / 100);
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: state.business.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const active = (type: FinanceType) =>
    view.records.filter((r) => r.data.type === type && !r.archived);
  const opts = (type: FinanceType) =>
    active(type).map(
      (r) =>
        [r.id, r.number ? `${r.number} · ${r.data.name}` : r.data.name] as [
          string,
          string,
        ],
    );
  const choices = (values: string[]) =>
    values.map((v) => [v, v.replaceAll("_", " ")] as [string, string]);
  const eventOpts = () =>
    [
      ["", "No event"],
      ...state.bookings.map((b) => [b.id, `${b.date} · ${b.name}`]),
    ] as [string, string][];
  const serviceOpts = () =>
    [
      ...state.packages.map((p) => [
        p.id,
        p.bundleIds?.length
          ? p.name
          : ((
              {
                magic: "Magic Show",
                science: "Science Show",
                bubbles: "Bubble Show",
              } as Record<string, string>
            )[p.category.toLowerCase()] ?? p.name),
      ]),
      ...guestServiceNames(
        state.business.otherShowNames ?? [],
        state.business.hiddenGuestServices ?? [],
      ).map((n) => [n, catalogueName(state.business, "service:" + n, n)]),
    ] as [string, string][];
  const error = (err: unknown) => {
    const target = dialog?.open
      ? dialog.querySelector(".finance-error")
      : panel.querySelector(".finance-error");
    if (target)
      target.textContent =
        err instanceof Error ? err.message : "Unable to complete this action.";
  };
  const run = (action: () => Promise<void>) => async (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      await action();
    } catch (err) {
      error(err);
    } finally {
      button.disabled = false;
    }
  };
  async function load() {
    view = await api<View>("/manage/finance");
    if (panel.isConnected) draw();
  }
  const field = (f: Field, value: unknown) => {
    const label = e(f.label),
      name = e(f.key),
      required = f.required ? "required" : "";
    if (f.kind === "check")
      return `<label class="finance-check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${label}</label>`;
    if (f.kind === "select")
      return `<label>${label}<select name="${name}" aria-label="${label}" ${required}>${(f.options ?? []).map(([id, n]) => `<option value="${e(id)}" ${id === String(value ?? "") ? "selected" : ""}>${e(n)}</option>`).join("")}</select></label>`;
    if (f.kind === "textarea")
      return `<label class="finance-wide">${label}<textarea name="${name}" rows="3" maxlength="2000">${e(value)}</textarea></label>`;
    const numeric = ["money", "number", "percent"].includes(f.kind ?? "");
    const shown =
      (f.kind === "money" || f.kind === "percent") &&
      value !== null &&
      value !== undefined &&
      value !== ""
        ? Number(value) / 100
        : (value ?? "");
    return `<label>${label}<input name="${name}" aria-label="${label}" type="${numeric ? "number" : f.kind === "date" ? "date" : f.kind === "month" ? "month" : "text"}" ${numeric && !f.signed ? 'min="0"' : ""} ${f.kind === "money" || f.kind === "percent" ? 'step="0.01"' : numeric ? 'step="1"' : ""} value="${e(shown)}" ${required} maxlength="2000">${f.nullable ? "<small>Blank = unknown, not zero.</small>" : ""}</label>`;
  };
  function fields(type: FinanceType): Field[] {
    const select = (
      key: string,
      label: string,
      options: [string, string][],
    ): Field => ({ key, label, kind: "select", options });
    const cash = () =>
      view.accounts
        .filter((a) => a.active && a.cash)
        .map((a) => [a.id, a.name] as [string, string]);
    const m = (key: string, label: string, nullable = false): Field => ({
      key,
      label: label + " (" + view.currency + ")",
      kind: "money",
      nullable,
      required: !nullable,
    });
    const date = (key: string, label: string, required = false): Field => ({
      key,
      label,
      kind: "date",
      required,
    });
    const check = (key: string, label: string): Field => ({
      key,
      label,
      kind: "check",
    });
    const event = select("bookingId", "Event", eventOpts());
    const tax = select("taxId", "VAT / tax code", [
      ["", "No VAT applied"],
      ...opts("tax"),
    ]);
    switch (type) {
      case "account":
        return [
          { key: "code", label: "Accountant’s chart account code" },
          select(
            "category",
            "Account category",
            choices(["asset", "liability", "equity", "income", "expense"]),
          ),
          check("cash", "Cash, bank or Whish account"),
        ];
      case "company":
        return [
          { key: "legalName", label: "Registered legal name", required: true },
          { key: "address", label: "Registered address", kind: "textarea" },
          {
            key: "fiscalNumber",
            label: "Ministry of Finance registration number",
          },
          {
            key: "registrationNumber",
            label: "Commercial / business registration number",
          },
          select(
            "vatStatus",
            "VAT registration status",
            choices(["unreviewed", "unregistered", "registered"]),
          ),
          { key: "vatNumber", label: "VAT registration number" },
          { key: "nssfNumber", label: "Employer NSSF number" },
          check("reviewed", "Company registration and applicability reviewed"),
          {
            key: "minimumMarginBps",
            label: "Minimum direct margin for published prices (%)",
            kind: "percent",
          },
          {
            key: "invoiceFooter",
            label: "Invoice footer / payment terms",
            kind: "textarea",
          },
        ];
      case "reconciliation":
        return [
          select("accountId", "Cash / bank / Whish account", cash()),
          date("date", "Statement / cash count date", true),
          {
            key: "statementBalance",
            label: "Statement closing balance (" + view.currency + ")",
            kind: "money",
            signed: true,
            required: true,
          },
          { key: "reference", label: "Statement / cash count reference" },
          check(
            "reviewed",
            "Compared to ledger and reviewed (balances must match)",
          ),
        ];
      case "tax":
        return [
          {
            key: "rateBps",
            label: "Rate (%)",
            kind: "percent",
            required: true,
          },
          date("effectiveFrom", "Valid from", true),
          date("effectiveTo", "Valid until"),
          check(
            "reviewed",
            "Company applicability and current rule reviewed with accountant",
          ),
        ];
      case "price":
        return [
          select("serviceId", "Show / service", serviceOpts()),
          select(
            "priceMode",
            "Public price display",
            choices(["quote", "from", "fixed"]),
          ),
          m("salePrice", "Selling price"),
          m("cost", "Estimated direct cost", true),
          tax,
          check("inclusive", "Selling price includes the selected VAT"),
          {
            key: "approvalReason",
            label: "Reason for approving a price below cost / target margin",
            kind: "textarea",
          },
        ];
      case "rate":
        return [
          select("serviceId", "Show / service", serviceOpts()),
          select(
            "performerId",
            "Artist",
            state.performers.map((p) => [p.id, p.name]),
          ),
          m("cost", "Private artist cost"),
          select("unit", "Cost per", choices(["show", "hour", "day"])),
          date("effectiveFrom", "Valid from", true),
          date("effectiveTo", "Valid until"),
        ];
      case "party":
        return [
          select(
            "relationship",
            "Relationship",
            choices(["supplier", "partner"]),
          ),
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "address", label: "Address", kind: "textarea" },
          { key: "taxNumber", label: "Tax registration number" },
        ];
      case "document":
        return [
          select(
            "kind",
            "Document type",
            choices(["invoice", "bill", "credit"]),
          ),
          select("partyId", "Supplier / partner", [
            ["", "Customer / no supplier"],
            ...opts("party"),
          ]),
          {
            key: "customerAddress",
            label: "Customer / supplier address",
            kind: "textarea",
          },
          event,
          select("performerId", "Assigned artist (artist bills only)", [
            ["", "Not an artist bill"],
            ...state.performers.map((p) => [p.id, p.name] as [string, string]),
          ]),
          select(
            "revenueTreatment",
            "Invoice revenue treatment",
            choices(["deferred", "earned"]),
          ),
          check(
            "performanceConfirmed",
            "Service delivered: earned revenue reviewed (invoice only)",
          ),
          select("originalId", "Original invoice (credit only)", [
            ["", "None"],
            ...active("document")
              .filter(
                (r) =>
                  r.status === "posted" &&
                  r.data.type === "document" &&
                  r.data.kind === "invoice",
              )
              .map((r) => [r.id, r.number ?? r.data.name] as [string, string]),
          ]),
          date("date", "Document date", true),
          date("dueDate", "Due date"),
          { key: "reference", label: "Customer / supplier reference" },
        ];
      case "employee":
        return [
          { key: "position", label: "Position" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          date("startDate", "Employment starts", true),
          date("endDate", "Employment ends"),
          m("salary", "Monthly base salary"),
          { key: "taxReference", label: "Salary tax reference" },
          { key: "socialReference", label: "NSSF / CNSS reference" },
          { key: "contractNotes", label: "Contract details", kind: "textarea" },
        ];
      case "work":
        return [
          select("employeeId", "Employee", opts("employee")),
          select("kind", "Record", choices(["attendance", "leave"])),
          date("date", "From", true),
          date("toDate", "Until"),
          { key: "hours", label: "Hours", kind: "number" },
          check("approved", "Approved"),
        ];
      case "payroll":
        return [
          select("employeeId", "Employee", opts("employee")),
          {
            key: "period",
            label: "Salary month",
            kind: "month",
            required: true,
          },
          date("date", "Posting date", true),
          date("dueDate", "Pay due"),
          m("basic", "Basic pay"),
          m("allowances", "Allowances"),
          m("overtime", "Overtime"),
          m("tax", "Employee salary tax"),
          m("social", "Employee NSSF contribution"),
          m("employerSocial", "Employer NSSF contribution"),
          m("advanceRecovery", "Recover salary advance"),
          check(
            "reviewed",
            "Gross pay, deductions and contributions reviewed; no automatic statutory calculation",
          ),
        ];
      case "obligation":
        return [
          select(
            "kind",
            "Government obligation",
            choices([
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
          ),
          date("from", "Period from", true),
          date("to", "Period to", true),
          date("dueDate", "Verified due date", true),
          select(
            "currency",
            "Government amount currency",
            choices(["LBP", "USD"]),
          ),
          {
            key: "amount",
            label: "Reviewed amount (selected currency)",
            kind: "money",
            required: true,
          },
          select(
            "status",
            "Filing / payment status",
            choices(["draft", "reviewed", "filed", "settled"]),
          ),
          { key: "reference", label: "Filing / payment proof reference" },
        ];
      case "item":
        return [
          select(
            "kind",
            "Inventory type",
            choices(["consumable", "equipment", "fixed_asset"]),
          ),
          { key: "openingQuantity", label: "Opening quantity", kind: "number" },
          { key: "lowStock", label: "Low stock threshold", kind: "number" },
          m("unitCost", "Unit cost / asset purchase value"),
          { key: "location", label: "Storage location" },
          { key: "condition", label: "Condition" },
          date("purchasedOn", "Purchase date"),
          {
            key: "usefulLifeMonths",
            label: "Useful life (months; no automatic depreciation)",
            kind: "number",
          },
          check(
            "ledgerTracked",
            "Post consumable use to ledger (post opening balances / purchases to Consumable inventory first)",
          ),
        ];
      case "stock":
        return [
          select("itemId", "Item", opts("item")),
          event,
          date("date", "Movement date", true),
          select(
            "kind",
            "Movement",
            choices([
              "in",
              "use",
              "restore_use",
              "out",
              "return",
              "damage",
              "adjustment",
            ]),
          ),
          {
            key: "quantity",
            label: "Quantity",
            kind: "number",
            required: true,
          },
          select(
            "adjustmentSign",
            "Adjustment direction",
            choices(["add", "remove"]),
          ),
          select("reversesId", "Original consumption (restore_use only)", [
            ["", "None"],
            ...active("stock")
              .filter(
                (r) =>
                  r.status === "posted" &&
                  r.data.type === "stock" &&
                  r.data.kind === "use",
              )
              .map((r) => [r.id, r.data.name] as [string, string]),
          ]),
        ];
      case "cost":
        return [
          event,
          select(
            "category",
            "Cost category",
            choices([
              "artist",
              "transport",
              "fuel",
              "supplies",
              "rental",
              "staff",
              "fees",
              "other",
            ]),
          ),
          select("performerId", "Artist (if relevant)", [
            ["", "None"],
            ...state.performers.map((p) => [p.id, p.name] as [string, string]),
          ]),
          m("amount", "Cost amount", true),
          select(
            "stage",
            "Cost stage",
            choices(["estimated", "committed", "actual"]),
          ),
          select("moneyId", "Link existing actual expense", [
            ["", "No existing expense"],
            ...state.money
              .filter((m) => m.kind === "expense")
              .map(
                (m) =>
                  [
                    m.id,
                    `${state.bookings.find((b) => b.id === m.bookingId)?.name ?? "Event"} · ${money(m.amount)} · ${m.category}`,
                  ] as [string, string],
              ),
          ]),
        ];
      case "settlement":
        return [
          event,
          select("partyId", "Partner", opts("party")),
          select(
            "role",
            "Reviewed company role",
            choices(["principal", "agent"]),
          ),
          m("bookingValue", "Customer booking value"),
          m("commission", "Company commission / fee"),
          m("partnerAmount", "Amount owed to partner"),
          m("paid", "Partner payments recorded"),
          date("date", "Settlement date", true),
          check(
            "reviewed",
            "Contract, collection responsibility and accounting treatment reviewed",
          ),
        ];
      case "journal":
        return [date("date", "Posting date", true)];
      case "payment":
        return [
          select(
            "kind",
            "Record money already received / paid",
            choices(["receipt", "payment", "transfer", "advance"]),
          ),
          date("date", "Transaction date", true),
          m("amount", "Amount"),
          select("accountId", "Cash / bank / Whish account", cash()),
          select("toAccountId", "Transfer destination", [
            ["", "Not a transfer"],
            ...cash(),
          ]),
          select("documentId", "Invoice / bill / credit / payroll", [
            ["", "None"],
            ...view.records
              .filter(
                (r) =>
                  r.status === "posted" &&
                  ["document", "payroll"].includes(r.data.type),
              )
              .map(
                (r) =>
                  [
                    r.id,
                    `${r.number ?? r.data.name} · ${money(documentBalance(r, view.records).balance)}`,
                  ] as [string, string],
              ),
          ]),
          select("employeeId", "Employee (advance only)", [
            ["", "None"],
            ...opts("employee"),
          ]),
          select(
            "legacyMoneyId",
            "Link existing event payment instead of creating another",
            [
              ["", "New transaction"],
              ...state.money
                .filter((m) => m.amount > 0)
                .map(
                  (m) =>
                    [
                      m.id,
                      `${m.date} · ${m.kind} · ${money(m.amount)} · ${state.bookings.find((b) => b.id === m.bookingId)?.name ?? ""}`,
                    ] as [string, string],
                ),
            ],
          ),
          { key: "reference", label: "Transfer / receipt reference" },
        ];
      case "close":
        return [date("through", "Lock posting through", true)];
    }
  }
  const readValue = (f: Field, form: FormData) => {
    const raw = String(form.get(f.key) ?? "");
    if (f.kind === "check") return form.has(f.key);
    if (f.kind === "money" || f.kind === "percent") {
      if (!raw && f.nullable) return null;
      if (
        !(f.signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(raw)
      )
        throw Error(f.label + ": enter a value with up to two decimals.");
      return Math.round(Number(raw) * 100);
    }
    if (f.kind === "number") return Number(raw);
    return raw;
  };
  function lineEditor(type: FinanceType, values: Record<string, unknown>[]) {
    const lineFields: Field[] =
      type === "document"
        ? [
            { key: "description", label: "Description", required: true },
            {
              key: "quantity",
              label: "Quantity",
              kind: "number",
              required: true,
            },
            {
              key: "unitPrice",
              label: "Unit price",
              kind: "money",
              required: true,
            },
            {
              key: "discount",
              label: "Line discount",
              kind: "money",
              required: true,
            },
            {
              key: "taxId",
              label: "Tax code",
              kind: "select",
              options: [["", "No VAT applied"], ...opts("tax")],
            },
            { key: "inclusive", label: "Price includes VAT", kind: "check" },
            {
              key: "accountId",
              label: "Ledger account (blank = sales / direct cost)",
              kind: "select",
              options: [
                ["", "Automatic"],
                ...view.accounts
                  .filter(
                    (a) =>
                      a.active &&
                      ["asset", "income", "expense"].includes(a.category),
                  )
                  .map((a) => [a.id, a.name] as [string, string]),
              ],
            },
            {
              key: "recoverable",
              label: "Purchase VAT is deductible (bills only; reviewed)",
              kind: "check",
            },
          ]
        : [
            {
              key: "accountId",
              label: "Account",
              kind: "select",
              options: view.accounts
                .filter((a) => a.active)
                .map((a) => [a.id, a.name]),
            },
            { key: "debit", label: "Debit", kind: "money", required: true },
            { key: "credit", label: "Credit", kind: "money", required: true },
          ];
    const row = (values: Record<string, unknown>) =>
      `<fieldset class="finance-line"><legend>${type === "document" ? "Document line" : "Journal line"}</legend>${
        type === "document"
          ? `<label>Use a published service price<select data-catalogue-line aria-label="Use a published service price"><option value="">Custom line / keep entered price</option>${serviceOpts()
              .map(
                ([id, name]) => `<option value="${e(id)}">${e(name)}</option>`,
              )
              .join("")}</select></label>`
          : ""
      }<div class="finance-form-grid">${lineFields.map((f) => field(f, values[f.key] ?? (f.kind === "money" ? 0 : ""))).join("")}</div><button type="button" class="small outline" data-remove-line>Remove line</button></fieldset>`;
    return {
      html: `<div class="finance-lines">${values.map(row).join("")}</div><button type="button" class="small outline" data-add-line>Add line</button>`,
      lineFields,
      row,
    };
  }
  function edit(
    type: FinanceType,
    record?: FinanceRecord,
    duplicate = false,
    defaults: Record<string, unknown> = {},
  ) {
    dialog?.remove();
    dialog = document.createElement("dialog");
    dialog.className = "finance-dialog";
    dialog.setAttribute("aria-labelledby", "finance-dialog-title");
    if (initialServiceId) {
      const opened = dialog;
      opened.addEventListener(
        "close",
        () => {
          opened.remove();
          root.remove();
        },
        { once: true },
      );
    }
    document.body.append(dialog);
    const original = record?.data as unknown as
      Record<string, unknown> | undefined;
    if (!record && type === "payroll") {
      const employee = active("employee")[0];
      if (employee?.data.type === "employee")
        defaults = { basic: employee.data.salary, ...defaults };
    }
    const values: Record<string, unknown> = {
      currency: "LBP",
      date: today(),
      effectiveFrom: today(),
      startDate: today(),
      from: today(),
      to: today(),
      dueDate: today(),
      period: today().slice(0, 7),
      quantity: 1,
      ...original,
      ...defaults,
    };
    if (duplicate && type === "document") {
      values.reference = "";
      values.name = String(values.name ?? "") + " (replacement)";
    }
    const config: Field[] = [
      {
        key: "name",
        label: type === "document" ? "Customer / document title" : "Name",
        required: true,
      },
      ...fields(type),
      { key: "notes", label: "Notes / agreement details", kind: "textarea" },
    ];
    const lines = ["document", "journal"].includes(type)
      ? lineEditor(
          type,
          (original?.lines as Record<string, unknown>[] | undefined) ??
            (type === "document"
              ? [{ quantity: 1, unitPrice: 0, discount: 0 }]
              : [
                  { debit: 0, credit: 0 },
                  { debit: 0, credit: 0 },
                ]),
        )
      : undefined;
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="finance-dialog-title">${record && !duplicate ? "Edit" : "Add"} ${e(titles[type])}</h2><button type="button" class="close" aria-label="Close accounting editor">×</button></div><form><p class="form-error finance-error" role="alert"></p><div class="finance-form-grid">${config.map((f) => field(f, values[f.key] ?? ((f.kind === "money" || f.kind === "number" || f.kind === "percent") && !f.nullable ? 0 : ""))).join("")}</div>${lines?.html ?? ""}<div class="finance-preview" role="status"></div><p class="muted">${postingTypes.includes(type) ? "Save a draft, review it, then post. Posting records accounting entries; it never sends money." : "Changes are saved privately. Selling prices need a separate Publish action."}</p><button type="submit">Save ${postingTypes.includes(type) ? "draft" : "changes"}</button></form>`;
    const form = dialog.querySelector("form")!;
    const read = () => {
      const fd = new FormData(form);
      const data: Record<string, unknown> = { type };
      config.forEach((f) => (data[f.key] = readValue(f, fd)));
      if (type === "reconciliation")
        data.statementBalance = Number(data.statementBalance);
      if (lines)
        data.lines = [...form.querySelectorAll("fieldset")].map((group) => {
          const row: Record<string, unknown> = {};
          const values = new FormData();
          group
            .querySelectorAll<HTMLInputElement | HTMLSelectElement>(
              "input,select",
            )
            .forEach((input) => {
              if (
                input.type !== "checkbox" ||
                (input as HTMLInputElement).checked
              )
                values.set(input.name, input.value);
            });
          lines.lineFields.forEach((f) => (row[f.key] = readValue(f, values)));
          return row;
        });
      return data as FinanceData;
    };
    const preview = () => {
      const output = form.querySelector(".finance-preview")!;
      try {
        const data = read();
        if (data.type === "document") {
          const t = documentTotals(data, view.records);
          output.textContent = `Net ${money(t.net)} · VAT ${money(t.tax)} · Total ${money(t.total)}`;
        }
        if (data.type === "payroll") {
          const p = payrollTotal(data);
          output.textContent = `Gross ${money(p.gross)} · Net pay ${money(p.net)} · Employer cost ${money(p.employerCost)}`;
        }
        if (data.type === "price") {
          const sale = data.salePrice;
          output.textContent =
            data.cost === null
              ? "Cost incomplete: enter a private cost to estimate margin."
              : `${data.taxId ? "Review VAT-excluded value before assessing margin. " : ""}Price ${money(sale)} · Estimated cost ${money(data.cost)} · Difference ${money(sale - data.cost)}${!data.taxId && sale > 0 ? " · " + (((sale - data.cost) / sale) * 100).toFixed(2) + "% margin" : ""}`;
        }
      } catch (err) {
        output.textContent = err instanceof Error ? err.message : "";
      }
    };
    dialog
      .querySelector(".close")!
      .addEventListener("click", () => dialog?.close());
    form.addEventListener("input", preview);
    form.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement;
      if (target.matches("[data-catalogue-line]") && target.value) {
        const group = target.closest("fieldset")!,
          id = target.value,
          published = view.records.find(
            (r) =>
              r.data.type === "price" &&
              r.data.serviceId === id &&
              r.publishedAt &&
              !r.archived,
          ),
          pack = state.packages.find((p) => p.id === id);
        const price =
          published?.data.type === "price" ? published.data : undefined;
        (group.querySelector("[name=description]") as HTMLInputElement).value =
          price?.name ?? pack?.name ?? id;
        (group.querySelector("[name=unitPrice]") as HTMLInputElement).value =
          String((price?.salePrice ?? pack?.price ?? 0) / 100);
        (group.querySelector("[name=taxId]") as HTMLSelectElement).value =
          price?.taxId ?? "";
        (group.querySelector("[name=inclusive]") as HTMLInputElement).checked =
          price?.inclusive ?? false;
        if ((price?.priceMode ?? pack?.priceMode ?? "quote") === "quote")
          form.querySelector(".finance-preview")!.textContent =
            "This service requires a personal quote. Enter the agreed unit price.";
      }
      preview();
    });
    if (lines) {
      form.querySelector("[data-add-line]")!.addEventListener("click", () => {
        form
          .querySelector(".finance-lines")!
          .insertAdjacentHTML(
            "beforeend",
            lines.row(
              type === "document"
                ? { quantity: 1, unitPrice: 0, discount: 0 }
                : { debit: 0, credit: 0 },
            ),
          );
        preview();
      });
      form.addEventListener("click", (event) => {
        const target = (event.target as Element).closest("[data-remove-line]");
        if (target) {
          target.closest("fieldset")?.remove();
          preview();
        }
      });
    }
    if (type === "payroll" && !record) {
      form
        .querySelector("[name=employeeId]")
        ?.addEventListener("change", () => {
          const employee = view.records.find(
            (r) =>
              r.id ===
              (form.elements.namedItem("employeeId") as HTMLSelectElement)
                .value,
          );
          if (employee?.data.type === "employee")
            (form.elements.namedItem("basic") as HTMLInputElement).value =
              String(employee.data.salary / 100);
          preview();
        });
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
      button.disabled = true;
      try {
        const saved = await api<FinanceRecord>(
          "/manage/finance/" +
            (record && !duplicate ? encodeURIComponent(record.id) : "new"),
          "PUT",
          {
            revision: record && !duplicate ? record.revision : 0,
            data: read(),
          },
        );
        dialog?.close();
        await load();
        detail(saved.id);
      } catch (err) {
        error(err);
      } finally {
        button.disabled = false;
      }
    });
    dialog.showModal();
    preview();
  }
  function detail(id: string) {
    const r = view.records.find((r) => r.id === id);
    if (!r) return;
    dialog?.remove();
    dialog = document.createElement("dialog");
    dialog.className = "finance-dialog";
    if (initialServiceId) {
      const opened = dialog;
      opened.addEventListener(
        "close",
        () => {
          opened.remove();
          root.remove();
        },
        { once: true },
      );
    }
    document.body.append(dialog);
    const canEdit = r.status === "draft" && !r.publishedAt;
    const recordFields = fields(r.data.type);
    const displayValue = (key: string, value: unknown): string => {
      const f = recordFields.find((field) => field.key === key);
      if (value === null) return "Unknown";
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (typeof value === "number" && f?.kind === "percent")
        return `${value / 100}%`;
      if (typeof value === "number" && f?.kind === "money")
        return r.data.type === "obligation"
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: r.data.currency,
            }).format(value / 100)
          : money(value);
      return (
        f?.options?.find(([id]) => id === value)?.[1] ?? String(value ?? "")
      );
    };
    dialog.innerHTML = `<div class="dialog-heading"><h2>${e(r.number ?? r.data.name)}</h2><button type="button" class="close" aria-label="Close financial record">×</button></div><p class="finance-error" role="alert"></p><p><span class="badge">${e(r.status)}${r.archived ? " · archived" : ""}${r.publishedAt ? " · published" : ""}</span> · ${e(titles[r.data.type])} · ${e(r.currency)}</p>${r.totals ? `<div class="finance-kpis"><span>Net <b>${money(r.totals.net)}</b></span><span>VAT <b>${money(r.totals.tax)}</b></span><span>Total <b>${money(r.totals.total)}</b></span><span>Remaining <b>${money(documentBalance(r, view.records).balance)}</b></span></div>` : ""}${r.data.type === "payroll" ? `<p>Net pay ${money(r.netPay ?? 0)} · Unpaid ${money(documentBalance(r, view.records).balance)}</p>` : ""}<dl class="finance-details">${Object.entries(
      r.data,
    )
      .filter(([k]) => k !== "type" && k !== "lines")
      .map(
        ([k, v]) =>
          `<div><dt>${e(recordFields.find((f) => f.key === k)?.label ?? { name: "Name", notes: "Notes" }[k] ?? k)}</dt><dd>${e(displayValue(k, v))}</dd></div>`,
      )
      .join(
        "",
      )}</dl>${r.data.type === "document" ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${r.data.lines.map((l, i) => `<tr><td>${e(l.description)}</td><td>${l.quantity}</td><td>${money(l.unitPrice)}</td><td>${money(r.totals?.lines[i]?.total ?? 0)}</td></tr>`).join("")}</tbody></table></div>` : ""}<div class="actions finance-record-actions">${canEdit ? '<button type="button" data-f-edit>Edit</button>' : ""}<button type="button" class="outline" data-f-copy>Duplicate as new draft</button>${canEdit && postingTypes.includes(r.data.type) && !r.archived ? '<button type="button" data-f-post>Review & post</button>' : ""}${canEdit && r.data.type === "price" && !r.archived ? '<button type="button" data-f-publish>Publish customer price</button>' : ""}${canEdit ? `<button type="button" class="outline" data-f-archive>${r.archived ? "Restore" : "Archive"}</button>` : ""}${r.status === "posted" && r.data.type === "document" && r.data.kind === "invoice" && r.data.revenueTreatment === "deferred" && !r.recognizedDate ? '<button type="button" class="outline" data-f-recognize>Recognize earned revenue</button>' : ""}${r.status === "posted" && r.data.type !== "stock" ? '<button type="button" class="danger outline" data-f-reverse>Correct by reversal</button>' : ""}${["document", "payroll", "payment"].includes(r.data.type) ? `<a class="button outline" target="_blank" rel="noopener" href="/api/manage/finance/${e(r.id)}/print">Print / save PDF ↗</a>` : ""}</div><section class="finance-receipts"><h3>Private receipts & documents</h3>${view.attachments
      .filter((a) => a.recordId === r.id)
      .map(
        (a) =>
          `<p><a href="/api/manage/finance-attachment/${e(a.id)}">${e(a.name)} ↓</a></p>`,
      )
      .join(
        "",
      )}<label>Attach PDF / JPEG / PNG (up to 2MB)<input type="file" data-f-file accept="application/pdf,image/jpeg,image/png"></label></section><small>Revision ${r.revision} · Updated ${e(r.updatedAt)}. Saved changes remain in the audit history.</small>`;
    dialog
      .querySelector(".close")!
      .addEventListener("click", () => dialog?.close());
    dialog
      .querySelector("[data-f-edit]")
      ?.addEventListener("click", () => edit(r.data.type, r));
    dialog
      .querySelector("[data-f-copy]")!
      .addEventListener("click", () => edit(r.data.type, r, true));
    for (const action of ["post", "publish", "archive"])
      dialog.querySelector(`[data-f-${action}]`)?.addEventListener(
        "click",
        run(async () => {
          if (action === "post" || action === "publish") {
            const note = document.createElement("div");
            note.className = "finance-confirm";
            note.innerHTML = `<p>${action === "publish" ? "Publish this selling price for new website estimates? Accepted bookings keep their agreed totals." : "Post this reviewed record? Draft values become a dated accounting entry. No money will be sent."}</p><button type="button">Confirm ${action === "publish" ? "publication" : "posting"}</button>`;
            dialog!.querySelector(".finance-record-actions")!.after(note);
            note.querySelector("button")!.addEventListener(
              "click",
              run(async () => {
                await api("/manage/finance/" + r.id + "/" + action, "POST", {
                  revision: r.revision,
                });
                dialog?.close();
                await reload();
              }),
            );
            return;
          }
          await api("/manage/finance/" + r.id + "/archive", "POST", {
            revision: r.revision,
            archived: !r.archived,
          });
          dialog?.close();
          await load();
        }),
      );
    dialog.querySelector("[data-f-reverse]")?.addEventListener("click", () => {
      const f = document.createElement("form");
      f.className = "finance-confirm";
      f.innerHTML = `<label>Correction date<input name="date" type="date" value="${today()}" required></label><label>Reason<textarea name="reason" minlength="4" maxlength="500" required></textarea></label><p>This preserves the original and posts its opposite entries. Create a corrected replacement afterward.</p><button type="submit">Confirm reversal</button>`;
      dialog!.querySelector(".finance-record-actions")!.after(f);
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const b = f.querySelector("button")!;
        b.disabled = true;
        try {
          const fd = new FormData(f);
          await api("/manage/finance/" + r.id + "/reverse", "POST", {
            revision: r.revision,
            date: fd.get("date"),
            reason: fd.get("reason"),
          });
          dialog?.close();
          await reload();
        } catch (err) {
          error(err);
        } finally {
          b.disabled = false;
        }
      });
    });
    dialog
      .querySelector("[data-f-recognize]")
      ?.addEventListener("click", () => {
        const form = document.createElement("form");
        form.className = "finance-confirm";
        form.innerHTML = `<label>Performance / recognition date<input name="date" type="date" value="${today()}" required></label><label>Performance confirmation / reason<textarea name="reason" minlength="4" maxlength="500" required></textarea></label><p>Recognize revenue only after delivery. Linked events must be completed. This does not record a payment.</p><button type="submit">Confirm recognition</button>`;
        dialog!.querySelector(".finance-record-actions")!.after(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const button = form.querySelector("button")!;
          button.disabled = true;
          try {
            const fd = new FormData(form);
            await api("/manage/finance/" + r.id + "/recognize", "POST", {
              revision: r.revision,
              date: fd.get("date"),
              reason: fd.get("reason"),
            });
            dialog?.close();
            await reload();
          } catch (err) {
            error(err);
          } finally {
            button.disabled = false;
          }
        });
      });
    dialog.querySelector<HTMLInputElement>("[data-f-file]")!.addEventListener(
      "change",
      run(async () => {
        const file =
          dialog!.querySelector<HTMLInputElement>("[data-f-file]")!.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024)
          throw Error("Choose a file up to 2MB.");
        const response = await fetch(
          "/api/manage/finance/" + r.id + "/attachment",
          {
            method: "POST",
            headers: { ...headers(), "Content-Type": file.type },
            body: file,
          },
        );
        const result = (await response.json()) as { error?: string };
        if (!response.ok)
          throw Error(result.error ?? "Attachment could not be saved.");
        await load();
        detail(r.id);
      }),
    );
    dialog.showModal();
  }
  const table = (heads: string[], rows: string[]) =>
    `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  function list(
    title: string,
    types: FinanceType[],
    filter: (r: FinanceRecord) => boolean = () => true,
  ) {
    const rows = view.records.filter(
      (r) => types.includes(r.data.type) && filter(r),
    );
    return `<section class="panel"><div class="section-heading"><h3>${e(title)}</h3><div class="actions">${types.map((type) => `<button type="button" class="small" data-finance-add="${type}">＋ ${e(titles[type])}</button>`).join("")}</div></div><input type="search" class="search" data-finance-filter aria-label="Search ${e(title)}" placeholder="Search ${e(title.toLowerCase())}">${
      rows.length
        ? table(
            ["Record", "Status", "Value", ""],
            rows.map((r) => {
              let value = "";
              if (r.totals) value = money(r.totals.total);
              if (r.data.type === "price")
                value =
                  money(r.data.salePrice) +
                  (r.data.cost === null
                    ? " · Cost incomplete"
                    : ` · Cost ${money(r.data.cost)}`);
              if (r.data.type === "rate")
                value = money(r.data.cost) + " / " + r.data.unit;
              if (r.data.type === "payment") value = money(r.data.amount);
              if (r.data.type === "payroll") value = money(r.netPay ?? 0);
              if (r.data.type === "employee") value = money(r.data.salary);
              if (r.data.type === "cost")
                value =
                  r.data.amount === null
                    ? "Cost incomplete"
                    : money(r.data.amount);
              if (r.data.type === "obligation")
                value =
                  new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: r.data.currency,
                  }).format(r.data.amount / 100) +
                  " · Due " +
                  r.data.dueDate;
              if (r.data.type === "item") {
                const s = stockState(r, view.records);
                value = `${s.onHand} on hand · ${s.out} out · ${money(s.value)}`;
              }
              return `<tr data-finance-row><td><strong>${e(r.number ?? r.data.name)}</strong><small>${e(r.number ? r.data.name : titles[r.data.type])}</small></td><td><span class="badge">${r.archived ? "Archived" : r.publishedAt ? "Published" : e(r.status === "draft" && !postingTypes.includes(r.data.type) ? "Saved" : r.status)}</span></td><td>${e(value)}</td><td><button type="button" class="small outline" data-finance-open="${e(r.id)}">Open / edit</button></td></tr>`;
            }),
          )
        : `<div class="finance-empty">${e(title)} will appear here. Add your first record above.</div>`
    }</section>`;
  }
  function eventCosts() {
    return `<section class="panel"><h3>Event cost sheets</h3><p>Accepted totals stay fixed. Artist commitments and unpaid bills count toward forecasts. Missing costs stay visible.</p>${table(
      [
        "Event",
        "Agreed customer total",
        "Forecast costs",
        "Forecast result",
        "",
      ],
      state.bookings.map((b) => {
        const result = view.forecasts.find((r) => r.bookingId === b.id);
        return `<tr><td>${e(b.name)}<small>${e(b.date)}</small></td><td>${result?.customerTotal !== null && result?.customerTotal !== undefined ? money(result.customerTotal) : "Not agreed"}</td><td>${money(result?.forecastCost ?? 0)}</td><td>${result?.missing.length ? "Incomplete estimate · " + e(result.missing.join("; ")) : result?.contribution !== null && result?.contribution !== undefined ? money(result.contribution) + " · " + (result.margin ?? 0).toFixed(2) + "% margin" : "Before unallocated VAT / overhead: " + money(result?.provisionalContribution ?? 0)}</td><td><button type="button" class="small outline" data-cost-event="${e(b.id)}">Add cost</button></td></tr>`;
      }),
    )}<p class="muted">Operational forecast; accepted legacy totals do not separate VAT. Formal ledger reports use posted documents and their VAT snapshots. Stock consumption is operational until journaled; avoid duplicating a stock purchase as an event cost.</p></section>${list("Private cost entries", ["cost"])}`;
  }
  function reports() {
    const balances = ledgerBalances(view.journals, reportFrom, reportTo);
    const dr = balances.reduce((n, l) => n + l.debit, 0),
      cr = balances.reduce((n, l) => n + l.credit, 0);
    const position = ledgerBalances(view.journals, "", reportTo);
    const sum = (category: string) =>
      position
        .filter(
          (b) =>
            view.accounts.find((a) => a.id === b.accountId)?.category ===
            category,
        )
        .reduce((n, b) => n + b.balance, 0);
    const assets = sum("asset"),
      liabilities = -sum("liability"),
      equity = -sum("equity"),
      retained = -sum("income") - sum("expense");
    const revenue = -balances
        .filter(
          (b) =>
            view.accounts.find((a) => a.id === b.accountId)?.category ===
            "income",
        )
        .reduce((n, b) => n + b.balance, 0),
      expenses = balances
        .filter(
          (b) =>
            view.accounts.find((a) => a.id === b.accountId)?.category ===
            "expense",
        )
        .reduce((n, b) => n + b.balance, 0);
    return `<section class="panel"><h3>Posted ledger reports</h3><form class="finance-report-period"><label>From<input name="from" type="date" value="${e(reportFrom)}"></label><label>To<input name="to" type="date" value="${e(reportTo)}"></label><button type="submit" class="small">Apply period</button><button type="button" class="small outline" data-report-reset>All dates</button></form><p>${e(view.ledgerScope)} ${view.canPayroll ? "" : "Payroll journals are excluded from your view."}</p><div class="finance-kpis"><span>Posted income <b>${money(revenue)}</b></span><span>Posted expenses <b>${money(expenses)}</b></span><span>Ledger result before unposted items / company tax <b>${money(revenue - expenses)}</b></span></div><h4>Financial position · through ${e(reportTo || "all dates")}</h4><div class="finance-kpis"><span>Assets <b>${money(assets)}</b></span><span>Liabilities <b>${money(liabilities)}</b></span><span>Equity plus ledger result <b>${money(equity + retained)}</b></span></div><p>Assets less liabilities/equity/result: ${money(assets - liabilities - equity - retained)}. Complete opening balances and accountant review are required.</p><h4>VAT & government control balances (selected postings)</h4>${table(
      ["Control account", "Debit / (credit)"],
      ["output_vat", "input_vat", "salary_tax", "social"].map(
        (id) =>
          `<tr><td>${e(view.accounts.find((a) => a.id === id)?.name ?? id)}</td><td>${money(balances.find((b) => b.accountId === id)?.balance ?? 0)}</td></tr>`,
      ),
    )}<p>These ledger control balances are worksheets for review, not filed returns. VAT recovery and applicable filing treatment must be checked.</p><h4>Trial balance · selected postings</h4>${table(
      ["Account", "Debits", "Credits", "Debit / (credit) balance"],
      balances.map(
        (b) =>
          `<tr><td>${e(view.accounts.find((a) => a.id === b.accountId)?.name ?? b.accountId)}</td><td>${money(b.debit)}</td><td>${money(b.credit)}</td><td>${money(b.balance)}</td></tr>`,
      ),
    )}<p><strong>Debits ${money(dr)} · Credits ${money(cr)} · ${dr === cr ? "Balanced" : "OUT OF BALANCE — review required"}</strong></p><button type="button" class="outline" data-export-ledger>Download ledger CSV</button><p class="muted">Opening balances, complete postings and accountant review are required before using this as company financial statements.</p></section><section class="panel"><h3>Document balances & due dates</h3>${table(
      ["Document", "Due", "Unpaid", "Status"],
      view.records
        .filter(
          (r) =>
            r.status === "posted" &&
            ["document", "payroll"].includes(r.data.type),
        )
        .map(
          (r) =>
            `<tr><td><button class="link" data-finance-open="${r.id}">${e(r.number ?? r.data.name)}</button></td><td>${e("dueDate" in r.data ? r.data.dueDate : "")}</td><td>${money(documentBalance(r, view.records).balance)}</td><td>${"dueDate" in r.data && r.data.dueDate && r.data.dueDate < today() && documentBalance(r, view.records).balance > 0 ? "Overdue" : "Open / settled"}</td></tr>`,
        ),
    )}</section>`;
  }
  function home() {
    const posted = view.records.filter((r) => r.status === "posted");
    const invoices = posted.filter(
        (r) => r.data.type === "document" && r.data.kind === "invoice",
      ),
      bills = posted.filter(
        (r) =>
          (r.data.type === "document" && r.data.kind === "bill") ||
          r.data.type === "payroll",
      );
    const owed = invoices.reduce(
        (n, r) => n + Math.max(0, documentBalance(r, view.records).balance),
        0,
      ),
      pay = bills.reduce(
        (n, r) => n + Math.max(0, documentBalance(r, view.records).balance),
        0,
      ),
      balances = ledgerBalances(view.journals),
      cash = balances
        .filter((b) =>
          view.accounts.some((a) => a.id === b.accountId && a.cash),
        )
        .reduce((n, b) => n + b.balance, 0);
    return `<div class="finance-welcome"><div><span class="eyebrow">A clearer picture of your business</span><h2>Your finance desk</h2><p>Prices, people, payments and event costs, together.</p></div><span class="finance-currency">${e(view.currency)}</span></div><div class="finance-kpis"><button data-finance-section="sales"><span>Customers owe</span><b>${money(owed)}</b></button><button data-finance-section="purchases"><span>Bills & salaries due</span><b>${money(pay)}</b></button><button data-finance-section="cash"><span>Posted cash / bank / Whish</span><b>${money(cash)}</b></button><button data-finance-section="reports"><span>Posted documents</span><b>${posted.filter((r) => r.data.type === "document").length}</b></button></div><section class="panel finance-get-started"><h3>Start with your real figures</h3><p>Set private artist rates and approved selling prices. Add suppliers and employees, then record invoices, bills and payments.</p><div class="actions"><button data-finance-add="price">＋ Price & cost</button><button class="outline" data-finance-add="document">＋ Invoice / bill</button>${view.canPayroll ? '<button class="outline" data-finance-add="employee">＋ Employee</button>' : ""}</div><p class="muted">${e(view.ledgerScope)} No invented prices or tax rates. Payments are records of money movements; this app does not send money or file returns.</p></section><section class="panel"><h3>Needs attention</h3><div class="finance-attention">${active(
      "price",
    )
      .filter((r) => r.data.type === "price" && r.data.cost === null)
      .map(
        (r) =>
          `<button class="outline" data-finance-open="${r.id}">Missing cost · ${e(r.data.name)}</button>`,
      )
      .join("")}${active("obligation")
      .filter(
        (r) => r.data.type === "obligation" && r.data.status !== "settled",
      )
      .map(
        (r) =>
          `<button class="outline" data-finance-open="${r.id}">${e(r.data.name)} · ${e((r.data as DataOf<"obligation">).dueDate)}</button>`,
      )
      .join("")}${
      active("item")
        .filter(
          (r) =>
            r.data.type === "item" &&
            stockState(r, view.records).onHand <= r.data.lowStock,
        )
        .map(
          (r) =>
            `<button class="outline" data-finance-open="${r.id}">Low stock · ${e(r.data.name)}</button>`,
        )
        .join("") ||
      "<p>Keep prices, due dates and stock up to date to see your next actions here.</p>"
    }</div></section>`;
  }
  function draw() {
    const tabs = [
      ["home", "Overview"],
      ["prices", "Prices & artist costs"],
      ["sales", "Invoices & credits"],
      ["purchases", "Suppliers & bills"],
      ["cash", "Cash & accounts"],
      ...(view.canPayroll ? [["employees", "Employees & payroll"]] : []),
      ["tax", "Tax & VAT"],
      ["inventory", "Inventory & assets"],
      ["events", "Event cost sheets"],
      ["partners", "Partner settlements"],
      ["reports", "Reports"],
      ["ledger", "Journals & settings"],
    ];
    if (!tabs.some((t) => t[0] === section)) section = "home";
    let body = "";
    if (section === "home") body = home();
    if (section === "prices")
      body =
        list("Selling prices & internal costs", ["price"]) +
        list("Private artist rate cards", ["rate"]);
    if (section === "sales")
      body = list(
        "Customer invoices & credits",
        ["document"],
        (r) => r.data.type === "document" && r.data.kind !== "bill",
      );
    if (section === "purchases")
      body =
        list("Suppliers & partners", ["party"]) +
        list(
          "Supplier bills",
          ["document"],
          (r) => r.data.type === "document" && r.data.kind === "bill",
        );
    if (section === "cash")
      body =
        list("Money movements", ["payment"]) +
        list(
          "Custom ledger accounts",
          ["account"],
          (r) => !r.id.startsWith("account-"),
        ) +
        list("Cash / bank statement checks", ["reconciliation"]) +
        `<section class="panel"><h3>Standard accounts</h3>${table(
          ["Account", "Category", ""],
          view.accounts
            .filter((a) => !view.records.some((r) => r.id === a.id))
            .map(
              (a) =>
                `<tr><td>${e(a.name)}</td><td>${e(a.category)}</td><td><button class="small outline" data-edit-account="${a.id}">Edit name</button></td></tr>`,
            ),
        )}</section>`;
    if (section === "employees")
      body =
        list("Employees", ["employee"]) +
        list("Attendance & leave", ["work"]) +
        list("Monthly payroll", ["payroll"]);
    if (section === "tax")
      body =
        `<section class="panel finance-note"><h3>Government obligations</h3><p>Configure reviewed tax codes and track VAT, salary tax and NSSF filing/payment records. Stamp duty, entertainment-related fees, artists’ fund and nonresident categories are available for accountant-reviewed obligations; applicability is not assumed. Automatic statutory payroll calculations and government filing are not activated.</p><p>Purchase VAT recovery must be reviewed per bill. Attach declarations and payment proof privately to the relevant record. Government amounts retain their selected LBP/USD currency; ledger control balances use the company currency. Statutory currency conversion needs accountant review.</p></section>` +
        list("Company registration & invoice identity", ["company"]) +
        list("Tax codes", ["tax"]) +
        list("Filing & payment calendar", ["obligation"]);
    if (section === "inventory")
      body =
        `<section class="panel finance-note"><p>Stock movements track quantity and event consumption. Ledger-tracked consumables post use and corrections once; post purchases to the inventory asset account first. Equipment depreciation/disposal needs reviewed journals.</p></section>` +
        list("Inventory & assets", ["item"]) +
        list("Stock movements", ["stock"]);
    if (section === "events") body = eventCosts();
    if (section === "partners")
      body =
        `<section class="panel finance-note"><p>Settlement worksheets track reviewed commission and partner balances. They do not automatically post revenue or move money. Confirm principal/agent treatment before journaling.</p></section>` +
        list("Partner settlement worksheets", ["settlement"]);
    if (section === "reports") body = reports();
    if (section === "ledger")
      body =
        list("Manual balanced journals", ["journal"]) +
        list("Period locks (owner only)", ["close"]);
    panel.innerHTML = `<div class="finance-error" role="alert"></div><nav class="finance-nav" aria-label="Finance desk sections">${tabs.map(([id, name]) => `<button type="button" data-finance-section="${id}" aria-pressed="${section === id}">${name}</button>`).join("")}</nav>${body}`;
    panel.querySelectorAll<HTMLElement>("[data-finance-section]").forEach((b) =>
      b.addEventListener("click", () => {
        section = b.dataset.financeSection!;
        draw();
      }),
    );
    panel
      .querySelectorAll<HTMLElement>("[data-finance-add]")
      .forEach((b) =>
        b.addEventListener("click", () =>
          edit(
            b.dataset.financeAdd as FinanceType,
            undefined,
            false,
            b.dataset.financeAdd === "document" && section === "purchases"
              ? { kind: "bill" }
              : {},
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLElement>("[data-finance-open]")
      .forEach((b) =>
        b.addEventListener("click", () => detail(b.dataset.financeOpen!)),
      );
    panel
      .querySelectorAll<HTMLElement>("[data-cost-event]")
      .forEach((b) =>
        b.addEventListener("click", () =>
          edit("cost", undefined, false, { bookingId: b.dataset.costEvent }),
        ),
      );
    panel.querySelectorAll<HTMLElement>("[data-edit-account]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = view.accounts.find((a) => a.id === b.dataset.editAccount)!;
        const existing = view.records.find((r) => r.id === "account-" + a.id);
        if (existing) edit("account", existing);
        else {
          const record: FinanceRecord = {
            id: "account-" + a.id,
            revision: 0,
            createdAt: "",
            updatedAt: "",
            archived: false,
            status: "draft",
            currency: view.currency,
            data: {
              type: "account",
              name: a.name,
              notes: "",
              category: a.category as DataOf<"account">["category"],
              cash: a.cash,
              code: "",
            },
          };
          edit("account", record);
        }
      }),
    );
    panel
      .querySelectorAll<HTMLInputElement>("[data-finance-filter]")
      .forEach((input) =>
        input.addEventListener("input", () =>
          input
            .closest("section")!
            .querySelectorAll<HTMLElement>("[data-finance-row]")
            .forEach(
              (row) =>
                (row.hidden = !(row.textContent ?? "")
                  .toLowerCase()
                  .includes(input.value.toLowerCase())),
            ),
        ),
      );
    panel
      .querySelector<HTMLFormElement>(".finance-report-period")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget as HTMLFormElement);
        const from = String(fd.get("from") ?? ""),
          to = String(fd.get("to") ?? "");
        if (from && to && from > to) {
          error(new Error("From date must not follow To date."));
          return;
        }
        reportFrom = from;
        reportTo = to;
        draw();
      });
    panel
      .querySelector("[data-report-reset]")
      ?.addEventListener("click", () => {
        reportFrom = "";
        reportTo = "";
        draw();
      });
    panel
      .querySelector("[data-export-ledger]")
      ?.addEventListener("click", () => {
        const cell = (v: unknown) =>
          '"' +
          String(v ?? "")
            .replace(/^[=+@-]/, "'")
            .replaceAll('"', '""') +
          '"';
        const rows = [
          [
            "Date",
            "Source",
            "Memo",
            "Account",
            "Debit cents",
            "Credit cents",
            "Currency",
          ],
          ...view.journals
            .filter(
              (j) =>
                (!reportFrom || j.date >= reportFrom) &&
                (!reportTo || j.date <= reportTo),
            )
            .flatMap((j) =>
              j.lines.map((l) => [
                j.date,
                j.sourceId,
                j.memo,
                view.accounts.find((a) => a.id === l.accountId)?.name ??
                  l.accountId,
                l.debit,
                l.credit,
                view.currency,
              ]),
            ),
        ];
        const url = URL.createObjectURL(
          new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
            type: "text/csv;charset=utf-8",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "accounting-ledger.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
  }
  panel.innerHTML = "<p>Loading your finance desk…</p>";
  void load()
    .then(() => {
      if (!initialServiceId) return;
      const current = view.records
        .filter(
          (r) =>
            !r.archived &&
            r.data.type === "price" &&
            r.data.serviceId === initialServiceId,
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (current) edit("price", current, !!current.publishedAt);
      else {
        const pack = state.packages.find((p) => p.id === initialServiceId);
        edit("price", undefined, false, {
          serviceId: initialServiceId,
          name:
            serviceOpts().find(([id]) => id === initialServiceId)?.[1] ??
            initialServiceId,
          priceMode: pack?.priceMode ?? "quote",
          salePrice: pack?.price ?? 0,
          cost: null,
          taxId: "",
          inclusive: false,
        });
      }
    })
    .catch((err) => {
      panel.textContent =
        err instanceof Error ? err.message : "Unable to load Accounting.";
      if (initialServiceId) {
        root.remove();
        const notice = document.createElement("dialog");
        notice.className = "finance-dialog";
        notice.innerHTML = `<h2>Unable to open price</h2><p>${e(panel.textContent)}</p><button type="button">Close</button>`;
        document.body.append(notice);
        notice
          .querySelector("button")!
          .addEventListener("click", () => notice.close());
        notice.addEventListener("close", () => notice.remove(), { once: true });
        notice.showModal();
      }
    });
}
