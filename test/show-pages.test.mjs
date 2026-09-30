import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createApp } from "../dist/server.js";

test("shareable show pages expose only active public shows and escape page metadata", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Test & Wonder", "show-pages");
  business.hiddenGuestServices = ["Fire Show"];
  await store.db.prepare("UPDATE businesses SET data=? WHERE id=?").run(JSON.stringify(business), business.id);
  const shows = await store.all(business.id, "packages");
  await store.put(business.id, "packages", { ...shows[0], id: "inactive", active: false });
  await store.put(business.id, "packages", { ...shows[0], id: "custom", category: "custom", name: '<script>alert("x")</script>', description: 'A "quoted" description <with> markup.' });
  const other = await store.createBusiness("Other business", "other-shows");
  await store.put(other.id, "packages", { ...shows[0], id: "other-only" });
  const server = createApp(store, "https://example.test").listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(origin + "/b/show-pages/show/science");
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<title>Science Show · Test &amp; Wonder<\/title>/);
    assert.match(html, /rel="canonical" href="https:\/\/example.test\/b\/show-pages\/show\/science"/);
    assert.match(html, /property="og:title"/);
    for (const path of ["show/inactive", "show/other-only", "service/Fire%20Show", "service/Unknown", "private/science"]) {
      assert.equal((await fetch(origin + "/b/show-pages/" + path)).status, 404, path);
    }
    assert.equal((await fetch(origin + "/b/show-pages/service/Characters")).status, 200);
    const custom = await (await fetch(origin + "/b/show-pages/show/custom")).text();
    assert.ok(custom.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
    assert.ok(custom.includes("A &quot;quoted&quot; description &lt;with&gt; markup."));
    assert.ok(!custom.includes('<script>alert("x")</script>'));
    assert.equal((await fetch(origin + "/b/show-pages")).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});
