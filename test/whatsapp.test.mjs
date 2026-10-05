import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
import { objects } from "../scripts/prepare-whatsapp-import.mjs";
import { gzipSync } from "node:zlib";

test("WhatsApp CSV preserves quoted text, embedded lines, leading zeros and formula-like messages", () => {
  assert.deepEqual([...objects('\uFEFFid,text\r\n001,"hello,""friend""\n=SUM(A1)"\r\n')], [{ id: "001", text: 'hello,"friend"\n=SUM(A1)' }]);
});

test("private WhatsApp import is resumable, scoped, counted and never creates bookings or customers", async () => {
  const store = new Store(":memory:");
  const business = await store.createBusiness("Private test", "wa-test");
  const other = await store.createBusiness("Other", "wa-other");
  const password = "Test-private-import-42!";
  await createUser(store, business.id, "wa-owner@example.test", password, "Owner", "owner");
  await createUser(store, business.id, "wa-manager@example.test", password, "Manager", "manager");
  await createUser(store, other.id, "wa-other@example.test", password, "Other", "owner");
  const app = createApp(store, "http://localhost");
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, cookie) {
    const response = await fetch(origin + "/api" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: "http://localhost", ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  async function login(email) { return (await request("/login", { email, password })).headers.get("set-cookie").split(";")[0]; }
  try {
    const owner = await login("wa-owner@example.test"), manager = await login("wa-manager@example.test"), foreign = await login("wa-other@example.test");
    const sourceHash = "a".repeat(64);
    const common = { chat_id: "chat_1", source_sha256: sourceHash };
    const entries = [
      { kind: "contact", id: "chat_1", chatId: "chat_1", rows: [{ ...common, chat_label: "Test family", phone_candidate: "00123", sender_name_candidates: "Test name", customer_status: "unverified_chat_contact" }] },
      { kind: "messages", id: "messages_chat_1_0000000", chatId: "chat_1", rows: [{ ...common, message_id: "message_1", direction: "incoming", content: "not confirmed <script>" }] },
      { kind: "review", id: "review_chat_1_0000000", chatId: "chat_1", rows: [{ ...common, cue_message_id: "message_1", review_status: "needs_review", cue_text: "not confirmed" }] },
    ];
    assert.equal((await request("/manage/whatsapp/summary")).status, 401);
    assert.equal((await request("/manage/whatsapp/import", { sourceHash, entries }, manager)).status, 403);
    assert.equal((await request("/manage/whatsapp/import", { sourceHash, entries }, owner)).data.inserted, 3);
    assert.equal((await request("/manage/whatsapp/import", { sourceHash, entries }, owner)).data.inserted, 0);
    assert.equal((await request("/manage/whatsapp/import", { sourceHash, compressedEntries: gzipSync(JSON.stringify(entries)).toString("base64") }, owner)).data.inserted, 0);
    assert.equal((await request("/manage/whatsapp/import", { sourceHash, compressedEntries: Buffer.from("invalid gzip").toString("base64") }, owner)).status, 400);
    assert.equal((await request("/manage/whatsapp/complete", { sourceHash, expected: { contact: 1, messages: 2, review: 1 } }, owner)).status, 409);
    assert.equal((await request("/manage/whatsapp/complete", { sourceHash, expected: { contact: 1, messages: 1, review: 1 } }, owner)).status, 200);
    assert.deepEqual((await request("/manage/whatsapp/summary", null, owner)).data.counts, { contact: 1, messages: 1, review: 1 });
    const chats = (await request("/manage/whatsapp/chats?q=Test", null, owner)).data;
    assert.equal(chats.total, 1);
    assert.equal((await request(`/manage/whatsapp/chat/${chats.chats[0].key}`, null, owner)).data.rows[0].content, "not confirmed <script>");
    assert.equal((await request(`/manage/whatsapp/chat/${chats.chats[0].key}`, null, foreign)).status, 404);
    assert.equal((await request("/manage/whatsapp/chats", null, foreign)).data.total, 0);
    assert.equal((await request("/manage/whatsapp/import", { sourceHash, entries: [{ ...entries[2], rows: [{ ...common, cue_message_id: "x", review_status: "confirmed" }] }] }, owner)).status, 400);
    assert.equal((await store.all(business.id, "customers")).length, 0);
    assert.equal((await store.all(business.id, "bookings")).length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); store.db.close(); }
});

