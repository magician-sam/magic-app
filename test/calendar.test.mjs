import test from "node:test";
import assert from "node:assert/strict";
import { monthDays, shiftMonth } from "../dist/calendar.js";

test("Monday-first month grids include leap days and six-week months", () => {
  assert.equal(monthDays("2024-02").filter(Boolean).length, 29);
  assert.equal(monthDays("2025-02").filter(Boolean).length, 28);
  assert.equal(monthDays("2026-02")[6], "2026-02-01");
  assert.equal(monthDays("2026-03").length, 42);
  assert.equal(monthDays("2026-06")[0], "2026-06-01");
  assert.throws(() => monthDays("2026-13"));
});

test("calendar navigation crosses years without local timezone shifts", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.throws(() => shiftMonth("1900-01", -1));
});
