import type { BirthdaySettings, BirthdayProfile, BirthdayRow, BirthdayDraft } from "./birthday-crm.js";
import type { Customer } from "./models.js";

type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
interface BirthdayData {
  settings: BirthdaySettings; today: string;
  customers: { customer: Customer; profile: BirthdayProfile; rows: BirthdayRow[]; bookings: { id: string; name: string; date: string; status: string; occasion: string }[]; history: BirthdayDraft[] }[];
}
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
function styleForms(root: HTMLElement) {
  root.querySelectorAll<HTMLFormElement>("form").forEach(form => { form.classList.add("forms-grid"); form.style.marginBlock = "18px"; });
  root.querySelectorAll<HTMLLabelElement>("label").forEach(label => {
    label.className = label.querySelector('input[type="checkbox"]') ? "check" : "field";
    label.style.marginBlockEnd = "12px";
    if (label.className === "check") label.style.gridColumn = "1 / -1";
  });
  root.querySelectorAll<HTMLElement>("form > p, form > button").forEach(el => { el.style.gridColumn = "1 / -1"; el.style.justifySelf = "start"; });
}
export async function renderBirthdayCrm(root: HTMLElement, api: Api, owner: boolean, editCustomer: (id: string) => void) {
  root.innerHTML = '<section class="panel"><h2>Birthday CRM</h2><p role="status">Loading birthday plans…</p></section>';
  try {
    const data = await api<BirthdayData>("/manage/birthdays");
    const s = data.settings;
    root.innerHTML = `<section class="panel"><div class="section-heading"><div><p class="eyebrow">A little care, every year</p><h2>Birthday CRM</h2></div><button id="birthday-refresh" class="outline small">Refresh & prepare drafts</button></div><p>Start ${s.startDays} days before a birthday. Follow up at your customer's pace, then stop when booked.</p><p class="privacy">Internal drafts only. This planner never sends messages or opens a messaging app. Record birthday-message permission only after the customer has given it. Offers consent and Do not contact also apply.</p><p>Today: ${escape(data.today)} · Planner ${s.enabled ? "enabled" : "disabled"} · ${data.customers.reduce((n,c)=>n+c.rows.filter(r=>r.status==="Ready for review").length,0)} ready for review</p><div id="birthday-notice" role="status"></div></section>
    ${owner ? `<details class="panel"><summary><b>Planner & affordable bundle settings</b></summary><form id="birthday-settings"><label><input name="enabled" type="checkbox" ${s.enabled ? "checked" : ""}> Enable birthday planner</label><label>Start days before birthday<input name="startDays" type="number" min="1" max="90" required value="${s.startDays}"></label><label>Default interval for new customer plans (days)<input name="intervalDays" type="number" min="1" max="90" required value="${s.intervalDays}"></label><label>Countdown draft<textarea name="reminderText" required maxlength="3000">${escape(s.reminderText)}</textarea></label><p class="muted">Placeholders: {customer}, {child}, {date}, {business}.</p><label><input name="bundleEnabled" type="checkbox" ${s.bundleEnabled ? "checked" : ""}> Prepare one affordable bundle offer 10 days after birthday if still unbooked</label><label>Bundle name<input name="bundleName" maxlength="150" value="${escape(s.bundleName)}"></label><label>Price, inclusions and conditions<textarea name="bundleDetails" maxlength="2000">${escape(s.bundleDetails)}</textarea></label><label>Bundle draft<textarea name="bundleText" required maxlength="3000">${escape(s.bundleText)}</textarea></label><p class="muted">Bundle placeholders also include {bundle} and {details}. Set real agreed commercial details; nothing is priced automatically.</p><button>Save planner settings</button></form></details>` : ""}
    <section class="panel"><label>Find customer or child<input id="birthday-search" type="search" placeholder="Customer or child name"></label><label>Status<select id="birthday-filter"><option value="">All statuses</option><option>Ready for review</option><option>Scheduled</option><option>Paused</option><option>Consent required</option><option>Opted out</option><option>Booked — prompts stopped</option></select></label><button id="birthday-add-customer" class="outline small">＋ Add customer & birthday</button></section><div id="birthday-customers"></div>`;
    const error = (err: unknown) => { root.querySelector("#birthday-notice")!.textContent = err instanceof Error ? err.message : String(err); };
    const reload = () => renderBirthdayCrm(root, api, owner, editCustomer);
    root.querySelector("#birthday-refresh")!.addEventListener("click", () => { void api("/manage/birthdays/generate", "POST", {}).then(reload).catch(error); });
    root.querySelector("#birthday-add-customer")!.addEventListener("click", () => editCustomer("new"));
    root.querySelector<HTMLFormElement>("#birthday-settings")?.addEventListener("submit", ev => {
      ev.preventDefault(); const form = new FormData(ev.currentTarget as HTMLFormElement);
      void api("/manage/birthdays/settings", "PUT", { enabled: form.has("enabled"), startDays: Number(form.get("startDays")), intervalDays: Number(form.get("intervalDays")), bundleEnabled: form.has("bundleEnabled"), bundleName: form.get("bundleName"), bundleDetails: form.get("bundleDetails"), reminderText: form.get("reminderText"), bundleText: form.get("bundleText"), revision: s.revision }).then(reload).catch(error);
    });
    const list = root.querySelector<HTMLElement>("#birthday-customers")!;
    styleForms(root);
    const renderList = () => {
      const query = root.querySelector<HTMLInputElement>("#birthday-search")!.value.toLowerCase();
      const status = root.querySelector<HTMLSelectElement>("#birthday-filter")!.value;
      const visible = data.customers.filter(c => (query || c.customer.children.length || c.profile.revision) && `${c.customer.name} ${c.customer.children.map(ch=>ch.name).join(" ")}`.toLowerCase().includes(query) && (!status || c.rows.some(r=>r.status===status))).slice(0, 30);
      list.innerHTML = visible.map(({customer:c,profile:p,rows,bookings,history}) => `<article class="panel" data-customer="${escape(c.id)}"><div class="section-heading"><h3>${escape(c.name)}</h3><button class="outline small" data-birthday-edit="${escape(c.id)}">Edit customer & birthdays</button></div><p>${c.doNotContact ? "Do not contact" : c.offersConsent ? "Offers consent recorded" : "No offers consent"}</p>${rows.map(r=>`<div class="row"><div><b>${escape(r.child)} · ${escape(r.birthday)}</b><p>${escape(r.status)} · Next planning date: ${escape(r.nextDate || "—")}</p>${r.bookingIds.length ? '<p class="muted">Accepted/confirmed/completed birthday booking within 30 days: prompts stopped conservatively for this family.</p>' : ""}</div></div>`).join("") || '<p class="muted">Add a child’s verified date of birth to start planning. Historical event dates are separate.</p>'}<form data-birthday-profile="${escape(c.id)}"><label><input name="enabled" type="checkbox" ${p.enabled ? "checked" : ""}> Birthday reminders enabled (uncheck to pause)</label><label><input name="messageConsent" type="checkbox" ${p.messageConsent ? "checked" : ""}> Customer has agreed to birthday messages</label><label>Reminder interval<select name="preset"><option value="5" ${p.intervalDays===5 ? "selected" : ""}>Every 5 days</option><option value="8" ${p.intervalDays===8 ? "selected" : ""}>Every 8 days</option><option value="custom" ${![5,8].includes(p.intervalDays) ? "selected" : ""}>Custom</option></select></label><label>Custom interval (days)<input name="custom" type="number" min="1" max="90" required value="${p.intervalDays}"></label><label>Do not remind before (optional next date)<input name="nextReminderDate" type="date" value="${escape(p.nextReminderDate)}"></label><button class="small">Save customer plan</button></form><details><summary>Booking history (${bookings.length}) & birthday draft history (${history.length})</summary>${bookings.map(b=>`<p>${escape(b.date)} · ${escape(b.name)} · ${escape(b.status)} · ${escape(b.occasion)}</p>`).join("") || '<p>No bookings recorded.</p>'}${history.slice().reverse().map(d=>`<article class="panel"><b>${escape(d.child)} · ${escape(d.kind)} · ${escape(d.date)} · ${escape(d.status)}</b><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(d.draft)}</p>${d.status==="prepared" ? `<form data-birthday-complete="${escape(d.id)}"><label>Internal completion note<input name="note" maxlength="2000" required placeholder="Why this follow-up is complete"></label><button class="outline small">Mark reviewed / handled</button></form>` : ""}</article>`).join("")}</details></article>`).join("") || '<section class="panel"><p>No matching customers.</p></section>';
      list.querySelectorAll<HTMLButtonElement>("[data-birthday-edit]").forEach(button=>button.addEventListener("click",()=>editCustomer(button.dataset.birthdayEdit!)));
      list.querySelectorAll<HTMLFormElement>("[data-birthday-profile]").forEach(form=>form.addEventListener("submit",ev=>{
        ev.preventDefault(); const fields=new FormData(form), item=data.customers.find(c=>c.customer.id===form.dataset.birthdayProfile)!;
        void api(`/manage/birthdays/customers/${encodeURIComponent(item.customer.id)}`,"PUT",{ enabled:fields.has("enabled"),messageConsent:fields.has("messageConsent"),intervalDays:Number(fields.get("preset")==="custom"?fields.get("custom"):fields.get("preset")),nextReminderDate:fields.get("nextReminderDate"),revision:item.profile.revision }).then(reload).catch(error);
      }));
      list.querySelectorAll<HTMLFormElement>("[data-birthday-complete]").forEach(form=>form.addEventListener("submit",ev=>{
        ev.preventDefault(); const draft=data.customers.flatMap(c=>c.history).find(d=>d.id===form.dataset.birthdayComplete)!;
        void api(`/manage/birthdays/${encodeURIComponent(draft.id)}/complete`,"POST",{revision:draft.revision,note:new FormData(form).get("note")}).then(reload).catch(error);
      }));
      styleForms(list);
    };
    root.querySelector("#birthday-search")!.addEventListener("input",renderList);
    root.querySelector("#birthday-filter")!.addEventListener("change",renderList);
    renderList();
  } catch (err) { root.textContent = `Could not load birthday CRM: ${err instanceof Error ? err.message : String(err)}`; }
}
