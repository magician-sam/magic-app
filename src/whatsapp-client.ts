type Api = (path: string, method?: string, body?: unknown) => Promise<unknown>;
type Row = Record<string, string>;
type Chat = { key: string; rows: Row[] };
type Summary = { counts: Record<string, number>; imports: unknown[] };
type List = { chats: Chat[]; total: number; offset: number };
type Conversation = { contact: Row; rows: Row[]; chunks: number; offset: number; kind: string };
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]!);

export async function renderWhatsApp(root: Element, api: Api) {
  root.innerHTML = `<section class="panel"><span class="eyebrow">Private conversation archive</span><h2>Your WhatsApp history, in one place.</h2><p>Search past conversations and review event clues with their original messages. Contacts are unverified; confirmation keywords do not create bookings.</p><p class="hint">Voice recordings, photos, videos and location pins are placeholders in this export. Original timestamps have an unknown timezone.</p><div id="wa-summary" aria-live="polite">Loading archive…</div><details><summary>Import or resume a prepared archive</summary><p>Choose the prepared Magic App .ndjson file. A repeated upload safely resumes without duplicating saved records.</p><label>Prepared WhatsApp archive<input id="wa-file" type="file" accept=".ndjson"></label><button id="wa-start" class="small">Import privately</button><button id="wa-pause" class="small outline" hidden>Pause import</button><p id="wa-progress" role="status" aria-live="polite"></p></details></section><section class="panel"><form id="wa-search-form" class="toolbar"><label>Search conversations<input id="wa-search" class="search" placeholder="Name or phone number"></label><button class="small">Search</button></form><div id="wa-list"></div></section><section id="wa-conversation" class="panel" hidden></section>`;
  const summary = root.querySelector("#wa-summary")!;
  const list = root.querySelector("#wa-list")!;
  const conversation = root.querySelector<HTMLElement>("#wa-conversation")!;
  let query = "", offset = 0, selected = "", conversationKind = "messages", conversationOffset = 0;
  const fail = (target: Element, error: unknown) => { target.textContent = error instanceof Error ? error.message : "Please try again."; };
  async function refreshSummary() {
    const result = await api("/manage/whatsapp/summary") as Summary;
    summary.innerHTML = `<div class="stats"><div class="stat"><span>Conversations</span><b>${result.counts.contact.toLocaleString()}</b></div><div class="stat"><span>Messages</span><b>${result.counts.messages.toLocaleString()}</b></div><div class="stat"><span>Event clues to review</span><b>${result.counts.review.toLocaleString()}</b></div></div><p>${result.imports.length ? "Archive import verified. Your existing customers and events are unchanged." : "No completed import yet. Saved partial batches can be resumed."}</p>`;
  }
  async function showConversation() {
    conversation.hidden = false;
    conversation.textContent = "Loading conversation…";
    try {
      const result = await api(`/manage/whatsapp/chat/${encodeURIComponent(selected)}?kind=${conversationKind}&offset=${conversationOffset}`) as Conversation;
      conversation.innerHTML = `<div class="section-heading"><div><span class="eyebrow">Unverified contact</span><h2>${escape(result.contact.sender_name_candidates || result.contact.chat_label)}</h2><p>${escape(result.contact.phone_candidate || result.contact.chat_label)}</p></div><button id="wa-close" class="outline small">Close conversation</button></div><div class="actions"><button id="wa-messages" class="${conversationKind === "messages" ? "" : "outline"} small">Original messages</button><button id="wa-review" class="${conversationKind === "review" ? "" : "outline"} small">Event clues & nearby replies</button></div><p class="muted">${result.chunks ? `Part ${result.offset + 1} of ${result.chunks}` : "No matching records"} · Original local timestamps</p>${result.rows.map(row => `<article class="whatsapp-message ${row.direction === "outgoing" ? "wa-outgoing" : ""}"><small>${escape(row.timestamp_local)} · ${escape(row.direction)} · ${escape(row.sender_name || row.categories || "")}</small><p>${escape(row.content ?? row.cue_text)}</p>${row.reply_candidate_text ? `<p class="hint">Nearby replies to review: ${escape(row.reply_candidate_text)}</p>` : ""}<small>${escape(row.cue_categories || row.categories || "")} · Evidence ${escape(row.message_id || row.cue_message_id)} · Source row ${escape(row.source_record)}</small></article>`).join("")}<div class="actions"><button id="wa-chat-prev" class="outline small" ${result.offset === 0 ? "disabled" : ""}>Previous part</button><button id="wa-chat-next" class="outline small" ${result.offset + 1 >= result.chunks ? "disabled" : ""}>Next part</button></div>`;
      conversation.querySelector("#wa-close")!.addEventListener("click", () => { conversation.hidden = true; });
      for (const kind of ["messages", "review"]) conversation.querySelector(`#wa-${kind}`)!.addEventListener("click", () => { conversationKind = kind; conversationOffset = 0; void showConversation(); });
      conversation.querySelector("#wa-chat-prev")!.addEventListener("click", () => { conversationOffset--; void showConversation(); });
      conversation.querySelector("#wa-chat-next")!.addEventListener("click", () => { conversationOffset++; void showConversation(); });
    } catch (error) { fail(conversation, error); }
  }
  async function refreshList() {
    try {
      const result = await api(`/manage/whatsapp/chats?q=${encodeURIComponent(query)}&offset=${offset}`) as List;
      list.innerHTML = `<p>${result.total.toLocaleString()} conversations${result.total ? ` · ${offset + 1}–${Math.min(offset + 30, result.total)}` : ""}</p>${result.chats.map(chat => { const row = chat.rows[0]; return `<div class="row"><div class="row-main"><h3>${escape(row.sender_name_candidates || row.chat_label)}</h3><p>${escape(row.phone_candidate || row.chat_label)} · ${escape(row.message_count)} messages</p><small>${escape(row.first_message)} → ${escape(row.last_message)}</small></div><button class="outline small" data-wa-chat="${escape(chat.key)}">Review conversation</button></div>`; }).join("") || '<p class="muted">No conversations found.</p>'}<div class="actions"><button id="wa-prev" class="outline small" ${offset === 0 ? "disabled" : ""}>Previous</button><button id="wa-next" class="outline small" ${offset + 30 >= result.total ? "disabled" : ""}>Next</button></div>`;
      list.querySelectorAll<HTMLElement>("[data-wa-chat]").forEach(button => button.addEventListener("click", () => { selected = button.dataset.waChat!; conversationOffset = 0; conversationKind = "messages"; void showConversation(); }));
      list.querySelector("#wa-prev")!.addEventListener("click", () => { offset -= 30; void refreshList(); });
      list.querySelector("#wa-next")!.addEventListener("click", () => { offset += 30; void refreshList(); });
    } catch (error) { fail(list, error); }
  }
  root.querySelector("#wa-search-form")!.addEventListener("submit", event => { event.preventDefault(); query = root.querySelector<HTMLInputElement>("#wa-search")!.value; offset = 0; void refreshList(); });
  let paused = false, importing = false;
  const start = root.querySelector<HTMLButtonElement>("#wa-start")!;
  const pause = root.querySelector<HTMLButtonElement>("#wa-pause")!;
  const progress = root.querySelector("#wa-progress")!;
  pause.addEventListener("click", () => { paused = true; pause.disabled = true; progress.textContent = "Pausing after the current batch…"; });
  start.addEventListener("click", async () => {
    if (importing) return;
    const file = root.querySelector<HTMLInputElement>("#wa-file")!.files?.[0];
    if (!file || !file.name.endsWith(".ndjson")) { progress.textContent = "Choose the prepared .ndjson file first."; return; }
    importing = true; paused = false; start.disabled = true; pause.hidden = false; pause.disabled = false;
    const reader = file.stream().getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "", batches = 0, completed = false;
    try {
      async function processLine(line: string) {
        if (!line.trim()) return;
        const body = JSON.parse(line);
        if (body.complete) {
          await api("/manage/whatsapp/complete", "POST", { sourceHash: body.sourceHash, expected: body.expected });
          completed = true;
        } else {
          await api("/manage/whatsapp/import", "POST", body);
          batches++;
          progress.textContent = `Saved ${batches} batches. Keep this tab open while importing.`;
        }
      }
      while (!paused) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        let end: number;
        while (!paused && (end = buffer.indexOf("\n")) >= 0) { await processLine(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
        if (buffer.length > 512000) throw new Error("Archive batch is too large.");
        if (chunk.done) { if (!paused && buffer.trim()) await processLine(buffer); break; }
      }
      progress.textContent = completed ? "Import complete. All expected conversations, messages and event clues verified." : "Import paused. Choose the same file and import again to resume safely.";
    } catch (error) { fail(progress, error); progress.textContent += " Your saved batches are safe; import the same file again to resume."; }
    finally { await reader.cancel(); importing = false; start.disabled = false; pause.hidden = true; await refreshSummary().catch(error => fail(summary, error)); await refreshList(); }
  });
  await refreshSummary().catch(error => fail(summary, error));
  await refreshList();
}
