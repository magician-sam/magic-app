import test from "node:test";
import assert from "node:assert/strict";
import {
  compatibility,
  conflicts,
  timetable,
  totals,
  normalizePhone,
} from "../dist/domain.js";
const packages = [
  {
    id: "magic",
    name: "Magic",
    duration: 45,
    setup: 30,
    minAge: 4,
    maxAge: 99,
    indoorOnly: false,
    needsPower: false,
    minSpace: 12,
  },
  {
    id: "bubble",
    name: "Bubbles",
    duration: 30,
    setup: 30,
    minAge: 2,
    maxAge: 99,
    indoorOnly: true,
    needsPower: false,
    minSpace: 16,
  },
];
const base = {
  id: "a",
  date: "2027-05-04",
  time: "14:00",
  performerIds: ["sam"],
  packageIds: ["magic"],
  quotes: [],
  acceptedQuoteId: "",
  travel: 30,
  breakMinutes: 10,
  age: 7,
  indoor: true,
  power: true,
  space: 20,
  status: "accepted",
};
test("shows welcome every age while venue requirements still apply", () => {
  assert.deepEqual(compatibility(base, packages), []);
  const issues = compatibility(
    { ...base, indoor: false, age: 1, space: 4 },
    packages,
  );
  assert.equal(issues.length, 3);
  for (const age of [0, 1, 18, 99])
    assert.deepEqual(compatibility({ ...base, age }, packages), []);
});
test("conflicts include travel and setup, but not unrelated performers or unconfirmed requests", () => {
  const existing = { ...base, id: "b", time: "15:00", status: "confirmed" };
  assert.equal(
    conflicts(base, [existing], packages, [], "Asia/Beirut").length,
    1,
  );
  assert.equal(
    conflicts(
      base,
      [{ ...existing, performerIds: ["other"] }],
      packages,
      [],
      "Asia/Beirut",
    ).length,
    0,
  );
  assert.equal(
    conflicts(
      base,
      [{ ...existing, status: "requested" }],
      packages,
      [],
      "Asia/Beirut",
    ).length,
    0,
  );
});
test("cross-midnight occupied intervals and explicit unavailability are checked", () => {
  const late = { ...base, time: "23:30" };
  assert.equal(
    conflicts(
      late,
      [
        {
          ...base,
          id: "b",
          date: "2027-05-05",
          time: "00:30",
          status: "confirmed",
        },
      ],
      packages,
      [],
      "Asia/Beirut",
    ).length,
    1,
  );
  assert.equal(
    conflicts(
      base,
      [],
      packages,
      [{ performerId: "sam", date: base.date, start: "13:00", end: "13:30" }],
      "Asia/Beirut",
    ).length,
    1,
  );
});
test("accepted quote controls timetable and changeovers", () => {
  const b = {
    ...base,
    quotes: [{ id: "q", packageIds: ["magic", "bubble"] }],
    acceptedQuoteId: "q",
  };
  assert.deepEqual(
    timetable(b, packages, "Asia/Beirut").map((r) => r.at),
    ["13:30", "14:00", "14:45", "14:55", "15:25"],
  );
});
test("financial figures separate agreed value, net cash and profit", () => {
  const b = {
    ...base,
    quotes: [{ id: "q", amount: 30000, deposit: 5000 }],
    acceptedQuoteId: "q",
  };
  const result = totals(b, [
    { bookingId: "a", kind: "payment", amount: 10000 },
    { bookingId: "a", kind: "refund", amount: 1000 },
    { bookingId: "a", kind: "expense", amount: 4000 },
    { bookingId: "other", kind: "payment", amount: 99999 },
  ]);
  assert.deepEqual(result, {
    agreed: 30000,
    deposit: 5000,
    paid: 9000,
    expenses: 4000,
    balance: 21000,
    profit: 26000,
  });
});
test("duplicate phone matching normalizes punctuation and international 00 prefix", () =>
  assert.equal(
    normalizePhone("00961 70-123-456"),
    normalizePhone("+96170123456"),
  ));
test("catalog edits do not alter the duration or requirements of an accepted proposal", () => {
  const b = {
    ...base,
    quotes: [
      { id: "q", packageIds: ["magic"], packageSnapshot: [packages[0]] },
    ],
    acceptedQuoteId: "q",
  };
  const edited = [{ ...packages[0], duration: 180, setup: 120 }];
  assert.deepEqual(
    timetable(b, edited, "Asia/Beirut").map((r) => r.at),
    ["13:30", "14:00", "14:45"],
  );
});

test("custom running order, breaks and pack-down reserve the full occupied interval", () => {
  const booking = {
    ...base,
    packageIds: ["magic", "bubble"],
    travel: 0,
    runningOrder: [
      { packageId: "bubble", breakAfter: 20 },
      { packageId: "magic", breakAfter: 0 },
    ],
    teardown: 30,
  };
  const rows = timetable(booking, packages, "Asia/Beirut");
  assert.deepEqual(
    rows.map((r) => [r.label, r.at]),
    [
      ["Arrival & setup", "13:30"],
      ["Bubbles", "14:00"],
      ["Changeover / break", "14:30"],
      ["Magic", "14:50"],
      ["Finish", "15:35"],
      ["Pack down", "15:35"],
      ["Team departure", "16:05"],
    ],
  );
  const next = {
    ...base,
    id: "next",
    time: "16:00",
    travel: 0,
    status: "confirmed",
  };
  assert.equal(
    conflicts(booking, [next], packages, [], "Asia/Beirut").length,
    1,
  );
  const overnight = timetable(
    { ...booking, time: "23:30" },
    packages,
    "Asia/Beirut",
  );
  assert.equal(overnight.at(-1).at, "01:35");
});
