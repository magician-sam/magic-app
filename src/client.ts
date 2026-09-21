import { reportPeriod } from "./reports.js";
import type { ContactEntry } from "./contact-history.js";
import { monthDays, shiftMonth } from "./calendar.js";
import type { CustomField } from "./custom-fields.js";
import type { RewardSettings } from "./rewards.js";
import type { RewardAward } from "./reward-ledger.js";
import type {
  Catalog,
  Dashboard,
  Booking,
  Customer,
  Package,
  Performer,
  Quote,
} from "./models.js";

const app = document.querySelector<HTMLDivElement>("#app")!;
const modal = document.querySelector<HTMLDialogElement>("#modal")!;
const e = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: state?.business.currency ?? catalog?.business.currency ?? "USD",
    maximumFractionDigits: 2,
  }).format(value / 100);
const pretty = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (x) => x.toUpperCase());
const day = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone:
      state?.business.timezone ?? catalog?.business.timezone ?? "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const badge = (value: string) =>
  `<span class="badge ${e(value)}">${e(pretty(value))}</span>`;
const brand = (name = "Magic App", logo = "") =>
  `<a href="/" class="brand">${logo ? `<img class="brand-logo" src="${e(logo)}" alt="${e(name)} logo" width="76" height="76" referrerpolicy="no-referrer">` : '<span class="brand-mark" aria-hidden="true">✦</span>'}<span>${e(name)}</span></a>`;
const empty = (title: string, description: string) =>
  `<div class="empty"><span class="spark" aria-hidden="true">✧</span><h3>${e(title)}</h3><p>${e(description)}</p></div>`;
let catalog: Catalog;
let state: Dashboard | undefined;
let currentView = "today";
let calendarMonth = "",
  calendarDay = "",
  calendarStatus = "all",
  calendarPerformer = "";
let basket: string[] = [];
let selectedPerformers: string[] = [];
let noticeTimer: ReturnType<typeof setTimeout>;
function notify(message: string) {
  const n = document.querySelector("#notice")!;
  n.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (n.textContent = ""), 6500);
}
async function api<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (location.pathname === "/event")
    headers["X-Event-Token"] = location.hash.slice(1);
  const result = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await result.json();
  if (!result.ok)
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}
function on(
  root: ParentNode,
  selector: string,
  event: string,
  handler: (event: Event) => void | Promise<void>,
) {
  root.querySelectorAll(selector).forEach((el) =>
    el.addEventListener(event, (ev) => {
      Promise.resolve(handler(ev)).catch((error) => notify(error.message));
    }),
  );
}
function openDialog(title: string, content: string) {
  modal.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${e(title)}</h2><button class="close" aria-label="Close dialog" type="button">×</button></div>${content}`;
  modal.querySelector(".close")!.addEventListener("click", () => modal.close());
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
}
function submit(
  form: HTMLFormElement,
  handler: (data: FormData) => Promise<void>,
) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>(
      "button[type=submit]",
    )!;
    const error = form.querySelector(".form-error")!;
    error.textContent = "";
    button.disabled = true;
    try {
      await handler(new FormData(form));
    } catch (err) {
      error.textContent =
        err instanceof Error ? err.message : "Unable to save. Try again.";
    } finally {
      button.disabled = false;
    }
  });
}
type Field = {
  autocomplete?: string;
  key: string;
  label: string;
  type?: string;
  value?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
  wide?: boolean;
  min?: number;
  max?: number;
  step?: string;
};
function field(f: Field) {
  const value = f.value ?? "";
  const attrs = `name="${e(f.key)}" id="f-${e(f.key)}" aria-label="${e(f.label)}" ${f.help ? `aria-describedby="help-${e(f.key)}"` : ""} ${f.required ? "required" : ""} ${f.min !== undefined ? `min="${f.min}"` : ""} ${f.max !== undefined ? `max="${f.max}"` : ""}`;
  if (f.type === "checkbox")
    return `<label class="check ${f.wide ? "wide" : ""}"><input type="checkbox" ${attrs} ${value ? "checked" : ""}>${e(f.label)}</label>`;
  const input =
    f.type === "textarea"
      ? `<textarea ${attrs}>${e(value)}</textarea>`
      : f.type === "select"
        ? `<select ${attrs}>${f.options?.map((o) => `<option value="${e(o.value)}" ${String(value) === o.value ? "selected" : ""}>${e(o.label)}</option>`).join("")}</select>`
        : `<input type="${e(f.type ?? "text")}" autocomplete="${e(f.autocomplete ?? "off")}" ${attrs} value="${e(value)}" ${f.step ? `step="${e(f.step)}"` : ""}>`;
  return `<label class="field ${f.wide ? "wide" : ""}" for="f-${e(f.key)}">${e(f.label)}${input}${f.help ? `<small id="help-${e(f.key)}">${e(f.help)}</small>` : ""}</label>`;
}
const options = (values: string[]) =>
  values.map((v) => ({ value: v, label: pretty(v) }));
function formBody(fields: Field[], extra = "", label = "Save changes") {
  return `<form><div class="forms-grid">${fields.map(field).join("")}</div>${extra}<div class="form-error" role="alert"></div><div class="form-actions"><button type="submit">${e(label)}</button></div></form>`;
}
function formValues(data: FormData, fields: Field[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.type === "checkbox"
        ? data.has(f.key)
        : f.type === "number"
          ? Number(data.get(f.key))
          : String(data.get(f.key) ?? ""),
    ]),
  );
}
function choices(
  name: string,
  values: { id: string; name: string }[],
  selected: string[],
  label: string,
) {
  return `<fieldset><legend>${e(label)}</legend>${values.map((v) => `<label class="check"><input type="checkbox" name="${e(name)}" value="${e(v.id)}" ${selected.includes(v.id) ? "checked" : ""}>${e(v.name)}</label>`).join("") || "<small>Add a performer in the Performers section first.</small>"}</fieldset>`;
}
function selected(data: FormData, key: string) {
  return data.getAll(key).map(String);
}
const categoryIcon: Record<string, string> = {
  magic: "✦",
  science: "⚗",
  bubbles: "◌",
  other: "★",
};
function price(p: Package) {
  return p.priceMode === "quote"
    ? "Quote required"
    : `${p.priceMode === "from" ? "From " : ""}${money(p.price)}`;
}
function showCard(p: Package) {
  return `<article class="show-card"><div class="show-art ${e(p.category)}" aria-hidden="true"><span class="art-icon">${categoryIcon[p.category] ?? "★"}</span></div><div class="show-body"><span class="eyebrow">${e(p.category)} · ${p.duration} minutes</span><h3>${e(p.name)}</h3><p>${e(p.description)}</p>${p.previewVideo ? `<p><a href="${e(p.previewVideo)}" target="_blank" rel="noopener noreferrer">Watch a quick preview ↗</a></p>` : ""}<div class="show-meta">${e(price(p))}</div><button data-add="${e(p.id)}" class="${basket.includes(p.id) ? "secondary" : "outline"}">${basket.includes(p.id) ? "✓ In your event box" : "＋ Add to my event"}</button></div></article>`;
}
function renderBox() {
  const chosen = catalog.packages.filter((p) => basket.includes(p.id));
  const node = document.querySelector("#event-box")!;
  node.innerHTML = `<span class="eyebrow">A celebration, your way</span><h3>Your event box <span aria-hidden="true">✧</span></h3><p>Good things come together here.</p>${chosen.length ? chosen.map((p) => `<div class="box-item"><span>${e(p.name)}<br><small>${p.duration} min · ${e(price(p))}</small></span><button class="link" data-remove="${e(p.id)}" aria-label="Remove ${e(p.name)}">×</button></div>`).join("") : `<div class="box-empty"><span>✦</span>A little empty. Full of possibilities.<br><small>Add a show to start the fun.</small></div>`}${selectedPerformers.length ? `<p>${selectedPerformers.length} performer preference(s) added</p>` : ""}<div class="box-total"><span>Show time</span><strong>${chosen.reduce((n, p) => n + p.duration, 0)} min</strong></div>${chosen.length ? `<div class="box-total"><span>${chosen.some((p) => p.priceMode === "quote") ? "Your price" : "Package estimate"}</span><strong>${chosen.some((p) => p.priceMode === "quote") ? "Personal quote" : money(chosen.reduce((n, p) => n + p.price, 0))}</strong></div>` : ""}<button id="request" ${chosen.length ? "" : "disabled"}>Request my event <span aria-hidden="true">→</span></button><p class="box-note">No payment now. We’ll check availability and send your proposal. Your request is not a confirmed booking. Setup, breaks and travel are reviewed separately.</p>`;
  on(node, "[data-remove]", "click", (ev) => {
    basket = basket.filter(
      (id) => id !== (ev.currentTarget as HTMLElement).dataset.remove,
    );
    renderPublic();
  });
  on(node, "#request", "click", () => requestForm());
}
let showMore = false;
function renderPublic() {
  document.title = `${catalog.business.name} · Make room for wonder`;
  app.innerHTML = `<div class="wrap"><header class="site-header">${brand(catalog.business.name, catalog.business.logo)}<nav class="site-nav" aria-label="Main navigation"><a href="#shows">The shows</a><a href="#adult-magic">Adult magic</a>${catalog.business.characterNames?.length ? '<a href="#characters">Characters</a>' : ""}<button class="link" id="customer-account">My account</button><a href="#performers">The people</a><a href="#how">How it works</a><a class="button secondary small" href="#event-box">Your event box (${basket.length}) ↗</a></nav></header><main id="main"><section class="hero"><div class="hero-copy"><div class="eyebrow">✦ Small moments. Big memories.</div><h1>Make room<br>for a little<br><em>wonder.</em></h1><p>${e(catalog.business.intro)}</p><div class="actions"><a class="button" href="#shows">Let’s build your event <span aria-hidden="true">↗</span></a><button class="outline" id="help-choose">Help me choose</button></div><div class="micro muted">Birthdays, school days & just-because days.</div></div><div class="stage" role="img" aria-label="A playful illustrated theatre with a magician’s hat, wand, stars and bubbles"><span class="big-star">✦</span><span class="tiny-star">✧</span><span class="tiny-star second">✦</span><div class="bubble b1"></div><div class="bubble b2"></div><div class="bubble b3"></div><div class="wand"></div><div class="hat"></div><span class="stage-caption">LET THE HAPPY HAPPEN</span><span class="floating-ticket">One event.<br>So many possibilities.</span></div></section><div class="ribbon"><span><b>✧</b> Made for your celebration</span><span><b>◷</b> Availability checked personally</span><span><b>♡</b> A little extra imagination</span></div><section id="shows" class="section"><div class="section-heading"><div><span class="eyebrow">Pick your kind of extraordinary</span><h2>${showMore ? "More Shows" : "Fast Order"}</h2></div><p>Mix a little magic with a lot of joy.</p></div><div class="builder-layout"><div class="cards">${catalog.packages
    .filter(
      (p) =>
        showMore ||
        (p.fastOrder ?? ["magic", "science", "bubbles"].includes(p.id)),
    )
    .map(showCard)
    .join(
      "",
    )}${showMore ? (catalog.business.otherShowNames ?? []).map(enquiryCard).join("") : ""}<article class="show-card"><div class="show-art other" aria-hidden="true"><span class="art-icon">🎭</span></div><div class="show-body"><span class="eyebrow">Even more possibilities</span><h3>${showMore ? "Back to Fast Order" : "More Shows"}</h3><p>Explore the full cast of celebrations. New shows appear here when the business adds them.</p><button class="outline" id="more-shows">${showMore ? "See quick choices" : "Explore all shows →"}</button></div></article></div><aside class="event-box" id="event-box" aria-label="Your event box"></aside></div></section><section id="adult-magic" class="section"><div class="section-heading"><div><span class="eyebrow">Wonder has no age limit</span><h2>Adult Magic Shows</h2></div><p>Bring a little surprise to your celebration. Pick a show and tell us what you have in mind.</p></div><div class="cards">${
    catalog.packages
      .filter((p) => p.adultShow ?? p.category.toLowerCase() === "magic")
      .map(showCard)
      .join("") ||
    '<p class="muted">New adult magic options are being prepared. Explore our shows or contact us to plan your event.</p>'
  }</div></section>${catalog.business.characterNames?.length ? `<section id="characters" class="section"><div class="section-heading"><div><span class="eyebrow">A very special guest</span><h2>Characters</h2></div><p>A whole cast of happy surprises, changing with the seasons.</p></div><div class="cards"><article class="show-card"><div class="show-art other" aria-hidden="true"><span class="art-icon">🎭</span></div><div class="show-body"><span class="eyebrow">Meet your surprise guest</span><h3>Choose your character</h3><p>Explore the current cast and find a favourite for your celebration.</p><button id="choose-character" class="outline">Meet the characters →</button></div></article></div></section>` : ""}<section class="how" id="how"><h2>From “what if”<br>to “wow!”</h2><div class="step"><span>01</span><b>Dream it up</b><p>Pick your shows and tell us about your celebration.</p></div><div class="step"><span>02</span><b>Make it yours</b><p>We check the details and put your proposal together.</p></div><div class="step"><span>03</span><b>Let the fun begin</b><p>Once approved and confirmed, it’s time to look forward to the big day.</p></div></section><section id="performers" class="section"><div class="section-heading"><div><span class="eyebrow">Meet the makers of happy</span><h2>People with a little extra sparkle.</h2></div></div><div class="profile-grid">${catalog.performers.map((p) => `<article class="panel profile">${p.photo ? `<img src="${e(p.photo)}" alt="${e(p.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="profile-placeholder" aria-hidden="true">✦</div>'}<h3>${e(p.name)}</h3>${p.membershipVerified ? '<span class="badge">Verified membership</span>' : ""}<p>${e(p.bio)}</p><p class="muted">${e(p.areas)}</p>${p.video ? `<p><a href="${e(p.video)}" target="_blank" rel="noopener noreferrer">Watch a show ↗</a></p>` : ""}<button data-performer="${e(p.id)}" class="outline">${selectedPerformers.includes(p.id) ? "✓ Added · remove" : "Add to my event"}</button></article>`).join("") || empty("The cast is coming together", "Performer profiles will appear here once they’re ready. You can still request your favourite shows.")}</div></section>${catalog.reviews.length ? `<section class="section"><span class="eyebrow">After the applause</span><h2>Happy memories, in their words.</h2><div class="profile-grid">${catalog.reviews.map((r) => `<article class="review"><div class="review-stars" aria-label="${r.overall} out of 5 stars">${"★".repeat(r.overall)}${"☆".repeat(5 - r.overall)}</div><p>${e(r.text)}</p><small>${e(catalog.performers.find((p) => p.id === r.performerId)?.name ?? "Overall event")} · Verified event review</small>${r.photo ? `<img src="${e(r.photo)}" alt="Customer-shared event memory" loading="lazy" width="180" referrerpolicy="no-referrer">` : ""}</article>`).join("")}</div></section>` : ""}</main><footer class="footer"><span>✦ ${e(catalog.business.name)} · A little wonder goes a long way.</span><div class="links">${catalog.business.instagram ? `<a href="${e(catalog.business.instagram)}" target="_blank" rel="noopener noreferrer">Instagram ↗</a>` : ""}${catalog.business.whatsapp ? `<a href="https://wa.me/${e(catalog.business.whatsapp.replace(/\D/g, "").replace(/^00/, ""))}?text=${encodeURIComponent("Hello! I would like help planning an entertainment event.")}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>` : ""}${catalog.business.contactEmail ? `<a href="mailto:${e(catalog.business.contactEmail)}">${e(catalog.business.contactEmail)}</a>` : ""}<a href="/manage">Backstage login</a><button class="link" id="privacy">Privacy</button></div></footer>${catalog.business.whatsapp ? `<a class="whatsapp-button" href="https://wa.me/${e(catalog.business.whatsapp.replace(/\D/g, "").replace(/^00/, ""))}?text=${encodeURIComponent("Hello! I would like help planning an entertainment event.")}" target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp (opens a new tab)">✆ Let’s chat on WhatsApp ↗</a>` : ""}</div>`;
  renderBox();
  on(app, "#choose-character", "click", () => chooseCharacter());
  on(app, "#customer-account", "click", () => customerAccount());
  on(app, "#more-shows", "click", () => {
    showMore = !showMore;
    renderPublic();
    document.querySelector("#shows")?.scrollIntoView();
  });
  on(app, "[data-add]", "click", (ev) => {
    const key = (ev.currentTarget as HTMLElement).dataset.add!;
    basket = basket.includes(key)
      ? basket.filter((x) => x !== key)
      : [...basket, key];
    renderPublic();
    notify(
      basket.includes(key)
        ? "A little more wonder in your event box."
        : "Show removed from your event box.",
    );
  });
  on(app, "[data-performer]", "click", (ev) => {
    const key = (ev.currentTarget as HTMLElement).dataset.performer!;
    selectedPerformers = selectedPerformers.includes(key)
      ? selectedPerformers.filter((x) => x !== key)
      : [...selectedPerformers, key];
    renderPublic();
  });
  on(app, "#help-choose", "click", () => helpChoose());
  on(app, "#privacy", "click", () =>
    openDialog(
      "Your details, handled with care",
      `<p>We use the contact and event details you submit to prepare and manage your celebration. Marketing permission is optional. Event photos and reviews are published only with your permission.</p><p>Your private event link gives access to your proposal and event details. Keep it private. Business staff and authorized platform support can access records to help manage your event; platform support access is logged.</p><p>We count page views by source without identifying anonymous visitors. Contact the business to request a correction or discuss retention and deletion of your records.</p>`,
    ),
  );
}
function enquiryLinks(name: string) {
  const business = catalog.business;
  return business.whatsapp
    ? `<a class="button outline" href="https://wa.me/${e(business.whatsapp.replace(/\D/g, "").replace(/^00/, ""))}?text=${encodeURIComponent("Hello! I would like to ask about " + name + " for my event.")}" target="_blank" rel="noopener noreferrer">Ask about ${e(name)} ↗</a>`
    : business.contactEmail
      ? `<a class="button outline" href="mailto:${e(business.contactEmail)}?subject=${encodeURIComponent(name + " event enquiry")}">Ask about ${e(name)} ↗</a>`
      : '<p class="muted">Enquiry details coming soon.</p>';
}
function enquiryCard(name: string) {
  const icon = /animation/i.test(name)
    ? "🎉"
    : /dog/i.test(name)
      ? "🐶"
      : /bmx/i.test(name)
        ? "🚲"
        : /clown/i.test(name)
          ? "🤡"
          : /juggl/i.test(name)
            ? "🤹"
            : /dance/i.test(name)
              ? "♫"
              : "✦";
  return `<article class="show-card"><div class="show-art other" aria-hidden="true"><span class="art-icon">${icon}</span></div><div class="show-body"><span class="eyebrow">More ways to celebrate</span><h3>${e(name)}</h3><p>Tell us about your event. Timing, venue needs, availability and price are agreed in your quote.</p>${enquiryLinks(name)}</div></article>`;
}
function chooseCharacter() {
  const names = catalog.business.characterNames ?? [];
  openDialog(
    "Who’s joining the party?",
    formBody(
      [
        {
          key: "character",
          label: "Choose a character",
          type: "select",
          options: options(names),
          required: true,
        },
      ],
      "<p>Our cast changes with the seasons. Pick your favourite to ask about details and availability.</p>",
      "Choose this character",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const name = String(data.get("character"));
    if (!names.includes(name))
      throw new Error("Please choose a current character.");
    openDialog(
      name + " for your celebration",
      `<p>A special guest, a happy memory. Ask us about your date and the visit you have in mind.</p>${enquiryLinks(name)}<p class="privacy">An enquiry does not reserve a character. The team confirms availability and the final details before a booking is confirmed.</p><button class="link" id="back-to-characters">Choose another character</button>`,
    );
    on(modal, "#back-to-characters", "click", () => chooseCharacter());
  });
}
function eventFields(b?: Partial<Booking>): Field[] {
  return [
    {
      key: "name",
      label: "Event name",
      value: b?.name,
      required: true,
      help: "For example: Maya’s birthday or School science day",
    },
    {
      key: "occasion",
      label: "Occasion",
      type: "select",
      value: b?.occasion ?? "Birthday",
      options: options([
        "Birthday",
        "School event",
        "Family celebration",
        "Corporate event",
        "Other",
      ]),
    },
    {
      key: "date",
      label: "Event date",
      type: "date",
      value: b?.date,
      required: true,
    },
    {
      key: "time",
      label: `Show start time (${catalog?.business.timezone ?? state?.business.timezone ?? "Asia/Beirut"})`,
      type: "time",
      value: b?.time,
      required: true,
    },
    {
      key: "location",
      label: "Venue / location",
      value: b?.location,
      required: true,
      wide: true,
    },
    {
      key: "audience",
      label: "Number of guests",
      type: "number",
      value: b?.audience ?? 20,
      min: 1,
      max: 10000,
      required: true,
    },
    {
      key: "age",
      label: "Main audience age",
      type: "number",
      value: b?.age ?? 7,
      min: 0,
      max: 99,
      required: true,
    },
    {
      key: "space",
      label: "Clear performance area (m²)",
      type: "number",
      value: b?.space ?? 20,
      min: 1,
      max: 100000,
      required: true,
    },
    {
      key: "source",
      label: "How did you find us?",
      type: "select",
      value:
        b?.source ??
        new URLSearchParams(location.search).get("source") ??
        "direct",
      options: options([
        "direct",
        "instagram",
        "whatsapp",
        "referral",
        "school",
        "other",
      ]),
    },
    {
      key: "indoor",
      label: "The performance is indoors",
      type: "checkbox",
      value: b?.indoor ?? true,
    },
    {
      key: "power",
      label: "Electricity is available",
      type: "checkbox",
      value: b?.power ?? true,
    },
    {
      key: "notes",
      label: "Anything else we should know?",
      type: "textarea",
      value: b?.notes,
      wide: true,
    },
  ];
}
async function requestForm() {
  let account: { profile: { name: string; phone: string; email: string } };
  try {
    account = await api(`/customer/${catalog.business.slug}/me`);
  } catch {
    customerAuth(true);
    return;
  }
  const questions = (catalog.customFields ?? []).filter((f) => f.active);
  const extras = catalog.packages.filter(
    (p) => p.checkoutExtra && !basket.includes(p.id),
  );
  const fields = eventFields();
  openDialog(
    "Let’s make a happy day.",
    formBody(
      [
        ...fields,
        ...questions.map((f) => ({
          key: "custom-" + f.id,
          label: f.label,
          type: f.type,
          required: f.required,
          options: f.options.map((value) => ({ value, label: value })),
          wide: f.type === "textarea",
        })),
      ],
      `${extras.length ? `<fieldset><legend>A little extra wow? (optional)</legend><p>Pick only the extras you want. We will include them in your quote and check suitability before confirmation.</p>${extras.map((p) => `<label class="check"><input type="checkbox" name="checkout-extra" value="${e(p.id)}">${e(p.name)} · ${p.duration} min · ${e(price(p))}</label>`).join("")}</fieldset>` : ""}<p>Booking as <strong>${e(account.profile.name)}</strong> · ${e(account.profile.phone)}. You can edit these in My account.</p><p class="hint">${basket.map((key) => e(catalog.packages.find((p) => p.id === key)?.name)).join(" + ")}<br>This is a request, not a confirmed booking. We’ll check the venue, date and performers before confirming.</p><p class="privacy">We use these details to manage your event. Authorized staff and logged platform support can access event records. Save your private link after submitting.</p>`,
      "Send my event request →",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const result = await api<{ path: string }>(
      `/public/${catalog.business.slug}/requests`,
      "POST",
      {
        customAnswers: Object.fromEntries(
          questions.map((f) => {
            const value = String(data.get("custom-" + f.id) ?? "");
            return [
              f.id,
              f.type === "number" && value !== "" ? Number(value) : value,
            ];
          }),
        ),
        event: {
          ...formValues(data, fields),
          packageIds: [
            ...new Set([...basket, ...selected(data, "checkout-extra")]),
          ],
          performerIds: selectedPerformers,
        },
      },
    );
    modal.close();
    location.href = result.path;
  });
}
function helpChoose() {
  const fields: Field[] = [
    {
      key: "occasion",
      label: "What are we celebrating?",
      type: "select",
      options: options([
        "Birthday",
        "School event",
        "Adult celebration",
        "Corporate event",
        "Other",
      ]),
    },
    {
      key: "space",
      label: "Performance area (m²)",
      type: "number",
      value: 20,
      min: 1,
      required: true,
    },
    {
      key: "budget",
      label: "Optional package budget (USD)",
      type: "number",
      min: 0,
      step: "0.01",
    },
    { key: "indoor", label: "Indoor venue", type: "checkbox", value: true },
    {
      key: "power",
      label: "Electricity available",
      type: "checkbox",
      value: true,
    },
  ];
  openDialog(
    "Find your kind of wonder",
    formBody(
      fields,
      '<p class="privacy">All shows welcome every age. Recommendations use venue needs and any published prices. Quote-only packages need a personal price check.</p>',
      "Find my shows",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const budget = Number(data.get("budget")) * 100;
    const matches = catalog.packages.filter(
      (p) =>
        (!p.indoorOnly || data.has("indoor")) &&
        (!p.needsPower || data.has("power")) &&
        Number(data.get("space")) >= p.minSpace &&
        (!budget || p.priceMode === "quote" || p.price <= budget),
    );
    matches.sort((a, b) =>
      data.get("occasion") === "School event"
        ? Number(b.category === "science") - Number(a.category === "science")
        : ["Adult celebration", "Corporate event"].includes(
              String(data.get("occasion")),
            )
          ? Number(b.adultShow ?? b.category.toLowerCase() === "magic") -
            Number(a.adultShow ?? a.category.toLowerCase() === "magic")
          : 0,
    );
    openDialog(
      "A little inspiration for your day",
      matches.length
        ? `${matches.map((p) => `<div class="row"><div><h3>${e(p.name)}</h3><p>${p.duration} minutes · ${e(price(p))}</p></div><button data-recommend="${p.id}" class="small">Add to event box</button></div>`).join("")}<p class="privacy">Each show is checked separately against your budget. Your combined event receives its own quote.</p>`
        : empty(
            "Let’s tailor something for you",
            "No published show matches all those details. Try another venue setup or contact us using the links on the website.",
          ),
    );
    on(modal, "[data-recommend]", "click", (ev) => {
      const key = (ev.currentTarget as HTMLElement).dataset.recommend!;
      if (!basket.includes(key)) basket.push(key);
      renderPublic();
      modal.close();
      notify("Added to your event box.");
    });
  });
}

function customerAuth(orderAfter = false, register = true) {
  const fields: Field[] = register
    ? [
        { key: "name", label: "Your name", required: true },
        {
          key: "phone",
          label: "Phone / WhatsApp with country code",
          autocomplete: "tel",
          type: "tel",
          required: true,
        },
        {
          key: "referralCode",
          label: "Referral code (optional)",
          value: new URLSearchParams(location.search).get("ref") ?? "",
        },
        {
          key: "username",
          label: "Your username",
          value: `guest-${crypto.randomUUID().slice(0, 8)}`,
          autocomplete: "username",
          required: true,
          help: "We picked one for you. Keep it or choose your own.",
        },
        {
          key: "password",
          label: "Choose a password (12 characters minimum)",
          autocomplete: "new-password",
          type: "password",
          required: true,
        },
      ]
    : [
        {
          key: "username",
          label: "Username",
          autocomplete: "username",
          required: true,
        },
        {
          key: "password",
          label: "Password",
          type: "password",
          required: true,
        },
      ];
  openDialog(
    register ? "Your next happy memory starts here" : "Welcome back to the fun",
    formBody(
      fields,
      '<p class="privacy">Your account shows only your own events. Email and children’s details are optional. Phone verification is not connected yet; keep your username and password safe.</p>',
      register ? "Create my customer account" : "Sign in",
    ) +
      '<button class="link" id="switch-customer-auth">' +
      (register
        ? "Already have an account? Sign in"
        : "New here? Create an account") +
      "</button>",
  );
  if (!register) {
    const forgot = document.createElement("button");
    forgot.className = "link";
    forgot.textContent = "Forgot password?";
    forgot.addEventListener("click", () => customerResetRequest());
    modal.append(forgot);
  }
  on(modal, "#switch-customer-auth", "click", () =>
    customerAuth(orderAfter, !register),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const result = await api<{ username?: string }>(
      `/customer/${catalog.business.slug}/${register ? "register" : "login"}`,
      "POST",
      formValues(data, fields),
    );
    if (result.username)
      notify(
        `Your username is ${result.username}. Save it or change it in My account.`,
      );
    if (orderAfter) await requestForm();
    else await customerAccount();
  });
}
function customerResetRequest() {
  openDialog(
    "Let’s get you back in",
    formBody(
      [
        {
          key: "username",
          label: "Username",
          autocomplete: "username",
          required: true,
        },
        {
          key: "phone",
          label: "Phone number on your account",
          type: "tel",
          autocomplete: "tel",
          required: true,
        },
      ],
      "<p>The team will verify your identity before giving you a reset code. Automatic SMS delivery is not connected yet. If you also forgot your username, contact the business.</p>",
      "Request password help",
    ) +
      '<button class="link" id="have-reset-code">I already have a reset code</button>',
  );
  on(modal, "#have-reset-code", "click", () => customerResetComplete());
  submit(modal.querySelector("form")!, async (data) => {
    const response = await api<{ message: string }>(
      `/customer/${catalog.business.slug}/reset/request`,
      "POST",
      Object.fromEntries(data),
    );
    openDialog(
      "Password help requested",
      "<p>" +
        e(response.message) +
        "</p>" +
        (catalog.business.whatsapp
          ? '<a class="button outline" target="_blank" rel="noopener noreferrer" href="https://wa.me/' +
            e(catalog.business.whatsapp.replace(/\D/g, "")) +
            "?text=" +
            encodeURIComponent(
              "Hello, I need help recovering my customer account. Please help me verify my identity.",
            ) +
            '">Contact us on WhatsApp</a>'
          : "") +
        '<button id="have-reset-code">Enter my reset code</button>',
    );
    on(modal, "#have-reset-code", "click", () =>
      customerResetComplete(String(data.get("username"))),
    );
  });
}
function customerResetComplete(username = "", code = "") {
  openDialog(
    "A fresh start",
    formBody(
      [
        {
          key: "username",
          label: "Username",
          value: username,
          autocomplete: "username",
          required: true,
        },
        {
          key: "code",
          label: "Private reset code",
          value: code,
          required: true,
        },
        {
          key: "password",
          label: "New password (12 characters minimum)",
          type: "password",
          autocomplete: "new-password",
          required: true,
        },
      ],
      "<p>Your code works once and expires 30 minutes after it is issued. Resetting signs out all existing customer sessions.</p>",
      "Reset my password",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api(
      `/customer/${catalog.business.slug}/reset/complete`,
      "POST",
      Object.fromEntries(data),
    );
    notify("Password reset. Please sign in with your new password.");
    customerAuth(false, false);
  });
}
async function customerResetQueue() {
  const requests = await api<
    {
      id: string;
      username: string;
      name: string;
      phone: string;
      issued: boolean;
    }[]
  >("/manage/customer-resets");
  openDialog(
    "Customer password help",
    "<p>Verify the customer’s identity through an established contact channel before issuing a code. A supplied name and phone alone are not proof. Codes are never sent automatically.</p>" +
      (requests
        .map(
          (r) =>
            '<div class="row"><div><h3>' +
            e(r.name) +
            "</h3><p>" +
            e(r.username) +
            " · " +
            e(r.phone) +
            '</p></div><button class="outline small" data-reset-request="' +
            e(r.id) +
            '">' +
            (r.issued ? "Replace reset code" : "Review request") +
            "</button></div>",
        )
        .join("") || "<p>No open reset requests.</p>"),
  );
  on(modal, "[data-reset-request]", "click", (ev) => {
    const r = requests.find(
      (x) => x.id === (ev.currentTarget as HTMLElement).dataset.resetRequest,
    )!;
    openDialog(
      "Verify before resetting",
      formBody(
        [
          {
            key: "identityVerified",
            label:
              "I independently verified this customer’s identity through an established contact channel",
            type: "checkbox",
            required: true,
          },
        ],
        "<p>" +
          e(r.name) +
          " · " +
          e(r.username) +
          "</p><p>A new code invalidates any previous code. Share it only with the verified customer.</p>",
        "Issue private reset code",
      ),
    );
    submit(modal.querySelector("form")!, async (data) => {
      const result = await api<{ code: string }>(
        `/manage/customer-resets/${r.id}/issue`,
        "POST",
        { identityVerified: data.has("identityVerified") },
      );
      const link =
        location.origin +
        "/b/" +
        encodeURIComponent(state!.business.slug) +
        "?reset=1&username=" +
        encodeURIComponent(r.username) +
        "#" +
        result.code;
      openDialog(
        "Private reset details",
        "<p>Valid for 30 minutes and one use. Copy now; the code is not stored in readable form.</p>" +
          field({
            key: "reset-link",
            label: "Private reset link",
            value: link,
          }) +
          field({
            key: "reset-code",
            label: "Private reset code",
            value: result.code,
          }) +
          "<p>No message has been sent. Share privately with the verified customer.</p>",
      );
    });
  });
}
async function customerAccount() {
  type Account = {
    username: string;
    referralCode: string;
    rewards: {
      settings: RewardSettings;
      profilePoints: number;
      qualifyingEvents: number;
      awards: {
        id: string;
        kind: string;
        percent: number;
        terms: string;
        status: string;
      }[];
    };
    profile: {
      name: string;
      phone: string;
      email: string;
      childrenAges: number[];
    };
    bookings: { id: string; name: string; date: string; status: string }[];
  };
  let account: Account;
  try {
    account = await api<Account>(`/customer/${catalog.business.slug}/me`);
  } catch {
    customerAuth();
    return;
  }
  const fields: Field[] = [
    {
      key: "username",
      label: "Username",
      value: account.username,
      required: true,
      help: "3–40 letters, numbers, underscores or hyphens.",
    },
    {
      key: "name",
      label: "Your name",
      value: account.profile.name,
      required: true,
    },
    {
      key: "phone",
      label: "Phone / WhatsApp with country code",
      type: "tel",
      value: account.profile.phone,
      required: true,
    },
    {
      key: "email",
      label: "Email (optional)",
      type: "email",
      value: account.profile.email,
    },
    {
      key: "childrenAges",
      label: "Children’s ages (optional)",
      value: account.profile.childrenAges.join(", "),
      help: "One age per child, separated by commas. No names or exact birthdays needed. Leave blank to skip or remove.",
    },
  ];
  openDialog(
    "My little world of wonder",
    "<p>Your username: <strong>" +
      e(account.username) +
      '</strong>. Save it for next time.</p><p class="privacy">Phone number supplied by you; not yet verified. Only your events appear here.</p>' +
      formBody(fields) +
      "<h3>A little extra sparkle</h3><p>" +
      account.rewards.profilePoints +
      " profile points · a profile-completion score, not payment credit.</p><p>Optional email: " +
      account.rewards.settings.emailPoints +
      " points. Optional children’s ages: " +
      account.rewards.settings.childrenPoints +
      " points total, regardless of how many children.</p>" +
      (account.rewards.settings.enabled
        ? "<p>" +
          account.rewards.qualifyingEvents +
          " / " +
          account.rewards.settings.eventsForFree +
          " qualifying events toward a free magic show.</p><p>Referral discount: " +
          account.rewards.settings.discountPercent +
          "%. Loyalty: " +
          account.rewards.settings.loyaltyPercent +
          "% after every " +
          account.rewards.settings.loyaltyEvery +
          " qualifying personal events.</p><p>" +
          e(account.rewards.settings.terms) +
          "</p><p>The team reviews earned rewards and applies them to your proposal. Review the reduced total before accepting.</p>"
        : "<p>Referral rewards are being prepared. No discount or free-show offer is active yet.</p>") +
      "<h3>My issued rewards</h3>" +
      (account.rewards.awards
        .map(
          (a) =>
            '<div class="row"><div><strong>' +
            e(pretty(a.kind)) +
            " · " +
            a.percent +
            "%</strong><p>" +
            e(a.terms) +
            "</p></div>" +
            badge(a.status) +
            "</div>",
        )
        .join("") || "<p>No rewards issued yet.</p>") +
      "<p>Your referral code: <strong>" +
      e(account.referralCode) +
      '</strong></p><p><a href="/b/' +
      e(catalog.business.slug) +
      "?ref=" +
      e(account.referralCode) +
      '">Your shareable invitation link ↗</a></p><h3>My celebrations</h3>' +
      (account.bookings
        .map(
          (b) =>
            '<div class="row"><div><h3>' +
            e(b.name) +
            "</h3><p>" +
            day(b.date) +
            " · " +
            e(pretty(b.status)) +
            '</p></div><button class="outline small" data-customer-event="' +
            e(b.id) +
            '">Open my event</button></div>',
        )
        .join("") ||
        "<p>Your first happy day is waiting. Add a show to your event box.</p>") +
      '<button class="link" id="customer-password">Change password</button><button class="link" id="customer-logout">Sign out</button>',
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api(`/customer/${catalog.business.slug}/profile`, "PUT", {
      ...formValues(data, fields),
      childrenAges: String(data.get("childrenAges") ?? "").trim()
        ? String(data.get("childrenAges"))
            .split(",")
            .map((x) => Number(x.trim()))
        : [],
    });
    notify("Your profile is saved.");
    await customerAccount();
  });
  on(modal, "#customer-password", "click", () => {
    openDialog(
      "Change my password",
      formBody(
        [
          {
            key: "currentPassword",
            label: "Current password",
            type: "password",
            required: true,
          },
          {
            key: "password",
            label: "New password (12 characters minimum)",
            type: "password",
            required: true,
          },
        ],
        "<p>All customer sessions will be signed out.</p>",
      ),
    );
    submit(modal.querySelector("form")!, async (data) => {
      await api(
        `/customer/${catalog.business.slug}/password`,
        "POST",
        Object.fromEntries(data),
      );
      customerAuth(false, false);
    });
  });
  on(modal, "#customer-logout", "click", async () => {
    await api(`/customer/${catalog.business.slug}/logout`, "POST", {});
    modal.close();
    notify("You are signed out.");
  });
  on(modal, "[data-customer-event]", "click", async (ev) => {
    const key = (ev.currentTarget as HTMLElement).dataset.customerEvent;
    const result = await api<{ path: string }>(
      `/customer/${catalog.business.slug}/bookings/${key}/open`,
      "POST",
      {},
    );
    location.href = result.path;
  });
}

async function login() {
  app.innerHTML = `<main id="main" class="login"><section class="panel">${brand()}<h1>Hello, backstage.</h1><p class="muted">A little less admin. A lot more showtime.</p>${formBody(
    [
      { key: "email", label: "Email", type: "email", required: true },
      { key: "password", label: "Password", type: "password", required: true },
    ],
    "",
    "Step inside →",
  )}<p class="privacy">Each business has its own private records. Authorized platform support access is disclosed and logged.</p><a href="/">← Back to the happy side</a></section></main>`;
  submit(app.querySelector("form")!, async (data) => {
    await api("/login", "POST", Object.fromEntries(data));
    await loadDashboard();
  });
}
async function loadDashboard() {
  state = await api<Dashboard>("/manage/state");
  renderDashboard();
}
const navItems = [
  ["today", "✦", "Today"],
  ["bookings", "▤", "Events & requests"],
  ["calendar", "▦", "Calendar"],
  ["customers", "♡", "Customers"],
  ["packages", "✧", "Shows & packages"],
  ["performers", "☆", "Performers"],
  ["money", "$", "Money & reports"],
  ["reminders", "◷", "Follow-ups"],
  ["reviews", "★", "Reviews"],
  ["settings", "⚙", "Settings & history"],
];
function bookingMoney(b: Booking) {
  const q = b.quotes.find((q) => q.id === b.acceptedQuoteId);
  const entries = state!.money.filter((m) => m.bookingId === b.id);
  const paid = entries.reduce(
    (s, m) =>
      s +
      (m.kind === "payment" ? m.amount : m.kind === "refund" ? -m.amount : 0),
    0,
  );
  const expense = entries
    .filter((m) => m.kind === "expense")
    .reduce((s, m) => s + m.amount, 0);
  return {
    agreed: q?.amount ?? 0,
    paid,
    balance: (q?.amount ?? 0) - paid,
    expense,
    profit: (q?.amount ?? 0) - expense,
  };
}
function stats() {
  const live = state!.bookings.filter((b) =>
    ["confirmed", "completed"].includes(b.status),
  );
  return `<div class="stats"><div class="stat"><span>Requests to review</span><b>${state!.bookings.filter((b) => ["requested", "availability_pending"].includes(b.status)).length}</b></div><div class="stat"><span>Confirmed booking value</span><b>${money(live.reduce((s, b) => s + bookingMoney(b).agreed, 0))}</b></div><div class="stat"><span>Net payments recorded</span><b>${money(state!.bookings.reduce((s, b) => s + bookingMoney(b).paid, 0))}</b></div><div class="stat"><span>Balance on confirmed events</span><b>${money(live.reduce((s, b) => s + bookingMoney(b).balance, 0))}</b></div></div>`;
}
function bookingRow(b: Booking) {
  return `<div class="row"><div class="date-tile">${e(new Date(`${b.date}T12:00:00`).toLocaleDateString("en", { month: "short" }))}<b>${e(b.date.slice(8))}</b></div><div class="row-main"><h3>${e(b.name)}</h3><p>${e(b.time)} · ${e(b.location)}</p></div>${badge(b.status)}<button class="small outline" data-booking="${b.id}">Open event ↗</button></div>`;
}
function renderDashboard() {
  if (!state) return;
  const title = navItems.find((n) => n[0] === currentView)?.[2] ?? "Today";
  app.innerHTML = `<div class="dashboard"><aside class="sidebar">${brand()}<nav aria-label="Dashboard">${navItems
    .filter(
      (n) =>
        state!.user.role !== "performer" ||
        ["today", "bookings", "calendar", "settings"].includes(n[0]),
    )
    .map(
      ([key, icon, label]) =>
        `<button data-nav="${key}" class="${key === currentView ? "active" : ""}" ${key === currentView ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}</button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><b>${e(state.business.name)}</b><p>${e(state.user.name)} · ${e(state.user.role)}</p><button id="logout" class="link">Sign out</button></div></aside><main class="dash-main" id="main"><header class="dash-top"><div><span class="eyebrow">Your little corner of backstage</span><h1>${currentView === "today" ? "Let’s make good days happen." : e(title)}</h1></div><a href="/b/${e(state.business.slug)}" class="button outline small" target="_blank" rel="noopener">View website ↗</a></header><div id="dash-content"></div><button id="mobile-logout" class="link mobile-only">Sign out</button></main></div>`;
  on(app, "[data-nav]", "click", (ev) => {
    currentView = (ev.currentTarget as HTMLElement).dataset.nav!;
    renderDashboard();
  });
  on(app, "#logout,#mobile-logout", "click", async () => {
    await api("/logout", "POST", {});
    state = undefined;
    await login();
  });
  const content = app.querySelector("#dash-content")!;
  if (currentView === "today") {
    const upcoming = state.bookings
      .filter((b) => b.status !== "cancelled" && b.status !== "completed")
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 6);
    content.innerHTML = `<div class="welcome"><div><h2>A little planning. A lot of magic.</h2><p>${day(localToday())} · ${e(state.business.timezone)} · Your next happy moments start here.</p></div><span class="spark" aria-hidden="true">✦</span></div>${state.user.role !== "performer" ? stats() : ""}<div class="two-col"><section class="panel"><div class="section-heading"><h3>Coming up next</h3><button class="link" data-go="calendar">View calendar →</button></div>${upcoming.map(bookingRow).join("") || empty("Your next big day starts here", "Share your website link to receive your first event request.")}</section><section class="panel"><h3>A little nudge</h3>${
      state.reminders
        .filter((r) => !r.done)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5)
        .map(
          (r) =>
            `<div class="row"><div><h3>${e(r.title)}</h3><p>${day(r.date)}</p></div><button class="small outline" data-edit="reminders:${r.id}">Open</button></div>`,
        )
        .join("") ||
      '<p class="muted">No follow-ups waiting. Enjoy the breathing room.</p>'
    }<button class="outline small" data-go="reminders">Plan a follow-up</button><hr><h3>Before the curtain goes up</h3><p class="muted">${state.bookings.filter((b) => (!b.performerIds.length || b.performerIds.some((p) => b.availability[p] !== "available")) && !["cancelled", "completed"].includes(b.status)).length} events still need performer availability.</p></section></div>`;
  } else if (currentView === "calendar") {
    renderCalendar(content);
    return;
  } else if (currentView === "bookings") renderBookings(content);
  else if (currentView === "customers") renderCustomers(content);
  else if (currentView === "packages" || currentView === "performers")
    renderCatalogAdmin(content, currentView);
  else if (currentView === "money") renderMoney(content);
  else if (currentView === "reminders") renderReminders(content);
  else if (currentView === "reviews") renderReviews(content);
  else renderSettings(content);
  wireDashboard(content);
}
function wireDashboard(root: ParentNode) {
  on(root, "[data-booking]", "click", (ev) =>
    openBooking((ev.currentTarget as HTMLElement).dataset.booking!),
  );
  on(root, "[data-go]", "click", (ev) => {
    currentView = (ev.currentTarget as HTMLElement).dataset.go!;
    renderDashboard();
  });
  on(root, "[data-edit]", "click", (ev) => {
    const [kind, key] = (ev.currentTarget as HTMLElement).dataset.edit!.split(
      ":",
    );
    editRecord(kind, key);
  });
  on(root, "[data-delete]", "click", (ev) => {
    const [kind, key] = (ev.currentTarget as HTMLElement).dataset.delete!.split(
      ":",
    );
    confirmRemove(kind, key);
  });
}
function renderBookings(root: Element) {
  root.innerHTML = `<div class="toolbar"><input class="search" id="booking-search" aria-label="Search events" placeholder="Find a happy day…"><div class="actions">${currentView === "calendar" ? '<button class="outline small" data-edit="blocks:new">＋ Block availability</button>' : ""}<a class="button small" href="/b/${state!.business.slug}" target="_blank" rel="noopener">＋ Create a request ↗</a></div></div><div class="filter-chips">${["all", "requested", "availability_pending", "quoted", "accepted", "confirmed", "completed", "cancelled"].map((s) => `<button data-filter="${s}" class="secondary ${s === "all" ? "active" : ""}">${pretty(s)}</button>`).join("")}</div><section class="panel" id="booking-list"></section>${currentView === "calendar" ? `<section class="panel"><h3>Unavailable times</h3>${state!.blocks.map((b) => `<div class="row"><div><h3>${e(state!.performers.find((p) => p.id === b.performerId)?.name)}</h3><p>${day(b.date)} · ${b.start}–${b.end} · ${e(b.note)}</p></div><button class="small outline" data-edit="blocks:${b.id}">Edit</button><button class="small danger" data-delete="blocks:${b.id}">Remove</button></div>`).join("") || '<p class="muted">No unavailable times recorded.</p>'}</section>` : ""}`;
  let filter = "all";
  let search = "";
  const list = () => {
    const bookings = state!.bookings
      .filter(
        (b) =>
          (filter === "all" || b.status === filter) &&
          `${b.name} ${b.location} ${b.date}`.toLowerCase().includes(search),
      )
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const el = root.querySelector("#booking-list")!;
    el.innerHTML =
      bookings.map(bookingRow).join("") ||
      empty(
        "No events here yet",
        "New requests, accepted proposals and confirmed shows each have their own place.",
      );
    wireDashboard(el);
  };
  list();
  on(root, "#booking-search", "input", (ev) => {
    search = (ev.currentTarget as HTMLInputElement).value.toLowerCase();
    list();
  });
  on(root, "[data-filter]", "click", (ev) => {
    filter = (ev.currentTarget as HTMLElement).dataset.filter!;
    root
      .querySelectorAll("[data-filter]")
      .forEach((el) =>
        el.classList.toggle(
          "active",
          (el as HTMLElement).dataset.filter === filter,
        ),
      );
    list();
  });
}
function renderCalendar(root: Element) {
  const today = localToday();
  calendarMonth ||= today.slice(0, 7);
  const events = state!.bookings
    .filter(
      (b) =>
        b.date.startsWith(calendarMonth) &&
        (calendarStatus === "all" || b.status === calendarStatus) &&
        (!calendarPerformer || b.performerIds.includes(calendarPerformer)),
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const blocks = state!.blocks.filter(
    (b) =>
      b.date.startsWith(calendarMonth) &&
      (!calendarPerformer || b.performerId === calendarPerformer),
  );
  const title = new Date(`${calendarMonth}-01T12:00:00Z`).toLocaleDateString(
    "en-GB",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const shown = events.filter((b) => !calendarDay || b.date === calendarDay);
  const unavailable = blocks.filter(
    (b) => !calendarDay || b.date === calendarDay,
  );
  root.innerHTML = `<section class="panel calendar-panel"><div class="toolbar"><div><h2>${e(title)}</h2><p class="muted">${e(state!.business.timezone)} · Requests are provisional. Empty days do not guarantee availability.</p></div><button class="outline small" data-edit="blocks:new">＋ Block availability</button></div><div class="calendar-controls"><button class="outline small" id="calendar-prev" aria-label="Previous month" ${calendarMonth === "1900-01" ? "disabled" : ""}>←</button><label>Month<input type="month" id="calendar-month" min="1900-01" max="2299-12" value="${calendarMonth}"></label><button class="outline small" id="calendar-next" aria-label="Next month" ${calendarMonth === "2299-12" ? "disabled" : ""}>→</button><button class="outline small" id="calendar-today">This month</button><label>Event status<select id="calendar-status" aria-label="Event status">${["all", "requested", "availability_pending", "quoted", "accepted", "confirmed", "completed", "cancelled"].map((s) => `<option value="${s}" ${s === calendarStatus ? "selected" : ""}>${pretty(s)}</option>`).join("")}</select></label><label>Performer<select id="calendar-performer" aria-label="Performer"><option value="">All performers</option>${state!.performers.map((p) => `<option value="${e(p.id)}" ${p.id === calendarPerformer ? "selected" : ""}>${e(p.name)}</option>`).join("")}</select></label></div><p class="calendar-key">${badge("requested")} ${badge("accepted")} ${badge("confirmed")} <span class="badge">Unavailable time</span></p><p class="muted mobile-only">Swipe the calendar sideways to see the full week. Your agenda is below.</p><div class="calendar-scroll" tabindex="0" role="region" aria-label="Monthly event calendar"><div class="month-grid">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="weekday">${d}</div>`).join("")}${monthDays(
    calendarMonth,
  )
    .map((date) => {
      if (!date) return '<div class="calendar-blank" aria-hidden="true"></div>';
      const dayEvents = events.filter((b) => b.date === date),
        dayBlocks = blocks.filter((b) => b.date === date);
      return `<section class="calendar-day ${date === today ? "is-today" : ""} ${date === calendarDay ? "is-selected" : ""}" aria-label="${e(day(date))}"><button class="day-number" data-calendar-day="${date}" aria-label="Show ${e(day(date))}: ${dayEvents.length} events, ${dayBlocks.length} unavailable times" aria-pressed="${date === calendarDay}">${Number(date.slice(8))}${date === today ? '<span class="sr-only">Today</span>' : ""}</button>${dayEvents
        .slice(0, 3)
        .map(
          (b) =>
            `<button class="calendar-event ${b.status}" data-booking="${b.id}" title="${e(b.name)} · ${pretty(b.status)}"><time>${b.time}</time><span>${e(b.name)}</span><small>${pretty(b.status)}</small></button>`,
        )
        .join(
          "",
        )}${dayEvents.length > 3 ? `<button class="link small" data-calendar-day="${date}">＋ ${dayEvents.length - 3} more</button>` : ""}${dayBlocks.length ? `<button class="calendar-block" data-calendar-day="${date}">${dayBlocks.length} unavailable time${dayBlocks.length === 1 ? "" : "s"}</button>` : ""}</section>`;
    })
    .join(
      "",
    )}</div></div></section><section class="panel" id="calendar-agenda"><div class="section-heading"><h2>${calendarDay ? e(day(calendarDay)) : "This month’s agenda"}</h2>${calendarDay ? '<button class="link" id="calendar-all-days">Show whole month</button>' : ""}</div>${shown.map(bookingRow).join("") || '<p class="muted">No events match these filters.</p>'}<h3>Unavailable times</h3>${unavailable.map((b) => `<div class="row"><div><h3>${e(state!.performers.find((p) => p.id === b.performerId)?.name ?? "Performer")}</h3><p>${day(b.date)} · ${b.start}–${b.end} · ${e(b.note)}</p></div><button class="outline small" data-edit="blocks:${b.id}">Edit</button><button class="danger small" data-delete="blocks:${b.id}">Remove</button></div>`).join("") || '<p class="muted">No unavailable times recorded for this selection.</p>'}</section>`;
  const move = (month: string) => {
    monthDays(month);
    calendarMonth = month;
    calendarDay = "";
    renderCalendar(root);
  };
  on(root, "#calendar-prev", "click", () =>
    move(shiftMonth(calendarMonth, -1)),
  );
  on(root, "#calendar-next", "click", () => move(shiftMonth(calendarMonth, 1)));
  on(root, "#calendar-today", "click", () => move(today.slice(0, 7)));
  on(root, "#calendar-month", "change", (ev) =>
    move((ev.currentTarget as HTMLInputElement).value),
  );
  on(root, "#calendar-status", "change", (ev) => {
    calendarStatus = (ev.currentTarget as HTMLSelectElement).value;
    renderCalendar(root);
  });
  on(root, "#calendar-performer", "change", (ev) => {
    calendarPerformer = (ev.currentTarget as HTMLSelectElement).value;
    renderCalendar(root);
  });
  on(root, "[data-calendar-day]", "click", (ev) => {
    calendarDay = (ev.currentTarget as HTMLElement).dataset.calendarDay!;
    renderCalendar(root);
    root.querySelector("#calendar-agenda")?.scrollIntoView({ block: "start" });
  });
  on(root, "#calendar-all-days", "click", () => {
    calendarDay = "";
    renderCalendar(root);
  });
  wireDashboard(root);
}

function renderCustomers(root: Element) {
  root.innerHTML = `<div class="toolbar"><input class="search" id="customer-search" aria-label="Search customers" placeholder="Names, numbers, schools…"><div class="actions"><button class="outline small" id="import">Import spreadsheet CSV</button><button class="small" data-edit="customers:new">＋ Add customer</button></div></div><div id="customer-list"></div>`;
  const list = (query = "") => {
    const customers = state!.customers.filter((c) =>
      `${c.name} ${c.phone} ${c.email} ${c.kind}`.toLowerCase().includes(query),
    );
    root.querySelector("#customer-list")!.innerHTML = customers.length
      ? `<section class="panel table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Type</th><th>History</th><th>Actions</th></tr></thead><tbody>${customers.map((c) => `<tr><td><b>${e(c.name)}</b><span class="sub">${e(c.children.map((ch) => ch.name).join(", "))}</span>${state!.customers.some((other) => other.id !== c.id && other.phone.replace(/\D/g, "") === c.phone.replace(/\D/g, "")) ? '<span class="badge">Possible duplicate</span>' : ""}</td><td>${e(c.phone)}<span class="sub">${e(c.email)}</span></td><td>${badge(c.kind)}${c.doNotContact ? '<span class="sub">Do not contact</span>' : ""}</td><td>${state!.bookings.filter((b) => b.customerId === c.id).length} events</td><td><div class="actions"><button class="small outline" data-customer-history="${c.id}">Contact history</button><button class="small outline" data-edit="customers:${c.id}">Edit</button><button class="small danger" data-delete="customers:${c.id}">Remove</button></div></td></tr>`).join("")}</tbody></table></section>`
      : empty(
          "Good relationships start here",
          "Add families, schools, organizations, event planners and venues.",
        );
    wireDashboard(root.querySelector("#customer-list")!);
    on(root, "[data-customer-history]", "click", (ev) =>
      showContactHistory(
        (ev.currentTarget as HTMLElement).dataset.customerHistory!,
      ),
    );
  };
  list();
  on(root, "#customer-search", "input", (ev) =>
    list((ev.currentTarget as HTMLInputElement).value.toLowerCase()),
  );
  on(root, "#import", "click", () => importCustomers());
}
async function showContactHistory(customerId: string, includeArchived = false) {
  const customer = state!.customers.find((c) => c.id === customerId)!;
  const history = await api<{
    entries: ContactEntry[];
    childrenAges: number[];
  }>(`/manage/customers/${customerId}/history`);
  const entries = history.entries.filter((n) => includeArchived || !n.archived);
  const followups = state!.reminders.filter(
    (r) => r.customerId === customerId && !r.done,
  );
  openDialog(
    `${customer.name} · Contact history`,
    `<p>${e(customer.phone)} · ${e(customer.email)}</p>${customer.doNotContact ? '<p class="hint">Do not contact is set for this customer.</p>' : ""}<p class="privacy">Internal staff notes. Record conversations you have handled yourself; nothing is sent automatically.</p><p>Optional ages supplied in the customer profile: ${history.childrenAges.length ? history.childrenAges.map(e).join(", ") : "Not supplied"}.</p><div class="actions"><button id="add-contact-entry">＋ Record contact</button><button class="outline small" id="toggle-archived-contacts">${includeArchived ? "Hide archived" : "Show archived"}</button></div><h3>Conversation notes</h3>${entries.map((n) => `<article class="panel"><div class="section-heading"><h3>${day(n.date)} · ${e(pretty(n.channel))}</h3>${badge(n.archived ? "archived" : n.direction)}</div><p class="contact-summary">${e(n.summary)}</p>${n.bookingId ? `<p>Event: ${e(state!.bookings.find((b) => b.id === n.bookingId)?.name ?? "Linked event")}</p>` : ""}<div class="actions"><button class="small outline" data-edit-contact="${n.id}">Edit note</button><button class="small outline" data-archive-contact="${n.id}">${n.archived ? "Restore" : "Archive"}</button></div><small class="muted">Revision ${n.revision} · Changes are recorded in business history.</small></article>`).join("") || '<p class="muted">No contact notes to show.</p>'}<h3>Open follow-ups</h3>${followups.map((r) => `<div class="row"><div><b>${e(r.title)}</b><p>${day(r.date)}</p></div><button class="small outline" data-edit-followup="${r.id}">Edit follow-up</button></div>`).join("") || '<p class="muted">No open follow-ups for this customer.</p>'}`,
  );
  on(modal, "#add-contact-entry", "click", () => editContactEntry(customerId));
  on(modal, "#toggle-archived-contacts", "click", () =>
    showContactHistory(customerId, !includeArchived),
  );
  on(modal, "[data-edit-contact]", "click", (ev) =>
    editContactEntry(
      customerId,
      history.entries.find(
        (n) => n.id === (ev.currentTarget as HTMLElement).dataset.editContact,
      )!,
    ),
  );
  on(modal, "[data-archive-contact]", "click", async (ev) => {
    const entry = history.entries.find(
      (n) => n.id === (ev.currentTarget as HTMLElement).dataset.archiveContact,
    )!;
    await api(`/manage/customers/${customerId}/history/${entry.id}`, "PUT", {
      ...entry,
      archived: !entry.archived,
    });
    await showContactHistory(customerId, includeArchived);
  });
  on(modal, "[data-edit-followup]", "click", (ev) =>
    editRecord(
      "reminders",
      (ev.currentTarget as HTMLElement).dataset.editFollowup!,
    ),
  );
}
function editContactEntry(customerId: string, entry?: ContactEntry) {
  const fields: Field[] = [
    {
      key: "date",
      label: "Contact date",
      type: "date",
      value: entry?.date ?? localToday(),
      required: true,
    },
    {
      key: "channel",
      label: "Channel",
      type: "select",
      value: entry?.channel ?? "note",
      options: options(["phone", "whatsapp", "email", "in_person", "note"]),
    },
    {
      key: "direction",
      label: "Direction",
      type: "select",
      value: entry?.direction ?? "internal",
      options: options(["inbound", "outbound", "internal"]),
    },
    {
      key: "bookingId",
      label: "Related event (optional)",
      type: "select",
      value: entry?.bookingId ?? "",
      options: [
        { value: "", label: "General customer contact" },
        ...state!.bookings
          .filter((b) => b.customerId === customerId)
          .map((b) => ({ value: b.id, label: `${b.name} · ${day(b.date)}` })),
      ],
    },
    {
      key: "summary",
      label: "What was discussed / next step",
      type: "textarea",
      value: entry?.summary ?? "",
      required: true,
      wide: true,
    },
  ];
  openDialog(
    entry ? "Edit contact note" : "Record customer contact",
    formBody(
      fields,
      '<p class="privacy">Save a factual internal note. This does not send a message. Corrections retain the previous version in the audit history.</p>',
      "Save contact note",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api(
      `/manage/customers/${customerId}/history/${entry?.id ?? "new"}`,
      "PUT",
      {
        ...formValues(data, fields),
        revision: entry?.revision ?? 0,
        archived: entry?.archived ?? false,
      },
    );
    await showContactHistory(customerId, entry?.archived ?? false);
  });
}

function renderCatalogAdmin(root: Element, kind: "packages" | "performers") {
  root.innerHTML = `<div class="toolbar"><p class="muted">Your ${kind === "packages" ? "show details, prices and venue requirements" : "cast, profiles, media and verified memberships"}.</p><button class="small" data-edit="${kind}:new">＋ Add ${kind === "packages" ? "package" : "performer"}</button></div><div class="profile-grid">${(state![kind] as (Package | Performer)[]).map((v) => `<article class="panel"><span class="badge">${v.active ? "Public" : "Archived"}</span><h3>${e(v.name)}</h3><p>${e("description" in v ? v.description : v.bio)}</p>${"duration" in v ? `<p class="muted">${v.duration} min · ${e(price(v))}</p>` : ""}<div class="actions"><button class="small outline" data-edit="${kind}:${v.id}">Edit all details</button><button class="small outline" data-duplicate="${kind}:${v.id}">Duplicate</button><button class="small danger" data-delete="${kind}:${v.id}">Archive</button></div></article>`).join("") || empty("Ready for a new act?", "Add a performer profile to introduce the people behind the happy memories.")}</div>`;
  on(root, "[data-duplicate]", "click", (ev) => {
    const [kind, key] = (
      ev.currentTarget as HTMLElement
    ).dataset.duplicate!.split(":");
    editRecord(kind, key, true);
  });
}
let reportFrom = "",
  reportTo = "";
function renderMoney(root: Element) {
  const report = reportPeriod(
    state!.bookings,
    state!.money,
    reportFrom,
    reportTo,
  );
  root.innerHTML = `<section class="panel"><h2>Your reporting period</h2><form id="report-period"><div class="calendar-controls"><label>From date<input type="date" name="from" value="${e(reportFrom)}"></label><label>To date<input type="date" name="to" value="${e(reportTo)}"></label><button type="submit" class="small">Apply dates</button><button type="button" class="outline small" id="report-all">All dates</button></div><p class="form-error" role="alert"></p></form><p class="muted">Inclusive dates in ${e(state!.business.timezone)}. Blank dates leave that end open. Current recorded values, not a historical snapshot.</p></section><h2>Cash recorded in this period</h2><p class="muted">Selected by payment, refund or expense date, even when the event falls outside this period. Cash after expenses is not accounting profit.</p><div class="stats">${[
    ["Payments", report.payments],
    ["Refunds", report.refunds],
    ["Expenses", report.expenses],
    ["Cash after expenses", report.cashAfterExpenses],
  ]
    .map(
      ([label, value]) =>
        `<div class="stat"><span>${label}</span><b>${money(Number(value))}</b></div>`,
    )
    .join(
      "",
    )}</div><div class="toolbar"><p class="muted">Amounts are recorded manually in ${e(state!.business.currency)}. No money is charged online.</p><button id="record-money" class="small">＋ Record payment / cost</button></div><section class="panel table-wrap"><h3>Event performance · by event date</h3><p class="muted">All payments and expenses for each selected event are included, even outside this period. Estimates use the accepted quote and recorded costs; status is shown separately.</p><table><thead><tr><th>Event</th><th>Agreed</th><th>Collected</th><th>Balance</th><th>Expenses</th><th>Estimated profit</th></tr></thead><tbody>${report.events
    .map((b) => {
      const m = bookingMoney(b);
      return `<tr><td><button class="link" data-booking="${b.id}">${e(b.name)}</button>${badge(b.status)}</td><td>${money(m.agreed)}</td><td>${money(m.paid)}</td><td>${money(m.balance)}</td><td>${money(m.expense)}</td><td>${money(m.profit)}</td></tr>`;
    })
    .join(
      "",
    )}</tbody></table>${report.events.length ? "" : '<p class="muted">No events in this period.</p>'}</section><div class="two-col"><section class="panel"><h3>Payments & expenses · by transaction date</h3>${
    report.transactions
      .slice()
      .reverse()
      .map(
        (m) =>
          `<div class="row"><div><h3>${e(pretty(m.kind))} · ${money(m.amount)}</h3><p>${day(m.date)} · ${e(m.category)} · ${e(m.note)}</p></div><button class="small outline" data-correct="${m.id}">Correct</button></div>`,
      )
      .join("") || '<p class="muted">No transactions recorded.</p>'
  }</section><section class="panel"><h3>Where the happy begins</h3><p class="muted">All-time page views (not filtered by these dates), not unique people. Anonymous visitors stay anonymous.</p>${state!.visits.map((v) => `<div class="row"><span>${e(pretty(v.source))}</span><b>${v.count} views</b></div>`).join("")}<h3>Requested shows · by event date</h3>${state!.packages.map((p) => `<div class="row"><span>${e(p.name)}</span><b>${report.events.filter((b) => b.packageIds.includes(p.id)).length}</b></div>`).join("")}<h3>Request sources · by event date</h3>${[...new Set(report.events.map((b) => b.source))].map((source) => `<div class="row"><span>${e(pretty(source))}</span><b>${report.events.filter((b) => b.source === source).length} requests</b></div>`).join("")}<h3>Repeat customers</h3><p>${state!.customers.filter((c) => report.events.filter((b) => b.customerId === c.id && b.status === "completed").length > 1).length} customers with multiple completed events dated within this period.</p></section></div>`;
  submit(
    root.querySelector<HTMLFormElement>("#report-period")!,
    async (data) => {
      const from = String(data.get("from") ?? ""),
        to = String(data.get("to") ?? "");
      reportPeriod(state!.bookings, state!.money, from, to);
      reportFrom = from;
      reportTo = to;
      renderDashboard();
    },
  );
  on(root, "#report-all", "click", () => {
    reportFrom = "";
    reportTo = "";
    renderDashboard();
  });
  on(root, "#record-money", "click", () => moneyForm());
  on(root, "[data-correct]", "click", (ev) =>
    moneyCorrection((ev.currentTarget as HTMLElement).dataset.correct!),
  );
}
function renderReminders(root: Element) {
  const now = localToday();
  const birthdays = state!.customers
    .filter((c) => !c.doNotContact)
    .flatMap((c) => c.children.map((ch) => ({ customer: c, child: ch })))
    .filter(({ child }) => {
      const birthday = new Date(
        `${now.slice(0, 4)}-${child.birthday.slice(5)}T12:00:00`,
      );
      const today = new Date(`${now}T12:00:00`);
      if (birthday < today) birthday.setFullYear(birthday.getFullYear() + 1);
      return (birthday.getTime() - today.getTime()) / 86400000 <= 45;
    });
  root.innerHTML = `<div class="toolbar"><p class="muted">Thoughtful follow-ups. You choose when to reach out.</p><button class="small" data-edit="reminders:new">＋ Add follow-up</button></div><div class="two-col"><section class="panel"><h3>Your reminders</h3>${
    state!.reminders
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (r) =>
          `<div class="row"><div><h3>${r.done ? "✓ " : ""}${e(r.title)}</h3><p>${day(r.date)} · ${e(state!.customers.find((c) => c.id === r.customerId)?.name ?? "")}</p></div><div class="actions"><button class="small outline" data-edit="reminders:${r.id}">Edit</button><button class="small danger" data-delete="reminders:${r.id}">Remove</button></div></div>`,
      )
      .join("") ||
    empty(
      "Nothing slipping through the cracks",
      "Add a reminder for a school, a birthday or a quote awaiting a reply.",
    )
  }</section><section class="panel"><h3>Birthdays in the next 45 days</h3>${birthdays.map(({ customer: c, child: ch }) => `<div class="row"><div><h3>${e(ch.name)} · ${e(ch.birthday.slice(5))}</h3><p>${e(c.name)} · ${c.offersConsent ? "Offers permitted" : "Ask about contact preference first"}</p></div><button class="small outline" data-edit="customers:${c.id}">View</button></div>`).join("") || '<p class="muted">No birthdays coming up. Add children’s actual birthdays to family records.</p>'}<h3>Quotes awaiting a reply</h3>${
    state!.bookings
      .filter((b) => b.status === "quoted")
      .map(bookingRow)
      .join("") || '<p class="muted">All caught up.</p>'
  }</section></div>`;
}
function renderReviews(root: Element) {
  root.innerHTML = `<p class="hint">Genuine ratings and words stay unchanged. Publish only with customer permission; private feedback stays backstage.</p>${state!.reviews.map((r) => `<article class="panel"><div class="row"><h3>${e(state!.bookings.find((b) => b.id === r.bookingId)?.name)}</h3>${badge(r.published ? "published" : "private")}</div><div class="review-stars">${"★".repeat(r.overall)}</div><p>${e(r.text)}</p><p class="muted">Punctuality ${r.punctuality}/5 · Engagement ${r.engagement}/5 · Communication ${r.communication}/5</p><p><b>Private feedback:</b> ${e(r.privateFeedback || "None")}</p><p class="muted">Publication permission: ${r.publishConsent ? "Yes" : "No"} · Photo permission: ${r.photoConsent ? "Yes" : "No"}</p><button class="outline small" data-moderate="${r.id}">${r.published ? "Unpublish" : "Review for publication"}</button></article>`).join("") || empty("The applause will find its way here", "After a completed event, customers can review the event and each booked performer from their private event page.")}`;
  on(root, "[data-moderate]", "click", (ev) =>
    moderateReview((ev.currentTarget as HTMLElement).dataset.moderate!),
  );
}
async function editQuestions() {
  const questions = await api<CustomField[]>("/manage/custom-fields");
  openDialog(
    "Your booking questions",
    "<p>Add questions for your customers. Hide a question to remove it from new orders; answers on past events stay in their history.</p>" +
      questions
        .map(
          (q, index) =>
            '<div class="row"><div><h3>' +
            e(q.label) +
            "</h3><p>" +
            (q.active ? "Visible" : "Hidden") +
            " · " +
            e(q.type) +
            '</p></div><button class="outline small" data-question="' +
            e(q.id) +
            '">Edit</button><button class="outline small" data-question-move="' +
            index +
            '" data-direction="-1" aria-label="Move ' +
            e(q.label) +
            ' up" ' +
            (index === 0 ? "disabled" : "") +
            '>↑</button><button class="outline small" data-question-move="' +
            index +
            '" data-direction="1" aria-label="Move ' +
            e(q.label) +
            ' down" ' +
            (index === questions.length - 1 ? "disabled" : "") +
            ">↓</button></div>",
        )
        .join("") +
      '<button id="new-question">Add a question</button>',
  );
  on(modal, "[data-question-move]", "click", async (ev) => {
    const target = ev.currentTarget as HTMLElement;
    const index = Number(target.dataset.questionMove),
      next = index + Number(target.dataset.direction);
    const previous = questions.map((q) => q.id),
      ids = previous.slice();
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await api("/manage/custom-fields/order", "PUT", { previous, ids });
    await editQuestions();
  });
  const edit = (q?: CustomField) => {
    const fields: Field[] = [
      {
        key: "label",
        label: "Question label",
        value: q?.label,
        required: true,
      },
      {
        key: "type",
        label: "Answer type",
        type: "select",
        options: options(["text", "textarea", "number", "select"]),
        value: q?.type ?? "text",
      },
      {
        key: "options",
        label: "Choices (one per line, for select questions)",
        type: "textarea",
        value: q?.options.join("\n") ?? "",
        wide: true,
      },
      {
        key: "required",
        label: "An answer is required",
        type: "checkbox",
        value: q?.required ?? false,
      },
      {
        key: "active",
        label: "Show on new booking requests",
        type: "checkbox",
        value: q?.active ?? true,
      },
    ];
    openDialog(
      q ? "Edit booking question" : "Add a little detail",
      formBody(fields),
    );
    submit(modal.querySelector("form")!, async (data) => {
      await api("/manage/custom-fields", "POST", {
        ...formValues(data, fields),
        id: q?.id ?? crypto.randomUUID(),
        options: String(data.get("options"))
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      await editQuestions();
    });
  };
  on(modal, "#new-question", "click", () => edit());
  on(modal, "[data-question]", "click", (ev) =>
    edit(
      questions.find(
        (q) => q.id === (ev.currentTarget as HTMLElement).dataset.question,
      ),
    ),
  );
}
function customSummary(b: Booking) {
  return b.customAnswers?.length
    ? '<section class="panel"><h3>A few extra details</h3>' +
        b.customAnswers
          .map(
            (a) =>
              "<p><strong>" +
              e(a.label) +
              "</strong><br>" +
              e(a.value) +
              "</p>",
          )
          .join("") +
        "</section>"
    : "";
}
async function editRewards() {
  const values = await api<RewardSettings>("/manage/reward-settings");
  const fields: Field[] = [
    {
      key: "freeShowPackageId",
      label: "Magic package eligible for a free-show reward",
      type: "select",
      value: values.freeShowPackageId,
      options: [
        { value: "", label: "Choose before issuing free shows" },
        ...state!.packages
          .filter((p) => p.active && p.category.toLowerCase() === "magic")
          .map((p) => ({ value: p.id, label: p.name })),
      ],
    },
    {
      key: "returnOnCancel",
      label: "Return a used reward if its booking is cancelled",
      type: "checkbox",
      value: values.returnOnCancel,
    },
    {
      key: "enabled",
      label: "Publish reward program",
      type: "checkbox",
      value: values.enabled,
    },
    {
      key: "discountPercent",
      label: "Referral discount (%)",
      type: "number",
      min: 0,
      max: 100,
      step: "0.01",
      value: values.discountPercent,
    },
    {
      key: "eventsForFree",
      label: "Qualifying events for a free magic show",
      type: "number",
      min: 1,
      max: 100,
      value: values.eventsForFree,
    },
    {
      key: "qualification",
      label: "What counts toward the free show?",
      type: "select",
      options: [
        { value: "unconfigured", label: "Choose before enabling" },
        {
          value: "referrals",
          label: "Completed and fully paid referred events",
        },
        {
          value: "personal",
          label: "Completed and fully paid personal events",
        },
      ],
      value: values.qualification,
    },
    {
      key: "loyaltyEvery",
      label: "Personal events for loyalty discount",
      type: "number",
      min: 1,
      max: 100,
      value: values.loyaltyEvery,
    },
    {
      key: "loyaltyPercent",
      label: "Loyalty discount (%)",
      type: "number",
      min: 0,
      max: 100,
      step: "0.01",
      value: values.loyaltyPercent,
    },
    {
      key: "emailPoints",
      label: "Optional email profile points",
      type: "number",
      min: 0,
      max: 10000,
      value: values.emailPoints,
    },
    {
      key: "childrenPoints",
      label: "Optional children’s ages profile points (flat bonus)",
      type: "number",
      min: 0,
      max: 10000,
      value: values.childrenPoints,
    },
    {
      key: "terms",
      label:
        "Reward conditions: eligible show, duration, area, exclusions and validity",
      type: "textarea",
      value: values.terms,
      wide: true,
    },
  ];
  openDialog(
    "Your rewards, your rules",
    formBody(
      fields,
      '<p class="hint">Changes apply to newly issued rewards. Each issued reward keeps its original percentage, conditions and cancellation rule. Qualifying events cannot earn the same reward type twice; different reward types have separate counters. Staff reviews eligibility before issuing; quote discounts and usage tracking are automatic. Profile points are a completion score, not money.</p>',
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api("/manage/reward-settings", "PUT", formValues(data, fields));
    modal.close();
    await loadDashboard();
    notify("Reward settings saved.");
  });
}
function renderSettings(root: Element) {
  root.innerHTML = `<div class="two-col"><section class="panel"><h3>Your business, your personality</h3><p>${e(state!.business.name)}</p><p class="muted">${e(state!.business.intro)}</p><button class="outline small" id="edit-business">Edit business details</button><button class="outline small" id="edit-rewards">Edit rewards and points</button><button class="outline small" id="edit-questions">Edit booking questions</button><button class="outline small" id="customer-resets">Customer password help</button><p class="privacy">Booking timezone: ${e(state!.business.timezone)} · Currency: ${e(state!.business.currency)}. Changing these for historical records requires a migration.</p><h3>Keep a copy</h3><p class="muted">Export this business’s records, including booking history. Keep customer exports private.</p><a href="/api/manage/export" class="button outline small" download>Download business export</a></section><section class="panel"><h3>People backstage</h3><button class="small outline" id="change-password">Change my password</button><p class="privacy">Other businesses cannot see your customer records. Authorized platform support access requires a reason and is logged.</p>${state!.users.map((u) => `<div class="row"><div><h3>${e(u.name)}</h3><p>${e(u.email)} · ${e(u.role)}</p></div><button class="small outline" data-edit-user="${u.id}">Edit</button>${u.id !== state!.user.id ? `<button class="small danger" data-remove-user="${u.id}">Remove access</button>` : ""}</div>`).join("")}<button class="outline small" id="add-user">＋ Add login</button>${state!.user.role === "admin" ? '<button class="outline small" id="add-business">＋ Separate business</button>' : ""}</section></div><section class="panel"><h3>Change history</h3><p class="muted">Who changed what, and when. The latest 200 entries are shown; exports include the full history.</p>${state!.audit.map((a) => `<details><summary>${e(a.at.replace("T", " ").slice(0, 19))} · ${e(a.actor)} · ${e(a.action)}</summary><div class="audit-detail">Before: ${e(JSON.stringify(a.before, null, 2))}<br>After: ${e(JSON.stringify(a.after, null, 2))}</div></details>`).join("") || '<p class="muted">Saved changes will appear here.</p>'}</section>`;
  on(root, "#customer-resets", "click", () => customerResetQueue());
  on(root, "#edit-questions", "click", () => editQuestions());
  on(root, "#edit-rewards", "click", () => editRewards());
  on(root, "#edit-business", "click", () => editBusiness());
  on(root, "#add-user", "click", () => addUser());
  on(root, "#change-password", "click", () => changePassword());
  on(root, "[data-edit-user]", "click", (ev) =>
    editUser((ev.currentTarget as HTMLElement).dataset.editUser!),
  );
  on(root, "#add-business", "click", () => addBusiness());
  on(root, "[data-remove-user]", "click", (ev) =>
    confirmRemove(
      "users",
      (ev.currentTarget as HTMLElement).dataset.removeUser!,
    ),
  );
}
function editRecord(kind: string, key: string, duplicate = false) {
  const list = (state as unknown as Record<string, Record<string, unknown>[]>)[
    kind
  ];
  const item = key === "new" ? {} : (list.find((v) => v.id === key) ?? {});
  const f = (
    key: string,
    label: string,
    type = "text",
    extra: Partial<Field> = {},
  ): Field => ({ key, label, type, value: item[key], ...extra });
  let fields: Field[] = [];
  if (kind === "customers")
    fields = [
      f("name", "Name", "text", { required: true }),
      f("kind", "Customer type", "select", {
        options: options([
          "family",
          "school",
          "organization",
          "planner",
          "venue",
        ]),
        value: item.kind ?? "family",
      }),
      f("phone", "Phone with country code", "tel", { required: true }),
      f("email", "Email", "email"),
      f("language", "Preferred language", "text", {
        value: item.language ?? "English",
      }),
      f("source", "How they found you"),
      f("followUp", "Next follow-up", "date"),
      f("children", "Children & actual birthdays", "textarea", {
        wide: true,
        value: ((item.children as Customer["children"]) ?? [])
          .map((c) => `${c.name} | ${c.birthday}`)
          .join("\n"),
        help: "One per line: Child name | YYYY-MM-DD. Birthday is separate from the event date.",
      }),
      f("contacts", "Organization contacts", "textarea", {
        wide: true,
        value: ((item.contacts as Customer["contacts"]) ?? [])
          .map((c) => `${c.name} | ${c.role} | ${c.phone}`)
          .join("\n"),
        help: "One per line: Name | Role | Phone",
      }),
      f("notes", "Notes / contact preferences", "textarea", { wide: true }),
      f("offersConsent", "Permission for future offers", "checkbox"),
      f("doNotContact", "Do not contact", "checkbox"),
    ];
  if (kind === "packages")
    fields = [
      f("name", "Package name", "text", { required: true }),
      f("category", "Show category", "text", {
        help: "For example: magic, science, bubbles, clown or character.",
        value: item.category ?? "magic",
      }),
      f("description", "Description", "textarea", { wide: true }),
      f("previewVideo", "Short show preview link", "url", {
        help: "Use an approved HTTPS video page. A 15–20 second clip is ideal. Leave blank to remove.",
      }),
      f("checkoutExtra", "Offer as an optional checkout extra", "checkbox"),
      f("duration", "Show duration (minutes)", "number", {
        value: item.duration ?? 45,
        min: 5,
        max: 480,
        required: true,
      }),
      f("setup", "Setup (minutes)", "number", {
        value: item.setup ?? 30,
        min: 0,
        max: 240,
        required: true,
      }),
      f("adultShow", "Feature in Adult Magic Shows", "checkbox", {
        value:
          item.adultShow ??
          String(item.category ?? "magic").toLowerCase() === "magic",
        help: "All shows fit every age. This adds another place to discover this show; it does not restrict who can book.",
      }),
      f("minSpace", "Minimum clear area (m²)", "number", {
        value: item.minSpace ?? 12,
        min: 0,
      }),
      f("priceMode", "Price display", "select", {
        options: options(["quote", "fixed", "from"]),
        value: item.priceMode ?? "quote",
      }),
      f("price", "Price (USD)", "number", {
        value: Number(item.price ?? 0) / 100,
        min: 0,
        step: "0.01",
      }),
      f("indoorOnly", "Indoor venue required", "checkbox"),
      f("needsPower", "Electricity required", "checkbox"),
      f("active", "Visible on public website", "checkbox", {
        value: item.active ?? true,
      }),
      f("fastOrder", "Feature in Fast Order", "checkbox", {
        value:
          item.fastOrder ??
          ["magic", "science", "bubbles"].includes(String(item.id)),
      }),
      f("checklist", "Preparation checklist", "textarea", {
        wide: true,
        value: ((item.checklist as string[]) ?? []).join("\n"),
        help: "One item per line. Add, change or remove any line.",
      }),
    ];
  if (kind === "performers")
    fields = [
      f("name", "Stage name", "text", { required: true }),
      f("areas", "Service areas"),
      f("bio", "Introduction", "textarea", { wide: true }),
      f("photo", "Photo link", "url", {
        help: "HTTPS image URL. Use only photos you have permission to publish.",
      }),
      f("video", "Show video link", "url", {
        help: "HTTPS video page, opens in a new tab.",
      }),
      f("active", "Public profile is visible", "checkbox", {
        value: item.active ?? true,
      }),
      f(
        "membershipVerified",
        "Membership independently verified and badge authorized",
        "checkbox",
        { wide: true },
      ),
    ];
  if (kind === "reminders")
    fields = [
      f("title", "What should you remember?", "text", {
        required: true,
        wide: true,
      }),
      f("date", "Reminder date", "date", {
        required: true,
        value: item.date ?? localToday(),
      }),
      f("customerId", "Customer", "select", {
        options: [
          { value: "", label: "No customer" },
          ...state!.customers.map((c) => ({ value: c.id, label: c.name })),
        ],
      }),
      f("bookingId", "Event", "select", {
        options: [
          { value: "", label: "No event" },
          ...state!.bookings.map((b) => ({ value: b.id, label: b.name })),
        ],
      }),
      f("done", "Completed", "checkbox"),
    ];
  if (kind === "blocks")
    fields = [
      f("performerId", "Performer", "select", {
        required: true,
        options: state!.performers
          .filter(
            (p) =>
              state!.user.role !== "performer" ||
              p.id === state!.user.performerId,
          )
          .map((p) => ({ value: p.id, label: p.name })),
      }),
      f("date", "Date", "date", { required: true }),
      f("start", "Unavailable from", "time", { required: true }),
      f("end", "Unavailable until", "time", { required: true }),
      f("note", "Reason / note", "text", { wide: true }),
    ];
  if (kind === "referrals")
    fields = [
      f("bookingId", "Event", "select", {
        required: true,
        options: state!.bookings.map((b) => ({ value: b.id, label: b.name })),
      }),
      f("performerId", "Refer to performer", "select", {
        required: true,
        options: state!.performers.map((p) => ({ value: p.id, label: p.name })),
      }),
      f("fee", "Agreed referral fee (USD)", "number", {
        value: Number(item.fee ?? 0) / 100,
        min: 0,
        step: "0.01",
      }),
      f("status", "Response", "select", {
        value: item.status ?? "offered",
        options: options(["offered", "accepted", "declined"]),
      }),
      f("note", "Note", "textarea", { wide: true }),
    ];
  openDialog(
    `${key === "new" || duplicate ? "Add" : "Edit"} ${kind === "customers" ? "customer" : kind === "packages" ? "package" : kind === "performers" ? "performer" : kind === "blocks" ? "availability block" : kind === "referrals" ? "referral" : "follow-up"}`,
    formBody(
      fields,
      kind === "performers"
        ? choices(
            "categories",
            [
              ...new Set([
                "magic",
                "science",
                "bubbles",
                "other",
                ...state!.packages.map((p) => p.category),
                ...((item.categories as string[]) ?? []),
              ]),
            ].map((id) => ({
              id,
              name: pretty(id),
            })),
            (item.categories as string[]) ?? ["magic"],
            "Acts / categories",
          )
        : "",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const value = formValues(data, fields);
    if (kind === "customers") {
      value.children = String(value.children)
        .split("\n")
        .filter((v) => v.trim())
        .map((line) => {
          const [name, birthday] = line.split("|").map((s) => s.trim());
          return { name, birthday };
        });
      value.contacts = String(value.contacts)
        .split("\n")
        .filter((v) => v.trim())
        .map((line) => {
          const [name, role, phone] = line.split("|").map((s) => s.trim());
          return { name, role: role ?? "", phone: phone ?? "" };
        });
    }
    if (kind === "packages") {
      value.price = Math.round(Number(value.price) * 100);
      value.checklist = String(value.checklist)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (kind === "performers") value.categories = selected(data, "categories");
    if (kind === "referrals") value.fee = Math.round(Number(value.fee) * 100);
    await api(`/manage/${kind}/${duplicate ? "new" : key}`, "PUT", value);
    modal.close();
    await loadDashboard();
    notify("Saved. A little more organized.");
  });
}
function confirmRemove(kind: string, key: string) {
  openDialog(
    kind === "users" ? "Remove access?" : "Remove this record?",
    `<p>${["packages", "performers"].includes(kind) ? "This will archive the listing and remove it from the public website. Past event history stays intact. You can make it active again from Edit." : "Linked booking and payment history is protected. This action is recorded in the change history."}</p><form><div class="form-error" role="alert"></div><div class="form-actions"><button type="submit" class="danger">${["packages", "performers"].includes(kind) ? "Archive listing" : "Remove"}</button></div></form>`,
  );
  submit(modal.querySelector("form")!, async () => {
    await api(`/manage/${kind}/${key}`, "DELETE");
    modal.close();
    await loadDashboard();
    notify("Removed.");
  });
}
function editBusiness() {
  const b = state!.business;
  const fields: Field[] = [
    {
      key: "name",
      label: "Business / public brand name",
      value: b.name,
      required: true,
    },
    {
      key: "intro",
      label: "Welcome text",
      type: "textarea",
      value: b.intro,
      wide: true,
    },
    {
      key: "logo",
      label: "Logo image",
      value: b.logo ?? "",
      help: "Use /sam-logo.png for your supplied original, or an HTTPS image link. Leave blank to remove.",
      wide: true,
    },
    {
      key: "otherShowNames",
      label: "More Shows enquiries (one per line)",
      type: "textarea",
      value: (b.otherShowNames ?? []).join("\n"),
      help: "Add, remove or reorder enquiries. Put Animation first to feature it. Configure full bookable packages under Shows & packages when timings and venue needs are known.",
      wide: true,
    },
    {
      key: "characterNames",
      label: "Characters (one per line)",
      type: "textarea",
      value: (b.characterNames ?? []).join("\n"),
      help: "Add, rename or remove characters. Leave empty to hide this section. Enquiries use your contact details; no availability is promised.",
      wide: true,
    },
    {
      key: "contactEmail",
      label: "Public contact email",
      type: "email",
      value: b.contactEmail ?? "",
    },
    {
      key: "instagram",
      label: "Instagram profile URL",
      type: "url",
      value: b.instagram,
    },
    {
      key: "whatsapp",
      label: "WhatsApp phone with country code",
      type: "tel",
      value: b.whatsapp,
    },
  ];
  openDialog("Make it feel like you", formBody(fields));
  submit(modal.querySelector("form")!, async (data) => {
    await api("/manage/business", "PUT", {
      ...formValues(data, fields),
      otherShowNames: String(data.get("otherShowNames") ?? "")
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean),
      characterNames: String(data.get("characterNames") ?? "")
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean),
    });
    modal.close();
    await loadDashboard();
    notify("Your public details are updated.");
  });
}
function addUser() {
  const fields: Field[] = [
    { key: "name", label: "Name", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    {
      key: "password",
      label: "Initial password (at least 14 characters)",
      type: "password",
      required: true,
    },
    {
      key: "role",
      label: "Access level",
      type: "select",
      options: options(["assistant", "performer", "owner"]),
    },
    {
      key: "performerId",
      label: "Linked performer (required for performer login)",
      type: "select",
      options: [
        { value: "", label: "Not a performer" },
        ...state!.performers.map((p) => ({ value: p.id, label: p.name })),
      ],
    },
  ];
  openDialog(
    "Invite someone backstage",
    formBody(
      fields,
      '<p class="privacy">Share initial credentials privately. Assistants manage event details and customers; performers see assigned events. Owners can manage money, exports and other logins.</p>',
      "Create login",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api("/manage/users", "POST", formValues(data, fields));
    modal.close();
    await loadDashboard();
    notify("Login created.");
  });
}
function addBusiness() {
  const fields: Field[] = [
    { key: "name", label: "Business name", required: true },
    {
      key: "slug",
      label: "Public address ending",
      required: true,
      help: "Lowercase letters, digits and hyphens only.",
    },
    {
      key: "timezone",
      label: "Business timezone",
      value: "Asia/Beirut",
      required: true,
    },
    { key: "email", label: "Owner email", type: "email", required: true },
    {
      key: "password",
      label: "Initial password (at least 14 characters)",
      type: "password",
      required: true,
    },
  ];
  openDialog(
    "A separate stage for a friend",
    formBody(
      fields,
      '<p class="privacy">This creates a separate business with private customers, calendar, packages and reviews. Authorized platform support access is disclosed and logged.</p>',
      "Create separate business",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api("/manage/businesses", "POST", formValues(data, fields));
    modal.close();
    notify("Separate business and owner login created.");
  });
}
function changePassword() {
  const fields: Field[] = [
    {
      key: "currentPassword",
      label: "Current password",
      type: "password",
      required: true,
    },
    {
      key: "newPassword",
      label: "New password (at least 14 characters)",
      type: "password",
      required: true,
    },
  ];
  openDialog(
    "Change your backstage password",
    formBody(
      fields,
      '<p class="privacy">Changing your password signs out all your sessions. Sign in again with your new password.</p>',
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api("/manage/password", "POST", formValues(data, fields));
    modal.close();
    state = undefined;
    await login();
    notify("Password changed. Please sign in again.");
  });
}
function editUser(key: string) {
  const u = state!.users.find((u) => u.id === key)!;
  const fields: Field[] = [
    { key: "name", label: "Name", value: u.name, required: true },
    {
      key: "email",
      label: "Email",
      type: "email",
      value: u.email,
      required: true,
    },
    {
      key: "role",
      label: "Access level",
      type: "select",
      value: u.role,
      options: options(
        u.role === "admin" ? ["admin"] : ["owner", "assistant", "performer"],
      ),
    },
    {
      key: "performerId",
      label: "Linked performer",
      type: "select",
      value: u.performerId,
      options: [
        { value: "", label: "Not a performer" },
        ...state!.performers.map((p) => ({ value: p.id, label: p.name })),
      ],
    },
  ];
  openDialog(
    "Edit backstage access",
    formBody(
      fields,
      '<p class="privacy">Saving ends this person’s existing sessions so the updated access takes effect immediately.</p>',
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api(`/manage/users/${key}`, "PUT", formValues(data, fields));
    modal.close();
    if (key === state!.user.id) {
      state = undefined;
      await login();
    } else await loadDashboard();
    notify("Access details updated.");
  });
}
async function openBooking(key: string) {
  const b = state!.bookings.find((b) => b.id === key)!;
  const c = state!.customers.find((c) => c.id === b.customerId);
  const checks = await api<{
    issues: string[];
    timetable: { label: string; at: string; duration: number }[];
    totals?: { agreed: number; paid: number; balance: number; deposit: number };
  }>(`/manage/bookings/${b.id}/checks`);
  openDialog(
    b.name,
    `<div class="booking-banner">${badge(b.status)}<small>Revision ${b.revision} · ${e(state!.business.timezone)}</small></div><div class="details-grid"><div><small>Date & show time</small><strong>${day(b.date)} · ${e(b.time)}</strong></div><div><small>Venue</small><strong>${e(b.location)}</strong><br><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.location)}" target="_blank" rel="noopener noreferrer">Directions ↗</a></div><div><small>Customer</small><strong>${e(c?.name ?? "Assigned event")}</strong>${c ? `<p>${e(c.phone)} · ${e(c.email)}</p>` : ""}</div><div><small>Audience & setup</small><strong>${b.audience} guests · Age ${b.age} · ${b.space} m²</strong><p>${b.indoor ? "Indoor" : "Outdoor"} · ${b.power ? "Electricity available" : "No electricity"}</p></div></div>${checks.issues.length ? `<ul class="warn-list">${checks.issues.map((i) => `<li>${e(i)}</li>`).join("")}</ul>` : '<p class="success">✓ No venue or scheduling conflicts found for the current selection.</p>'}<div class="tabs">${state!.user.role !== "performer" ? '<button id="edit-event" class="outline small">Edit event details</button><button id="quote-event" class="outline small">Build quote options</button><button id="customer-link" class="outline small">Create / replace private link</button><button id="event-money" class="outline small">Record payment / cost</button>' : ""}<button id="print-event" class="outline small">Print show-day card</button></div><section class="panel"><h3>Who’s on stage?</h3>${b.performerIds.map((p) => `<div class="row"><span>${e(state!.performers.find((v) => v.id === p)?.name)}</span>${badge(b.availability[p] ?? "pending")}<select aria-label="Availability for ${e(state!.performers.find((v) => v.id === p)?.name)}" data-availability="${p}" ${state!.user.role === "performer" && p !== state!.user.performerId ? "disabled" : ""}>${["pending", "available", "declined"].map((v) => `<option value="${v}" ${b.availability[p] === v ? "selected" : ""}>${pretty(v)}</option>`).join("")}</select></div>`).join("") || '<p class="muted">Assign performers using Edit event details before confirming.</p>'}<p class="muted">Backups: ${e(b.backupPerformerIds.map((p) => state!.performers.find((v) => v.id === p)?.name).join(", ") || "None assigned")}</p>${state!.user.role !== "performer" ? '<button id="refer-event" class="small outline">＋ Track a referral</button>' : ""}</section><section class="panel"><h3>The running order</h3><ul class="timeline">${checks.timetable.map((t) => `<li><time>${e(t.at)}</time><span>${e(t.label)}${t.duration ? ` · ${t.duration} min` : ""}</span></li>`).join("")}</ul><p class="muted">Travel buffer: ${b.travel} minutes each side. Changeovers: ${b.breakMinutes} minutes.</p><p>${e(b.venueNotes)}</p></section>${
      state!.user.role !== "performer"
        ? `<section class="panel"><h3>Referrals</h3>${
            state!.referrals
              .filter((r) => r.bookingId === b.id)
              .map(
                (r) =>
                  `<div class="row"><span>${e(state!.performers.find((p) => p.id === r.performerId)?.name)} · ${e(r.status)} · ${money(r.fee)}</span><button class="small outline" data-edit-referral="${r.id}">Edit</button><button class="small danger" data-remove-referral="${r.id}">Remove</button></div>`,
              )
              .join("") || '<p class="muted">No referrals recorded.</p>'
          }</section>`
        : ""
    }${checks.totals ? `<section class="panel"><h3>The proposal & payments</h3><p>Agreed ${money(checks.totals.agreed)} · Collected ${money(checks.totals.paid)} · Balance ${money(checks.totals.balance)}</p>${b.quotes.map((q) => `<div class="row"><div><h3>${e(q.name)} ${q.id === b.acceptedQuoteId ? "✓ Accepted" : ""}</h3><p>${q.packageIds.map((p) => e(state!.packages.find((v) => v.id === p)?.name)).join(" + ")}</p><p>${e(q.notes)}</p>${rewardSummary(q)}</div><strong>${money(q.amount)}</strong></div>`).join("") || '<p class="muted">No proposal prepared yet.</p>'}</section>` : ""}${customSummary(b)}<section class="panel"><h3>Ready, set, showtime</h3><form id="checklist-form">${b.checklist.map((ch, i) => `<label class="check"><input type="checkbox" name="check" value="${i}" ${ch.done ? "checked" : ""}>${e(ch.text)}</label>`).join("") || '<p class="muted">Add a checklist in event details, or confirm the event to use package preparation lists.</p>'}<div class="form-error" role="alert"></div><div class="form-actions"><button class="small outline" type="submit">Save checklist</button></div></form></section>${!["cancelled", "completed"].includes(b.status) && ["admin", "owner"].includes(state!.user.role) ? `<div class="actions"><button id="confirm-event">Confirm booking</button><button id="complete-event" class="outline">Mark completed</button><button id="cancel-event" class="danger">Cancel event</button></div>` : ""}<p class="privacy">Schedule and venue edits require a fresh confirmation. Date, venue or performer changes reset performer availability. Cancellation preserves the record; refunds are recorded separately.</p>`,
  );
  on(modal, "[data-edit-referral]", "click", (ev) =>
    editRecord(
      "referrals",
      (ev.currentTarget as HTMLElement).dataset.editReferral!,
    ),
  );
  on(modal, "[data-remove-referral]", "click", (ev) =>
    confirmRemove(
      "referrals",
      (ev.currentTarget as HTMLElement).dataset.removeReferral!,
    ),
  );
  on(modal, "#edit-event", "click", () => editEvent(b));
  if (["owner", "admin"].includes(state!.user.role)) {
    const rewardButton = document.createElement("button");
    rewardButton.className = "outline small";
    rewardButton.textContent = "Customer rewards";
    rewardButton.addEventListener("click", () => {
      rewardDialog(b).catch((err) => notify(err.message));
    });
    modal.querySelector(".tabs")!.append(rewardButton);
  }
  if (
    b.customAnswers?.length &&
    ["owner", "admin"].includes(state!.user.role) &&
    !["completed", "cancelled"].includes(b.status)
  ) {
    const button = document.createElement("button");
    button.textContent = "Edit extra answers";
    button.className = "outline small";
    modal.querySelector(".tabs")!.append(button);
    button.addEventListener("click", () => {
      const fields: Field[] = b.customAnswers!.map((a) => ({
        key: a.id,
        label: a.label,
        type: typeof a.value === "number" ? "number" : "text",
        value: a.value,
      }));
      openDialog(
        "Edit extra event details",
        formBody(fields, "<p>Changes are recorded in the event history.</p>"),
      );
      submit(modal.querySelector("form")!, async (data) => {
        await api(`/manage/bookings/${b.id}/custom-answers`, "PUT", {
          revision: b.revision,
          values: formValues(data, fields),
        });
        await loadDashboard();
        await openBooking(b.id);
      });
    });
  }
  on(modal, "#quote-event", "click", () => quoteForm(b));
  on(modal, "#event-money", "click", () => moneyForm(b.id));
  on(modal, "#print-event", "click", () => window.print());
  on(modal, "#refer-event", "click", () => editRecord("referrals", "new"));
  on(modal, "#customer-link", "click", async () => {
    const value = await api<{ path: string }>(
      `/manage/bookings/${b.id}/link`,
      "POST",
      {},
    );
    openDialog(
      "Your customer’s private event page",
      `<p>Copy and share this link privately. It replaces any earlier link for this event.</p>${field({ key: "link", label: "Private event link", value: location.origin + value.path })}<p><a class="button" href="${e(value.path)}" target="_blank" rel="noopener noreferrer">Open event page ↗</a></p>`,
    );
  });
  on(modal, "[data-availability]", "change", async (ev) => {
    const el = ev.currentTarget as HTMLSelectElement;
    await api(`/manage/bookings/${b.id}/availability`, "POST", {
      revision: b.revision,
      performerId: el.dataset.availability,
      state: el.value,
    });
    await loadDashboard();
    await openBooking(b.id);
  });
  for (const [selector, status] of [
    ["#confirm-event", "confirmed"],
    ["#complete-event", "completed"],
    ["#cancel-event", "cancelled"],
  ])
    on(modal, selector, "click", () => statusForm(b, status));
  submit(modal.querySelector("#checklist-form")!, async (data) => {
    await api(`/manage/bookings/${b.id}/checklist`, "PUT", {
      revision: b.revision,
      checklist: b.checklist.map((ch, i) => ({
        ...ch,
        done: data.getAll("check").includes(String(i)),
      })),
    });
    await loadDashboard();
    await openBooking(b.id);
    notify("Checklist saved.");
  });
}
function editEvent(b: Booking) {
  const fields: Field[] = [
    ...eventFields(b),
    {
      key: "travel",
      label: "Travel buffer each side (minutes)",
      type: "number",
      min: 0,
      max: 1440,
      value: b.travel,
    },
    {
      key: "breakMinutes",
      label: "Break between acts (minutes)",
      type: "number",
      min: 0,
      max: 120,
      value: b.breakMinutes,
    },
    {
      key: "venueNotes",
      label: "Venue requirements / parking / access / directions",
      type: "textarea",
      wide: true,
      value: b.venueNotes,
    },
    {
      key: "customerId",
      label: "Customer record",
      type: "select",
      value: b.customerId,
      options: state!.customers.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: "checklist",
      label: "Show-day checklist",
      type: "textarea",
      wide: true,
      value: b.checklist
        .map((ch) => `${ch.done ? "[x] " : "[ ] "}${ch.text}`)
        .join("\n"),
      help: "One item per line. Use [x] for completed or [ ] for waiting. Add or remove lines freely.",
    },
  ];
  openDialog(
    "Edit the big day",
    formBody(
      fields,
      choices(
        "packageIds",
        state!.packages.filter((p) => p.active || b.packageIds.includes(p.id)),
        b.packageIds,
        "Shows in the request",
      ) +
        choices(
          "performerIds",
          state!.performers,
          b.performerIds,
          "Assigned performers",
        ) +
        choices(
          "backupPerformerIds",
          state!.performers,
          b.backupPerformerIds,
          "Backup performers",
        ) +
        '<p class="hint">Changing the requested packages clears old quote options and acceptance. Date, location or performer edits require fresh availability. A confirmed event must be confirmed again after editing.</p>',
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const value = formValues(data, fields);
    value.checklist = String(value.checklist)
      .split("\n")
      .filter((s) => s.trim())
      .map((s) => ({
        text: s.replace(/^\[[ x]\]\s*/i, "").trim(),
        done: /^\[x\]/i.test(s),
      }));
    await api(`/manage/bookings/${b.id}/details`, "PUT", {
      ...value,
      packageIds: selected(data, "packageIds"),
      performerIds: selected(data, "performerIds"),
      backupPerformerIds: selected(data, "backupPerformerIds"),
      revision: b.revision,
    });
    await loadDashboard();
    await openBooking(b.id);
    notify("Event updated.");
  });
}
async function rewardDialog(b: Booking) {
  type Award = RewardAward & {
    status: string;
    eligible: boolean;
    usage: { bookingId: string; quoteId: string; status: string }[];
  };
  const awards = await api<Award[]>(
    `/manage/customers/${b.customerId}/rewards`,
  );
  openDialog(
    "A little thank-you, carefully tracked",
    "<p>Issue a reward after reviewing the qualifying events. One reward can be attached to one quote option at a time. Refunded qualifying events suspend unused rewards.</p>" +
      awards
        .map(
          (a) =>
            `<section class="panel"><h3>${e(pretty(a.kind))} · ${a.percent}%</h3>${badge(a.status)}<p>${e(a.settings.terms)}</p><p>${a.sourceEventIds.length} qualifying event(s) · Issued ${e(a.issuedAt.slice(0, 10))}</p>${!a.eligible ? '<p class="hint">A qualifying event changed or was refunded. Review it; agreed prices have not been silently changed.</p>' : ""}${a.status === "available" && b.status === "quoted" ? `<button class="outline small" data-apply-reward="${a.id}">Apply to a quote</button>` : ""}${!a.voided && !a.usage.length ? `<button class="link" data-void-reward="${a.id}">Void with a reason</button>` : ""}</section>`,
        )
        .join("") +
      formBody(
        [
          {
            key: "kind",
            label: "Reward to issue",
            type: "select",
            options: options(["referral", "loyalty", "free_show"]),
          },
          {
            key: "reviewed",
            label: "I reviewed the qualifying events and referral legitimacy",
            type: "checkbox",
            required: true,
          },
        ],
        "<p>The system checks completed and fully paid events and prevents duplicate issuance for the same event and reward type.</p>",
        "Issue earned reward",
      ),
  );
  const refresh = async () => {
    await loadDashboard();
    await rewardDialog(state!.bookings.find((x) => x.id === b.id)!);
  };
  submit(modal.querySelector("form")!, async (data) => {
    await api(`/manage/customers/${b.customerId}/rewards`, "POST", {
      kind: data.get("kind"),
      reviewed: data.has("reviewed"),
    });
    await refresh();
  });
  on(modal, "[data-apply-reward]", "click", (ev) => {
    const awardId = (ev.currentTarget as HTMLElement).dataset.applyReward!;
    openDialog(
      "Put the thank-you in the proposal",
      formBody(
        [
          {
            key: "quoteId",
            label: "Quote option",
            type: "select",
            options: b.quotes.map((q) => ({
              value: q.id,
              label: `${q.name} · ${money(q.amount)}`,
            })),
          },
        ],
        "<p>The discount is calculated from this option’s total. Its deposit is capped to the reduced total. The customer must accept the updated proposal. A free-show reward requires a quote for only its configured magic package.</p>",
        "Apply reward",
      ),
    );
    submit(modal.querySelector("form")!, async (data) => {
      await api(`/manage/bookings/${b.id}/reward`, "POST", {
        awardId,
        quoteId: data.get("quoteId"),
        revision: b.revision,
      });
      await loadDashboard();
      await openBooking(b.id);
    });
  });
  on(modal, "[data-void-reward]", "click", (ev) => {
    const awardId = (ev.currentTarget as HTMLElement).dataset.voidReward!;
    openDialog(
      "Void this reward",
      formBody(
        [{ key: "reason", label: "Reason", required: true }],
        "<p>The record remains in history. Its source events can qualify again after the reward is voided.</p>",
        "Save logged reversal",
      ),
    );
    submit(modal.querySelector("form")!, async (data) => {
      await api(`/manage/rewards/${awardId}/void`, "POST", {
        reason: data.get("reason"),
      });
      await refresh();
    });
  });
}
function rewardSummary(q: Quote) {
  return q.reward
    ? `<p class="hint">${e(pretty(q.reward.kind))}: ${money(q.reward.originalAmount)} − ${money(q.reward.discount)} (${q.reward.percent}%) = ${money(q.amount)}<br>${e(q.reward.terms)}</p>`
    : "";
}
function quoteForm(b: Booking) {
  const drafts: Partial<Quote>[] = b.quotes.length
    ? structuredClone(b.quotes).map((q) => ({
        ...q,
        amount: q.reward?.originalAmount ?? q.amount,
        deposit: q.reward?.originalDeposit ?? q.deposit,
        reward: undefined,
      }))
    : [
        {
          name: "Your little moment of wonder",
          packageIds: b.packageIds,
          amount: 0,
          deposit: 0,
          notes: "",
        },
        {
          name: "A little extra sparkle",
          packageIds: b.packageIds,
          amount: 0,
          deposit: 0,
          notes: "",
        },
      ];
  function render() {
    openDialog(
      "Give them a few happy possibilities",
      `<p class="muted">Prepare one to three options. Editing restores amounts before rewards and releases any attached reward; reapply it after saving. The customer accepts one; you confirm after availability and deposit checks.</p><form><div id="quote-rows">${drafts.map((q, i) => `<fieldset><legend>Option ${i + 1}</legend><div class="forms-grid">${field({ key: `name-${i}`, label: "Option name", value: q.name, required: true })}${field({ key: `amount-${i}`, label: "Total (USD)", type: "number", value: Number(q.amount ?? 0) / 100, min: 0, step: "0.01", required: true })}${field({ key: `deposit-${i}`, label: "Required deposit (USD)", type: "number", value: Number(q.deposit ?? 0) / 100, min: 0, step: "0.01", required: true })}${field({ key: `notes-${i}`, label: "What’s included / terms", type: "textarea", value: q.notes, wide: true })}</div>${choices(`packages-${i}`, state!.packages, q.packageIds ?? [], "Included shows")}<button type="button" class="small danger" data-remove-option="${i}">Remove option</button></fieldset>`).join("")}</div><button type="button" id="add-option" class="outline small" ${drafts.length >= 3 ? "disabled" : ""}>＋ Add option</button><div class="form-error" role="alert"></div><div class="form-actions"><button type="submit">Save proposal for customer</button></div></form>`,
    );
    const read = () => {
      const data = new FormData(modal.querySelector("form")!);
      drafts.forEach((q, i) =>
        Object.assign(q, {
          name: String(data.get(`name-${i}`)),
          amount: Math.round(Number(data.get(`amount-${i}`)) * 100),
          deposit: Math.round(Number(data.get(`deposit-${i}`)) * 100),
          notes: String(data.get(`notes-${i}`)),
          packageIds: selected(data, `packages-${i}`),
        }),
      );
    };
    on(modal, "#add-option", "click", () => {
      read();
      drafts.push({
        name: "Another way to celebrate",
        packageIds: b.packageIds,
        amount: 0,
        deposit: 0,
        notes: "",
      });
      render();
    });
    on(modal, "[data-remove-option]", "click", (ev) => {
      read();
      drafts.splice(
        Number((ev.currentTarget as HTMLElement).dataset.removeOption),
        1,
      );
      render();
    });
    submit(modal.querySelector("form")!, async () => {
      read();
      await api(`/manage/bookings/${b.id}/quotes`, "POST", {
        revision: b.revision,
        options: drafts,
      });
      await loadDashboard();
      await openBooking(b.id);
      notify("Proposal saved. Share the private event link for acceptance.");
    });
  }
  render();
}
function statusForm(b: Booking, status: string) {
  openDialog(
    `${pretty(status)}: ${b.name}`,
    formBody(
      [
        {
          key: "reason",
          label: "Reason / confirmation note",
          type: "textarea",
          required: true,
          wide: true,
        },
      ],
      status === "cancelled"
        ? '<p class="hint">The event and all payments stay in the history. Record any deposit refund separately.</p>'
        : "",
      status === "confirmed"
        ? "Check & confirm booking"
        : status === "completed"
          ? "Mark event completed"
          : "Cancel event",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api(`/manage/bookings/${b.id}/status`, "POST", {
      status,
      reason: data.get("reason"),
      revision: b.revision,
    });
    await loadDashboard();
    await openBooking(b.id);
    notify(`Event ${status}.`);
  });
}
function moneyForm(bookingId = "") {
  const fields: Field[] = [
    {
      key: "bookingId",
      label: "Event",
      type: "select",
      value: bookingId,
      required: true,
      options: state!.bookings.map((b) => ({ value: b.id, label: b.name })),
    },
    {
      key: "kind",
      label: "Record type",
      type: "select",
      options: options(["payment", "refund", "expense"]),
    },
    {
      key: "amount",
      label: "Amount (USD)",
      type: "number",
      min: 0.01,
      step: "0.01",
      required: true,
    },
    {
      key: "date",
      label: "Date",
      type: "date",
      value: localToday(),
      required: true,
    },
    {
      key: "category",
      label: "Category",
      type: "select",
      options: options([
        "deposit",
        "balance",
        "performer payment",
        "assistant",
        "transport",
        "supplies",
        "referral fee",
        "other",
      ]),
    },
    { key: "note", label: "Reference / note", wide: true },
  ];
  openDialog(
    "Keep the numbers in tune",
    formBody(
      fields,
      '<p class="privacy">Records money already paid or a cost incurred. This does not charge a card or send a payment.</p>',
      "Record transaction",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const value = formValues(data, fields);
    value.amount = Math.round(Number(value.amount) * 100);
    await api("/manage/money", "POST", value);
    modal.close();
    await loadDashboard();
    notify("Transaction recorded.");
  });
}
function moneyCorrection(key: string) {
  const old = state!.money.find((m) => m.id === key)!;
  const fields: Field[] = [
    {
      key: "amount",
      label: "Correct amount (USD)",
      type: "number",
      value: old.amount / 100,
      min: 0,
      step: "0.01",
      required: true,
    },
    { key: "category", label: "Category", value: old.category, required: true },
    {
      key: "date",
      label: "Date",
      type: "date",
      value: old.date,
      required: true,
    },
    { key: "note", label: "Reference / note", value: old.note },
    {
      key: "reason",
      label: "Why is this correction needed?",
      type: "textarea",
      required: true,
      wide: true,
    },
  ];
  openDialog(
    "Correct a transaction",
    formBody(
      fields,
      '<p class="hint">The original values and your reason will remain in the audit history. Enter zero to void the amount.</p>',
      "Save logged correction",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const value = formValues(data, fields);
    value.amount = Math.round(Number(value.amount) * 100);
    await api(`/manage/money/${key}/correct`, "POST", value);
    modal.close();
    await loadDashboard();
    notify("Correction saved with history.");
  });
}
function moderateReview(key: string) {
  const r = state!.reviews.find((r) => r.id === key)!;
  openDialog(
    r.published ? "Unpublish review" : "Publish review",
    formBody(
      [
        {
          key: "reason",
          label: "Moderation reason",
          type: "textarea",
          required: true,
          wide: true,
        },
      ],
      '<p class="privacy">The review text, category scores and customer’s permission will not be changed.</p>',
      r.published ? "Unpublish" : "Publish",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    await api(`/manage/reviews/${key}/moderate`, "POST", {
      published: !r.published,
      reason: data.get("reason"),
    });
    modal.close();
    await loadDashboard();
    notify("Publication updated.");
  });
}
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function importCustomers() {
  openDialog(
    "Bring your contacts along",
    `<p>Export your spreadsheet as CSV. Required columns: <b>name, phone</b>. Optional: email, kind, notes, source, language. Import does not grant marketing permission.</p>${formBody([{ key: "csv", label: "CSV file", type: "file", required: true }], "", "Preview import")}`,
  );
  submit(modal.querySelector("form")!, async (data) => {
    const file = data.get("csv") as File;
    if (file.size > 500000)
      throw new Error("Keep each import under 500 KB and 500 rows.");
    const [headers, ...lines] = parseCsv(
      (await file.text()).replace(/^\uFEFF/, ""),
    );
    if (!headers?.includes("name") || !headers.includes("phone"))
      throw new Error("CSV needs name and phone column headings.");
    const rows = lines.map((row) =>
      Object.fromEntries(
        headers.map((h, i) => [h.trim().toLowerCase(), row[i] ?? ""]),
      ),
    );
    const preview = await api<{ rows: (Customer & { duplicate: boolean })[] }>(
      "/manage/import/customers",
      "POST",
      { rows, commit: false },
    );
    openDialog(
      "Check before adding",
      `<p>${preview.rows.filter((r) => !r.duplicate).length} new records · ${preview.rows.filter((r) => r.duplicate).length} duplicates will be skipped.</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Result</th></tr></thead><tbody>${preview.rows.map((r) => `<tr><td>${e(r.name)}</td><td>${e(r.phone)}</td><td>${r.duplicate ? "Skip duplicate" : "Add new"}</td></tr>`).join("")}</tbody></table></div><form><div class="form-error" role="alert"></div><div class="form-actions"><button type="submit">Import new records</button></div></form>`,
    );
    submit(modal.querySelector("form")!, async () => {
      const result = await api<{ added: number }>(
        "/manage/import/customers",
        "POST",
        { rows, commit: true },
      );
      modal.close();
      await loadDashboard();
      notify(
        `${result.added} customers added. Existing records were preserved.`,
      );
    });
  });
}
interface EventPageData {
  business: Catalog["business"];
  booking: Booking;
  packages: Package[];
  performers: Performer[];
  totals: { agreed: number; paid: number; balance: number; deposit: number };
  timetable: { label: string; at: string; duration: number }[];
  reviewed: string[];
}
async function renderEvent() {
  const data = await api<EventPageData>("/event");
  catalog = {
    business: data.business,
    packages: data.packages,
    performers: data.performers,
    reviews: [],
  };
  const b = data.booking;
  const descriptions: Record<string, string> = {
    requested:
      "Your idea is in the box! We’ll review the details and check availability.",
    availability_pending:
      "We’re checking who can be there to make your day special.",
    quoted:
      "A few happy possibilities, made just for you. Choose your favourite below.",
    accepted:
      "Your choice is saved. We still need to confirm availability, your deposit and the final details.",
    confirmed:
      "It’s happening! Your event is confirmed. Let the countdown begin.",
    completed:
      "Thank you for sharing your day with us. Tell us how it went below.",
    cancelled:
      "This event has been cancelled. Please contact the business about any remaining payment or refund.",
  };
  app.innerHTML = `<main id="main" class="event-page">${brand(data.business.name, data.business.logo)}<p class="eyebrow">Just for your celebration · Private event page</p><h1>${e(b.name)}</h1>${badge(b.status)}<p class="lead">${e(descriptions[b.status])}</p>${customSummary(b)}<div class="progress">${[
    ["Request received", true],
    ["Proposal accepted", !!b.acceptedQuoteId],
    ["Booking confirmed", ["confirmed", "completed"].includes(b.status)],
  ]
    .map(
      ([label, done]) =>
        `<span class="${done ? "done" : ""}">${done ? "✓" : "○"} ${label}</span>`,
    )
    .join(
      "",
    )}</div><section class="panel"><div class="details-grid"><div><small>When</small><strong>${day(b.date)} · ${e(b.time)}</strong><p>${e(data.business.timezone)}</p></div><div><small>Where</small><strong>${e(b.location)}</strong></div><div><small>Your audience</small><strong>${b.audience} guests · Main age ${b.age}</strong></div><div><small>Venue setup</small><strong>${b.indoor ? "Indoor" : "Outdoor"} · ${b.space} m² · ${b.power ? "Electricity" : "No electricity"}</strong></div></div>${!["completed", "cancelled"].includes(b.status) ? '<button id="event-details" class="outline small">Update venue & audience details</button>' : ""}</section>${b.quotes.length ? `<section><h2>Your happy possibilities</h2><div class="quote-options">${b.quotes.map((q) => `<article class="quote-card"><h3>${e(q.name)}</h3><p>${q.packageIds.map((p) => e(data.packages.find((v) => v.id === p)?.name)).join(" + ")}</p><div class="amount">${money(q.amount)}</div><p>Deposit required: ${money(q.deposit)}</p><p>${e(q.notes)}</p>${rewardSummary(q)}${b.status === "quoted" ? `<button data-accept="${q.id}">Choose this option</button>` : q.id === b.acceptedQuoteId ? '<span class="badge confirmed">Your choice ✓</span>' : ""}</article>`).join("")}</div><p class="privacy">Accepting a proposal does not confirm the booking. The business confirms it after the availability, venue and deposit checks.</p></section>` : ""}<section class="panel"><h2>The plan for your day</h2><ul class="timeline">${data.timetable.map((t) => `<li><time>${t.at}</time><span>${e(t.label)}${t.duration ? ` · ${t.duration} minutes` : ""}</span></li>`).join("")}</ul><small>Provisional until confirmed. The team reviews travel and setup.</small></section>${b.acceptedQuoteId ? `<section class="panel"><h3>Payments at a glance</h3><div class="details-grid"><div><small>Agreed total</small><strong>${money(data.totals.agreed)}</strong></div><div><small>Recorded payments</small><strong>${money(data.totals.paid)}</strong></div><div><small>Balance remaining</small><strong>${money(data.totals.balance)}</strong></div><div><small>Agreed deposit</small><strong>${money(data.totals.deposit)}</strong></div></div><p class="privacy">Please arrange payment directly with the business. This page does not collect card details.</p></section>` : ""}${b.status === "completed" ? `<section class="panel"><h2>How was your little moment of wonder?</h2><div class="actions">${[{ id: "", name: "Overall event" }, ...data.performers].map((p) => (data.reviewed.includes(p.id) ? `<span class="badge">${e(p.name)} reviewed ✓</span>` : `<button data-review="${p.id}" class="outline">Review ${e(p.name)}</button>`)).join("")}</div></section>` : ""}<footer class="footer"><span>Keep this link private. It gives access to your event.</span><a href="/b/${e(data.business.slug)}">Back to the shows ↗</a></footer></main>`;
  on(app, "[data-accept]", "click", (ev) => {
    const quoteId = (ev.currentTarget as HTMLElement).dataset.accept!;
    const q = b.quotes.find((q) => q.id === quoteId)!;
    openDialog(
      "Choose this happy possibility?",
      `<h3>${e(q.name)}</h3><p>Total ${money(q.amount)} · Deposit ${money(q.deposit)}</p><p>${e(q.notes)}</p>${rewardSummary(q)}<p class="hint">Your choice will be sent for final confirmation. It does not reserve the date until the business confirms.</p><form><div class="form-error" role="alert"></div><div class="form-actions"><button type="submit">Accept this proposal</button></div></form>`,
    );
    submit(modal.querySelector("form")!, async () => {
      await api("/event/accept", "POST", { quoteId, revision: b.revision });
      modal.close();
      await renderEvent();
    });
  });
  on(app, "#event-details", "click", () => {
    const fields = eventFields(b).filter((f) =>
      ["location", "audience", "age", "space", "indoor", "power"].includes(
        f.key,
      ),
    );
    openDialog(
      "Fine-tune your event details",
      formBody(
        fields,
        '<p class="hint">Changes to a confirmed event require the business to check and confirm the details again.</p>',
      ),
    );
    submit(modal.querySelector("form")!, async (form) => {
      await api("/event/details", "POST", {
        ...formValues(form, fields),
        revision: b.revision,
      });
      modal.close();
      await renderEvent();
      notify("Details saved for review.");
    });
  });
  on(app, "[data-review]", "click", (ev) =>
    reviewForm((ev.currentTarget as HTMLElement).dataset.review!),
  );
}
function reviewForm(performerId: string) {
  const fields: Field[] = [
    "overall",
    "punctuality",
    "engagement",
    "communication",
  ].map((key) => ({
    key,
    label: pretty(key),
    type: "select",
    options: [1, 2, 3, 4, 5].map((n) => ({
      value: String(n),
      label: `${n} ${n === 1 ? "star" : "stars"}`,
    })),
    value: 5,
  }));
  fields.push(
    { key: "text", label: "Your review", type: "textarea", wide: true },
    {
      key: "privateFeedback",
      label: "Private feedback for the business",
      type: "textarea",
      wide: true,
    },
    {
      key: "photo",
      label: "Optional photo link (HTTPS)",
      type: "url",
      wide: true,
      help: "Only share a photo you have permission to use, including permission for any children pictured.",
    },
    {
      key: "publishConsent",
      label: "You may publish my review and ratings",
      type: "checkbox",
      wide: true,
    },
    {
      key: "photoConsent",
      label: "You may publish this photo",
      type: "checkbox",
      wide: true,
    },
  );
  openDialog(
    "A few words after the applause",
    formBody(
      fields,
      '<p class="privacy">Private feedback is never displayed publicly. Photo permission is separate from review permission.</p>',
      "Send my review",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const value = formValues(data, fields);
    for (const key of ["overall", "punctuality", "engagement", "communication"])
      value[key] = Number(value[key]);
    await api("/event/reviews", "POST", { ...value, performerId });
    modal.close();
    await renderEvent();
    notify("Thank you for sharing your experience.");
  });
}
async function start() {
  if (location.pathname === "/manage") {
    try {
      await loadDashboard();
    } catch {
      await login();
    }
    return;
  }
  if (location.pathname === "/event") {
    await renderEvent();
    return;
  }
  const slug = location.pathname.startsWith("/b/")
    ? location.pathname.split("/")[2]
    : (await api<{ slug: string }>("/default-business")).slug;
  catalog = await api<Catalog>(`/public/${encodeURIComponent(slug)}`);
  renderPublic();
  if (new URLSearchParams(location.search).get("reset") === "1") {
    customerResetComplete(
      new URLSearchParams(location.search).get("username") ?? "",
      location.hash.slice(1),
    );
    history.replaceState(null, "", location.pathname);
  }
  if (!sessionStorage.getItem(`visit:${slug}`)) {
    const source =
      new URLSearchParams(location.search).get("source") ?? "direct";
    await api(`/public/${slug}/visit`, "POST", {
      source: [
        "direct",
        "instagram",
        "whatsapp",
        "referral",
        "school",
        "other",
      ].includes(source)
        ? source
        : "other",
    }).catch(() => {});
    sessionStorage.setItem(`visit:${slug}`, "1");
  }
}
start().catch((error) => {
  app.innerHTML = `<main class="loading" id="main"><span class="spark">✧</span><h1>The stage isn’t ready.</h1><p>${e(error.message)}</p><a class="button" href="/">Back to the website</a></main>`;
});
