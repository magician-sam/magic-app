import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
import {
  hourlyBasic,
  attendanceClockHours,
  approvedAttendance,
  attendanceLocked,
  validatePayrollHours,
} from "../dist/employee-payroll.js";
import { documentBalance } from "../dist/finance-math.js";
import { snapshot, restoreSnapshot } from "../dist/snapshots.js";

test("hourly calculations round cents and clocks deduct breaks without guessing overnight or DST times", () => {
  assert.equal(hourlyBasic(7.5, 1234), 9255);
  assert.equal(hourlyBasic(0.125, 100), 13);
  assert.throws(() => hourlyBasic(-1, 100));
  assert.throws(() => hourlyBasic(2, 1.5));
  const shift = {
    date: "2026-10-22",
    toDate: "",
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: 30,
  };
  assert.equal(attendanceClockHours(shift, "Asia/Beirut"), 7.5);
  assert.equal(
    attendanceClockHours(
      { ...shift, startTime: "", endTime: "" },
      "Asia/Beirut",
    ),
    null,
  );
  assert.throws(() =>
    attendanceClockHours({ ...shift, endTime: "" }, "Asia/Beirut"),
  );
  assert.throws(() =>
    attendanceClockHours({ ...shift, endTime: "08:00" }, "Asia/Beirut"),
  );
  assert.throws(() =>
    attendanceClockHours({ ...shift, breakMinutes: 481 }, "Asia/Beirut"),
  );
  assert.equal(
    attendanceClockHours(
      { ...shift, startTime: "22:00", endTime: "06:00", toDate: "2026-10-23" },
      "Asia/Beirut",
    ),
    7.5,
  );
  assert.throws(() =>
    attendanceClockHours(
      { ...shift, date: "2026-03-08", startTime: "02:30" },
      "America/New_York",
    ),
  );
  assert.throws(() =>
    attendanceClockHours(
      { ...shift, date: "2026-11-01", startTime: "01:30" },
      "America/New_York",
    ),
  );
});

test("approved sources exclude leave, pending, archived and other employees; changed source hours need review", () => {
  const row = (id, data = {}, archived = false) => ({
    id,
    archived,
    data: {
      type: "work",
      employeeId: "one",
      kind: "attendance",
      date: "2026-10-22",
      toDate: "",
      hours: 7.5,
      approved: true,
      ...data,
    },
  });
  const rows = [
    row("ok"),
    row("pending", { approved: false }),
    row("leave", { kind: "leave" }),
    row("other", { employeeId: "two" }),
    row("archived", {}, true),
    row("month", { date: "2026-09-22" }),
  ];
  assert.deepEqual(approvedAttendance(rows, "one", "2026-10"), {
    hours: 7.5,
    ids: ["ok"],
  });
  const pay = {
    employeeId: "one",
    period: "2026-10",
    payBasis: "hourly",
    paidHours: 7.5,
    hourlyRate: 1000,
    basic: 7500,
    workIds: ["ok"],
    calculationNotes: "",
  };
  validatePayrollHours(pay, rows);
  assert.throws(() =>
    validatePayrollHours({ ...pay, workIds: ["ok", "ok"] }, rows),
  );
  assert.throws(() =>
    validatePayrollHours({ ...pay, workIds: ["pending"] }, rows),
  );
  assert.throws(() => validatePayrollHours({ ...pay, workIds: [] }, rows));
  assert.throws(() =>
    validatePayrollHours({ ...pay, paidHours: 8, basic: 8000 }, rows),
  );
  validatePayrollHours(
    {
      ...pay,
      paidHours: 8,
      basic: 8000,
      calculationNotes: "Reviewed paid-time adjustment",
    },
    rows,
  );
  assert.throws(() =>
    approvedAttendance(
      [row("cross", { date: "2026-10-31", toDate: "2026-11-01" })],
      "one",
      "2026-10",
    ),
  );
  assert.equal(
    attendanceLocked(
      [{ status: "posted", data: { type: "payroll", workIds: ["ok"] } }],
      "ok",
    ),
    true,
  );
  assert.equal(
    attendanceLocked(
      [{ status: "reversed", data: { type: "payroll", workIds: ["ok"] } }],
      "ok",
    ),
    false,
  );
});

test("synthetic hourly payroll survives draft source corrections, locks posted attendance and preserves rate snapshots, balances and privacy", async () => {
  const f = await fixture();
  try {
    const employee = await f.save({
      type: "employee",
      name: "Fictional hourly employee",
      notes: "",
      position: "",
      email: "",
      phone: "",
      startDate: "2026-01-01",
      endDate: "",
      salary: 0,
      payBasis: "hourly",
      hourlyRate: 1000,
      taxReference: "",
      socialReference: "",
      contractNotes: "",
    });
    const workData = {
      type: "work",
      name: "Fictional shift",
      notes: "",
      employeeId: employee.id,
      kind: "attendance",
      date: "2026-10-22",
      toDate: "",
      hours: 999,
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 30,
      approved: true,
    };
    let work = await f.save(workData);
    assert.equal(
      work.data.hours,
      7.5,
      "Server ignores forged client total when clock times exist",
    );
    const overlap = await f.request("/manage/finance/new", "PUT", {
      revision: 0,
      data: { ...workData, startTime: "10:00", endTime: "12:00" },
    });
    assert.equal(overlap.status, 409);
    await f.save({ ...workData, name: "Pending duplicate", approved: false });
    let pay = await f.save({
      type: "payroll",
      name: "Synthetic October payslip",
      notes: "",
      employeeId: employee.id,
      period: "2026-10",
      date: "2026-10-31",
      dueDate: "2026-10-31",
      basic: 7500,
      payBasis: "hourly",
      paidHours: 7.5,
      hourlyRate: 1000,
      workIds: [work.id],
      calculationNotes: "",
      allowances: 0,
      overtime: 0,
      tax: 0,
      social: 0,
      employerSocial: 0,
      advanceRecovery: 0,
      reviewed: true,
    });
    work = await f.ok("/manage/finance/" + work.id, "PUT", {
      revision: work.revision,
      data: { ...workData, breakMinutes: 60 },
    });
    assert.equal(work.data.hours, 7);
    assert.equal(
      (
        await f.request("/manage/finance/" + pay.id + "/post", "POST", {
          revision: pay.revision,
        })
      ).status,
      400,
    );
    pay = await f.ok("/manage/finance/" + pay.id, "PUT", {
      revision: pay.revision,
      data: { ...pay.data, paidHours: 7, basic: 7000 },
    });
    pay = await f.post(pay);
    assert.equal(pay.netPay, 7000);
    assert.equal(
      (
        await f.request("/manage/finance/" + work.id, "PUT", {
          revision: work.revision,
          data: workData,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.request("/manage/finance/" + work.id + "/archive", "POST", {
          revision: work.revision,
          archived: true,
        })
      ).status,
      409,
    );
    await f.ok("/manage/finance/" + employee.id, "PUT", {
      revision: employee.revision,
      data: { ...employee.data, hourlyRate: 2000 },
    });
    const paid = await f.post(
      await f.save({
        type: "payment",
        name: "Synthetic salary payment",
        notes: "",
        kind: "payment",
        date: "2026-10-31",
        amount: 3500,
        accountId: "cash",
        toAccountId: "",
        documentId: pay.id,
        employeeId: "",
        legacyMoneyId: "",
        reference: "",
      }),
    );
    const state = await f.ok("/manage/finance");
    const stored = state.records.find((r) => r.id === pay.id);
    assert.equal(stored.data.hourlyRate, 1000);
    assert.equal(stored.data.basic, 7000);
    assert.equal(documentBalance(stored, state.records).balance, 3500);
    assert.equal(paid.status, "posted");
    const restricted = { ...f.users.accounts, permissions: { payroll: false } };
    await f.store.db
      .prepare("UPDATE users SET data=? WHERE id=?")
      .run(JSON.stringify(restricted), restricted.id);
    const manager = await f.ok(
      "/manage/finance",
      undefined,
      undefined,
      "accounts",
    );
    assert.equal(manager.canPayroll, false);
    assert.equal(
      manager.records.some((r) =>
        [pay.id, work.id, employee.id, paid.id].includes(r.id),
      ),
      false,
    );
    assert.equal(
      (
        await f.request(
          "/manage/finance/" + work.id,
          "PUT",
          { revision: work.revision, data: workData },
          "accounts",
        )
      ).status,
      403,
    );
    const print = await fetch(
      f.base + "/api/manage/finance/" + pay.id + "/print",
      { headers: { cookie: f.cookies.owner } },
    );
    assert.equal(print.status, 200);
    assert.match(await print.text(), /7 hours/);
    const backup = await snapshot(f.store),
      copy = new Store(":memory:");
    try {
      await restoreSnapshot(copy, backup);
      const restored = await copy.get(f.business.id, "finance", pay.id);
      assert.equal(restored.data.paidHours, 7);
      assert.deepEqual(restored.data.workIds, [work.id]);
    } finally {
      await copy.db.close();
    }
  } finally {
    await f.close();
  }
});
async function fixture() {
  const store = new Store(":memory:"),
    business = await store.createBusiness(
      "Synthetic finance",
      "synthetic-finance",
    );
  const users = {};
  for (const [name, role] of [
    ["owner", "owner"],
    ["accounts", "accountant"],
    ["sales", "sales"],
    ["manager", "manager"],
  ])
    users[name] = await createUser(
      store,
      business.id,
      name + "@finance.test",
      "Fixture-password-42!",
      name,
      role,
    );
  const server = createApp(store, "https://finance.test").listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve) => server.on("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const cookies = {};
  for (const name of Object.keys(users)) {
    const r = await fetch(base + "/api/login", {
      method: "POST",
      headers: {
        origin: "https://finance.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: name + "@finance.test",
        password: "Fixture-password-42!",
      }),
    });
    assert.equal(r.status, 200);
    cookies[name] = r.headers.get("set-cookie").split(";")[0];
  }
  async function request(path, method = "GET", body, user = "owner") {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        cookie: cookies[user],
        origin: "https://finance.test",
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    return { status: response.status, data };
  }
  async function ok(path, method, body, user) {
    const r = await request(path, method, body, user);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  }
  const save = (data) =>
    ok("/manage/finance/new", "PUT", { revision: 0, data });
  const post = (r) =>
    ok("/manage/finance/" + r.id + "/post", "POST", { revision: r.revision });
  return {
    store,
    business,
    users,
    request,
    ok,
    save,
    post,
    base,
    cookies,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await store.db.close();
    },
  };
}
