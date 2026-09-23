import test from "node:test";
import assert from "node:assert/strict";
import { TestStore } from "./store-fixture.mjs";
import { createUser, passwordMatches } from "../dist/auth.js";
import { recoverOwner } from "../dist/owner-recovery.js";

test("one-time owner recovery identifies the login, revokes sessions and preserves other accounts", async () => {
  const store = new TestStore(":memory:");
  try {
    const business = await store.createBusiness("Magic", "magic-by-sam");
    const otherBusiness = await store.createBusiness("Other", "other");
    const oldPassword = "Old-recovery-password-42";
    const newPassword = "New-recovery-password-43";
    const owner = await createUser(store, business.id, "sam@example.test", oldPassword, "Sam", "admin");
    const assistant = await createUser(store, business.id, "assistant@example.test", oldPassword, "Assistant", "assistant");
    const other = await createUser(store, otherBusiness.id, "other@example.test", oldPassword, "Other", "admin");
    await store.db.prepare("INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)").run("session-1", owner.id, Date.now() + 999999);

    assert.deepEqual(await recoverOwner(store, business.slug), {
      email: "sam@example.test", status: "needs-password",
    });
    assert.deepEqual(await recoverOwner(store, business.slug, newPassword), {
      email: "sam@example.test", status: "completed",
    });
    const updated = await store.db.prepare("SELECT password FROM users WHERE id=?").get(owner.id);
    assert.ok(await passwordMatches(newPassword, String(updated.password)));
    assert.equal(await passwordMatches(oldPassword, String(updated.password)), false);
    assert.equal(await store.db.prepare("SELECT hash FROM sessions WHERE user_id=?").get(owner.id), undefined);
    assert.deepEqual(await recoverOwner(store, business.slug, "Different-later-password-99"), {
      email: "sam@example.test", status: "already-completed",
    });
    const stillUpdated = await store.db.prepare("SELECT password FROM users WHERE id=?").get(owner.id);
    assert.ok(await passwordMatches(newPassword, String(stillUpdated.password)));
    for (const id of [assistant.id, other.id]) {
      const row = await store.db.prepare("SELECT password FROM users WHERE id=?").get(id);
      assert.ok(await passwordMatches(oldPassword, String(row.password)));
    }
  } finally {
    store.db.close();
  }
});

test("owner recovery refuses an ambiguous administrator account", async () => {
  const store = new TestStore(":memory:");
  try {
    const business = await store.createBusiness("Magic", "magic-by-sam");
    await createUser(store, business.id, "one@example.test", "Original-password-123", "One", "admin");
    await createUser(store, business.id, "two@example.test", "Original-password-123", "Two", "admin");
    await assert.rejects(recoverOwner(store, business.slug, "New-recovery-password-43"), /exactly one administrator/);
  } finally {
    store.db.close();
  }
});
