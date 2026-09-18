import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../dist/store.js";
import { createApp } from "../dist/server.js";
import { createUser } from "../dist/auth.js";

test("password recovery is staff-verified, scoped, expiring, single-use and revokes sessions", async () => {
  const store = new Store(":memory:");
  const b = store.createBusiness("Recovery", "recovery");
  const other = store.createBusiness("Other", "other");
  const password = "Original-test-password-42!";
  await createUser(store, b.id, "owner@example.test", password, "Owner");
  await createUser(store, other.id, "other@example.test", password, "Other");
  const origin = "http://localhost:43221";
  const server = createApp(store, origin).listen(43221, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = async (path, method = "GET", body, cookie = "") => {
    const r = await fetch(origin + "/api" + path, {
      method,
      headers: { origin, "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    const owner = await request("/login", "POST", {
      email: "owner@example.test",
      password,
    });
    const otherOwner = await request("/login", "POST", {
      email: "other@example.test",
      password,
    });
    const customer = await request("/customer/recovery/register", "POST", {
      name: "Recovery family",
      phone: "+96170012345",
      username: "recover-me",
      password,
    });
    assert.equal(customer.status, 201);
    const reset = (username = "recover-me") =>
      request("/customer/recovery/reset/request", "POST", {
        username,
        phone: "+96170012345",
      });
    assert.deepEqual(
      (await reset()).data,
      (await reset("unknown-person")).data,
    );
    assert.equal(
      (
        await request(
          "/manage/customer-resets",
          "GET",
          undefined,
          customer.cookie,
        )
      ).status,
      401,
    );
    assert.deepEqual(
      (
        await request(
          "/manage/customer-resets",
          "GET",
          undefined,
          otherOwner.cookie,
        )
      ).data,
      [],
    );
    const queue = (
      await request("/manage/customer-resets", "GET", undefined, owner.cookie)
    ).data;
    assert.equal(queue.length, 1);
    const issue = (auth, verified = true) =>
      request(
        `/manage/customer-resets/${queue[0].id}/issue`,
        "POST",
        { identityVerified: verified },
        auth,
      );
    assert.equal((await issue(otherOwner.cookie)).status, 404);
    assert.equal((await issue(owner.cookie, false)).status, 400);
    const issued = await issue(owner.cookie);
    assert.equal(issued.status, 200);
    assert.equal(issued.data.code.length, 64);
    assert.equal(
      JSON.stringify(
        (
          await request(
            "/manage/customer-resets",
            "GET",
            undefined,
            owner.cookie,
          )
        ).data,
      ).includes(issued.data.code),
      false,
    );
    const complete = (code) =>
      request("/customer/recovery/reset/complete", "POST", {
        username: "recover-me",
        code,
        password: "Replacement-password-42!",
      });
    assert.equal((await complete("bad-code")).status, 400);
    // A repeated untrusted help request must not invalidate an already issued code.
    await reset();
    assert.equal((await complete(issued.data.code)).status, 200);
    assert.equal((await complete(issued.data.code)).status, 400);
    assert.equal(
      (
        await request(
          "/customer/recovery/me",
          "GET",
          undefined,
          customer.cookie,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/customer/recovery/login", "POST", {
          username: "recover-me",
          password,
        })
      ).status,
      401,
    );
    const login = await request("/customer/recovery/login", "POST", {
      username: "recover-me",
      password: "Replacement-password-42!",
    });
    assert.equal(login.status, 200);
    await reset();
    const fresh = (
      await request("/manage/customer-resets", "GET", undefined, owner.cookie)
    ).data[0];
    const next = await request(
      `/manage/customer-resets/${fresh.id}/issue`,
      "POST",
      { identityVerified: true },
      owner.cookie,
    );
    store.db
      .prepare("UPDATE customer_resets SET expires=0 WHERE id=?")
      .run(fresh.id);
    assert.equal((await complete(next.data.code)).status, 400);
    await reset();
    const last = (
      await request("/manage/customer-resets", "GET", undefined, owner.cookie)
    ).data[0];
    const finalCode = await request(
      `/manage/customer-resets/${last.id}/issue`,
      "POST",
      { identityVerified: true },
      owner.cookie,
    );
    assert.equal(
      (
        await request(
          "/customer/recovery/password",
          "POST",
          {
            currentPassword: "Replacement-password-42!",
            password: "Another-safe-password-42!",
          },
          login.cookie,
        )
      ).status,
      200,
    );
    assert.equal((await complete(finalCode.data.code)).status, 400);
    assert.equal(
      JSON.stringify(store.all(b.id, "audit")).includes(issued.data.code),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});
