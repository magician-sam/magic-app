import type { Express, Request } from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import type { Business, User } from "./models.js";
import { requireThat } from "./domain.js";
import { writeRoutes } from "./write-routes.js";
import { gunzipSync } from "node:zlib";

const kinds = { contact: "whatsappContacts", messages: "whatsappMessages", review: "whatsappReview" } as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z.object({
  kind: z.enum(["contact", "messages", "review"]),
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
  chatId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  rows: z.array(z.record(z.string().max(80), z.string().max(100000))).min(1).max(200),
}).strict();
type Entry = z.infer<typeof entrySchema>;
type Stored = Entry & { sourceHash: string; importedAt: string };
type Authed = Request & { business: Business; user: User };

function owner(request: Request) {
  const req = request as Authed;
  requireThat(["owner", "admin"].includes(req.user.role), "WhatsApp history is private to the owner.", 403);
  return req;
}
async function counts(store: Store, bid: string, sourceHash?: string) {
  const rows = sourceHash ? [await store.get<{ id: string; counts: Record<string, number> }>(bid, "whatsappStats", sourceHash)] : await store.all<{ id: string; counts: Record<string, number> }>(bid, "whatsappStats");
  return Object.fromEntries(Object.keys(kinds).map(key => [key, rows.reduce((sum, row) => sum + (row?.counts[key] ?? 0), 0)]));
}
export function whatsappHistory(app: Express, store: Store) {
  const writes = writeRoutes(app, store);
  app.get("/api/manage/whatsapp/summary", async (request, res) => {
    const req = owner(request);
    res.set("Cache-Control", "private, no-store").json({ counts: await counts(store, req.business.id), imports: await store.all(req.business.id, "whatsappImports") });
  });
  writes.post("/api/manage/whatsapp/import", async (request, res) => {
    const req = owner(request);
    const packet = z.object({ sourceHash: hash, entries: z.array(entrySchema).min(1).max(100).optional(), compressedEntries: z.string().max(650000).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional() }).strict().parse(req.body);
    requireThat(!!packet.entries !== !!packet.compressedEntries, "Choose one archive packet format.");
    let entries = packet.entries;
    if (packet.compressedEntries) {
      try { entries = z.array(entrySchema).min(1).max(100).parse(JSON.parse(gunzipSync(Buffer.from(packet.compressedEntries, "base64"), { maxOutputLength: 4 * 1024 * 1024 }).toString("utf8"))); }
      catch { requireThat(false, "Archive packet is invalid or exceeds the decompression limit."); }
    }
    const input = { sourceHash: packet.sourceHash, entries: entries! };
    for (const entry of input.entries) {
      requireThat(entry.kind !== "contact" || entry.rows.length === 1, "Each chat needs its own contact record.");
      for (const row of entry.rows) {
        requireThat(row.chat_id === entry.chatId && row.source_sha256 === input.sourceHash, "Source references do not match.");
        if (entry.kind === "contact") requireThat(entry.id === entry.chatId && row.customer_status === "unverified_chat_contact", "Import chats as unverified contacts.");
        if (entry.kind === "messages") requireThat(!!row.message_id && ["incoming", "outgoing"].includes(row.direction), "Invalid message record.");
        if (entry.kind === "review") requireThat(!!row.cue_message_id && row.review_status === "needs_review", "Event clues must remain unverified.");
      }
      if (entry.kind !== "contact") requireThat(entry.id.startsWith(`${entry.kind}_${entry.chatId}_`) && /^\d{7}$/.test(entry.id.slice(`${entry.kind}_${entry.chatId}_`.length)), "Invalid conversation chunk reference.");
    }
    const values = input.entries.map(entry => ({ ...entry, sourceHash: input.sourceHash, importedAt: new Date().toISOString() }));
    const existing = await store.db.prepare(`SELECT kind,id FROM records WHERE business_id=? AND (${values.map(() => "(kind=? AND id=?)").join(" OR ")})`).all(req.business.id, ...values.flatMap(entry => [kinds[entry.kind], `${input.sourceHash}:${entry.id}`]));
    const saved = new Set(existing.map(row => `${row.kind}:${row.id}`));
    const newKeys = new Set<string>();
    const increments: Record<string, number> = { contact: 0, messages: 0, review: 0 };
    for (const entry of values) {
      const key = `${kinds[entry.kind]}:${input.sourceHash}:${entry.id}`;
      if (!saved.has(key) && !newKeys.has(key)) increments[entry.kind] += entry.rows.length;
      newKeys.add(key);
    }
    const before = await counts(store, req.business.id, input.sourceHash);
    // Stable source IDs make interruption/retry safe; never overwrite an earlier import.
    // The hosted database has smaller request limits than a local SQLite file.
    // Split SQL payloads while keeping the entire archive packet atomic.
    let inserted = 0, sqlValues: string[][] = [], sqlBytes = 0;
    async function flushSql() {
      if (!sqlValues.length) return;
      const result = await store.db.prepare(`INSERT INTO records(business_id,kind,id,data) VALUES ${sqlValues.map(() => "(?,?,?,?)").join(",")} ON CONFLICT(business_id,kind,id) DO NOTHING`).run(...sqlValues.flat());
      inserted += Number(result.changes); sqlValues = []; sqlBytes = 0;
    }
    for (const entry of values) {
      const args = [req.business.id, kinds[entry.kind], `${input.sourceHash}:${entry.id}`, JSON.stringify(entry)];
      const bytes = Buffer.byteLength(JSON.stringify(args));
      if (sqlBytes + bytes > 350000) await flushSql();
      sqlValues.push(args); sqlBytes += bytes;
    }
    await flushSql();
    await store.put(req.business.id, "whatsappStats", { id: input.sourceHash, counts: Object.fromEntries(Object.keys(kinds).map(key => [key, before[key] + increments[key]])) });
    res.json({ inserted, received: values.length });
  });
  writes.post("/api/manage/whatsapp/complete", async (request, res) => {
    const req = owner(request);
    const input = z.object({ sourceHash: hash, expected: z.object({ contact: z.number().int().nonnegative(), messages: z.number().int().nonnegative(), review: z.number().int().nonnegative() }).strict() }).strict().parse(req.body);
    const actual = await counts(store, req.business.id, input.sourceHash);
    requireThat(Object.keys(input.expected).every(key => actual[key] === input.expected[key as keyof typeof input.expected]), "Import is incomplete. Select the same file to resume.", 409);
    const record = { id: input.sourceHash, counts: actual, completedAt: new Date().toISOString(), timezone: "unknown", reviewStatus: "needs_review" };
    await store.put(req.business.id, "whatsappImports", record);
    await store.audit(req.business.id, req.user.email, "whatsapp.import-completed", input.sourceHash, null, record);
    res.json(record);
  });
  app.get("/api/manage/whatsapp/chats", async (request, res) => {
    const req = owner(request);
    const q = String(req.query.q ?? "").slice(0, 120);
    const offset = Math.max(0, Math.min(1000000, Number(req.query.offset) || 0));
    const filter = "business_id=? AND kind='whatsappContacts' AND (json_extract(data,'$.rows[0].chat_label') LIKE ? OR json_extract(data,'$.rows[0].sender_name_candidates') LIKE ? OR json_extract(data,'$.rows[0].phone_candidate') LIKE ?)";
    const args = [req.business.id, `%${q}%`, `%${q}%`, `%${q}%`];
    const total = await store.db.prepare(`SELECT count(*) AS total FROM records WHERE ${filter}`).get(...args);
    const rows = await store.db.prepare(`SELECT id,data FROM records WHERE ${filter} ORDER BY json_extract(data,'$.rows[0].last_message') DESC,id LIMIT 30 OFFSET ?`).all(...args, offset);
    res.set("Cache-Control", "private, no-store").json({ total: Number(total?.total ?? 0), offset, chats: rows.map(row => ({ key: row.id, ...JSON.parse(String(row.data)) as Stored })) });
  });
  app.get("/api/manage/whatsapp/chat/:key", async (request, res) => {
    const req = owner(request);
    const contact = await store.get<Stored>(req.business.id, kinds.contact, String(req.params.key));
    requireThat(contact, "Conversation not found", 404);
    const kind = req.query.kind === "review" ? "review" : "messages";
    const offset = Math.max(0, Math.min(1000000, Number(req.query.offset) || 0));
    const prefix = `${contact.sourceHash}:${kind}_${contact.chatId}_`;
    const args = [req.business.id, kinds[kind], prefix, prefix + "\uffff"];
    const filter = "business_id=? AND kind=? AND id>=? AND id<?";
    const total = await store.db.prepare(`SELECT count(*) AS total FROM records WHERE ${filter}`).get(...args);
    const row = await store.db.prepare(`SELECT data FROM records WHERE ${filter} ORDER BY id LIMIT 1 OFFSET ?`).get(...args, offset);
    res.set("Cache-Control", "private, no-store").json({ contact: contact.rows[0], kind, offset, chunks: Number(total?.total ?? 0), rows: row ? (JSON.parse(String(row.data)) as Stored).rows : [] });
  });
}
