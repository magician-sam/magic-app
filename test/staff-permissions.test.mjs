import test from "node:test";
import assert from "node:assert/strict";
import {
  canStaffAction,
  staffRouteAllowed,
  staffViews,
  userCanStaffAction,
} from "../dist/staff-permissions.js";

test("staff permission overrides replace role defaults for limited staff", () => {
  const manager = { role: "manager", permissions: { catalog: false, money: true, businessExport: true } };
  assert.equal(canStaffAction("manager", "catalog"), true);
  assert.equal(userCanStaffAction(manager, "catalog"), false);
  assert.equal(userCanStaffAction(manager, "money"), true);
  assert.equal(staffRouteAllowed(manager, "PUT", "/api/manage/packages/show-1"), false);
  assert.equal(staffRouteAllowed(manager, "POST", "/api/manage/money"), true);
  assert.equal(staffRouteAllowed(manager, "GET", "/api/manage/export"), true);
});

test("unknown routes and owner-only controls stay closed for limited staff", () => {
  const accounting = { role: "accountant", permissions: { customers: true, officeTasks: false } };
  assert.equal(staffRouteAllowed(accounting, "PUT", "/api/manage/customers/customer-1"), true);
  assert.equal(staffRouteAllowed(accounting, "GET", "/api/manage/office-tasks"), false);
  assert.equal(staffRouteAllowed(accounting, "DELETE", "/api/manage/users/user-1"), false);
  assert.equal(staffRouteAllowed(accounting, "GET", "/api/manage/full-database-export"), false);
  assert.equal(staffRouteAllowed(accounting, "POST", "/api/manage/future-owner-action"), false);
});

test("owner and platform admin permissions cannot be reduced by overrides", () => {
  for (const role of ["owner", "admin"]) {
    const user = { role, permissions: { money: false, catalog: false } };
    assert.equal(userCanStaffAction(user, "money"), true);
    assert.equal(staffRouteAllowed(user, "POST", "/api/manage/money"), true);
  }
});

test("navigation follows effective permissions", () => {
  const workAdmin = { role: "manager", permissions: { catalog: false, money: true, customers: false } };
  const views = staffViews(workAdmin);
  assert.ok(views.includes("money"));
  assert.ok(!views.includes("packages"));
  assert.ok(!views.includes("customers"));
  assert.ok(views.includes("bookings"));
});
