import test from "node:test";
import assert from "node:assert/strict";
import { performerAssignments } from "../dist/act-plans.js";

test("own show assignments follow agreed order and midnight dates without private fee fields", () => {
  const shows = [
    { id: "one", name: "Same name", duration: 30, setup: 15 },
    { id: "two", name: "Same name", duration: 40, setup: 10 },
  ];
  const booking = {
    date: "2028-06-04",
    time: "23:30",
    packageIds: ["one", "two"],
    performerIds: ["sam", "friend"],
    acceptedQuoteId: "q",
    quotes: [{ id: "q", packageIds: ["one", "two"], packageSnapshot: shows }],
    runningOrder: [
      { packageId: "two", breakAfter: 10 },
      { packageId: "one", breakAfter: 0 },
    ],
    breakMinutes: 5,
  };
  const plan = {
    id: "event",
    notes: "Private",
    rows: [
      { packageId: "one", performerId: "sam", agreedPay: 12345 },
      { packageId: "two", performerId: "friend", agreedPay: 999 },
      { packageId: "removed", performerId: "sam", agreedPay: 10 },
    ],
  };
  const result = performerAssignments(booking, [], "Asia/Beirut", "sam", plan);
  assert.deepEqual(result, [
    {
      label: "Same name",
      packageId: "one",
      at: "00:20",
      date: "2028-06-05",
      duration: 30,
    },
  ]);
  assert.deepEqual(
    performerAssignments(booking, [], "Asia/Beirut", "outsider", plan),
    [],
  );
  assert.deepEqual(
    performerAssignments(
      { ...booking, acceptedQuoteId: "" },
      [],
      "Asia/Beirut",
      "sam",
      plan,
    ),
    [],
  );
  assert.deepEqual(performerAssignments(booking, [], "Asia/Beirut", "sam"), []);
});
