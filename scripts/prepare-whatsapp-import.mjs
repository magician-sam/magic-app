import { readFileSync, createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";

// Read RFC 4180 CSV without spreadsheet coercion or changing source messages.
export function* csvRows(text) {
  let field = "", fields = [], quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") { fields.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      fields.push(field); yield fields; fields = []; field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("Unclosed CSV quotation.");
  if (field || fields.length) { fields.push(field); yield fields; }
}
export function* objects(text) {
  let headers;
  for (const values of csvRows(text)) {
    if (!headers) { headers = values; continue; }
    if (values.length !== headers.length) throw new Error("CSV column mismatch.");
    yield Object.fromEntries(headers.map((key, index) => [key, values[index]]));
  }
}

export async function prepare(inputDirectory, outputDirectory) {
  mkdirSync(outputDirectory, { recursive: true });
  const path = join(outputDirectory, "magic-whatsapp-private.ndjson");
  const output = createWriteStream(path, { encoding: "utf8", flags: "w" });
  const totals = { contact: 0, messages: 0, review: 0 };
  let sourceHash, entries = [], size = 0, batches = 0;
  async function flush() {
    if (!entries.length) return;
    const line = JSON.stringify({ sourceHash, entries }) + "\n";
    if (Buffer.byteLength(line) > 480000) throw new Error("Batch exceeds the private import limit.");
    if (!output.write(line)) await once(output, "drain");
    batches++; entries = []; size = 0;
  }
  async function append(entry) {
    const bytes = Buffer.byteLength(JSON.stringify(entry));
    if (bytes > 300000) throw new Error("A source record is too large; review it before importing.");
    if (size + bytes > 450000 || entries.length >= 80) await flush();
    entries.push(entry); size += bytes;
  }
  for (const [kind, file] of [["contact", "magic_chat_contacts.csv"], ["messages", "magic_messages.csv"], ["review", "magic_event_review.csv"]]) {
    let rows = [], chatId = "", chunk = 0, bytes = 0;
    const text = readFileSync(join(inputDirectory, file), "utf8");
    async function flushRows() {
      if (!rows.length) return;
      await append({ kind, id: kind === "contact" ? chatId : `${kind}_${chatId}_${String(chunk).padStart(7, "0")}`, chatId, rows });
      rows = []; bytes = 0; chunk++;
    }
    for (const row of objects(text)) {
      sourceHash ??= row.source_sha256;
      if (row.source_sha256 !== sourceHash || !/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error("Mixed or missing source hashes.");
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(row.chat_id)) throw new Error("Invalid chat reference.");
      if (row.chat_id !== chatId) { await flushRows(); chatId = row.chat_id; chunk = 0; }
      const rowBytes = Buffer.byteLength(JSON.stringify(row));
      if (rows.length >= (kind === "contact" ? 1 : 200) || bytes + rowBytes > 120000) await flushRows();
      rows.push(row); bytes += rowBytes; totals[kind]++;
    }
    await flushRows();
  }
  await flush();
  output.end(JSON.stringify({ complete: true, sourceHash, expected: totals }) + "\n");
  await once(output, "finish");
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  const manifest = { path, sourceHash, expected: totals, batches, sha256 };
  return manifest;
}
if (process.argv[1]?.endsWith("prepare-whatsapp-import.mjs") && process.argv[2]) {
  console.log(JSON.stringify(await prepare(process.argv[2], process.argv[3] ?? process.argv[2])));
}
