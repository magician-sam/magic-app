import type { Campaign, CampaignInput } from "./messaging.js";
type Api = (path: string, method?: string, body?: unknown) => Promise<unknown>;
type Customer = { id: string; name: string; phone: string; offersConsent: boolean };
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]!);
const templates = {
  reminder: "Hi {name}! A friendly reminder about your upcoming event with {company}. Please let us know if any details have changed.",
  event_update: "Hi {name}! We have an update about your event: [add the details here]. Thank you, {company}.",
  app_invite: "Hi {name}! Discover our shows and build your next event with {company}: {app_link}\nReply STOP if you do not want future invitations.",
  public_show: "Hi {name}! You're invited to our public show on [date] at [time], [venue]. [Add booking information.] See you there! — {company}\nReply STOP to stop invitations.",
  offer: "Hi {name}! We have a new offer for your next celebration: [offer details and dates]. Explore it here: {app_link}\nReply STOP to stop offers.",
  announcement: "Hi {name}! Something new is coming to {company}: [announcement]. Take a look: {app_link}\nReply STOP to stop announcements.",
  custom: "Hi {name}! [Your message here.] — {company}",
} as const;
const names = { reminder: "Event reminder", event_update: "Event update", app_invite: "Invite to the app", public_show: "Public-show invitation", offer: "Offer or discount", announcement: "New show or announcement", custom: "Custom marketing message" };

export async function renderMessaging(root: Element, api: Api) {
  root.innerHTML = '<section class="panel"><p>Loading your messaging desk…</p></section>';
  try {
    const data = await api("/manage/messaging") as { customers: Customer[]; campaigns: Campaign[] };
    root.innerHTML = `<section class="panel"><span class="eyebrow">Stay in touch</span><h2>A little message. A new reason to celebrate.</h2><p>Prepare SMS or WhatsApp messages for one customer, selected customers or your eligible customer list.</p><p class="hint">Individual messages open in WhatsApp or your phone's SMS app for you to send. Automatic bulk delivery is not connected yet. Imported WhatsApp contacts stay in the review archive until verified as customers.</p><form id="message-form"><div class="two-col"><label>Campaign name<input name="title" required maxlength="120" placeholder="October public-show invitation"></label><label>Channel<select name="channel"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label><label>Message type<select name="purpose">${Object.entries(names).map(([key, label]) => `<option value="${key}">${escape(label)}</option>`).join("")}</select></label><label>Audience<select name="audience"><option value="selected">One or selected customers</option><option value="all">All eligible customers</option></select></label></div><details open id="message-customer-picker"><summary>Select customers (${data.customers.length})</summary><input id="message-customer-search" class="search" aria-label="Find a customer" placeholder="Search names or phone numbers"><div class="message-customer-list">${data.customers.map(customer => `<label class="message-customer" data-name="${escape((customer.name + " " + customer.phone).toLowerCase())}"><input type="checkbox" name="customerIds" value="${escape(customer.id)}"><span><strong>${escape(customer.name)}</strong><small>${escape(customer.phone)} · ${customer.offersConsent ? "Offers permitted" : "Event messages only"}</small></span></label>`).join("") || '<p>Add or verify customers before preparing a message.</p>'}</div></details><div class="section-heading"><label for="campaign-message">Your message</label><button type="button" id="message-template" class="small outline">Use template</button></div><textarea id="campaign-message" name="message" required maxlength="1600" rows="6">${escape(templates.reminder)}</textarea><p class="muted">Use {name}, {company} and {app_link} to personalize each message. Replace any [bracketed details] before saving.</p><label>Planned date and time (optional)<input name="plannedAt" type="datetime-local"></label><p class="muted">This records your plan; messages will not send automatically.</p><div id="message-preview" role="status" aria-live="polite"></div><div class="actions"><button type="button" id="preview-audience" class="outline">Check audience</button><button type="submit">Save message draft</button></div></form></section><section class="panel"><h2>Message drafts & manual history</h2><div id="message-drafts"></div></section>`;
    const form = root.querySelector<HTMLFormElement>("#message-form")!;
    const preview = root.querySelector("#message-preview")!;
    const drafts = root.querySelector("#message-drafts")!;
    function read(): CampaignInput {
      const values = new FormData(form), localDate = String(values.get("plannedAt") ?? "");
      return { title: String(values.get("title") || "Message draft"), channel: String(values.get("channel")) as CampaignInput["channel"], purpose: String(values.get("purpose")) as CampaignInput["purpose"], message: String(values.get("message")), audience: String(values.get("audience")) as CampaignInput["audience"], customerIds: values.getAll("customerIds").map(String), plannedAt: localDate ? new Date(localDate).toISOString() : "" };
    }
    const fail = (error: unknown) => { preview.textContent = error instanceof Error ? error.message : "Please try again."; };
    root.querySelector("#message-template")!.addEventListener("click", () => { root.querySelector<HTMLTextAreaElement>("#campaign-message")!.value = templates[read().purpose]; });
    form.querySelector<HTMLSelectElement>('select[name="audience"]')!.addEventListener("change", () => { root.querySelector<HTMLElement>("#message-customer-picker")!.hidden = read().audience === "all"; });
    root.querySelector("#message-customer-search")!.addEventListener("input", event => { const query = (event.target as HTMLInputElement).value.toLowerCase(); root.querySelectorAll<HTMLElement>(".message-customer").forEach(label => { label.hidden = !label.dataset.name!.includes(query); }); });
    root.querySelector("#preview-audience")!.addEventListener("click", async () => {
      try { const result = await api("/manage/messaging/preview", "POST", read()) as Pick<Campaign, "recipients" | "exclusions">; preview.textContent = `${result.recipients.length} eligible customers. Excluded: ${result.exclusions.noConsent} without marketing permission, ${result.exclusions.doNotContact} marked do not contact, ${result.exclusions.duplicatePhone} duplicate numbers, ${result.exclusions.invalidPhone} invalid numbers.`; }
      catch (error) { fail(error); }
    });
    function renderDrafts() {
      drafts.innerHTML = data.campaigns.map(campaign => `<article class="message-draft"><div class="section-heading"><div><h3>${escape(campaign.title)}</h3><p>${escape(campaign.channel.toUpperCase())} · ${escape(names[campaign.purpose])} · ${campaign.recipients.length} recipients · ${campaign.recipients.filter(recipient => recipient.markedSentAt).length} marked sent manually</p>${campaign.plannedAt ? `<small>Planned: ${escape(new Date(campaign.plannedAt).toLocaleString())} · manual delivery</small>` : ""}</div><div class="actions"><button class="outline small" data-message-copy="${escape(campaign.id)}">Copy & edit</button><button class="outline small" data-message-archive="${escape(campaign.id)}">Archive draft</button></div></div><p class="message-copy">${escape(campaign.message)}</p><details><summary>Review recipients & prepare messages</summary><div data-message-recipients="${escape(campaign.id)}"></div><div class="message-prepared" data-message-prepared="${escape(campaign.id)}" role="status"></div></details></article>`).join("") || '<p class="muted">Your saved messages will appear here. Nothing is sent when you save a draft.</p>';
      drafts.querySelectorAll<HTMLElement>("[data-message-copy]").forEach(button => button.addEventListener("click", () => {
        const campaign = data.campaigns.find(item => item.id === button.dataset.messageCopy)!;
        for (const key of ["title", "channel", "purpose", "message", "audience"] as const) (form.querySelector(`[name="${key}"]`) as HTMLInputElement).value = key === "title" ? campaign.title + " copy" : campaign[key];
        form.querySelectorAll<HTMLInputElement>('[name="customerIds"]').forEach(input => { input.checked = campaign.customerIds.includes(input.value); });
        root.querySelector<HTMLElement>("#message-customer-picker")!.hidden = campaign.audience === "all";
        preview.textContent = "Copy loaded. Edit the message, then save it as a separate draft.";
        form.scrollIntoView({ block: "start", behavior: "smooth" });
      }));
      for (const campaign of data.campaigns) {
        let page = 0;
        const list = drafts.querySelector(`[data-message-recipients="${campaign.id}"]`)!;
        function recipientPage() {
          list.innerHTML = campaign.recipients.slice(page * 30, page * 30 + 30).map(recipient => `<div class="row"><div class="row-main"><b>${escape(recipient.name)}</b><small>${escape(recipient.phone)}${recipient.markedSentAt ? " · Marked sent manually" : ""}</small></div><button class="outline small" data-message-prepare="${escape(recipient.customerId)}">Prepare message</button>${!recipient.markedSentAt ? `<button class="outline small" data-message-sent="${escape(recipient.customerId)}">I sent this</button>` : ""}</div>`).join("") + `<div class="actions"><button class="small outline" data-message-prev ${page === 0 ? "disabled" : ""}>Previous</button><button class="small outline" data-message-next ${(page + 1) * 30 >= campaign.recipients.length ? "disabled" : ""}>Next</button></div>`;
          list.querySelector("[data-message-prev]")!.addEventListener("click", () => { page--; recipientPage(); });
          list.querySelector("[data-message-next]")!.addEventListener("click", () => { page++; recipientPage(); });
          list.querySelectorAll<HTMLElement>("[data-message-prepare]").forEach(button => button.addEventListener("click", async () => {
            const output = drafts.querySelector(`[data-message-prepared="${campaign.id}"]`)!;
            try { const result = await api(`/manage/messaging/${campaign.id}/prepare/${button.dataset.messagePrepare}`, "POST", {}) as { url: string; text: string; name: string; channel: string }; output.innerHTML = `<h4>Ready for ${escape(result.name)}</h4><p class="message-copy">${escape(result.text)}</p><a class="button small" href="${escape(result.url)}" target="_blank" rel="noopener noreferrer">Open ${result.channel === "whatsapp" ? "WhatsApp" : "phone SMS app"} ↗</a><p class="muted">Review and send there. Preparing a message does not send it.</p>`; }
            catch (error) { output.textContent = error instanceof Error ? error.message : "Please try again."; }
          }));
          list.querySelectorAll<HTMLElement>("[data-message-sent]").forEach(button => button.addEventListener("click", async () => {
            try { const next = await api(`/manage/messaging/${campaign.id}/marked-sent/${button.dataset.messageSent}`, "POST", {}) as Campaign; data.campaigns = data.campaigns.map(item => item.id === next.id ? next : item); renderDrafts(); }
            catch (error) { fail(error); }
          }));
        }
        recipientPage();
      }
      drafts.querySelectorAll<HTMLElement>("[data-message-archive]").forEach(button => button.addEventListener("click", async () => {
        try { await api(`/manage/messaging/${button.dataset.messageArchive}/archive`, "POST", {}); data.campaigns = data.campaigns.filter(item => item.id !== button.dataset.messageArchive); renderDrafts(); }
        catch (error) { fail(error); }
      }));
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!; button.disabled = true;
      try { const campaign = await api("/manage/messaging/drafts", "POST", read()) as Campaign; data.campaigns.unshift(campaign); renderDrafts(); preview.textContent = "Draft saved. No messages have been sent."; }
      catch (error) { fail(error); } finally { button.disabled = false; }
    });
    renderDrafts();
  } catch (error) { root.textContent = error instanceof Error ? error.message : "Unable to load messaging."; }
}

