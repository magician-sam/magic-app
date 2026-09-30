import { canStaffAction, limitedStaff, staffViews, roleDescriptions, type StaffAction } from "./staff-permissions.js";
import { guestServiceNames } from "./guest-services.js";
import { siteMediaSlots } from "./site-media.js";
import type { ActPlan } from "./act-plans.js";
import type { FollowupSettings } from "./followups.js";
import { reportPeriod } from "./reports.js";
import type { ContactEntry } from "./contact-history.js";
import { monthDays, shiftMonth } from "./calendar.js";
import { upload } from "@vercel/blob/client";
import type { CustomField } from "./custom-fields.js";
import type { RewardSettings } from "./rewards.js";
import type { RewardAward } from "./reward-ledger.js";
import type {
  Catalog,
  Dashboard,
  Booking,
  Customer,
  GuestGallery,
  Package,
  Performer,
  Quote,
  Reminder,
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
const customerStatus = (status: string, declined?: boolean) =>
  status === "accepted" ? "Proposal chosen · awaiting Sam" :
  status === "cancelled" && declined ? "Request declined" : pretty(status);
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
let guestBasket: string[] = [];
const publicOccasions = ["Birthday", "School event", "Wedding", "Corporate event", "Festival", "Christmas", "Private party", "Just because"];
let chosenOccasion = "";
function publicShowName(p: Package) {
  if (p.bundleIds?.length) return p.name;
  return ({ magic: "Magic Show", science: "Science Show", bubbles: "Bubble Show" } as Record<string, string>)[p.category.toLowerCase()] ?? p.name;
}
function publicShowTagline(p: Package) {
  return p.id === "magic" ? "The magic starts here" : p.name;
}
const publicPackageLabel = (name: string | undefined) =>
  name === "A little hocus pocus" ? "The magic starts here" : name ?? "";
function selectionNames() { return [...basket.map((key) => { const show = catalog.packages.find((p) => p.id === key); return show ? publicShowName(show) : ""; }), ...guestBasket]; }
function saveEventBox() {
  try { sessionStorage.setItem('event-box:' + catalog.business.slug, JSON.stringify({ basket, guestBasket, selectedPerformers, requestBundleDiscount, chosenOccasion })); } catch { /* Storage can be disabled. The current page still retains choices. */ }
}
function restoreEventBox() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('event-box:' + catalog.business.slug) ?? '{}');
    basket = Array.isArray(saved.basket) ? [...new Set<string>(saved.basket)].filter((id) => catalog.packages.some((p) => p.id === id)) : [];
    guestBasket = Array.isArray(saved.guestBasket) ? [...new Set<string>(saved.guestBasket)].filter((name) => moreShowNames().includes(name)) : [];
    selectedPerformers = Array.isArray(saved.selectedPerformers) ? saved.selectedPerformers.filter((id: string) => catalog.performers.some((p) => p.id === id)) : [];
    requestBundleDiscount = saved.requestBundleDiscount === true;
    chosenOccasion = publicOccasions.includes(saved.chosenOccasion) ? saved.chosenOccasion : "";
  } catch { /* Ignore expired or invalid drafts. */ }
}
function toggleGuest(name: string) {
  if (!moreShowNames().includes(name)) return;
  guestBasket = guestBasket.includes(name) ? guestBasket.filter((item) => item !== name) : [...guestBasket, name];
  renderPublic();
  notify(guestBasket.includes(name) ? name + ' added to your event.' : name + ' removed.');
}
let requestBundleDiscount = false;
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
document.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-toggle-password]");
  if (!button) return;
  const input = button.parentElement?.querySelector<HTMLInputElement>("input");
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
  const label = input.type === "password" ? "Show" : "Hide";
  button.textContent = label;
  button.setAttribute("aria-label", `${label} password`);
  button.setAttribute("aria-pressed", String(input.type === "text"));
});
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
  if (f.type === "password")
    return `<div class="field ${f.wide ? "wide" : ""}"><label for="f-${e(f.key)}">${e(f.label)}</label><span class="password-control">${input}<button type="button" data-toggle-password aria-label="Show password" aria-pressed="false">Show</button></span>${f.help ? `<small id="help-${e(f.key)}">${e(f.help)}</small>` : ""}</div>`;
  return `<label class="field ${f.wide ? "wide" : ""} ${f.key === "referralCode" ? "referral-field" : ""}" for="f-${e(f.key)}">${e(f.label)}${input}${f.help ? `<small id="help-${e(f.key)}">${e(f.help)}</small>` : ""}</label>`;
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
async function resizedPhoto(file: File): Promise<Blob> {
  if (file.size > 20_000_000) throw new Error("Choose a photo under 20 MB.");
  const localUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = localUrl;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare this photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const photo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!photo || photo.size > 3_000_000) throw new Error("This photo is too large after resizing.");
    return photo;
  } finally {
    URL.revokeObjectURL(localUrl);
  }
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
function photoGallery(
  photos?: { url: string; caption: string; approved: boolean }[],
) {
  const approved = (photos ?? []).filter((p) => p.approved);
  return approved.length
    ? '<details class="photo-gallery"><summary>View photos (' +
        approved.length +
        ')</summary><div class="gallery-grid">' +
        approved
          .map(
            (p) =>
              '<figure><a href="' +
              e(p.url) +
              '" target="_blank" rel="noopener noreferrer"><img src="' +
              e(p.url) +
              '" alt="' +
              e(p.caption) +
              '" loading="lazy" referrerpolicy="no-referrer"></a><figcaption>' +
              e(p.caption) +
              "</figcaption></figure>",
          )
          .join("") +
        "</div></details>"
    : "";
}
function bundleDetails(p: Package) {
  if (!p.bundleIds?.length) return "";
  const parts = p.bundleIds.map((id) =>
    catalog.packages.find((show) => show.id === id),
  );
  const separate = parts.every(
    (show) => show?.active && show.priceMode === "fixed",
  )
    ? parts.reduce((sum, show) => sum + show!.price, 0)
    : 0;
  const names = (p.bundleSnapshot ?? parts.filter((show): show is Package => !!show))
    .map((show) => show.name);
  return `<div class="bundle-summary"><span class="eyebrow">In this bundle</span><div class="bundle-parts">${names.map((name) => `<span>${e(name)}</span>`).join("")}</div>${separate > p.price ? `<p class="bundle-saving"><strong>Save ${money(separate - p.price)}</strong><small>Instead of ${money(separate)} separately</small></p>` : ""}</div>`;
}
const demoShowPhotos: Record<string, { url: string; caption: string; approved: true }[]> = {};
const portfolioShowPhotos: Record<string, { url: string; caption: string; approved: true }[]> = {
  magic: [
    { url: "/portfolio/sam-magic-live-1.jpg", caption: "Sam · magician portrait", approved: true },
    { url: "/portfolio/sam-magic-live-2.jpg", caption: "Sam performing magic", approved: true },
    { url: "/portfolio/sam-magic-1.jpg", caption: "Sam on stage", approved: true },
    { url: "/portfolio/sam-magic-2.jpg", caption: "Sam's magic show", approved: true },
    { url: "/portfolio/sam-magic-3.jpg", caption: "Magic performance with Sam", approved: true },
  ],
  science: [
    { url: "/portfolio/sam-science-live-1.jpg", caption: "Sam performing the Science Show", approved: true },
    { url: "/portfolio/sam-science-live-2.jpg", caption: "A child joins Sam's science experiment", approved: true },
    { url: "/portfolio/sam-science-live-3.jpg", caption: "Colourful experiments at a real event", approved: true },
    { url: "/portfolio/sam-science-live-4.jpg", caption: "Children enjoying the Science Show", approved: true },
  ],
  bubbles: [
    { url: "/portfolio/presentation/bubble-show.jpg", caption: "Giant bubble show with children", approved: true },
  ],
};
const characterPhotos = [
  { url: "/portfolio/characters-rabbits.jpg", caption: "Red and grey rabbit characters" },
  { url: "/portfolio/characters-teddy.jpg", caption: "Teddy bear character" },
  { url: "/portfolio/characters-gorillas.jpg", caption: "Black and grey gorilla characters" },
  { url: "/portfolio/characters-panda-bear.jpg", caption: "Panda and polar bear characters" },
];
const guestPhotoGroups = [
  { match: /animation/i, photos: [["../presentation/kids-animation", "Children enjoying an activity session"]] },
  { match: /carnival games?/i, photos: [["../presentation/carnival-games", "Carnival game stalls"], ["../presentation/carnival-arcade", "Colorful arcade games"]] },
  { match: /children.?s workshops?|kids.? workshops?/i, photos: [["../presentation/painting-workshop", "Children's painting activity"], ["../presentation/science-workshop", "Hands-on science activity"]] },
  { match: /decoration|balloon decor/i, photos: [["../decoration/garden-birthday", "Garden birthday backdrop"], ["../decoration/black-gold-birthday", "Black and gold birthday setup"], ["../decoration/basketball-birthday", "Basketball-themed celebration"], ["../decoration/dinosaur-birthday", "Dinosaur birthday backdrop"], ["../decoration/pink-first-birthday", "Pink first-birthday setup"], ["../decoration/gold-white-celebration", "White and gold celebration"], ["../decoration/daisy-first-birthday", "Daisy-themed first birthday"], ["../decoration/baby-celebration", "Baby celebration balloons"], ["../decoration/pink-character-birthday", "Pink character-themed birthday"], ["../decoration/space-birthday", "Space-themed birthday setup"], ["../decoration/video-game-birthday", "Video-game-themed birthday"], ["../decoration/fairytale-celebration", "Fairytale celebration backdrop"], ["../decoration/gender-reveal", "Gender reveal balloon setup"], ["../decoration/bridal-room", "Bridal celebration balloons"]] },
  { match: /face paint|glitter/i, photos: [["face-painting-1", "Butterfly face painting"], ["face-painting-2", "Tiger face painting"]] },
  { match: /balloon twist/i, photos: [["balloon-twisting-live", "Balloon twisting at a family event"], ["clown-unicycle-balloon", "Clown with balloon creations"]] },
  { match: /dance show|dance performance/i, photos: [["dance", "Dance performance"]] },
  { match: /dog show/i, photos: [["dog-1", "Dog show obstacle act"], ["dog-2", "Dog show hoop act"], ["dog-3", "Dog show performer"]] },
  { match: /acrobat/i, photos: [["acrobat", "Acrobatic performance"]] },
  { match: /juggl/i, photos: [["juggling-rings-live", "Ring juggling at an outdoor celebration"], ["unicycle-juggling-live", "Juggling clubs on a unicycle"], ["bmx-juggling-live", "Ball juggling during a BMX performance"], ["juggling-1", "Juggler on stage"], ["juggling-2", "Juggling act"], ["juggling-3", "Juggler and unicycle"], ["../presentation/juggling-show", "Colorful juggling performance"]] },
  { match: /stilt/i, photos: [["stilt-walker-live", "Colorful stilt walker at an outdoor venue"], ["stilt-walker", "Stilt walkers in costume"], ["../presentation/stilt-walker", "Stilt walker at an outdoor event"]] },
  { match: /bmx/i, photos: [["bmx-jump-live", "BMX jump at a children's event"], ["bmx-juggling-live", "BMX performer entertaining children"], ["bmx-1", "BMX stunt show"], ["bmx-2", "BMX stage performance"], ["../presentation/bmx-show", "BMX stunt at a children's event"]] },
  { match: /clown/i, photos: [["clown-unicycle-balloon", "Clown with balloons and a unicycle"], ["clown-bubbles-live", "Clown entertaining with bubbles"], ["clown-1", "Clown performance"], ["clown-2", "Clown character close-up"]] },
  { match: /breakdance/i, photos: [["breakdance", "Breakdance performers"]] },
  { match: /aerial/i, photos: [["aerial", "Aerial ring act"]] },
  { match: /fire show/i, photos: [["fire-show", "Fire performance"]] },
  { match: /led (?:robot|dancing suit)|robot show/i, photos: [["led-robots", "LED dancing suit performers"], ["../presentation/led-robots", "LED dancers on stage"]] },
  { match: /live music|violin/i, photos: [["live-music", "Live violin performance"], ["circus-parade", "Costumed parade performers"], ["../presentation/stilt-walker", "Stilt performer at an outdoor event"]] },
  { match: /caricatur/i, photos: [["caricaturist", "Caricaturist drawing at an event"]] },
  { match: /human statue/i, photos: [["human-statues", "Human statue performer"]] },
  { match: /football|soccer/i, photos: [["football-balance-live", "Football balancing skills on the field"], ["football-stage-live", "Football freestyle performance in front of a crowd"]] },
  { match: /chair balance/i, photos: [["chair-balance", "Chair balance act"], ["../presentation/chair-balance", "Outdoor chair balance performance"]] },
  { match: /circus parade/i, photos: [["circus-parade", "Circus parade"]] },
] as const;
function guestBuiltInPhotos(name: string) {
  if (/character/i.test(name)) return characterPhotos;
  const group = guestPhotoGroups.find((entry) => entry.match.test(name));
  return group?.photos.map(([file, caption]) => ({
    url: file.startsWith("../presentation/")
      ? `/portfolio/presentation/${file.slice("../presentation/".length)}.jpg`
      : file.startsWith("../decoration/")
        ? `/portfolio/decoration/${file.slice("../decoration/".length)}.jpg`
      : `/portfolio/guest/${file}.jpg`,
    caption,
  })) ?? [];
}
function guestPhotos(name: string) {
  const saved = (catalog?.guestGalleries ?? []).find((entry) => entry.id === name.toLocaleLowerCase("en"));
  const hidden = new Set(saved?.hiddenPhotoUrls ?? []);
  const builtIn = guestBuiltInPhotos(name).filter((photo) => !hidden.has(photo.url));
  return [...builtIn, ...(saved?.gallery ?? []).filter((photo) => !builtIn.some((item) => item.url === photo.url))].slice(0, 30);
}
function guestBuiltInVideos(name: string) {
  return /football|soccer/i.test(name) ? ["/portfolio/guest/football-show-live.mp4"] : [];
}
function guestVideos(name: string) {
  const saved = (catalog?.guestGalleries ?? []).find((entry) => entry.id === name.toLocaleLowerCase("en"));
  const hidden = new Set(saved?.hiddenVideoUrls ?? []);
  return [...new Set([...guestBuiltInVideos(name).filter((url) => !hidden.has(url)), ...(saved?.videos ?? [])])].slice(0, 6);
}
function characterGallery() {
  return `<section><h3>Meet the characters</h3><div class="show-detail-gallery">${guestPhotos("Characters").map((photo) => `<figure><img src="${e(photo.url)}" alt="${e(photo.caption)}" loading="lazy"><figcaption>${e(photo.caption)}</figcaption></figure>`).join("")}</div><p class="privacy">Tell us which costume you like. We will confirm its availability for your date before booking.</p></section>`;
}
function showPhotos(p: Package) {
  const approved = (p.gallery ?? []).filter((photo) => photo.approved);
  const hidden = new Set(p.hiddenPhotoUrls ?? []);
  const portfolio = (portfolioShowPhotos[p.id] ?? []).filter((photo) => !hidden.has(photo.url));
  if (portfolio.length) return [...portfolio, ...approved.filter((photo) => !portfolio.some((saved) => saved.url === photo.url))].slice(0, 12);
  if (approved.length) return approved;
  return (demoShowPhotos[p.id] ?? []).filter((photo) => !hidden.has(photo.url));
}
function showVideos(p: Package) {
  const scienceVideos = packageBuiltInVideos(p);
  const hidden = new Set(p.hiddenVideoUrls ?? []);
  return [...new Set([...scienceVideos.filter((url) => !hidden.has(url)), ...(p.previewVideos ?? []), ...(p.previewVideo ? [p.previewVideo] : [])])].filter(Boolean);
}
function packageBuiltInVideos(p: Package) {
  return p.id === "science" ? [1, 2, 3, 4].map((number) => `/portfolio/sam-science-live-${number}.mp4`) : [];
}
function videoTile(link: string, showName: string, index: number, poster?: string) {
  const parsed = new URL(link, location.origin);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const youtubeId = host === "youtu.be"
    ? parsed.pathname.split("/")[1]
    : host === "youtube.com" || host === "m.youtube.com"
      ? parsed.pathname === "/watch" ? parsed.searchParams.get("v") : parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
      : null;
  const embed = youtubeId && /^[\w-]{11}$/.test(youtubeId)
    ? `https://www.youtube-nocookie.com/embed/${youtubeId}`
    : host === "vimeo.com" && /^\/\d+$/.test(parsed.pathname)
      ? `https://player.vimeo.com/video${parsed.pathname}`
      : "";
  const player = /\.(mp4|webm)$/i.test(parsed.pathname)
    ? `<video controls playsinline preload="metadata" src="${e(link)}"${poster ? ` poster="${e(poster)}"` : ""} aria-label="${e(showName)} video ${index + 1}"></video>`
    : embed
      ? `<iframe src="${e(embed)}" title="${e(showName)} video ${index + 1}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
      : `<div class="show-video-link"><span aria-hidden="true">▶</span><a href="${e(link)}" target="_blank" rel="noopener noreferrer">Watch video ${index + 1} ↗</a></div>`;
  return `<figure class="show-video-tile">${player}<figcaption>Video ${index + 1}</figcaption></figure>`;
}
function showCard(p: Package) {
  const photos = showPhotos(p);
  const cover = photos[(p.coverPhotoNumber ?? 1) - 1] ?? photos[0];
  const photoCount = photos.length;
  const isDemo = !(p.gallery ?? []).some((photo) => photo.approved) && !!demoShowPhotos[p.id];
  return `<article class="show-card${p.bundleIds?.length ? " bundle-card" : ""}"><button type="button" class="show-art ${e(p.category)}${cover ? " has-cover" : ""}" data-show-details="${e(p.id)}" aria-label="Explore ${e(publicShowName(p))}">${cover ? `<img class="show-cover" src="${e(cover.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="art-icon" aria-hidden="true">${categoryIcon[p.category] ?? "★"}</span>`}<span class="show-art-label">Explore the show ↗</span></button><div class="show-body"><span class="eyebrow">${p.bundleIds?.length ? "Bundle offer" : e(p.category)}</span><h3><button type="button" class="show-title" data-show-details="${e(p.id)}">${e(publicShowName(p))}</button></h3><small class="show-subtitle">${e(publicShowTagline(p))}</small><p>${e(p.description)}</p>${bundleDetails(p)}<p class="show-media-note">${photoCount ? `${photoCount} ${isDemo ? "demo " : ""}photo${photoCount === 1 ? "" : "s"}` : "Photos coming soon"}${showVideos(p).length ? " · Video" : ""}</p><div class="show-meta">${e(price(p))}</div><button type="button" class="outline" data-show-details="${e(p.id)}">See photos & videos</button><button data-add="${e(p.id)}" class="${basket.includes(p.id) ? "secondary" : "outline"}">${basket.includes(p.id) ? "✓ In your event box" : "＋ Add to my event"}</button></div></article>`;
}
function showDetails(p: Package) {
  const photos = showPhotos(p);
  const isDemo = !(p.gallery ?? []).some((photo) => photo.approved) && !!demoShowPhotos[p.id];
  const videos = showVideos(p);
  openDialog(
    publicShowName(p),
    `<div class="show-detail"><p class="eyebrow">${e(publicShowName(p) === p.name ? p.category : publicShowTagline(p))}</p><p>${e(p.description)}</p><ul class="show-facts"><li>${p.minAge === 0 && p.maxAge === 99 ? "All ages" : `Ages ${p.minAge}–${p.maxAge}`}</li>${p.needsPower ? "<li>Electricity needed</li>" : ""}</ul>${bundleDetails(p)}${photos.length ? `<section><h3>Photos</h3>${isDemo ? '<p class="show-demo-note">Sample illustrations for testing. Real show photos will replace these.</p>' : ""}<div class="show-detail-gallery">${photos.map((photo) => `<figure><img src="${e(photo.url)}" alt="${e(photo.caption || p.name)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>${e(photo.caption)}</figcaption></figure>`).join("")}</div></section>` : '<p class="show-media-empty">Photos will appear here when they are ready.</p>'}${videos.length ? `<section><h3>Videos</h3><div class="show-video-gallery${p.id === "science" ? " science-videos" : ""}">${videos.map((link, index) => videoTile(link, p.name, index, p.id === "science" ? `/portfolio/sam-science-live-${index + 1}.jpg` : undefined)).join("")}</div></section>` : ""}<div class="show-detail-footer"><strong>${e(price(p))}</strong><button type="button" id="detail-add">${basket.includes(p.id) ? "✓ In your event box" : "＋ Add to my event"}</button></div></div>`,
  );
  on(modal, "#detail-add", "click", () => {
    if (togglePackage(p.id)) modal.close();
  });
}
function moreShowNames() { return guestServiceNames(catalog.business.otherShowNames, catalog.business.hiddenGuestServices); }
function siteMediaUrl(key: string) {
  return catalog.business.siteMedia?.[key] ?? siteMediaSlots.find((slot) => slot.key === key)?.defaultUrl ?? "";
}
function applyPublicSiteMedia() {
  const heroKeys = ["heroMagic", "heroScience", "heroCharacters"];
  for (const selector of [".hero-gallery", ".mobile-hero-photos"]) {
    const images = [...app.querySelectorAll<HTMLImageElement>(`${selector} img`)];
    images.forEach((image, index) => {
      const url = siteMediaUrl(heroKeys[index]);
      if (url) image.src = url;
      else image.remove();
    });
  }
  for (const [selector, key] of [
    [".show-proof img", "showProof"],
    [".adult-magic-feature img", "adultMagic"],
    [".sam-profile img", "samProfile"],
  ]) {
    const image = app.querySelector<HTMLImageElement>(selector);
    if (!image) continue;
    const url = siteMediaUrl(key);
    if (url) image.src = url;
    else image.remove();
  }
}

function renderBox() {
  const chosen = catalog.packages.filter((p) => basket.includes(p.id));
  const node = document.querySelector("#event-box")!;
  const count = chosen.length + guestBasket.length;
  node.innerHTML = `<span class="eyebrow">A celebration, your way</span><h3>Your event box <span aria-hidden="true">✧</span></h3><p>Good things come together here.</p>${count ? chosen.map((p) => `<div class="box-item"><span>${e(publicShowName(p))}<br><small>${e(price(p))}</small></span><button class="link" data-remove="${e(p.id)}" aria-label="Remove ${e(publicShowName(p))}">×</button></div>`).join("") + guestBasket.map((name) => `<div class="box-item"><span>${e(name)}<br><small>Availability & price to confirm</small></span><button class="link" data-remove-guest="${e(name)}" aria-label="Remove ${e(name)}">×</button></div>`).join("") : `<div class="box-empty"><span>✦</span>A little empty. Full of possibilities.<br><small>Add a show to start the fun.</small></div>`}${selectedPerformers.length ? `<p>${selectedPerformers.length} performer preference(s) added</p>` : ""}${chosen.length ? `<div class="box-total"><span>${chosen.some((p) => p.priceMode === "quote") ? "Your price" : "Package estimate"}</span><strong>${chosen.some((p) => p.priceMode === "quote") ? "Personal quote" : money(chosen.reduce((n, p) => n + p.price, 0))}</strong></div>` : ""}<button id="request" ${count ? "" : "disabled"}>Request my event <span aria-hidden="true">→</span></button><p class="box-note">No payment now. We’ll check availability and send your proposal. Your request is not a confirmed booking. Setup, breaks and travel are reviewed separately.</p>`;
  document.querySelector('.mobile-event-bar')?.remove();
  document.body.classList.toggle('has-event-selection', count > 0);
  if (count) {
    const bar = document.createElement('div');
    bar.className = 'mobile-event-bar';
    bar.innerHTML = '<a href="#event-box"><strong>Your event · ' + count + '</strong><small>Review your choices</small></a><button type="button">Continue →</button>';
    bar.querySelector('button')!.addEventListener('click', () => requestForm());
    app.append(bar);
  }
  on(node, '[data-remove-guest]', 'click', (ev) => toggleGuest((ev.currentTarget as HTMLElement).dataset.removeGuest!));
  if (chosen.length >= 2 || chosen.some((item) => item.bundleIds?.length)) {
    const label = document.createElement("label");
    label.className = "bundle-discount-request";
    label.innerHTML = `<input type="checkbox" id="ask-bundle-discount" ${requestBundleDiscount ? "checked" : ""}><span><strong>Ask for a bundle discount</strong><small>We’ll review your mix of shows and send the best offer.</small></span>`;
    node.querySelector("#request")?.before(label);
    on(label, "#ask-bundle-discount", "change", (event) => {
      requestBundleDiscount = (event.currentTarget as HTMLInputElement).checked;
      saveEventBox();
    });
  }
  on(node, "[data-remove]", "click", (ev) => {
    basket = basket.filter(
      (id) => id !== (ev.currentTarget as HTMLElement).dataset.remove,
    );
    renderPublic();
  });
  on(node, "#request", "click", () => requestForm());
}
function togglePackage(key: string) {
  const added = catalog.packages.find((p) => p.id === key);
  if (!added) return false;
  const included = added.bundleIds?.length ? added.bundleIds : [key];
  if (
    !basket.includes(key) &&
    catalog.packages
      .filter((p) => basket.includes(p.id))
      .some((p) =>
        (p.bundleIds?.length ? p.bundleIds : [p.id]).some((id) =>
          included.includes(id),
        ),
      )
  ) {
    notify(
      "This show is already included in your event box. Remove the overlapping show or bundle first.",
    );
    return false;
  }
  basket = basket.includes(key)
    ? basket.filter((x) => x !== key)
    : [...basket, key];
  renderPublic();
  notify(
    basket.includes(key)
      ? "A little more wonder in your event box."
      : "Show removed from your event box.",
  );
  return true;
}
function samProfile() {
  return `<article class="panel profile sam-profile"><img src="/portfolio/sam-magic-live-1.jpg" alt="Sam, the magician behind Magic by Sam" loading="lazy"><div><span class="eyebrow">The person behind the wonder</span><h3>Meet Sam</h3><p>Sam is a magician and a member of the International Magicians Society. He personally performs the Magic, Science and Bubbles shows, bringing guests into the fun and making each celebration feel like its own story.</p><a class="button outline" href="#shows">Explore Sam’s shows ↗</a></div></article>`;
}
function guestCatalogGroups() {
  const names = moreShowNames();
  const party = ["Characters", "Animation", "Carnival Games", "Children's Workshops", "Decoration", "Face Painting & Glitter", "Balloon Twisting", "Clown"];
  const groups = [
    { id: "party-shows", title: "Characters & party fun", names: names.filter((name) => party.includes(name)) },
    { id: "special-acts", title: "Big moments & special acts", names: names.filter((name) => !party.includes(name)) },
  ];
  return groups.filter((group) => group.names.length).map((group) => `<section class="show-group" id="${group.id}"><h3>${group.title}</h3><div class="cards">${group.names.map(enquiryCard).join("")}</div></section>`).join("");
}
function adultMagicFeature() {
  const show = catalog.packages.find((p) => p.active && !p.bundleIds?.length && p.category.toLowerCase() === "magic");
  const closeUp = moreShowNames().includes("Close-up Magic");
  return `<section id="adult-magic" class="section adult-magic-feature"><img src="/portfolio/sam-magic-live-2.jpg" alt="Sam performing magic at an event" loading="lazy"><div><span class="eyebrow">Wonder has no age limit</span><h2>Magic for grown-up celebrations</h2><p>Planning a wedding, private party or corporate event? Tell us about your guests and the atmosphere you want. We’ll plan the format with you.</p><div class="actions">${show ? `<button type="button" data-show-details="${e(show.id)}">Explore the Magic Show ↗</button>` : '<a class="button" href="#sam-shows">Explore the shows ↗</a>'}${closeUp ? '<button type="button" class="outline" data-enquiry-details="Close-up Magic">Explore Close-up Magic ↗</button>' : ''}</div></div></section>`;
}
function bundleIdeas() {
  const byCategory = (name: string) => catalog.packages.find((p) => p.active && !p.bundleIds?.length && p.category.toLowerCase() === name);
  const magic = byCategory("magic"), science = byCategory("science"), bubbles = byCategory("bubbles");
  return [
    { title: "Magic & bubbles", note: "Two favourites for a joyful birthday.", shows: [magic, bubbles] },
    { title: "Magic & science", note: "Wonder and discovery in one event.", shows: [magic, science] },
    { title: "Science & bubbles", note: "Hands-on curiosity meets big smiles.", shows: [science, bubbles] },
  ].filter((idea) => idea.shows.every(Boolean)).map((idea) => `<article class="bundle-idea"><span class="eyebrow">Bundle idea</span><h3>${idea.title}</h3><p>${idea.note}</p><small>Personal quote · ask for a bundle discount</small><button type="button" class="outline" data-bundle-idea="${idea.shows.map((show) => show!.id).join(",")}">Add both shows ↗</button></article>`).join("");
}
function renderPublic() {
  saveEventBox();
  document.title = `${catalog.business.name} · Live shows for your celebration`;
  const defaultIntro = "A little wonder. A lot of happy memories. Magic, science and bubbles, brought together for your celebration.";
  const heroIntro = catalog.business.intro === defaultIntro
    ? "Magic, science, bubbles and characters for birthdays, schools and special events."
    : catalog.business.intro;
  const contactPhone = catalog.business.whatsapp || (catalog.business.slug === "magic-by-sam" ? "96171299716" : "");
  const contactEmail = catalog.business.contactEmail || (catalog.business.slug === "magic-by-sam" ? "sam.wehbi@gmail.com" : "");
  app.innerHTML = `<div class="wrap"><header class="site-header">${brand(catalog.business.name, catalog.business.logo)}<nav class="site-nav" aria-label="Main navigation"><a href="#shows">The shows</a><a href="#adult-magic">Adult magic</a>${catalog.packages.some((p) => p.bundleIds?.length) ? '<a href="#offers">Offers & bundles</a>' : ""}<a href="#characters">Characters</a><a href="#rewards">Free show</a><button class="link" id="customer-account">My account</button><a href="#performers">The people</a><a href="#how">How it works</a><a class="button secondary small" href="#event-box">Your event box (${basket.length + guestBasket.length}) ↗</a></nav></header><main id="main"><section class="hero"><div class="hero-copy"><div class="eyebrow">✦ Real shows. Real smiles.</div><h1>Make your event<br><em>magical.</em></h1><p>${e(heroIntro)}</p><div class="actions"><a class="button" href="#shows">See the shows <span aria-hidden="true">↗</span></a><button class="outline" id="help-choose">Help me choose</button></div><div class="micro muted">Choose your favourites. Request a personal quote.</div>${contactPhone ? `<a class="contact-link" href="https://wa.me/${e(contactPhone.replace(/\D/g, "").replace(/^00/, ""))}" target="_blank" rel="noopener noreferrer">Questions? Chat with us on WhatsApp ↗</a>` : ""}<a class="install-link" href="/install.html">↧ Install Magic by Sam on your phone</a></div><div class="hero-gallery" aria-label="Real moments from Magic by Sam"><img src="/portfolio/sam-magic-live-2.jpg" alt="Sam performing magic at a celebration" loading="eager"><img src="/portfolio/sam-science-live-1.jpg" alt="Sam presenting the Science Show" loading="eager"><img src="/portfolio/characters-rabbits.jpg" alt="Colourful event characters" loading="eager"><span>Magic by Sam · Live moments</span></div><div class="mobile-hero-photos" aria-label="Real moments from Magic by Sam"><img src="/portfolio/sam-magic-live-2.jpg" alt="Sam performing magic" loading="eager"><img src="/portfolio/sam-science-live-1.jpg" alt="Sam presenting the Science Show" loading="eager"><img src="/portfolio/characters-rabbits.jpg" alt="Colourful event characters" loading="eager"><span>Real shows. Real smiles. ✦</span></div></section><div class="ribbon"><span><b>✧</b> Made for your celebration</span><span><b>◷</b> Availability checked personally</span><span><b>♡</b> A little extra imagination</span></div><section id="shows" class="section"><div class="section-heading"><div><span class="eyebrow">Pick your kind of extraordinary</span><h2>All the shows</h2></div><p>Choose a show. We’ll check the details with you.</p></div><nav class="show-jump" aria-label="Browse show groups"><a href="#sam-shows">Sam’s shows</a><a href="#party-shows">Characters & party fun</a><a href="#special-acts">Special acts</a></nav><div class="show-proof"><img src="/portfolio/sam-magic-live-1.jpg" alt="Sam performing at a real event" loading="lazy"><div><strong>Meet Sam on stage.</strong><span>Sam personally performs the Magic, Science and Bubbles shows. Explore real event photos on each card.</span></div></div><div class="builder-layout"><div class="catalog-list"><div class="show-search"><label for="find-show">Find a show</label><input id="find-show" type="search" placeholder="Try clown, juggling, science…" autocomplete="off"><span id="show-search-count" role="status"></span></div><section class="show-group" id="sam-shows"><h3>Sam’s signature shows</h3><div class="cards">${catalog.packages
    .filter((p) => !p.bundleIds?.length)
    .map(showCard)
    .join(
      "",
    )}</div></section>${guestCatalogGroups()}</div><aside class="event-box" id="event-box" aria-label="Your event box"></aside></div></section><section id="offers" class="section"><div class="section-heading"><div><span class="eyebrow">More together</span><h2>Offers & bundles</h2></div><p>Pick a pair of shows below, or make your own mix. We’ll send a personal quote.</p></div><div class="bundle-ideas">${bundleIdeas()}</div><div class="bundle-invite"><span aria-hidden="true">✦</span><strong>Your favourite shows, together.</strong><p>Add two or more shows to your event box and ask for a bundle discount.</p><a class="button outline" href="#shows">Choose shows ↗</a></div><div class="cards">${catalog.packages
          .filter((p) => p.bundleIds?.length)
          .map(showCard)
          .join("")}</div></section>${referralPromo()}${adultMagicFeature()}<section class="how" id="how"><h2>From “what if”<br>to “wow!”</h2><div class="step"><span>01</span><b>Dream it up</b><p>Pick your shows and tell us about your celebration.</p></div><div class="step"><span>02</span><b>Make it yours</b><p>We check the details and put your proposal together.</p></div><div class="step"><span>03</span><b>Let the fun begin</b><p>Once approved and confirmed, it’s time to look forward to the big day.</p></div></section><section id="performers" class="section"><div class="section-heading"><div><span class="eyebrow">Meet the makers of happy</span><h2>People with a little extra sparkle.</h2></div></div><div class="profile-grid">${catalog.performers.map((p) => `<article class="panel profile">${p.photo ? `<img src="${e(p.photo)}" alt="${e(p.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="profile-placeholder" aria-hidden="true">✦</div>'}<h3>${e(p.name)}</h3>${p.membershipVerified ? '<span class="badge">Verified membership</span>' : ""}<p>${e(p.bio)}</p><p class="muted">${e(p.areas)}</p>${p.video ? `<p><a href="${e(p.video)}" target="_blank" rel="noopener noreferrer">Watch a show ↗</a></p>` : ""}${photoGallery(p.gallery)}<button data-performer="${e(p.id)}" class="outline">${selectedPerformers.includes(p.id) ? "✓ Added · remove" : "Add to my event"}</button></article>`).join("") || samProfile()}</div></section>${catalog.reviews.length ? `<section class="section"><span class="eyebrow">After the applause</span><h2>Happy memories, in their words.</h2><div class="profile-grid">${catalog.reviews.map((r) => `<article class="review"><div class="review-stars" aria-label="${r.overall} out of 5 stars">${"★".repeat(r.overall)}${"☆".repeat(5 - r.overall)}</div><p>${e(r.text)}</p><small>${e(catalog.performers.find((p) => p.id === r.performerId)?.name ?? "Overall event")} · Verified event review</small>${r.photo ? `<img src="${e(r.photo)}" alt="Customer-shared event memory" loading="lazy" width="180" referrerpolicy="no-referrer">` : ""}</article>`).join("")}</div></section>` : ""}</main><footer class="footer"><span>✦ ${e(catalog.business.name)} · A little wonder goes a long way.</span><div class="links">${catalog.business.instagram ? `<a href="${e(catalog.business.instagram)}" target="_blank" rel="noopener noreferrer">Instagram ↗</a>` : ""}${contactPhone ? `<a href="https://wa.me/${e(contactPhone.replace(/\D/g, "").replace(/^00/, ""))}?text=${encodeURIComponent("Hello! I would like help planning an entertainment event.")}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>` : ""}${contactEmail ? `<a href="mailto:${e(contactEmail)}">${e(contactEmail)}</a>` : ""}<a href="/manage">Backstage login</a><button class="link" id="privacy">Privacy</button></div></footer>${contactPhone ? `<a class="whatsapp-button" href="https://wa.me/${e(contactPhone.replace(/\D/g, "").replace(/^00/, ""))}?text=${encodeURIComponent("Hello! I would like help planning an entertainment event.")}" target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp (opens a new tab)">✆ Let’s chat on WhatsApp ↗</a>` : ""}</div>`;
  applyPublicSiteMedia();
  if (!moreShowNames().includes("Characters")) app.querySelector(".site-nav a[href='#characters']")?.remove();
  for (const group of ["party-shows", "special-acts"])
    if (!app.querySelector(`#${group}`)) app.querySelector(`.show-jump a[href='#${group}']`)?.remove();
  if (!catalog.packages.some((item) => item.bundleIds?.length)) {
    const offersLink = document.createElement("a");
    offersLink.href = "#offers";
    offersLink.textContent = "Offers & bundles";
    document.querySelector(".site-nav a[href='#characters']")?.before(offersLink);
  }
  const moments = [
    [siteMediaUrl("momentMagic"), "Magic with Sam", "show", "magic"],
    [siteMediaUrl("momentScience"), "Science show", "show", "science"],
    [siteMediaUrl("momentCharacters"), "Character costumes", "enquiry", "Characters"],
    [siteMediaUrl("momentDecoration"), "Birthday decoration", "enquiry", "Decoration"],
    [siteMediaUrl("momentGames"), "Carnival games", "enquiry", "Carnival Games"],
    [siteMediaUrl("momentPanda"), "Panda and bear characters", "enquiry", "Characters"],
  ].filter(([url, , kind, key]) => !!url && (kind !== "enquiry" || moreShowNames().includes(key)));
  const strip = document.createElement("div");
  strip.className = "moments-strip";
  strip.setAttribute("aria-label", "Real moments from our shows and events");
  const tiles = (duplicate = false) => moments.map(([url, label, kind, key]) => `<figure><button type="button" ${kind === "show" ? `data-show-details="${e(key)}"` : `data-enquiry-details="${e(key)}"`} aria-label="Explore ${e(key)}" ${duplicate ? 'tabindex="-1"' : ""}><img src="${e(url)}" alt="" loading="lazy"><figcaption>${e(label)} <span aria-hidden="true">↗</span></figcaption></button></figure>`).join("");
  strip.innerHTML = `<div class="moments-track"><div class="moments-set">${tiles()}</div><div class="moments-set" aria-hidden="true">${tiles(true)}</div></div>`;
  if (moments.length) document.querySelector(".ribbon")?.after(strip);
  renderBox();
  app.querySelectorAll<HTMLElement>(".review").forEach((card, index) => {
    const review = catalog.reviews[index];
    if (!review) return;
    card.classList.add("review-story");
    const extras = [
      ["The big reaction", review.bestReaction],
      ["A personal moment", review.personalMoment],
      ["A detail to remember", review.rememberedDetail],
    ].filter((item) => item[1]);
    if (extras.length) card.insertAdjacentHTML("beforeend", `<div class="review-highlights">${extras.map(([label, value]) => `<p><strong>${e(label)}</strong><br>${e(value)}</p>`).join("")}</div>`);
    if (extras.length || review.text.length > 160) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "outline small";
      button.textContent = "Read their story ↗";
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => {
        const expanded = card.classList.toggle("expanded");
        button.textContent = expanded ? "Show less ↑" : "Read their story ↗";
        button.setAttribute("aria-expanded", String(expanded));
      });
      card.append(button);
    } else card.classList.add("expanded");
  });
  const faq = document.createElement('section');
  faq.className = 'event-faq';
  faq.innerHTML = '<h2>Before your celebration</h2><details><summary>Is my date confirmed when I send a request?</summary><p>No. We check the date, venue and performers, then send your proposal. Your booking is confirmed separately after the agreed checks and deposit requirements.</p></details><details><summary>Can I combine different shows?</summary><p>Yes. Add Sam’s shows and guest acts to one event box. We’ll check the complete plan and quote for your selection.</p></details><details><summary>How is the price decided?</summary><p>We prepare a personal quote for the shows, event location and setup you need. No payment is collected when you send a request.</p></details><details><summary>What should I prepare at the venue?</summary><p>Tell us where the event will be held. We’ll confirm the setup details with you before booking.</p></details>';
  app.querySelector('main')?.append(faq);
  const offers = app.querySelector('#offers');
  if (offers) app.querySelector('#sam-shows')?.after(offers);
  on(app, "#referral-account", "click", () => customerAccount());
  on(app, "#choose-character", "click", () => chooseCharacter());
  on(app, "#customer-account", "click", () => customerAccount());
  on(app, "[data-show-details]", "click", (ev) => {
    const key = (ev.currentTarget as HTMLElement).dataset.showDetails;
    const show = catalog.packages.find((p) => p.id === key);
    if (show) showDetails(show);
  });
  on(app, "[data-add-guest]", "click", (ev) => toggleGuest((ev.currentTarget as HTMLElement).dataset.addGuest!));
  on(app, "[data-enquiry-details]", "click", (ev) => {
    const name = (ev.currentTarget as HTMLElement).dataset.enquiryDetails;
    if (name) enquiryDetails(name);
  });
  on(app, "#find-show", "input", (ev) => {
    const query = (ev.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase();
    const cards = [...app.querySelectorAll<HTMLElement>("#shows .show-card")];
    let found = 0;
    for (const card of cards) {
      card.hidden = !card.textContent?.toLocaleLowerCase().includes(query);
      if (!card.hidden) found++;
    }
    app.querySelectorAll<HTMLElement>("#shows .show-group").forEach((group) => {
      group.hidden = !group.querySelector(".show-card:not([hidden])");
    });
    const count = app.querySelector("#show-search-count");
    if (count) count.textContent = query ? `${found} show${found === 1 ? "" : "s"} found` : "";
  });
  on(app, "[data-bundle-idea]", "click", (ev) => {
    const keys = (ev.currentTarget as HTMLElement).dataset.bundleIdea!.split(",");
    basket = [...new Set([...basket, ...keys])];
    requestBundleDiscount = true;
    renderPublic();
    document.querySelector("#event-box")?.scrollIntoView({ behavior: "smooth" });
    notify("Both shows are in your event box. Bundle discount requested.");
  });
  on(app, "[data-add]", "click", (ev) => {
    togglePackage((ev.currentTarget as HTMLElement).dataset.add!);
  });
  on(app, "[data-performer]", "click", (ev) => {
    const key = (ev.currentTarget as HTMLElement).dataset.performer!;
    selectedPerformers = selectedPerformers.includes(key)
      ? selectedPerformers.filter((x) => x !== key)
      : [...selectedPerformers, key];
    renderPublic();
  });
  const occasionShortcuts = document.createElement("div");
  occasionShortcuts.className = "occasion-shortcuts";
  occasionShortcuts.innerHTML = `<p>What are we celebrating?</p><div role="group" aria-label="Start planning by occasion">${publicOccasions.slice(0, 6).map((occasion) => `<button type="button" class="outline small" data-start-occasion="${e(occasion)}">${e(occasion === "School event" ? "School" : occasion === "Corporate event" ? "Corporate" : occasion)}</button>`).join("")}</div>`;
  app.querySelector(".hero-copy .micro")!.before(occasionShortcuts);
  app.querySelector("#help-choose")!.textContent = "Design my event";
  app.querySelector(".hero-copy .actions a")!.textContent = "Book your event ↗";
  on(app, "[data-start-occasion]", "click", (event) => helpChoose((event.currentTarget as HTMLElement).dataset.startOccasion!));
  on(app, "#help-choose", "click", () => helpChoose());
  on(app, "#privacy", "click", () =>
    openDialog(
      "Your details, handled with care",
      `<p>We use the contact and event details you submit to prepare and manage your celebration. Marketing permission is optional. Event photos and reviews are published only with your permission.</p><p>Your private event link gives access to your proposal and event details. Keep it private. Business staff and authorized platform support can access records to help manage your event; platform support access is logged.</p><p>We count page views by source without identifying anonymous visitors. Contact the business to request a correction or discuss retention and deletion of your records.</p>`,
    ),
  );
}
function enquiryLinks(name: string) {
  return `<button type="button" data-service-enquiry="${e(name)}">${guestBasket.includes(name) ? "✓ In your event box · remove" : "＋ Add to my event"}</button>`;
}
function serviceEnquiry(name: string) { toggleGuest(name); modal.close(); }

function enquiryCard(name: string) {
  const characters = /character/i.test(name);
  const photos = characters ? characterPhotos : guestPhotos(name);
  const hasVideo = guestVideos(name).length > 0;
  const serviceType = /decoration|balloon decor/i.test(name)
    ? "Event styling · by request"
    : /carnival games?/i.test(name)
      ? "Games & activities · by request"
      : /children.?s workshops?|kids.? workshops?/i.test(name)
        ? "Hands-on activities · by request"
        : "Guest entertainment · by request";
  const specialDescription = /carnival games?/i.test(name)
    ? "Playful games for big smiles. See the photos."
    : /children.?s workshops?|kids.? workshops?/i.test(name)
      ? "Creative and science activities for curious kids."
      : /decoration|balloon decor/i.test(name)
        ? "Balloon backdrops and themed setups, made for your day."
      : /live music/i.test(name)
        ? "Live performers and colorful parades for your event."
      : ([
          [/character/i, "Favourite costumes make a big entrance."],
          [/animation/i, "Lively party activities that keep guests involved."],
          [/face paint|glitter/i, "Colourful looks for your party guests."],
          [/balloon twist/i, "Playful balloon creations for the celebration."],
          [/clown/i, "Big laughs and cheerful party moments."],
          [/juggl/i, "Fast-moving tricks and colourful props."],
          [/bmx/i, "Bicycle tricks for a high-energy moment."],
          [/stilt/i, "A towering welcome guests will notice."],
          [/led dancing/i, "Glowing costumes bring energy to the party."],
          [/dog show/i, "A playful performance for animal-loving guests."],
          [/aerial|acrobat|chair balance/i, "A standout act for a memorable moment."],
          [/football/i, "Football-themed entertainment for your event."],
          [/fire show/i, "A dramatic act for suitable venues."],
          [/caricatur/i, "A personal keepsake made at the event."],
          [/mime|human statue/i, "Visual entertainment that surprises your guests."],
          [/circus parade/i, "A lively entrance full of colour and movement."],
        ] as const).find(([match]) => match.test(name))?.[1] ?? "Ask us what this act could bring to your day.";
  const icon = ([
    [/carnival games?/i, "🎯"],
    [/children.?s workshops?|kids.? workshops?/i, "🧪"],
    [/decoration|balloon decor/i, "🎈"],
    [/face paint|glitter/i, "🎨"],
    [/balloon/i, "🎈"],
    [/theatre|character|mime/i, "🎭"],
    [/dog/i, "🐶"],
    [/bmx/i, "🚲"],
    [/clown/i, "🤡"],
    [/juggl/i, "🤹"],
    [/dance/i, "♫"],
    [/stilt|acrobat|aerial/i, "🎪"],
    [/football|soccer/i, "⚽"],
    [/fire/i, "🔥"],
    [/music/i, "🎵"],
    [/robot/i, "🤖"],
    [/animation/i, "🎉"],
  ] as const).find(([match]) => match.test(name))?.[1] ?? "✦";
  return `<article ${name === "Characters" ? 'id="characters"' : ""} class="show-card" data-guest-name="${e(name.toLocaleLowerCase())}"><button type="button" class="show-art other${photos.length ? " has-cover" : ""}" data-enquiry-details="${e(name)}" aria-label="Explore ${e(name)}">${photos.length ? `<img class="show-cover" src="${e(photos[0].url)}" alt="" loading="lazy">` : `<span class="art-icon" aria-hidden="true">${icon}</span>`}<span class="show-art-label">Explore the show ↗</span></button><div class="show-body"><span class="eyebrow">${e(serviceType)}</span><h3><button type="button" class="show-title" data-enquiry-details="${e(name)}">${e(name)}</button></h3><p>${e(specialDescription)}</p>${photos.length || hasVideo ? `<p class="show-media-note">${photos.length ? `${photos.length} portfolio photo${photos.length === 1 ? "" : "s"}` : ""}${hasVideo ? `${photos.length ? " · " : ""}Video` : ""}</p>` : ""}<button type="button" class="outline" data-enquiry-details="${e(name)}">See show details</button><button type="button" class="${guestBasket.includes(name) ? "secondary" : "outline"}" data-add-guest="${e(name)}">${guestBasket.includes(name) ? "✓ In your event box" : "＋ Add to my event"}</button></div></article>`;
}
function enquiryDetails(name: string) {
  const photos = guestPhotos(name);
  const videos = guestVideos(name);
  const isActivity = /carnival games?|children.?s workshops?|kids.? workshops?/i.test(name);
  const isDecoration = /decoration|balloon decor/i.test(name);
  const intro = isDecoration
    ? "Tell us your theme, colors, date and venue. We will plan the setup and confirm the design and price with you."
    : isActivity
      ? "Tell us the ages, guest count, date and venue. We will confirm the activities, setup and price for your event."
      : `Ask us about ${name} for your event. We will check the performer, availability, venue needs and price before confirming anything.`;
  const gallery = /character/i.test(name)
    ? characterGallery()
    : photos.length
      ? `<section><h3>${isActivity ? "Activity ideas" : isDecoration ? "Decoration portfolio" : "Past event photos"}</h3><p class="show-demo-note">${isActivity ? "These photos show possible activities. We'll confirm the exact games or workshop plan for your event." : isDecoration ? "These setups show what is possible. We will confirm your theme, venue, materials and final design in your quote." : "These photos show past performances. We will confirm the performer, setup and availability for your date."}</p><div class="show-detail-gallery">${photos.map((photo) => `<figure><img src="${e(photo.url)}" alt="${e(photo.caption)}" loading="eager"><figcaption>${e(photo.caption)}</figcaption></figure>`).join("")}</div></section>`
      : '<p class="show-media-empty">Photos and videos for this show are coming soon.</p>';
  openDialog(
    name,
    `<div class="show-detail"><p class="eyebrow">${isDecoration ? "Event styling" : isActivity ? "Games & workshops" : "Guest entertainment"} · by request</p><p>${e(intro)}</p><div class="show-detail-cta">${enquiryLinks(name)}</div>${gallery}${videos.length ? `<section><h3>Videos</h3><div class="show-video-gallery">${videos.map((link, index) => videoTile(link, name, index, link.startsWith("/portfolio/guest/") ? "/portfolio/guest/football-stage-live.jpg" : undefined)).join("")}</div></section>` : ""}<div class="show-detail-footer">${enquiryLinks(name)}</div></div>`,
  );
  on(modal, "[data-service-enquiry]", "click", () => serviceEnquiry(name));
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
      `<p>Pick a character you love. We’ll check the costume and your date.</p>${characterGallery()}`,
      "Ask about this character →",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const name = String(data.get("character"));
    if (!names.includes(name))
      throw new Error("Please choose a current character.");
    serviceEnquiry(name);
  });
}
function requestedServicesSummary(b: Booking) {
  return b.requestedServices?.length ? `<section class="requested-services"><h3>Guest acts in your request</h3><p>${b.requestedServices.map(e).join(" · ")}</p><small>Requested preferences. The proposal will confirm the acts, performers, duration and price.</small></section>` : "";
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
        "Wedding",
        "Festival",
        "Christmas",
        "Private party",
        "Just because",
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
  if (!basket.length && !guestBasket.length) { notify("Choose at least one show first."); return; }
  const continueButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#request, .mobile-event-bar button"));
  const originalLabels = continueButtons.map((button) => button.innerHTML);
  continueButtons.forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Opening…";
  });
  let account: {
    profile: { name: string; phone: string; email: string };
    rewards: { tokens: { balance: number } };
  };
  try {
    account = await api(`/customer/${catalog.business.slug}/me`);
  } catch {
    customerAuth(true);
    return;
  } finally {
    continueButtons.forEach((button, index) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = originalLabels[index];
    });
  }
  const questions = (catalog.customFields ?? []).filter((f) => f.active);
  const extras = catalog.packages.filter(
    (p) => p.checkoutExtra && !basket.includes(p.id),
  );
  const fields = eventFields(chosenOccasion ? { occasion: chosenOccasion } : undefined);
  const magicOnly = !guestBasket.length && basket.length === 1 && catalog.packages.find((item) => item.id === basket[0])?.category.toLowerCase() === "magic";
  const tokenChoices = magicOnly ? Math.min(5, account.rewards.tokens.balance) : 0;
  const giftExtras = `<details class="booking-extra"><summary>🎁 A gift or a surprise? (optional)</summary><p>Plan something personal. Only our event team sees your surprise notes.</p><div class="forms-grid">${field({ key: "gift-event", label: "This event is a gift", type: "checkbox", wide: true })}${field({ key: "gift-recipient", label: "Gift recipient’s name" })}${field({ key: "gift-flexible", label: "The date is flexible", type: "checkbox" })}${field({ key: "gift-message", label: "A message for the gift card", type: "textarea", wide: true })}${field({ key: "surprise-event", label: "Plan a surprise for someone", type: "checkbox", wide: true })}${field({ key: "surprise-guest", label: "Guest of honor’s name" })}${field({ key: "surprise-proposal", label: "This is a proposal", type: "checkbox" })}${field({ key: "surprise-secret", label: "One secret that would make it personal", type: "textarea", wide: true, help: "Only Sam and the event team see this. Please share only what you are comfortable sharing." })}${field({ key: "surprise-met", label: "How did you meet? (for a proposal)" })}${field({ key: "surprise-moment", label: "What moment would you like Sam to be part of?", type: "textarea", wide: true })}</div></details>`;
  openDialog(
    "Tell us about your event",
    `<p class="signup-progress"><strong>2 of 2 · Event details</strong><span>Still in your event box: ${selectionNames().map(e).join(" + ")}</span></p>` + formBody(
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
      `${extras.length ? `<fieldset><legend>A little extra wow? (optional)</legend><p>Pick only the extras you want. We will include them in your quote and check suitability before confirmation.</p>${extras.map((p) => `<label class="check"><input type="checkbox" name="checkout-extra" value="${e(p.id)}">${e(p.name)} · ${e(price(p))}</label>`).join("")}</fieldset>` : ""}${giftExtras}${tokenChoices ? `<div class="token-request"><label for="request-tokens"><strong>Use my tokens on this magic show</strong></label><select id="request-tokens" name="requestTokens"><option value="0">Save my ${account.rewards.tokens.balance} tokens for later</option>${Array.from({ length: tokenChoices }, (_, index) => index + 1).map((cost) => `<option value="${cost}">${cost} token${cost === 1 ? "" : "s"} · ${cost === 5 ? "Free magic show" : `${cost * 10}% off`}</option>`).join("")}</select><small>We’ll apply your choice to your proposal after checking the show details.</small></div>` : ""}<p>Booking as <strong>${e(account.profile.name)}</strong> · ${e(account.profile.phone)}. You can edit these in My account.</p><p class="hint">${selectionNames().map(e).join(" + ")}<br>This is a request, not a confirmed booking. We’ll check the venue, date and performers before confirming.</p><p class="privacy">We use these details to manage your event. Authorized staff and logged platform support can access event records. Save your private link after submitting.</p>`,
      "Send my event request →",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const isGift = data.has("gift-event");
    const isSurprise = data.has("surprise-event") || data.has("surprise-proposal");
    if (isGift && !String(data.get("gift-recipient") ?? "").trim()) throw new Error("Add the recipient’s name for the gift card.");
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
          ...(isGift ? { giftDetails: { recipientName: String(data.get("gift-recipient") ?? "").trim(), message: String(data.get("gift-message") ?? "").trim(), flexibleDate: data.has("gift-flexible") } } : {}),
          ...(isSurprise ? { surpriseDetails: { guestName: String(data.get("surprise-guest") ?? "").trim(), secret: String(data.get("surprise-secret") ?? "").trim(), proposal: data.has("surprise-proposal"), howWeMet: String(data.get("surprise-met") ?? "").trim(), specialMoment: String(data.get("surprise-moment") ?? "").trim() } } : {}),
          notes: `${requestBundleDiscount ? "Bundle discount requested. " : ""}${Number(data.get("requestTokens") ?? 0) > 0 ? `${Number(data.get("requestTokens"))} referral tokens requested for magic show. ` : ""}${String(data.get("notes") ?? "")}`.trim(),
          packageIds: [
            ...new Set([...basket, ...selected(data, "checkout-extra")]),
          ],
          requestedServices: guestBasket,
          performerIds: selectedPerformers,
        },
      },
    );
    modal.close();
    sessionStorage.removeItem("event-box:" + catalog.business.slug);
    location.href = result.path;
  });
}
function helpChoose(initialOccasion = "") {
  const occasions = [
    ["🎂", "Birthday"], ["💍", "Wedding"], ["🎉", "Private party"],
    ["🏢", "Corporate event"], ["🏫", "School event"], ["✨", "Just because"],
    ["🎪", "Festival"], ["🎄", "Christmas"],
  ];
  const guestGroups = [["👨‍👩‍👧", "1–20"], ["🥳", "21–50"], ["🎪", "More than 50"]];
  const feelings = [
    ["😂", "Make everyone laugh"], ["😮", "Leave everyone speechless"],
    ["❤️", "Create a personal moment"], ["🔥", "A high-energy party"],
  ];
  const answers = { occasion: publicOccasions.includes(initialOccasion) ? initialOccasion : "", guests: "", feeling: "", audience: "", setting: "" };
  const steps = [
    { title: "What are you celebrating?", choices: occasions, key: "occasion" },
    { title: "How many guests?", choices: guestGroups, key: "guests" },
    { title: "What feeling do you want?", choices: feelings, key: "feeling" },
    { title: "Who is the show for?", choices: [["", "Children under 6"], ["", "Children 6–12"], ["", "Teens and adults"], ["", "Mixed ages"]], key: "audience" },
    { title: "Where will the fun happen?", choices: [["", "Indoors"], ["", "Outdoors"], ["", "Not decided yet"]], key: "setting" },
  ] as const;
  const showResults = () => {
    chosenOccasion = answers.occasion;
    saveEventBox();
    const category = (p: Package) => p.category.toLowerCase();
    const score = (p: Package) =>
      Number(answers.occasion === "School event" && category(p) === "science") * 5 +
      Number(["Wedding", "Private party", "Corporate event"].includes(answers.occasion) && !!p.adultShow) * 3 +
      Number(answers.occasion === "Birthday" && category(p) === "bubbles") * 2 +
      Number(answers.feeling === "Make everyone laugh" && ["bubbles", "magic"].includes(category(p))) * 3 +
      Number(answers.feeling === "Leave everyone speechless" && ["magic", "science"].includes(category(p))) * 3 +
      Number(answers.feeling === "Create a personal moment" && category(p) === "magic") * 3 +
      Number(answers.feeling === "A high-energy party" && category(p) === "science") * 3;
    const audienceAge = answers.audience === "Children under 6" ? 4 : answers.audience === "Children 6–12" ? 9 : answers.audience === "Teens and adults" ? 18 : null;
    const ranked = catalog.packages
      .filter((p) => !p.bundleIds?.length && !p.checkoutExtra && (answers.setting !== "Outdoors" || !p.indoorOnly) && (audienceAge === null || (p.minAge <= audienceAge && p.maxAge >= audienceAge)))
      .sort((a, b) => score(b) - score(a));
    const featured: Package[] = [];
    for (const p of ranked) {
      if (featured.length === 3) break;
      if (!featured.some((chosen) => category(chosen) === category(p))) featured.push(p);
    }
    for (const p of ranked) {
      if (featured.length === 3) break;
      if (!featured.includes(p)) featured.push(p);
    }
    const ideas = answers.occasion === "School event"
      ? ["Juggling", "Clown", "Balloon Twisting", "Children's Workshops"]
      : answers.feeling === "A high-energy party"
      ? ["BMX Show", "Juggling", "Live Music & Parades", "LED Dancing Suits"]
      : answers.feeling === "Make everyone laugh"
        ? ["Clown", "Juggling", "Balloon Twisting", "Characters"]
        : answers.feeling === "Create a personal moment"
          ? ["Close-up Magic", "Caricaturist", "Decoration", "Characters"]
          : ["Close-up Magic", "Aerial Show", "Fire Show", "Juggling"];
    const availableIdeas = moreShowNames();
    openDialog(
      "Design your event",
      `<div class="chooser"><p class="chooser-context">${e(answers.occasion)} · ${e(answers.guests)} guests · ${e(answers.feeling)} · ${e(answers.audience)} · ${e(answers.setting)}</p><p class="chooser-intro">Start with one, or mix your favourites. Every show is still yours to explore.</p><div class="chooser-results">${featured.map((p) => {
        const photo = showPhotos(p)[0];
        return `<article class="chooser-result">${photo ? `<img src="${e(photo.url)}" alt="" loading="eager">` : `<span class="chooser-result-icon" aria-hidden="true">${categoryIcon[p.category] ?? "✦"}</span>`}<div><span class="eyebrow">${e(p.category)}</span><h3>${e(publicPackageLabel(p.name))}</h3><small>${e(price(p))}</small><p class="recommendation-reason">${e(p.category === "magic" ? "A shared moment of surprise for your celebration." : p.category === "science" ? "A chance for curious guests to discover something new." : "Playful visual moments for your guests.")} ${answers.setting === "Outdoors" ? "Listed for outdoor venues, subject to setup checks." : "Matched to your audience preference."}</p><button type="button" data-recommend="${e(p.id)}">Add to my event ↗</button></div></article>`;
      }).join("") || empty("Let's plan together", "Browse the shows below to choose your favourites.")}</div>${availableIdeas.some((name) => ideas.includes(name)) ? `<h3>Something extra?</h3><div class="chooser-extras">${ideas.filter((name) => availableIdeas.includes(name)).map((name) => `<button type="button" class="outline small" data-guest-idea="${e(name)}">${e(name)} ↗</button>`).join("")}</div>` : ""}<div class="chooser-bottom"><button type="button" class="outline" id="chooser-restart">Start again</button><button type="button" id="chooser-all">See every show</button></div><p class="privacy">Suggestions are ideas. We check availability, venue needs and price before confirming.</p></div>`,
    );
    on(modal, "[data-recommend]", "click", (ev) => {
      const key = (ev.currentTarget as HTMLElement).dataset.recommend!;
      if (togglePackage(key)) {
        const button = ev.currentTarget as HTMLButtonElement;
        button.textContent = basket.includes(key) ? "✓ Added · remove" : "Add to my event ↗";
        modal.querySelector<HTMLButtonElement>("#chooser-continue")!.disabled = !basket.length && !guestBasket.length;
      }
    });
    on(modal, "[data-guest-idea]", "click", (ev) => {
      const button = ev.currentTarget as HTMLButtonElement;
      const name = button.dataset.guestIdea!;
      toggleGuest(name);
      button.textContent = guestBasket.includes(name) ? "✓ " + name + " · remove" : name + " ↗";
      modal.querySelector<HTMLButtonElement>("#chooser-continue")!.disabled = !basket.length && !guestBasket.length;
    });
    const continueButton = document.createElement("button");
    continueButton.id = "chooser-continue";
    continueButton.type = "button";
    continueButton.textContent = "Continue with my event ↗";
    continueButton.disabled = !basket.length && !guestBasket.length;
    modal.querySelector(".chooser-bottom")!.after(continueButton);
    modal.querySelectorAll<HTMLButtonElement>("[data-recommend]").forEach((button) => { if (basket.includes(button.dataset.recommend!)) button.textContent = "✓ Added · remove"; });
    modal.querySelectorAll<HTMLButtonElement>("[data-guest-idea]").forEach((button) => { if (guestBasket.includes(button.dataset.guestIdea!)) button.textContent = "✓ " + button.dataset.guestIdea + " · remove"; });
    continueButton.addEventListener("click", () => { void requestForm(); });
    on(modal, "#chooser-restart", "click", () => showStep(0));
    on(modal, "#chooser-all", "click", () => {
      modal.close();
      document.querySelector("#shows")?.scrollIntoView({ behavior: "smooth" });
    });
  };
  const showStep = (index: number) => {
    const step = steps[index];
    openDialog(
      "Find your kind of wow",
      `<div class="chooser"><p class="chooser-progress">${index + 1} of ${steps.length}</p><div class="chooser-progress-track"><span class="step-${index + 1}"></span></div><h3>${e(step.title)}</h3><div class="chooser-options">${step.choices.map(([icon, label]) => `<button type="button" class="chooser-option" data-chooser-choice="${e(label)}"><span aria-hidden="true">${icon}</span>${e(label)}</button>`).join("")}</div><div class="chooser-bottom">${index ? '<button type="button" class="outline" id="chooser-back">← Back</button>' : '<span></span>'}<button type="button" class="link" id="chooser-all">See every show ↗</button></div></div>`,
    );
    on(modal, "[data-chooser-choice]", "click", (ev) => {
      answers[step.key] = (ev.currentTarget as HTMLElement).dataset.chooserChoice!;
      if (index === steps.length - 1) showResults();
      else showStep(index + 1);
    });
    on(modal, "#chooser-back", "click", () => showStep(index - 1));
    on(modal, "#chooser-all", "click", () => {
      modal.close();
      document.querySelector("#shows")?.scrollIntoView({ behavior: "smooth" });
    });
  };
  showStep(answers.occasion ? 1 : 0);
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
          label: "Friend’s 10-character code (optional)",
          value: new URLSearchParams(location.search).get("ref") ?? "",
        },
        {
          key: "username",
          label: "Your sign-in name",
          value: "",
          autocomplete: "username",
          required: true,
          help: "Choose a memorable name, such as sam_wehbi. Use 3–40 letters, numbers, underscores or hyphens.",
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
    register ? (orderAfter ? "Your shows are saved" : "Your next happy memory starts here") : "Welcome back to the fun",
    (register && orderAfter ? `<p class="signup-progress"><strong>1 of 2 · Create your account</strong><span>Your ${basket.length + guestBasket.length} chosen show${basket.length + guestBasket.length === 1 ? " is" : "s are"} still in your event box. Next, tell us about your day.</span></p>` : "") + formBody(
      fields,
      '<p class="privacy">Your account shows only your own events. Keep your sign-in name and password safe. Phone verification is not connected yet.</p>',
      register ? (orderAfter ? "Create account & continue →" : "Create my customer account") : (orderAfter ? "Sign in & continue →" : "Sign in"),
    ) +
      '<button class="link" id="switch-customer-auth">' +
      (register
        ? "Already have an account? Sign in"
        : "New here? Create an account") +
      "</button>",
  );
  if (register) {
    const referral = modal.querySelector('.referral-field');
    if (referral) {
      const details = document.createElement('details'); details.className = 'referral-entry wide';
      details.innerHTML = '<summary>Have a friend’s referral code? (optional)</summary>';
      details.open = Boolean((referral.querySelector('input') as HTMLInputElement)?.value);
      referral.before(details); details.append(referral);
    }
    const username = modal.querySelector<HTMLInputElement>('[name="username"]');
    if (username) { username.pattern = '[a-zA-Z0-9][a-zA-Z0-9_-]{2,39}'; username.maxLength = 40; }
  }
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
    if (orderAfter) {
      notify("Account ready. Your chosen shows are still in the box.");
      await requestForm();
    }
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
function tokenLadder() {
  return '<div class="token-ladder" aria-label="Magic show token rewards">' +
    [10, 20, 30, 40, 100].map((percent, index) =>
      `<div><b>${index + 1} <small>✦</small></b><strong>${percent === 100 ? "Free magic show" : `${percent}% off`}</strong></div>`
    ).join("") + '</div>';
}
function referralPromo() {
  return `<section id="rewards" class="section referral-promo"><div><span class="eyebrow">Your friends bring the magic</span><h2>Invite friends.<br><em>Get a free magic show.</em></h2><p>Share your link. When a friend completes a fully paid Magic, Science or Bubbles show, collect a token.</p><button type="button" id="referral-account">Get my invitation link ↗</button><small>One token per referred friend. Use tokens one by one or save five for a free magic show.</small></div>${tokenLadder()}</section>`;
}
async function offerNotification() {
  try {
    const account = await api<{ username: string; announcements: { id: string; title: string }[] }>(
      `/customer/${catalog.business.slug}/me`,
    );
    const latest = account.announcements[0];
    if (!latest) return;
    const key = `magic-offer-seen:${catalog.business.slug}:${account.username}`;
    if (localStorage.getItem(key) === latest.id) return;
    if (document.querySelector(".offer-notification")) return;
    const banner = document.createElement("div");
    banner.className = "offer-notification";
    const text = document.createElement("span");
    text.textContent = `✦ New offer: ${latest.title}`;
    const link = document.createElement("a");
    link.href = "#shows";
    link.textContent = "See offer ↗";
    link.addEventListener("click", () => {
      localStorage.setItem(key, latest.id);
      banner.remove();
    });
    banner.append(text, link);
    document.querySelector(".site-header")?.after(banner);
  } catch {
    // Visitors without an account see the offers on the public page.
  }
}
async function customerAccount() {
  type Account = {
    username: string;
    referralCode: string;
    rewards: {
      settings: RewardSettings;
      profilePoints: number;
      qualifyingEvents: number;
      tokens: { earned: number; manual: number; spent: number; balance: number; referredCount: number };
      awards: {
        id: string;
        kind: string;
        percent: number;
        terms: string;
        status: string;
      }[];
    };
    announcements: { id: string; packageId: string; title: string; description: string; at: string }[];
    notifications: { id: string; title: string; body: string; kind: string; at: string }[];
    pushEnabled: boolean;
    profile: {
      name: string;
      phone: string;
      email: string;
      offersConsent: boolean;
      childrenAges: number[];
    };
    bookings: { id: string; name: string; date: string; status: string; declined: boolean }[];
  };
  let account: Account;
  try {
    account = await api<Account>(`/customer/${catalog.business.slug}/me`);
  } catch {
    customerAuth();
    return;
  }
  const invitationLink =
    location.origin +
    "/b/" +
    encodeURIComponent(catalog.business.slug) +
    "?account=create&ref=" +
    encodeURIComponent(account.referralCode);
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
    { key: "offersConsent", label: "Send me new shows, bundles and offers", type: "checkbox", value: account.profile.offersConsent, wide: true },
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
      (account.pushEnabled && "serviceWorker" in navigator && "PushManager" in window ? '<div class="account-push"><h3>Phone alerts</h3><p>Get a popup when your event changes. New shows and offers use your choice above.</p><button type="button" class="outline small" id="enable-phone-alerts">Enable phone notifications</button> <button type="button" class="link" id="disable-phone-alerts">Turn off</button><p id="phone-alert-status" role="status"></p></div>' : '') +
      (account.notifications.length ? '<section class="account-announcements"><h3>Your updates</h3>' + account.notifications.map((item) => `<div class="announcement"><strong>${e(item.title)}</strong><span>${e(item.body)}</span></div>`).join('') + '</section>' : '') +
      '<section class="token-account"><span class="eyebrow">Invite friends. Earn magic.</span><h3>' +
      account.rewards.tokens.balance +
      ' token' + (account.rewards.tokens.balance === 1 ? '' : 's') +
      ' ready to use</h3><p>When a friend joins with your link and completes a fully paid Magic, Science or Bubbles show, you get one token.</p>' +
      tokenLadder() +
      '<p class="hint">Choose how many to use on one magic show. Spend 2 from a balance of 3 and keep 1. Ask us to apply your choice to your proposal. Extra tokens can be added by our team.</p></section>' +
      (account.announcements.length ? '<section class="account-announcements"><h3>New offers for you</h3>' +
        account.announcements.map((item) => '<a class="announcement" href="#shows" data-announcement="' + e(item.id) + '"><strong>✦ ' + e(item.title) + '</strong><span>' + e(item.description) + '</span></a>').join('') + '</section>' : '') +
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
      "<p class=\"referral-code-line\">Your referral code: <strong>" +
      e(account.referralCode) +
      '</strong> <button type="button" class="outline small" id="copy-referral-code">Copy code</button></p><p><a href="' +
      e(invitationLink) +
      '">Open my invitation link ↗</a> <button type="button" class="outline small" id="copy-referral-link">Copy invitation link</button></p>' +
      account.bookings.filter((b) => b.status === "confirmed").map((b) => `<div class="account-milestone"><strong>✦ ${e(b.name)} is confirmed!</strong><span>Your countdown and assistant certificate are ready.</span><button type="button" class="small" data-customer-event="${e(b.id)}">Open my event ↗</button></div>`).join("") +
      '<h3>My celebrations</h3>' +
      (account.bookings
        .map(
          (b) =>
            '<div class="row"><div><h3>' +
            e(b.name) +
            "</h3><p>" +
            day(b.date) +
            " · " +
            e(customerStatus(b.status, b.declined)) +
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
  on(modal, "#enable-phone-alerts", "click", async () => {
    const status = modal.querySelector<HTMLElement>("#phone-alert-status")!;
    try {
      const key = await api<{ publicKey: string }>(`/customer/${catalog.business.slug}/push-key`);
      if (!key.publicKey) throw new Error("Phone notifications are not connected yet.");
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications were not allowed on this phone.");
      const bytes = Uint8Array.from(atob(key.publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - key.publicKey.length % 4) % 4)), (character) => character.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      await api(`/customer/${catalog.business.slug}/push-device`, "POST", subscription.toJSON());
      status.textContent = "Phone notifications are on. We’ll alert you when your event changes.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Unable to enable notifications on this phone.";
    }
  });
  on(modal, "#disable-phone-alerts", "click", async () => {
    const status = modal.querySelector<HTMLElement>("#phone-alert-status")!;
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api(`/customer/${catalog.business.slug}/push-device`, "DELETE", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      status.textContent = "Phone notifications are off on this device.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Unable to turn off notifications.";
    }
  });
  on(modal, "#copy-referral-link", "click", async () => {
    await navigator.clipboard.writeText(invitationLink);
    notify("Invitation link copied. Paste it into WhatsApp to invite a friend.");
  });
  on(modal, "#copy-referral-code", "click", async () => {
    await navigator.clipboard.writeText(account.referralCode);
    notify("Short referral code copied.");
  });
  on(modal, "[data-announcement]", "click", (event) => {
    const entry = event.currentTarget as HTMLElement;
    localStorage.setItem(`magic-offer-seen:${catalog.business.slug}:${account.username}`,
      entry.dataset.announcement ?? "");
    document.querySelector(".offer-notification")?.remove();
    modal.close();
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
  )}<p class="privacy">Each business has its own private records. Authorized platform support access is disclosed and logged.</p><p><a href="/install.html">Install Magic App on your phone or computer ↗</a></p><a href="/">← Back to the happy side</a></section></main>`;
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
  ["notices", "◉", "Notifications"],
  ["bookings", "▤", "Events & requests"],
  ["enquiries", "✉", "Service enquiries"],
  ["calendar", "▦", "Calendar"],
  ["customers", "♡", "Customers"],
  ["packages", "✧", "Shows & packages"],
  ["guest-shows", "✶", "Guest shows & services"],
  ["guest-photos", "▧", "Photos & videos"],
  ["offers", "✦", "Offers & bundles"],
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
  return `<div class="row"><div class="date-tile">${e(new Date(`${b.date}T12:00:00`).toLocaleDateString("en", { month: "short" }))}<b>${e(b.date.slice(8))}</b></div><div class="row-main"><h3>${e(b.name)}</h3><p>${e(b.time)} · ${e(b.location)}</p></div>${badge(b.status)}<button class="small outline" data-booking="${b.id}">Open event ↗</button>${b.status === "cancelled" && ["owner", "admin"].includes(state!.user.role) ? `<button class="small danger" data-permanent-event="${e(b.id)}">Delete permanently</button>` : ""}</div>`;
}
function staffCan(action: StaffAction) { return !!state && canStaffAction(state.user.role, action); }
function renderDashboard() {
  if (!state) return;
  const views = staffViews(state.user.role);
  if (views && !views.includes(currentView)) currentView = "today";
  const title = navItems.find((n) => n[0] === currentView)?.[2] ?? "Today";
  app.innerHTML = `<div class="dashboard"><aside class="sidebar">${brand()}<nav aria-label="Dashboard">${navItems
    .filter(
      (n) =>
        (!views || views.includes(n[0])) &&
        (!["guest-photos", "guest-shows"].includes(n[0]) || staffCan("catalog")),
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
      .filter((b) => b.status !== "cancelled" && b.status !== "completed" && b.date >= localToday())
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 6);
    content.innerHTML = `<div class="welcome"><div><h2>A little planning. A lot of magic.</h2><p>${day(localToday())} · ${e(state.business.timezone)} · Your next happy moments start here.</p></div><span class="spark" aria-hidden="true">✦</span></div>${["owner", "admin", "manager", "accountant", "assistant"].includes(state.user.role) ? stats() : ""}${state.user.role !== "performer" && state.enquiries.some((item) => item.status === "new" && !item.archivedAt) ? `<section class="panel"><div class="section-heading"><h3>${state.enquiries.filter((item) => item.status === "new" && !item.archivedAt).length} new service enquiries</h3><button class="outline small" data-go="enquiries">View enquiries ↗</button></div><p>Customers are asking about characters, decoration and other services.</p></section>` : ""}<div class="two-col"><section class="panel"><div class="section-heading"><h3>Coming up next</h3><button class="link" data-go="calendar">View calendar →</button></div>${upcoming.map(bookingRow).join("") || empty("Your next big day starts here", "Share your website link to receive your first event request.")}</section><section class="panel"><h3>A little nudge</h3>${
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
    if (state.user.role === "performer") {
      content.querySelector(".two-col .panel:last-child")?.remove();
      const weekEnd = new Date(`${localToday()}T12:00:00Z`);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
      const attention = state.bookings.filter((b) => !["cancelled", "completed"].includes(b.status) && (b.availability[state!.user.performerId ?? ""] !== "available" || (b.date >= localToday() && b.date <= weekEnd.toISOString().slice(0, 10))));
      content.insertAdjacentHTML("beforeend", `<section class="panel"><h3>Your job reminders</h3><p class="muted">Review jobs awaiting your reply and events coming up in the next week.</p>${attention.map((b) => `<div class="row"><div><strong>${e(b.name)}</strong><p>${day(b.date)} · ${e(b.time)} · ${b.availability[state!.user.performerId ?? ""] === "available" ? "Confirmed" : "Your response is needed"}</p></div><button class="outline small" data-booking="${e(b.id)}">Open job</button></div>`).join("") || '<p class="muted">Nothing needs your reply right now.</p>'}</section>`);
    } else if (state.user.role !== "accountant") {
      const waiting = state.bookings.filter((b) => !["cancelled", "completed"].includes(b.status) && b.performerIds.some((performerId) => b.availability[performerId] !== "available"));
      content.insertAdjacentHTML("beforeend", `<section class="panel"><h3>Artist responses to follow up</h3>${waiting.slice(0, 8).map((b) => `<div class="row"><div><strong>${e(b.name)}</strong><p>${day(b.date)} · ${e(b.performerIds.filter((performerId) => b.availability[performerId] !== "available").map((performerId) => state!.performers.find((p) => p.id === performerId)?.name ?? "Artist").join(", "))}</p></div><button class="outline small" data-booking="${e(b.id)}">Review</button></div>`).join("") || '<p class="muted">All assigned artists have replied for current events.</p>'}</section>`);
    }
    if (state.user.role === "accountant") content.querySelector(".two-col .panel:last-child")?.remove();
  } else if (currentView === "notices") renderNotifications(content);
  else if (currentView === "calendar") {
    renderCalendar(content);
    return;
  } else if (currentView === "bookings") renderBookings(content);
  else if (currentView === "guest-photos") renderGuestPhotosAdmin(content);
  else if (currentView === "guest-shows") renderGuestShowsAdmin(content);
  else if (currentView === "enquiries") renderEnquiries(content);
  else if (currentView === "customers") renderCustomers(content);
  else if (currentView === "packages" || currentView === "performers")
    renderCatalogAdmin(content, currentView);
  else if (currentView === "offers") renderCatalogAdmin(content, "packages");
  else if (currentView === "money") renderMoney(content);
  else if (currentView === "reminders") renderReminders(content);
  else if (currentView === "reviews") renderReviews(content);
  else renderSettings(content);
  wireDashboard(content);
}
function renderEnquiries(root: Element, showArchived = false) {
  const enquiries = [...state!.enquiries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  root.innerHTML = `<p class="hint">These are enquiries, not confirmed bookings. Archive keeps a request for later; permanent deletion removes it.</p><div class="actions"><button id="enquiry-archive-filter" class="outline small">${showArchived ? "Show active enquiries" : "Show archived enquiries"} (${enquiries.filter((item) => showArchived ? !item.archivedAt : !!item.archivedAt).length})</button></div>${enquiries.filter((item) => !!item.archivedAt === showArchived).map((item) => `<article class="panel service-enquiry"><div class="section-heading"><div><span class="eyebrow">${e(item.archivedAt ? "Archived" : item.status === "new" ? "New enquiry" : "Handled")}</span><h3>${e(item.service)}</h3></div><small>${e(new Date(item.createdAt).toLocaleString("en-GB"))}</small></div><p><strong>${e(item.name)}</strong> · <a href="tel:${e(item.phone.replace(/[^\d+]/g, ""))}">${e(item.phone)}</a></p>${item.date || item.location ? `<p>${item.date ? e(day(item.date)) : "Date to confirm"} · ${e(item.location || "Location to confirm")}</p>` : ""}${item.notes ? `<p>${e(item.notes)}</p>` : ""}<div class="actions"><button class="outline small" data-enquiry-edit="${e(item.id)}">Open / Edit</button>${item.status === "new" && !item.archivedAt ? `<button class="outline small" data-enquiry-contacted="${e(item.id)}">Mark handled</button>` : ""}<button class="outline small" data-enquiry-archive="${e(item.id)}">${item.archivedAt ? "Restore" : "Archive"}</button>${["owner", "admin"].includes(state!.user.role) ? `<button class="danger small" data-enquiry-remove="${e(item.id)}">Delete permanently</button>` : ""}</div></article>`).join("") || empty(showArchived ? "No archived enquiries" : "No active enquiries", "Service requests appear here when visitors contact you.")}`;
  on(root, "#enquiry-archive-filter", "click", () => renderEnquiries(root, !showArchived));
  on(root, "[data-enquiry-contacted]", "click", async (event) => {
    const key = (event.currentTarget as HTMLElement).dataset.enquiryContacted!;
    const item = state!.enquiries.find((entry) => entry.id === key)!;
    await api(`/manage/enquiries/${key}/contacted`, "POST", { revision: item.revision ?? 0 });
    await loadDashboard();
  });
  on(root, "[data-enquiry-archive]", "click", async (event) => {
    const key = (event.currentTarget as HTMLElement).dataset.enquiryArchive!;
    const item = state!.enquiries.find((entry) => entry.id === key)!;
    await api(`/manage/enquiries/${key}/archive`, "POST", { archived: !item.archivedAt, revision: item.revision ?? 0 });
    await loadDashboard();
  });
  on(root, "[data-enquiry-edit]", "click", (event) => {
    const key = (event.currentTarget as HTMLElement).dataset.enquiryEdit!;
    const item = state!.enquiries.find((entry) => entry.id === key)!;
    const fields: Field[] = [
      { key: "service", label: "Service", value: item.service, required: true },
      { key: "name", label: "Customer name", value: item.name, required: true },
      { key: "phone", label: "Phone", value: item.phone, required: true },
      { key: "date", label: "Event date (if known)", type: "date", value: item.date },
      { key: "location", label: "Location", value: item.location },
      { key: "notes", label: "Enquiry details", type: "textarea", value: item.notes, wide: true },
    ];
    openDialog("Edit service enquiry", formBody(fields, '<p class="privacy">Editing this request does not create a booking or send a message.</p>', "Save enquiry"));
    submit(modal.querySelector("form")!, async (data) => {
      await api(`/manage/enquiries/${key}`, "PUT", { ...formValues(data, fields), revision: item.revision ?? 0 });
      modal.close();
      await loadDashboard();
    });
  });
  on(root, "[data-enquiry-remove]", "click", (event) => {
    const key = (event.currentTarget as HTMLElement).dataset.enquiryRemove!;
    const item = state!.enquiries.find((entry) => entry.id === key)!;
    openDialog("Delete enquiry permanently?", `<p>This removes the enquiry and its saved contact details permanently. It cannot be undone. Existing bookings are separate.</p><p><strong>${e(item.name)} · ${e(item.service)}</strong></p><form><label for="delete-enquiry-name">Type the customer's exact name to confirm</label><input id="delete-enquiry-name" name="name" required autocomplete="off"><div class="form-error" role="alert"></div><div class="form-actions"><button class="danger" type="submit">Delete permanently</button></div></form>`);
    submit(modal.querySelector("form")!, async (data) => {
      await api(`/manage/enquiries/${key}`, "DELETE", { name: String(data.get("name") ?? ""), revision: item.revision ?? 0 });
      modal.close();
      await loadDashboard();
      notify("Enquiry permanently deleted.");
    });
  });
}
function wireDashboard(root: ParentNode) {
  if (limitedStaff(state!.user.role)) {
    root.querySelectorAll("[data-delete], #import").forEach((node) => node.remove());
    const views = staffViews(state!.user.role)!;
    root.querySelectorAll<HTMLElement>("[data-go]").forEach((node) => { if (!views.includes(node.dataset.go!)) node.remove(); });
    if (!staffCan("availability")) root.querySelectorAll('[data-edit^="blocks:"]').forEach((node) => node.remove());
    if (!staffCan("events")) root.querySelectorAll('.toolbar a[href^="/b/"]').forEach((node) => node.remove());
    if (!staffCan("money")) root.querySelectorAll("#record-money, [data-correct]").forEach((node) => node.remove());
  }
  on(root, "[data-booking]", "click", (ev) =>
    openBooking((ev.currentTarget as HTMLElement).dataset.booking!),
  );
  on(root, "[data-permanent-event]", "click", (ev) =>
    confirmPermanentEvent((ev.currentTarget as HTMLElement).dataset.permanentEvent!),
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
let showDismissedNotices = false;
function renderNotifications(root: Element) {
  const today = localToday();
  const inDays = (count: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  };
  const artistId = state!.user.performerId ?? "";
  const artist = state!.user.role === "performer";
  const future = state!.bookings.filter((b) => b.date >= today && !["cancelled", "completed"].includes(b.status));
  const alerts: { booking: Booking; label: string; detail: string }[] = [];
  if (artist) {
    for (const booking of future) {
      if (booking.availability[artistId] === "pending") alerts.push({ booking, label: "Reply needed", detail: "Confirm or decline this assignment." });
      else if (booking.availability[artistId] === "available" && booking.date <= inDays(7)) alerts.push({ booking, label: "Coming up", detail: "Review your time, venue and show-day details." });
    }
    for (const booking of state!.bookings.filter((b) => b.date < today && b.date >= inDays(-30) && b.availability[artistId] === "available" && !b.artistCompletion?.[artistId] && b.status !== "cancelled")) {
      alerts.push({ booking, label: "After the show", detail: "Record how your assignment went." });
    }
  } else {
    for (const booking of future) {
      if (["requested", "availability_pending"].includes(booking.status)) alerts.push({ booking, label: "New request", detail: "Review the customer request and next step." });
      const declined = booking.performerIds.filter((id) => booking.availability[id] === "declined");
      const pending = booking.performerIds.filter((id) => (booking.availability[id] ?? "pending") === "pending");
      if (declined.length) alerts.push({ booking, label: "Artist declined", detail: declined.map((id) => state!.performers.find((p) => p.id === id)?.name ?? "Artist").join(", ") });
      if (pending.length) alerts.push({ booking, label: "Artist reply needed", detail: pending.map((id) => state!.performers.find((p) => p.id === id)?.name ?? "Artist").join(", ") });
      if (booking.date <= inDays(7) && ["accepted", "confirmed"].includes(booking.status)) alerts.push({ booking, label: "Coming up", detail: "Check the event plan before show day." });
    }
    for (const booking of state!.bookings.filter((b) => b.date >= inDays(-30) && Object.keys(b.artistCompletion ?? {}).length)) {
      alerts.push({ booking, label: "Artist report", detail: `${Object.keys(booking.artistCompletion ?? {}).length} completion report(s) to review.` });
    }
  }
  alerts.sort((a, b) => (a.booking.date + a.booking.time).localeCompare(b.booking.date + b.booking.time));
  const saved = (booking: Booking, label: string) => state!.noticeStates?.find((notice) => notice.bookingId === booking.id && notice.revision === booking.revision && notice.label === label);
  const visible = alerts.filter(({ booking, label }) => showDismissedNotices || !saved(booking, label)?.dismissedAt);
  const unread = alerts.filter(({ booking, label }) => !saved(booking, label)?.readAt && !saved(booking, label)?.dismissedAt).length;
  const alertRow = ({ booking, label, detail }: (typeof alerts)[number]) => {
    const notice = saved(booking, label);
    const action = (choice: string, text: string) => `<button class="outline small" data-notice-booking="${e(booking.id)}" data-notice-label="${e(label)}" data-notice-state="${choice}">${text}</button>`;
    return `<div class="row"><div><span class="eyebrow">${e(label)}${label === "Schedule check" ? "" : notice?.dismissedAt ? " · Dismissed" : notice?.readAt ? " · Read" : " · New"}</span><h3>${e(booking.name)}</h3><p>${e(day(booking.date))} · ${e(booking.time)} · ${e(detail)}</p></div><div class="actions"><button class="outline small" data-booking="${e(booking.id)}">Open event ↗</button>${label === "Schedule check" ? "" : notice?.dismissedAt ? action("restore", "Restore") : action(notice?.readAt ? "unread" : "read", notice?.readAt ? "Mark unread" : "Mark read") + action("dismissed", "Dismiss")}</div></div>`;
  };
  root.innerHTML = `<section class="panel"><div class="section-heading"><h2>${artist ? "Your job updates" : "Booking notification center"}</h2><span class="badge">${unread} unread</span></div><p class="muted">Live updates from events and artist responses. Your read and dismiss choices are saved for your account. Changed events appear as fresh updates.</p><label class="check"><input type="checkbox" id="show-dismissed-notices" ${showDismissedNotices ? "checked" : ""}>Include dismissed updates</label>${visible.slice(0, 30).map(alertRow).join("") || '<p class="muted">Nothing needs attention right now.</p>'}</section>${artist ? "" : '<section class="panel"><h3>Schedule checks</h3><p class="muted">Checking upcoming events for scheduling or venue issues.</p><div id="notice-conflicts" role="status">Checking…</div></section>'}`;
  on(root, "#show-dismissed-notices", "change", (event) => {
    showDismissedNotices = (event.currentTarget as HTMLInputElement).checked;
    renderNotifications(root);
  });
  on(root, "[data-notice-state]", "click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const booking = state!.bookings.find((item) => item.id === button.dataset.noticeBooking)!;
    button.disabled = true;
    try {
      await api("/manage/notices", "PUT", { bookingId: booking.id, revision: booking.revision, label: button.dataset.noticeLabel, state: button.dataset.noticeState });
      await loadDashboard();
    } catch (error) {
      button.disabled = false;
      notify(error instanceof Error ? error.message : "Unable to save notification.");
    }
  });
  wireDashboard(root);
  if (!artist) {
    const candidates = future.filter((b) => b.date <= inDays(14)).slice(0, 12);
    void Promise.all(candidates.map(async (booking) => {
      try {
        const check = await api<{ issues: string[] }>(`/manage/bookings/${booking.id}/checks`);
        return { booking, issues: check.issues };
      } catch {
        return { booking, issues: ["Schedule check unavailable. Open the event to retry."] };
      }
    })).then((results) => {
      if (!root.isConnected || currentView !== "notices") return;
      const target = root.querySelector("#notice-conflicts");
      if (!target) return;
      const warnings = results.flatMap(({ booking, issues }) => issues.map((issue) => ({ booking, label: "Schedule check", detail: issue })));
      target.innerHTML = warnings.map(alertRow).join("") || '<p class="muted">No issues found in the next two weeks.</p>';
      wireDashboard(target);
    });
  }
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
  const companyEvents = (state!.companyCalendar ?? [])
    .filter((b) => b.date.startsWith(calendarMonth) &&
      (calendarStatus === "all" || b.status === calendarStatus))
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
  const eventFlags = (booking: Booking) => {
    if (["cancelled", "completed"].includes(booking.status)) return [];
    if (state!.user.role === "performer") {
      return booking.availability[state!.user.performerId ?? ""] === "pending" ? ["Reply needed"] : [];
    }
    const flags: string[] = [];
    if (booking.performerIds.some((id) => booking.availability[id] === "declined")) flags.push("Artist declined");
    else if (booking.performerIds.some((id) => booking.availability[id] !== "available")) flags.push("Artist reply needed");
    if (["owner", "admin"].includes(state!.user.role) && ["accepted", "confirmed"].includes(booking.status) && bookingMoney(booking).balance > 0) flags.push("Balance open");
    return flags;
  };
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
            `<button class="calendar-event ${b.status} ${eventFlags(b).length ? "needs-attention" : ""}" data-booking="${e(b.id)}" title="${e(b.name)} · ${pretty(b.status)}${eventFlags(b).length ? ` · ${e(eventFlags(b).join(", "))}` : ""}"><time>${e(b.time)}</time><span>${e(b.name)}</span><small>${pretty(b.status)}${eventFlags(b).length ? ` · ${e(eventFlags(b).join(" · "))}` : ""}</small></button>`,
        )
        .join(
          "",
        )}${dayEvents.length > 3 ? `<button class="link small" data-calendar-day="${date}">＋ ${dayEvents.length - 3} more</button>` : ""}${state!.user.role === "performer" && state!.user.viewCompanyCalendar && companyEvents.some((item) => item.date === date) ? `<button class="calendar-block" data-calendar-day="${date}">Company: ${companyEvents.filter((item) => item.date === date).length} event(s)</button>` : ""}${dayBlocks.length ? `<button class="calendar-block" data-calendar-day="${date}">${dayBlocks.length} unavailable time${dayBlocks.length === 1 ? "" : "s"}</button>` : ""}</section>`;
    })
    .join(
      "",
    )}</div></div></section><section class="panel" id="calendar-agenda"><div class="section-heading"><h2>${calendarDay ? e(day(calendarDay)) : "This month’s agenda"}</h2>${calendarDay ? '<button class="link" id="calendar-all-days">Show whole month</button>' : ""}</div>${shown.map(bookingRow).join("") || '<p class="muted">No events match these filters.</p>'}<h3>Unavailable times</h3>${unavailable.map((b) => `<div class="row"><div><h3>${e(state!.performers.find((p) => p.id === b.performerId)?.name ?? "Performer")}</h3><p>${day(b.date)} · ${b.start}–${b.end} · ${e(b.note)}</p></div><button class="outline small" data-edit="blocks:${b.id}">Edit</button><button class="danger small" data-delete="blocks:${b.id}">Remove</button></div>`).join("") || '<p class="muted">No unavailable times recorded for this selection.</p>'}</section>`;
  if (state!.user.role === "performer" && state!.user.viewCompanyCalendar) {
    const visible = companyEvents.filter((b) => !calendarDay || b.date === calendarDay);
    root.insertAdjacentHTML("beforeend", `<section class="panel"><h3>Company calendar</h3><p class="muted">Other bookings appear as dates and status only. Open your assigned jobs above for details.</p>${visible.map((b) => `<div class="row"><strong>${e(day(b.date))} · ${e(b.time)}</strong>${badge(b.status)}</div>`).join("") || '<p class="muted">No other events in this view.</p>'}</section>`);
  }
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
      ? `<section class="panel table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Type</th><th>History</th><th>Actions</th></tr></thead><tbody>${customers.map((c) => `<tr><td><b>${e(c.name)}</b><span class="sub">${e(c.children.map((ch) => ch.name).join(", "))}</span>${state!.customers.some((other) => other.id !== c.id && other.phone.replace(/\D/g, "") === c.phone.replace(/\D/g, "")) ? '<span class="badge">Possible duplicate</span>' : ""}</td><td>${e(c.phone)}<span class="sub">${e(c.email)}</span></td><td>${badge(c.kind)}${c.doNotContact ? '<span class="sub">Do not contact</span>' : ""}</td><td>${state!.bookings.filter((b) => b.customerId === c.id).length} events</td><td><div class="actions"><button class="small outline" data-customer-history="${c.id}">Contact history</button><button class="small outline" data-edit="customers:${c.id}">Edit</button><button class="small danger" data-delete="customers:${c.id}">Delete</button></div></td></tr>`).join("")}</tbody></table></section>`
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
  if (["owner", "admin"].includes(state!.user.role)) {
    const button = document.createElement("button");
    button.className = "outline small";
    button.textContent = "Merge duplicate customers";
    button.addEventListener("click", chooseCustomerMerge);
    root.querySelector(".toolbar .actions")!.prepend(button);
  }
}
function chooseCustomerMerge() {
  const options = state!.customers.map((c) => ({
    value: c.id,
    label: `${c.name} · ${c.phone}`,
  }));
  openDialog(
    "Review duplicate customers",
    formBody(
      [
        {
          key: "targetId",
          label: "Customer record to keep",
          type: "select",
          required: true,
          options,
        },
        {
          key: "sourceId",
          label: "Duplicate record to combine",
          type: "select",
          required: true,
          options,
        },
      ],
      "<p>Only combine records you have verified belong to the same customer. Login-linked and reward-linked records are protected. Nothing changes until you confirm the preview.</p>",
      "Preview merge",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const ids = {
      targetId: String(data.get("targetId")),
      sourceId: String(data.get("sourceId")),
    };
    const p = await api<{
      target: Customer;
      source: Customer;
      merged: Customer;
      revision: string;
      reasons: string[];
      counts: { bookings: number; reminders: number; history: number };
    }>("/manage/customer-merge/preview", "POST", ids);
    const details = `<p>Keep <b>${e(p.target.name)}</b> and combine <b>${e(p.source.name)}</b>.</p><p>Move ${p.counts.bookings} bookings, ${p.counts.reminders} follow-ups and ${p.counts.history} contact notes. Financial entries and agreed prices stay unchanged.</p><p>The kept record retains its name, phone, email, type, language and source. Children, additional contacts and notes are combined. The earliest follow-up is kept. Do-not-contact takes priority, and offers remain allowed only if both records allow them.</p><p><b>Kept contact:</b> ${e(p.merged.phone)} · ${e(p.merged.email || "No email")}</p><p>${p.merged.children.length} children · ${p.merged.contacts.length} additional contacts</p><p class="privacy">The duplicate disappears from the active list. Original records are retained in the private merge archive and business export; there is no automatic undo.</p>`;
    if (p.reasons.length) {
      openDialog(
        "Merge needs a separate review",
        details + p.reasons.map((r) => `<p class="hint">${e(r)}</p>`).join(""),
      );
      return;
    }
    openDialog(
      "Confirm customer merge",
      formBody(
        [
          {
            key: "identityConfirmed",
            label: "I verified these records belong to the same customer",
            type: "checkbox",
            required: true,
          },
        ],
        details,
        "Combine customer records",
      ),
    );
    submit(modal.querySelector("form")!, async (confirmation) => {
      await api("/manage/customer-merge/confirm", "POST", {
        ...ids,
        revision: p.revision,
        identityConfirmed: confirmation.get("identityConfirmed") === "on",
      });
      modal.close();
      state = await api<Dashboard>("/manage/state");
      renderDashboard();
      notify(
        "Customer records combined. Original details are preserved in the private history.",
      );
    });
  });
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

function renderGuestPhotosAdmin(root: Element) {
  const names = guestServiceNames(state!.business.otherShowNames);
  const visibleHeroPhotos = siteMediaSlots.slice(0, 3).filter((slot) => (state!.business.siteMedia?.[slot.key] ?? slot.defaultUrl) !== "").length;
  const siteCards = siteMediaSlots.map((slot) => {
    const url = state!.business.siteMedia?.[slot.key] ?? slot.defaultUrl;
    const canHide = url && (!slot.key.startsWith("hero") || visibleHeroPhotos > 1);
    return `<article class="panel site-media-card">${url ? `<img src="${e(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="site-media-empty">Photo hidden</div>'}<h3>${e(slot.label)}</h3><p class="muted">${state!.business.siteMedia?.[slot.key] === undefined ? "Original photo" : url ? "Your photo" : "Hidden from website"}</p><div class="actions"><button type="button" class="small outline" data-edit-site-media="${e(slot.key)}">Change photo</button>${canHide ? `<button type="button" class="small danger" data-hide-site-media="${e(slot.key)}">Hide</button>` : ""}${state!.business.siteMedia?.[slot.key] !== undefined ? `<button type="button" class="small outline" data-reset-site-media="${e(slot.key)}">Use original</button>` : ""}</div></article>`;
  }).join("");
  const guestCards = names.map((name) => {
    const saved = state!.guestGalleries?.find((entry) => entry.id === name.toLocaleLowerCase("en"));
    const photos = guestBuiltInPhotos(name).filter((photo) => !saved?.hiddenPhotoUrls.includes(photo.url)).length + (saved?.gallery.length ?? 0);
    const videos = guestVideos(name).length;
    return `<article class="panel"><h3>${e(name)}</h3><p>${photos} ${photos === 1 ? "photo" : "photos"} · ${videos} ${videos === 1 ? "video" : "videos"}</p><button type="button" class="small outline" data-guest-gallery="${e(name)}">Manage photos & videos ↗</button></article>`;
  }).join("");
  root.innerHTML = `<section class="panel"><h2>Photos & videos</h2><p>Replace homepage pictures below, then manage photos and videos for each show. Changes to a show appear after you save its media.</p></section><h2>Homepage photos</h2><div class="profile-grid">${siteCards}</div><h2>Sam’s shows & bundles</h2><div class="profile-grid">${state!.packages.map((show) => { const photos = showPhotos(show).length, videos = showVideos(show).length; return `<article class="panel"><h3>${e(publicShowName(show))}</h3><p>${photos} ${photos === 1 ? "photo" : "photos"} · ${videos} ${videos === 1 ? "video" : "videos"}</p><button type="button" class="small outline" data-package-media="${e(show.id)}">Manage photos & videos ↗</button></article>`; }).join("")}</div><h2>Guest acts & party services</h2><div class="profile-grid">${guestCards}</div>`;
  on(root, "[data-edit-site-media]", "click", (event) => editSiteMedia((event.currentTarget as HTMLElement).dataset.editSiteMedia!));
  on(root, "[data-hide-site-media]", "click", async (event) => {
    await api(`/manage/site-media/${(event.currentTarget as HTMLElement).dataset.hideSiteMedia!}`, "PUT", { value: "" });
    await loadDashboard();
    notify("Photo hidden from the website.");
  });
  on(root, "[data-reset-site-media]", "click", async (event) => {
    await api(`/manage/site-media/${(event.currentTarget as HTMLElement).dataset.resetSiteMedia!}`, "PUT", { value: null });
    await loadDashboard();
    notify("Original photo restored.");
  });
  on(root, "[data-package-media]", "click", (event) => editPackageMedia((event.currentTarget as HTMLElement).dataset.packageMedia!));
  on(root, "[data-guest-gallery]", "click", (event) => editGuestGallery((event.currentTarget as HTMLElement).dataset.guestGallery!));
}
function editSiteMedia(key: string) {
  const slot = siteMediaSlots.find((item) => item.key === key);
  if (!slot) return;
  const current = state!.business.siteMedia?.[key] || "";
  const uploadControl = state!.uploadsEnabled
    ? '<div class="photo-upload"><label for="site-photo-upload">Choose a photo from your device</label><input id="site-photo-upload" type="file" accept="image/*"><small>We resize the photo before uploading. Save afterward to publish it.</small><p id="site-photo-status" role="status"></p></div>'
    : '<p class="hint">Photo uploads need connected media storage. You can still use a public HTTPS image link.</p>';
  openDialog(`Change ${slot.label}`, formBody([{ key: "url", label: "Public HTTPS photo link", value: current, type: "url", required: true, wide: true }], uploadControl, "Use this photo"));
  on(modal, "#site-photo-upload", "change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const status = modal.querySelector<HTMLElement>("#site-photo-status")!;
    input.disabled = true;
    try {
      status.textContent = "Preparing your photo…";
      const photo = await resizedPhoto(file);
      const response = await fetch("/api/manage/upload-photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: photo });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Photo upload failed.");
      modal.querySelector<HTMLInputElement>("#f-url")!.value = result.url;
      status.textContent = "Photo ready. Save to update the website.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Photo upload failed.";
    } finally {
      input.disabled = false;
    }
  });
  submit(modal.querySelector("form")!, async (data) => {
    await api(`/manage/site-media/${key}`, "PUT", { value: String(data.get("url") ?? "").trim() });
    modal.close();
    await loadDashboard();
    notify("Homepage photo updated.");
  });
}
function renderGuestShowsAdmin(root: Element) {
  const names = guestServiceNames(state!.business.otherShowNames);
  const hidden = state!.business.hiddenGuestServices ?? [];
  root.innerHTML = `<section class="panel"><div class="toolbar"><div><h2>Guest shows & party services</h2><p class="muted">Add an act, or remove one from the website. Customers can ask about visible services; you confirm availability and price personally.</p></div><button class="small" id="add-guest-show">＋ Add guest show</button></div><label class="guest-show-search" for="guest-show-search">Find a guest show<input id="guest-show-search" type="search" placeholder="Search by name…" autocomplete="off"></label></section><div class="profile-grid">${names.map((name) => {
    const isHidden = hidden.some((entry) => entry.toLowerCase() === name.toLowerCase());
    return `<article class="panel" data-guest-show-card="${e(name.toLowerCase())}"><span class="badge">${isHidden ? "Hidden" : "Public"}</span><h3>${e(name)}</h3><p>${isHidden ? "Removed from the public website. Existing requests are preserved." : "Visitors can add this service to their event request."}</p><button class="small ${isHidden ? "outline" : "danger"}" data-guest-visibility="${e(name)}" data-guest-action="${isHidden ? "restore" : "hide"}">${isHidden ? "Put back on website" : "Remove from website"}</button></article>`;
  }).join("")}</div>`;
  on(root, "#guest-show-search", "input", (ev) => {
    const query = (ev.currentTarget as HTMLInputElement).value.trim().toLowerCase();
    root.querySelectorAll<HTMLElement>("[data-guest-show-card]").forEach((card) => {
      card.hidden = !card.dataset.guestShowCard!.includes(query);
    });
  });
  on(root, "#add-guest-show", "click", () => {
    openDialog("Add a guest show", formBody([{ key: "name", label: "Show or service name", required: true }], '<p class="privacy">This creates an enquiry-only listing. Add a full bookable show under Shows & packages if you want to set its own quote and preparation details.</p>', "Add guest show"));
    submit(modal.querySelector("form")!, async (data) => {
      await api("/manage/guest-services", "POST", { action: "add", name: String(data.get("name") ?? "").trim() });
      modal.close();
      await loadDashboard();
      notify("Guest show added to the website.");
    });
  });
  on(root, "[data-guest-visibility]", "click", (ev) => {
    const button = ev.currentTarget as HTMLElement;
    const name = button.dataset.guestVisibility!, action = button.dataset.guestAction!;
    openDialog(action === "hide" ? `Remove ${name} from website?` : `Show ${name} again?`, `<p>${action === "hide" ? "This hides the service from customers. Existing requests and photos stay available in Backstage." : "This makes the service visible to customers again."}</p><form><div class="form-error" role="alert"></div><div class="form-actions"><button type="submit" class="${action === "hide" ? "danger" : ""}">${action === "hide" ? "Remove from website" : "Put back on website"}</button></div></form>`);
    submit(modal.querySelector("form")!, async () => {
      await api("/manage/guest-services", "POST", { action, name });
      modal.close();
      await loadDashboard();
      notify(action === "hide" ? "Guest show removed from the website." : "Guest show is visible again.");
    });
  });
}
function addedPhotoControls(photos: { url: string; caption: string }[]) {
  if (!photos.length) return "";
  return `<fieldset class="built-in-photos"><legend>Photos you added</legend><p>Use Remove photo to take an added picture off the website, then save.</p><div class="built-in-photo-grid">${photos.map((photo) => `<div class="added-photo"><img src="${e(photo.url)}" alt="${e(photo.caption)}" loading="lazy"><span>${e(photo.caption)}</span><button type="button" class="small outline" data-remove-added-photo="${e(photo.url)}">Remove photo</button></div>`).join("")}</div></fieldset>`;
}
function wireAddedPhotoRemoval() {
  on(modal, "[data-remove-added-photo]", "click", (event) => {
    const button = event.currentTarget as HTMLElement;
    const gallery = modal.querySelector<HTMLTextAreaElement>("#f-gallery")!;
    gallery.value = gallery.value.split("\n").filter((line) => line.split("|")[0].trim() !== button.dataset.removeAddedPhoto).join("\n");
    button.closest(".added-photo")?.remove();
  });
}
function videoUploadControl() {
  return state!.uploadsEnabled
    ? '<div class="photo-upload"><label for="media-video-upload">Add a video from your device</label><input id="media-video-upload" type="file" accept="video/mp4,video/webm,.mp4,.webm"><small>MP4 or WebM, up to 100 MB. The video uploads directly to media storage. Save media afterward to show it on the website.</small><p id="media-video-status" role="status"></p></div>'
    : "";
}
function wireVideoUpload() {
  on(modal, "#media-video-upload", "change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const status = modal.querySelector<HTMLElement>("#media-video-status")!;
    const videos = modal.querySelector<HTMLTextAreaElement>("#f-videos")!;
    const links = videos.value.split("\n").filter((line) => line.trim());
    const extension = file.name.toLowerCase().match(/\.(mp4|webm)$/)?.[1];
    if (!extension || file.size > 100 * 1024 * 1024 || links.length >= 6) {
      status.textContent = !extension ? "Choose an MP4 or WebM video." : file.size > 100 * 1024 * 1024 ? "Choose a video under 100 MB." : "This show already has six videos. Remove one before adding another.";
      input.value = "";
      return;
    }
    input.disabled = true;
    try {
      const pathname = `${state!.business.id}/show-videos/${crypto.randomUUID()}.${extension}`;
      const result = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/manage/upload-video",
        contentType: extension === "mp4" ? "video/mp4" : "video/webm",
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => { status.textContent = `Uploading video… ${Math.round(percentage)}%`; },
      });
      videos.value += `${videos.value.trim() ? "\n" : ""}${result.url}`;
      status.textContent = "Video ready. Save media to show it on the website.";
      input.value = "";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Video upload failed.";
    } finally { input.disabled = false; }
  });
}
function editPackageMedia(id: string) {
  const show = state!.packages.find((item) => item.id === id);
  if (!show) return;
  const fields: Field[] = [
    { key: "gallery", label: "Your added photos", type: "textarea", wide: true, value: (show.gallery ?? []).map((photo) => `${photo.url} | ${photo.caption}`).join("\n"), help: "One HTTPS image link | description per line. Remove a line to take that photo off the site." },
    { key: "publishApproved", label: "I have permission to publish these photos", type: "checkbox", wide: true, value: !!show.gallery?.length },
    { key: "coverPhotoNumber", label: "Main photo number", type: "number", min: 1, max: 12, value: show.coverPhotoNumber ?? 1, help: "The first visible photo is number 1." },
    { key: "videos", label: "Your video links", type: "textarea", wide: true, value: (show.previewVideos ?? (show.previewVideo ? [show.previewVideo] : [])).join("\n"), help: "One HTTPS MP4, WebM, YouTube or Vimeo link per line. Remove a line to remove a video." },
  ];
  const photos = portfolioShowPhotos[id] ?? demoShowPhotos[id] ?? [];
  const includedPhotos = photos.length ? `<fieldset class="built-in-photos"><legend>Included photos</legend><p>Tick a photo to hide it from the site.</p><div class="built-in-photo-grid">${photos.map((photo) => `<label><img src="${e(photo.url)}" alt="${e(photo.caption)}" loading="lazy"><span><input type="checkbox" name="hiddenPhotoUrls" value="${e(photo.url)}" ${(show.hiddenPhotoUrls ?? []).includes(photo.url) ? "checked" : ""}> Hide this photo</span></label>`).join("")}</div></fieldset>` : "";
  const includedVideos = packageBuiltInVideos(show).map((url, index) => `<label class="check"><input type="checkbox" name="hiddenVideoUrls" value="${e(url)}" ${(show.hiddenVideoUrls ?? []).includes(url) ? "checked" : ""}> Hide included video ${index + 1}</label>`).join("");
  const upload = state!.uploadsEnabled ? '<div class="photo-upload"><label for="media-photo-upload">Add photos from your device</label><input id="media-photo-upload" type="file" accept="image/*" multiple><p id="media-photo-status" role="status"></p></div>' : '<p class="muted">Device upload is not connected yet. Add an HTTPS photo link above.</p>';
  openDialog(`Photos & videos · ${publicShowName(show)}`, formBody(fields, addedPhotoControls(show.gallery ?? []) + includedPhotos + includedVideos + upload + videoUploadControl(), "Save media"));
  wireAddedPhotoRemoval();
  wireVideoUpload();
  on(modal, "#media-photo-upload", "change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    const status = modal.querySelector<HTMLElement>("#media-photo-status")!;
    const gallery = modal.querySelector<HTMLTextAreaElement>("#f-gallery")!;
    input.disabled = true;
    try {
      for (const [index, file] of files.entries()) {
        status.textContent = `Preparing photo ${index + 1} of ${files.length}…`;
        const response = await fetch("/api/manage/upload-photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: await resizedPhoto(file) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Photo upload failed.");
        const caption = file.name.replace(/\.[^.]+$/, "").replace(/[|\r\n]/g, " ").slice(0, 100) || "Show photo";
        gallery.value += `${gallery.value.trim() ? "\n" : ""}${result.url} | ${caption}`;
      }
      status.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} ready. Save media to publish.`;
      input.value = "";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Unable to add photos.";
    } finally { input.disabled = false; }
  });
  submit(modal.querySelector("form")!, async (data) => {
    const gallery = String(data.get("gallery") ?? "").split("\n").filter((line) => line.trim()).map((line) => {
      const separator = line.indexOf("|");
      if (separator < 0) throw new Error("Each photo needs an HTTPS link followed by | and a description.");
      return { url: line.slice(0, separator).trim(), caption: line.slice(separator + 1).trim(), approved: true as const };
    });
    if (gallery.length && data.get("publishApproved") !== "on") throw new Error("Confirm you have permission to publish these photos.");
    await api(`/manage/packages/${encodeURIComponent(id)}`, "PUT", {
      ...show, gallery, coverPhotoNumber: Number(data.get("coverPhotoNumber") ?? 1),
      hiddenPhotoUrls: selected(data, "hiddenPhotoUrls"),
      previewVideo: "", previewVideos: String(data.get("videos") ?? "").split("\n").map((url) => url.trim()).filter(Boolean),
      hiddenVideoUrls: selected(data, "hiddenVideoUrls"),
    });
    modal.close();
    await loadDashboard();
    notify(`${publicShowName(show)} media updated.`);
  });
}
function editGuestGallery(name: string) {
  const saved: GuestGallery = (state!.guestGalleries ?? []).find((entry) => entry.id === name.toLocaleLowerCase("en")) ?? { id: name.toLocaleLowerCase("en"), gallery: [], hiddenPhotoUrls: [], videos: [], hiddenVideoUrls: [] };
  const builtIn = guestBuiltInPhotos(name);
  const fields: Field[] = [
    { key: "gallery", label: "Your added photos", type: "textarea", wide: true, value: saved.gallery.map((photo) => `${photo.url} | ${photo.caption}`).join("\n"), help: "One HTTPS image link and description per line. Remove a line to take that photo off the site. The first visible photo appears on the show card." },
    { key: "videos", label: "Your video links", type: "textarea", wide: true, value: (saved.videos ?? []).join("\n"), help: "One HTTPS video link per line. MP4, WebM, YouTube and Vimeo are supported. Remove a line to remove the video from the site." },
  ];
  const included = builtIn.length ? `<fieldset class="built-in-photos"><legend>Photos already included</legend><p>Tick any photo to hide it from the public website.</p><div class="built-in-photo-grid">${builtIn.map((photo) => `<label><img src="${e(photo.url)}" alt="${e(photo.caption)}" loading="lazy"><span><input type="checkbox" name="hiddenPhotoUrls" value="${e(photo.url)}" ${saved.hiddenPhotoUrls.includes(photo.url) ? "checked" : ""}> Hide this photo</span></label>`).join("")}</div></fieldset>` : "";
  const includedVideos = guestBuiltInVideos(name).map((url) => `<label class="check"><input type="checkbox" name="hiddenVideoUrls" value="${e(url)}" ${(saved.hiddenVideoUrls ?? []).includes(url) ? "checked" : ""}> Hide included video</label>`).join("");
  const upload = state!.uploadsEnabled ? '<div class="photo-upload"><label for="guest-photo-upload">Add photos from your device</label><input id="guest-photo-upload" type="file" accept="image/*" multiple><small>Photos resize automatically. Save changes after uploading.</small><p id="guest-photo-upload-status" role="status"></p></div>' : '<p class="muted">Device upload is not connected yet. Add an HTTPS photo link above.</p>';
  openDialog(`Photos & videos · ${name}`, formBody(fields, addedPhotoControls(saved.gallery) + included + includedVideos + upload + videoUploadControl()));
  wireAddedPhotoRemoval();
  wireVideoUpload();
  on(modal, "#guest-photo-upload", "change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    const status = modal.querySelector<HTMLElement>("#guest-photo-upload-status")!;
    const gallery = modal.querySelector<HTMLTextAreaElement>("#f-gallery")!;
    input.disabled = true;
    try {
      for (const [position, file] of files.entries()) {
        status.textContent = `Preparing photo ${position + 1} of ${files.length}…`;
        const response = await fetch("/api/manage/upload-photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: await resizedPhoto(file) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Photo upload failed.");
        const caption = file.name.replace(/\.[^.]+$/, "").replace(/[|\r\n]/g, " ").slice(0, 100) || "Show photo";
        gallery.value += `${gallery.value.trim() ? "\n" : ""}${result.url} | ${caption}`;
      }
      status.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} ready. Save changes to publish.`;
      input.value = "";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Unable to add photos.";
    } finally { input.disabled = false; }
  });
  submit(modal.querySelector("form")!, async (data) => {
    const gallery = String(data.get("gallery") ?? "").split("\n").filter((line) => line.trim()).map((line) => {
      const separator = line.indexOf("|");
      if (separator < 0) throw new Error("Each photo needs an HTTPS link followed by | and a description.");
      return { url: line.slice(0, separator).trim(), caption: line.slice(separator + 1).trim(), approved: true as const };
    });
    const videos = String(data.get("videos") ?? "").split("\n").map((link) => link.trim()).filter(Boolean);
    await api(`/manage/guest-galleries/${encodeURIComponent(name)}`, "PUT", { gallery, videos, hiddenPhotoUrls: selected(data, "hiddenPhotoUrls"), hiddenVideoUrls: selected(data, "hiddenVideoUrls") });
    modal.close();
    await loadDashboard();
    notify(`${name} photos and videos updated.`);
  });
}
function managedShowCategories() {
  return [...new Set([
    ...(state!.business.showCategories ?? []),
    ...state!.packages.filter((show) => !show.bundleIds?.length).map((show) => show.category),
    ...state!.performers.flatMap((performer) => performer.categories),
  ].filter((name) => name && name.toLowerCase() !== "bundle"))];
}
function editShowCategory(oldName = "") {
  const fields: Field[] = [{ key: "name", label: "Category name", value: oldName, required: true, max: 40 }];
  openDialog(oldName ? `Rename ${oldName}` : "Add show category", formBody(fields, oldName ? "<p class=\"privacy\">Shows and performer profiles in this category will be updated together.</p>" : "", oldName ? "Save category" : "Add category"));
  submit(modal.querySelector("form")!, async (data) => {
    await api("/manage/show-categories", "POST", { action: oldName ? "rename" : "add", ...(oldName ? { oldName } : {}), name: String(data.get("name") ?? "").trim() });
    modal.close();
    await loadDashboard();
    notify(oldName ? "Category renamed." : "Category added. You can now choose it when adding a show.");
  });
}
function removeShowCategory(name: string) {
  openDialog(`Remove ${name}?`, '<p>Empty categories can be removed. Move any shows or performers to another category first.</p><form><div class="form-error" role="alert"></div><div class="form-actions"><button type="submit" class="danger">Remove category</button></div></form>');
  submit(modal.querySelector("form")!, async () => {
    await api("/manage/show-categories", "POST", { action: "remove", oldName: name });
    modal.close();
    await loadDashboard();
    notify("Category removed.");
  });
}
function renderCatalogAdmin(root: Element, kind: "packages" | "performers") {
  const offers = currentView === "offers";
  const categories = kind === "packages" && !offers ? managedShowCategories() : [];
  const categoryPanel = kind === "packages" && !offers ? `<section class="panel"><div class="toolbar"><div><h2>Show categories</h2><p class="muted">Create categories here, then choose one when adding or editing a show.</p></div><button class="small outline" id="add-show-category">＋ Add category</button></div><div class="category-manager">${categories.map((name) => { const count = state!.packages.filter((show) => !show.bundleIds?.length && show.category.toLowerCase() === name.toLowerCase()).length; return `<div class="category-manager-row"><div><strong>${e(name)}</strong><small>${count} ${count === 1 ? "show" : "shows"}</small></div><div class="actions"><button type="button" class="small outline" data-rename-category="${e(name)}">Rename</button><button type="button" class="small danger" data-remove-category="${e(name)}" ${count || state!.performers.some((performer) => performer.categories.some((category) => category.toLowerCase() === name.toLowerCase())) ? "disabled title=\"Move linked shows and performers first\"" : ""}>Remove</button></div></div>`; }).join("") || '<p class="muted">Add your first category to organise shows.</p>'}</div></section>` : "";
  root.innerHTML = `<div class="toolbar"><p class="muted">Your ${kind === "packages" ? "show details, prices and venue requirements" : "cast, profiles, media and verified memberships"}.</p><div class="actions">${kind === "packages" && !offers ? '<button class="small outline" data-go="guest-shows">Manage guest acts</button>' : ""}<button class="small" data-edit="${kind}:new">＋ Add ${offers ? "offer / bundle" : kind === "packages" ? "show" : "performer"}</button></div></div>${categoryPanel}<div class="profile-grid">${
    (state![kind] as (Package | Performer)[])
      .filter((v) => kind !== "packages" || (offers ? !!(v as Package).bundleIds?.length : !(v as Package).bundleIds?.length))
      .map(
        (v) =>
          `<article class="panel"><span class="badge">${v.active ? "Public" : "Archived"}</span><h3>${e(v.name)}</h3><p>${e("description" in v ? v.description : v.bio)}</p>${"duration" in v ? `<p class="muted">Category: ${e(v.category)} · ${e(price(v))}</p>` : ""}<div class="actions"><button class="small outline" data-edit="${kind}:${v.id}">Edit details</button><button class="small outline" data-duplicate="${kind}:${v.id}">Duplicate</button>${v.active ? `<button class="small danger" data-delete="${kind}:${v.id}">Remove from website</button>` : kind === "packages" ? `<button class="small outline" data-restore-show="${e(v.id)}">Put back on website</button>` : ""}</div></article>`,
      )
      .join("") ||
    empty(
      offers ? "Your next great offer starts here" : "Ready for a new act?",
      offers
        ? "Combine two or more shows, set your bundle price and publish it for customers."
        : kind === "packages"
          ? "Add a show with its price and venue requirements."
          : "Add a performer profile to introduce the people behind the happy memories.",
    )
  }</div>`;
  on(root, "[data-duplicate]", "click", (ev) => {
    const [kind, key] = (
      ev.currentTarget as HTMLElement
    ).dataset.duplicate!.split(":");
    editRecord(kind, key, true);
  });
  on(root, "#add-show-category", "click", () => editShowCategory());
  on(root, "[data-rename-category]", "click", (ev) => editShowCategory((ev.currentTarget as HTMLElement).dataset.renameCategory!));
  on(root, "[data-remove-category]", "click", (ev) => removeShowCategory((ev.currentTarget as HTMLElement).dataset.removeCategory!));
  on(root, "[data-restore-show]", "click", async (ev) => {
    const show = state!.packages.find((item) => item.id === (ev.currentTarget as HTMLElement).dataset.restoreShow);
    if (!show) return;
    await api(`/manage/packages/${encodeURIComponent(show.id)}`, "PUT", { ...show, active: true });
    await loadDashboard();
    notify("Show is back on the website.");
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
  const artistRows = state!.performers.map((artist) => {
    const jobs = report.events.filter((b) => b.performerIds.includes(artist.id));
    const agreed = jobs.reduce((sum, b) => sum + (state!.actPlans?.find((plan) => plan.id === b.id)?.rows.filter((row) => row.performerId === artist.id).reduce((n, row) => n + row.agreedPay, 0) ?? 0), 0);
    const paid = state!.money.filter((entry) => entry.performerId === artist.id && jobs.some((job) => job.id === entry.bookingId)).reduce((sum, entry) => sum + entry.amount, 0);
    return { artist, jobs, agreed, paid };
  }).filter((row) => row.jobs.length);
  root.insertAdjacentHTML("beforeend", `<section class="panel table-wrap"><h3>Artist work & pay · by event date</h3><p class="muted">Agreed fees come from each event’s staffing plan. Paid amounts are recorded artist expenses for those events, regardless of payment date.</p><table><thead><tr><th>Artist</th><th>Jobs</th><th>Confirmed</th><th>Completed</th><th>Cancelled</th><th>Agreed</th><th>Paid</th><th>Balance</th></tr></thead><tbody>${artistRows.map(({ artist, jobs, agreed, paid }) => `<tr><td>${e(artist.name)}</td><td>${jobs.length}</td><td>${jobs.filter((b) => b.availability[artist.id] === "available").length}</td><td>${jobs.filter((b) => !!b.artistCompletion?.[artist.id]).length}</td><td>${jobs.filter((b) => b.status === "cancelled").length}</td><td>${money(agreed)}</td><td>${money(paid)}</td><td>${money(Math.max(0, agreed - paid))}</td></tr>`).join("")}</tbody></table>${artistRows.length ? "" : '<p class="muted">No assigned artists in this period.</p>'}</section>`);
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
  const toolbar = root.querySelector(".toolbar")!;
  if (["owner", "admin"].includes(state!.user.role)) {
    const settings = document.createElement("button");
    settings.className = "outline small";
    settings.textContent = "Follow-up planner";
    settings.addEventListener("click", () => void editFollowupSettings());
    toolbar.append(settings);
  }
  for (const reminder of state!.reminders) {
    if (reminder.done || !reminder.customerId) continue;
    const actions = root.querySelector(
      `[data-edit="reminders:${CSS.escape(reminder.id)}"]`,
    )?.parentElement;
    if (!actions) continue;
    const review = document.createElement("button");
    review.className = "outline small";
    review.textContent = "Review & contact";
    review.addEventListener("click", () => reviewFollowup(reminder));
    actions.prepend(review);
  }
}
async function editFollowupSettings() {
  try {
    const settings = await api<FollowupSettings>("/manage/followups/settings");
    const fields: Field[] = [
      {
        key: "enabled",
        label: "Create reminders automatically when I open the dashboard",
        type: "checkbox",
        value: settings.enabled,
        wide: true,
      },
      {
        key: "birthday",
        label: "Birthday follow-ups",
        type: "checkbox",
        value: settings.birthday,
      },
      {
        key: "birthdayDays",
        label: "Days before the birthday",
        type: "number",
        value: settings.birthdayDays,
        min: 0,
        max: 90,
      },
      {
        key: "afterEvent",
        label: "After completed events",
        type: "checkbox",
        value: settings.afterEvent,
      },
      {
        key: "afterEventDays",
        label: "Days after the event",
        type: "number",
        value: settings.afterEventDays,
        min: 1,
        max: 30,
      },
      {
        key: "quote",
        label: "Proposals awaiting a reply",
        type: "checkbox",
        value: settings.quote,
      },
      {
        key: "quoteDays",
        label: "Days after the last proposal update",
        type: "number",
        value: settings.quoteDays,
        min: 1,
        max: 30,
      },
      {
        key: "schoolDate",
        label: "School campaign date (optional)",
        type: "date",
        value: settings.schoolDate,
      },
      {
        key: "schoolDays",
        label: "Days before the school campaign",
        type: "number",
        value: settings.schoolDays,
        min: 0,
        max: 90,
      },
      ...(
        ["birthdayText", "afterEventText", "quoteText", "schoolText"] as const
      ).map((key) => ({
        key,
        label: {
          birthdayText: "Birthday draft",
          afterEventText: "After-event draft",
          quoteText: "Proposal draft",
          schoolText: "School draft",
        }[key],
        type: "textarea",
        value: settings[key],
        wide: true,
        required: true,
      })),
    ];
    openDialog(
      "Your follow-up planner",
      formBody(
        fields,
        '<p class="privacy">Creates private reminders and editable drafts only. Nothing is sent automatically. Birthday and school offers require permission for offers. Do-not-contact always takes priority. Use {customer}, {child}, {event}, {date} and {business} in drafts. February 29 birthdays use February 28 in other years. Editing a rule does not rewrite existing drafts.</p>',
        "Save planner",
      ),
    );
    submit(modal.querySelector("form")!, async (data) => {
      await api("/manage/followups/settings", "PUT", {
        ...formValues(data, fields),
        revision: settings.revision,
      });
      const result = await api<{ added: number }>(
        "/manage/followups/generate",
        "POST",
        {},
      );
      modal.close();
      await loadDashboard();
      notify(`Planner saved. ${result.added} new follow-ups prepared.`);
    });
  } catch (error) {
    notify(
      error instanceof Error ? error.message : "Unable to open the planner.",
    );
  }
}
function reviewFollowup(reminder: Reminder) {
  const customer = state!.customers.find((c) => c.id === reminder.customerId);
  if (!customer) return;
  if (
    customer.doNotContact ||
    (reminder.marketing && !customer.offersConsent)
  ) {
    openDialog(
      "Contact preference",
      "<p>This customer’s current contact preferences prevent this follow-up. Review their customer record.</p>",
    );
    return;
  }
  const fields: Field[] = [
    {
      key: "summary",
      label: "Message / contact notes",
      type: "textarea",
      value: reminder.draft ?? "",
      required: true,
      wide: true,
    },
    {
      key: "channel",
      label: "How you contacted them",
      type: "select",
      options: options(["whatsapp", "phone", "email", "in_person"]),
    },
    {
      key: "date",
      label: "Contact date",
      type: "date",
      value: localToday(),
      required: true,
    },
    {
      key: "confirmed",
      label: "I have actually contacted this customer",
      type: "checkbox",
      required: true,
      wide: true,
    },
  ];
  openDialog(
    `Follow up with ${customer.name}`,
    formBody(
      fields,
      `<p><a id="followup-whatsapp" class="button outline" target="_blank" rel="noopener noreferrer">Open WhatsApp draft ↗</a></p><p class="privacy">Opening WhatsApp does not send a message. After you contact the customer yourself, record it here to finish this reminder and add it to their contact history.</p>`,
      "Record contact & finish",
    ),
  );
  const message = modal.querySelector<HTMLTextAreaElement>("textarea")!,
    link = modal.querySelector<HTMLAnchorElement>("#followup-whatsapp")!;
  const updateLink = () => {
    const phone = customer.phone.replace(/\D/g, "").replace(/^00/, "");
    link.href = `https://wa.me/${phone}?text=${encodeURIComponent(message.value)}`;
    link.hidden = !phone;
  };
  updateLink();
  message.addEventListener("input", updateLink);
  submit(modal.querySelector("form")!, async (data) => {
    await api(`/manage/reminders/${reminder.id}/contact`, "POST", {
      ...formValues(data, fields),
      revision: reminder.revision ?? 0,
    });
    modal.close();
    await loadDashboard();
    notify("Contact recorded and follow-up completed.");
  });
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
  if (limitedStaff(state!.user.role)) {
    root.innerHTML = `<section class="panel"><h2>Your ${e(pretty(state!.user.role))} account</h2><p>${e(state!.user.name)} · ${e(state!.user.email)}</p><p class="hint">${e(roleDescriptions[state!.user.role])}</p><button class="outline small" id="change-password">Change my password</button></section>`;
    on(root, "#change-password", "click", () => changePassword());
    return;
  }
  if (state!.user.role === "performer") {
    root.innerHTML = `<section class="panel"><h2>Your artist account</h2><p>${e(state!.user.name)} · ${e(state!.user.email)}</p><p class="muted">Your calendar shows your own assignments${state!.user.viewCompanyCalendar ? " and company event dates" : ""}. The organizer controls company calendar access.</p><button class="outline small" id="change-password">Change my password</button></section>`;
    on(root, "#change-password", "click", () => changePassword());
    return;
  }
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
  const item =
    key === "new"
      ? kind === "packages" && currentView === "offers"
        ? { category: "bundle", priceMode: "fixed", adultShow: false }
        : {}
      : (list.find((v) => v.id === key) ?? {});
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
      f("name", "Show name", "text", { required: true }),
      f("category", "Show category", "select", {
        help: "Manage the choices in Shows & packages. Bundles use the reserved Bundle category.",
        options: [...new Set([...(currentView === "offers" ? ["bundle"] : []), ...managedShowCategories(), String(item.category ?? "")].filter(Boolean))].map((name) => ({ value: name, label: pretty(name) })),
        value: item.category ?? (currentView === "offers" ? "bundle" : managedShowCategories()[0] ?? "magic"),
      }),
      f("description", "Description", "textarea", { wide: true }),
      f("previewVideos", "Show videos", "textarea", {
        wide: true,
        value: ((item.previewVideos as string[] | undefined) ?? (item.previewVideo ? [String(item.previewVideo)] : [])).join("\n"),
        help: "One approved HTTPS video link per line, up to 6. MP4, WebM, YouTube and Vimeo play beside the photos. Other links open in a new tab. Remove a line to remove a video.",
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
  if (kind === "packages")
    fields.push(
      f(
        "bundleBreakMinutes",
        "Break between bundled shows (minutes)",
        "number",
        {
          value: item.bundleBreakMinutes ?? 10,
          min: 0,
          max: 60,
          help: "For bundles, duration, setup and venue needs are calculated from the included shows. Use a fixed total price.",
        },
      ),
    );
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
      f("draft", "Message draft / preparation notes", "textarea", {
        wide: true,
      }),
      f("marketing", "This is an offer or marketing follow-up", "checkbox", {
        wide: true,
      }),
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
  if (kind === "packages" || kind === "performers") {
    const photos = (item.gallery ?? []) as { url: string; caption: string }[];
    fields.push(
      f("gallery", "Gallery photos", "textarea", {
        wide: true,
        value: photos.map((p) => p.url + " | " + p.caption).join("\n"),
        help: "Up to 12 photos. One per line: HTTPS image link | description. Line order is display order. Remove a line to remove a photo. Leave empty until your pictures are ready.",
      }),
      f(
        "galleryApproved",
        "I have permission to publish these gallery photos",
        "checkbox",
        { wide: true, value: photos.length > 0 },
      ),
    );
  }
  if (kind === "packages")
    fields.push(
      f("coverPhotoNumber", "Main photo number", "number", {
        value: item.coverPhotoNumber ?? 1,
        min: 1,
        max: 12,
        help: "Choose which gallery photo appears on the outside card: 1 is the first photo, 2 is the second. Add or remove gallery photos above, then save.",
      }),
    );
  const builtInPhotos = kind === "packages"
    ? portfolioShowPhotos[String(item.id ?? key)] ?? demoShowPhotos[String(item.id ?? key)] ?? []
    : [];
  const builtInPhotoEditor = builtInPhotos.length
    ? `<fieldset class="built-in-photos"><legend>Photos already included</legend><p>Hide a photo you do not want to show. The main photo number above chooses the outside picture from the visible gallery.</p><div class="built-in-photo-grid">${builtInPhotos.map((photo) => `<label><img src="${e(photo.url)}" alt="${e(photo.caption)}" loading="lazy"><span><input type="checkbox" name="hiddenPhotoUrls" value="${e(photo.url)}" ${(item.hiddenPhotoUrls as string[] | undefined)?.includes(photo.url) ? "checked" : ""}> Hide this photo</span></label>`).join("")}</div></fieldset>`
    : "";
  const photoUploadEditor = kind === "packages"
    ? state!.uploadsEnabled
      ? '<div class="photo-upload"><label for="photo-upload">Add photos from your device</label><input id="photo-upload" type="file" accept="image/*" multiple><small>Photos resize automatically. After uploading, check publication permission and save this show.</small><p id="photo-upload-status" role="status"></p></div>'
      : '<p class="muted">Adding photos from your device is being prepared. You can add HTTPS photo links above now.</p>'
    : "";
  openDialog(
    `${key === "new" || duplicate ? "Add" : "Edit"} ${kind === "customers" ? "customer" : kind === "packages" ? currentView === "offers" ? "bundle" : "show" : kind === "performers" ? "performer" : kind === "blocks" ? "availability block" : kind === "referrals" ? "referral" : "follow-up"}`,
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
        : kind === "packages"
          ? choices(
              "bundleIds",
              state!.packages.filter(
                (p) => p.id !== key && !p.bundleIds?.length,
              ),
              (item.bundleIds as string[]) ?? [],
              "Included shows — choose at least two for a bundle; leave empty for a single show",
            ) + builtInPhotoEditor + photoUploadEditor
          : "",
    ),
  );
  on(modal, "#photo-upload", "change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    const status = modal.querySelector<HTMLElement>("#photo-upload-status")!;
    const gallery = modal.querySelector<HTMLTextAreaElement>("#f-gallery")!;
    input.disabled = true;
    try {
      for (const [position, file] of files.entries()) {
        status.textContent = `Preparing photo ${position + 1} of ${files.length}…`;
        const photo = await resizedPhoto(file);
        const response = await fetch("/api/manage/upload-photo", {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: photo,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Photo upload failed.");
        const caption = file.name.replace(/\.[^.]+$/, "").replace(/[|\r\n]/g, " ").slice(0, 100) || "Show photo";
        gallery.value += `${gallery.value.trim() ? "\n" : ""}${result.url} | ${caption}`;
      }
      status.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} ready. Save changes to publish.`;
      input.value = "";
    } finally {
      input.disabled = false;
    }
  });
  submit(modal.querySelector("form")!, async (data) => {
    const value = formValues(data, fields);
    if (kind === "packages") {
      value.bundleIds = selected(data, "bundleIds");
      value.hiddenPhotoUrls = selected(data, "hiddenPhotoUrls");
      value.hiddenVideoUrls = (item.hiddenVideoUrls as string[] | undefined) ?? [];
      value.previewVideos = String(value.previewVideos ?? "").split("\n").map((link) => link.trim()).filter(Boolean);
      value.previewVideo = "";
      if (currentView === "offers" && (value.bundleIds as string[]).length < 2)
        throw new Error("Choose at least two shows for your bundle.");
    }
    if (kind === "packages" || kind === "performers") {
      value.gallery = String(value.gallery ?? "")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const separator = line.indexOf("|");
          if (separator < 0)
            throw new Error(
              "Each photo needs an HTTPS link followed by | and a description.",
            );
          return {
            url: line.slice(0, separator).trim(),
            caption: line.slice(separator + 1).trim(),
            approved: !!value.galleryApproved,
          };
        });
      delete value.galleryApproved;
    }
    if (kind === "reminders") value.revision = item.revision ?? 0;
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
  if (kind === "customers") {
    const customer = state!.customers.find((item) => item.id === key);
    if (!customer) return;
    openDialog(
      `Delete ${customer.name}?`,
      `<p>This permanently removes a customer with no event, contact, reward or referral history. If they have an unused account, it is also removed. Customers with history must be kept so event and payment records remain accurate.</p><form><label for="delete-customer-name">Type the customer's exact name to confirm</label><input id="delete-customer-name" name="name" autocomplete="off" required><div class="form-error" role="alert"></div><div class="form-actions"><button type="submit" class="danger">Delete customer</button></div></form>`,
    );
    submit(modal.querySelector("form")!, async (data) => {
      await api(`/manage/customers/${key}`, "DELETE", { name: String(data.get("name") ?? "") });
      modal.close();
      await loadDashboard();
      notify("Customer deleted.");
    });
    return;
  }
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
      options: options(["sales", "manager", "accountant", "performer", "assistant", "owner"]),
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
    { key: "viewCompanyCalendar", label: "Let this artist see the company calendar (dates and status only)", type: "checkbox", wide: true },
  ];
  openDialog(
    "Invite someone backstage",
    formBody(
      fields,
      '<p class="privacy">Share initial credentials privately. Managers run events and shows; Sales handles customers and proposals; Accountants record payments and costs. Only the owner controls business settings, exports, logins and permanent deletion. Artists see their assigned jobs.</p>',
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
        u.role === "admin" ? ["admin"] : ["owner", "manager", "sales", "accountant", "assistant", "performer"],
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
    { key: "viewCompanyCalendar", label: "Let this artist see the company calendar (dates and status only)", type: "checkbox", value: u.viewCompanyCalendar, wide: true },
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
function artistConfirmationSection(b: Booking) {
  if (state!.user.role === "performer") {
    const performerId = state!.user.performerId ?? "";
    const response = b.availability[performerId] ?? "pending";
    const closed = ["cancelled", "completed"].includes(b.status) || b.date < localToday();
    return `<section class="panel"><h3>Your job confirmation</h3><p>${response === "available" ? "You confirmed this job." : response === "declined" ? "You declined this job. Please contact the organizer if this changes." : "Please check the date, venue and your assigned shows before replying."}</p>${b.availabilityResponses?.[performerId] ? `<p class="muted">Last response: ${e(new Date(b.availabilityResponses[performerId].at).toLocaleString("en-GB"))}</p>` : ""}${closed ? "" : `<div class="actions"><button type="button" data-job-response="available" ${response === "available" ? "disabled" : ""}>Confirm job</button><button type="button" class="outline" data-job-response="declined" ${response === "declined" ? "disabled" : ""}>Decline job</button></div>`}</section>`;
  }
  return `<section class="panel"><h3>Artist confirmations</h3>${b.performerIds.map((p) => { const response = b.availabilityResponses?.[p]; return `<div class="row"><span>${e(state!.performers.find((v) => v.id === p)?.name ?? "Artist")}<br><small>${response ? `Responded ${e(new Date(response.at).toLocaleString("en-GB"))} · ${e(response.by)}` : "No response time recorded"}</small></span>${`<span class="badge ${e(b.availability[p] ?? "pending")}">${b.availability[p] === "available" ? "Confirmed" : e(pretty(b.availability[p] ?? "pending"))}</span>`}<select aria-label="Availability for ${e(state!.performers.find((v) => v.id === p)?.name)}" data-availability="${e(p)}" ${["cancelled", "completed"].includes(b.status) ? "disabled" : ""}>${["pending", "available", "declined"].map((v) => `<option value="${v}" ${b.availability[p] === v ? "selected" : ""}>${pretty(v)}</option>`).join("")}</select></div>`; }).join("") || '<p class="muted">Assign artists using Edit event details before confirming.</p>'}<p class="muted">Backups: ${e(b.backupPerformerIds.map((p) => state!.performers.find((v) => v.id === p)?.name).join(", ") || "None assigned")}</p><button id="refer-event" class="small outline">＋ Track a referral</button></section>`;
}
function artistCompletionSection(b: Booking) {
  if (state!.user.role === "sales") return "";
  if (state!.user.role === "performer") {
    const completion = b.artistCompletion?.[state!.user.performerId ?? ""];
    if (completion) return `<section class="panel"><h3>Job completed ✓</h3><p>Recorded ${e(new Date(completion.at).toLocaleString("en-GB"))}.</p>${completion.notes ? `<p>${e(completion.notes)}</p>` : ""}</section>`;
    if (!["confirmed", "completed"].includes(b.status) || b.date > localToday()) return "";
    return `<section class="panel"><h3>After the show</h3><p>Tell the organizer how your assignment went.</p><button type="button" id="artist-complete-job">Job completed ↗</button></section>`;
  }
  return `<section class="panel"><h3>Artist completion</h3>${b.performerIds.map((performerId) => { const done = b.artistCompletion?.[performerId]; return `<div class="row"><div><strong>${e(state!.performers.find((p) => p.id === performerId)?.name ?? "Artist")}</strong><p>${done ? `Completed ${e(new Date(done.at).toLocaleString("en-GB"))}` : "Awaiting artist completion"}</p>${done?.notes ? `<p>Notes: ${e(done.notes)}</p>` : ""}${done?.problems ? `<p>Problems: ${e(done.problems)}</p>` : ""}${done?.extraExpense ? `<p>Reported extra expense: ${money(done.extraExpense)} · Review before recording payment</p>` : ""}</div>${badge(done ? "completed" : "pending")}</div>`; }).join("") || '<p class="muted">No artists assigned.</p>'}</section>`;
}
async function openBooking(key: string) {
  const b = state!.bookings.find((b) => b.id === key)!;
  const c = state!.customers.find((c) => c.id === b.customerId);
  const checks = await api<{
    issues: string[];
    assignments?: {
      label: string;
      at: string;
      date: string;
      duration: number;
    }[];
    timetable: { label: string; at: string; duration: number }[];
    totals?: { agreed: number; paid: number; balance: number; deposit: number };
  }>(`/manage/bookings/${b.id}/checks`);
  openDialog(
    b.name,
    `<div class="booking-banner">${badge(b.status)}<small>Revision ${b.revision} · ${e(state!.business.timezone)}</small></div>${requestedServicesSummary(b)}<div class="details-grid"><div><small>Date & show time</small><strong>${day(b.date)} · ${e(b.time)}</strong></div><div><small>Venue</small><strong>${e(b.location)}</strong><br><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.location)}" target="_blank" rel="noopener noreferrer">Directions ↗</a></div><div><small>Customer</small><strong>${e(c?.name ?? "Assigned event")}</strong>${c ? `<p>${e(c.phone)} · ${e(c.email)}</p>` : ""}</div><div><small>Audience & setup</small><strong>${b.audience} guests · Age ${b.age} · ${b.space} m²</strong><p>${b.indoor ? "Indoor" : "Outdoor"} · ${b.power ? "Electricity available" : "No electricity"}</p></div></div>${checks.issues.length ? `<ul class="warn-list">${checks.issues.map((i) => `<li>${e(i)}</li>`).join("")}</ul>` : '<p class="success">✓ No venue or scheduling conflicts found for the current selection.</p>'}<div class="tabs">${state!.user.role !== "performer" ? '<button id="edit-event" class="outline small">Edit event details</button><button id="quote-event" class="outline small">Build quote options</button><button id="customer-link" class="outline small">Create / replace private link</button><button id="event-money" class="outline small">Record payment / cost</button>' : ""}<button id="print-event" class="outline small">Print show-day card</button></div>${artistConfirmationSection(b)}${checks.assignments ? `<section class="panel"><h3>Your assigned shows</h3>${checks.assignments.length ? `<ul class="timeline">${checks.assignments.map((t) => `<li><time>${day(t.date)} · ${e(t.at)}</time><span>${e(t.label)} · ${t.duration} min</span></li>`).join("")}</ul>` : `<p class="muted">No individual shows assigned yet. Ask the organizer to confirm your role.</p>`}<p class="hint">${b.status === "cancelled" ? "This event is cancelled." : b.status === "completed" ? "This event is completed; assignments are shown for reference." : "Plan for the full event, including arrival, setup and pack-down. Your availability covers the entire event; show times alone do not shorten it."}</p></section>` : ""}<section class="panel"><h3>The running order</h3><ul class="timeline">${checks.timetable.map((t) => `<li><time>${e(t.at)}</time><span>${e(t.label)}${t.duration ? ` · ${t.duration} min` : ""}</span></li>`).join("")}</ul><p class="muted">Travel buffer: ${b.travel} minutes each side. Default changeovers: ${b.breakMinutes} minutes. ${b.runningOrder ? "Custom running order applied." : ""} Pack-down: ${b.teardown ?? 0} minutes.</p><p>${e(b.venueNotes)}</p></section>${
      staffCan("referrals")
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
    }${checks.totals ? `<section class="panel"><h3>The proposal & payments</h3><p>Agreed ${money(checks.totals.agreed)} · Collected ${money(checks.totals.paid)} · Balance ${money(checks.totals.balance)}</p>${b.paymentTerms ? `<p><strong>Payment agreement:</strong> ${e(b.paymentTerms)}</p>` : ""}${b.quotes.map((q) => `<div class="row"><div><h3>${e(q.name)} ${q.id === b.acceptedQuoteId ? "✓ Accepted" : ""}</h3><p>${q.packageIds.map((p) => e(state!.packages.find((v) => v.id === p)?.name)).join(" + ")}</p><p>${e(q.notes)}</p>${rewardSummary(q)}</div><strong>${money(q.amount)}</strong></div>`).join("") || '<p class="muted">No proposal prepared yet.</p>'}</section>` : ""}${customSummary(b)}<section class="panel"><h3>Ready, set, showtime</h3><p><strong>Artist confirmation:</strong> ${b.performerIds.length ? `${b.performerIds.filter((performerId) => b.availability[performerId] === "available").length} of ${b.performerIds.length} confirmed` : "No artists assigned"}</p><form id="checklist-form">${b.checklist.map((ch, i) => `<label class="check"><input type="checkbox" name="check" value="${i}" ${ch.done ? "checked" : ""}>${e(ch.text)}</label>`).join("") || '<p class="muted">Add a checklist in event details, or confirm the event to use package preparation lists.</p>'}<div class="form-error" role="alert"></div><div class="form-actions"><button class="small outline" type="submit">Save checklist</button></div></form></section>${!["cancelled", "completed"].includes(b.status) && staffCan("status") ? `<div class="actions">${b.status !== "confirmed" ? `<button id="accept-event">Accept & confirm event</button>` : ""}${b.status === "confirmed" ? '<button id="complete-event" class="outline">Mark completed</button>' : ""}${["requested", "availability_pending", "quoted"].includes(b.status) ? '<button id="refuse-event" class="danger">Refuse request</button>' : ""}<button id="cancel-event" class="danger">Cancel event</button></div>` : ""}<p class="privacy">Schedule and venue edits require a fresh confirmation. Date, venue or performer changes reset performer availability. Cancellation preserves the record; refunds are recorded separately.</p>`,
  );
  const controls: [string, StaffAction][] = [["#edit-event", "events"], ["#quote-event", "quotes"], ["#customer-link", "links"], ["#event-money", "money"], ["#refer-event", "referrals"], ["[data-availability]", "availability"]];
  for (const [selector, action] of controls) if (!staffCan(action)) modal.querySelectorAll(selector).forEach((node) => node.remove());
  if (!staffCan("checklist")) {
    modal.querySelector("#checklist-form .form-actions")?.remove();
    modal.querySelectorAll<HTMLInputElement>("#checklist-form input").forEach((input) => { input.disabled = true; });
  }
  modal.querySelector(".booking-banner")?.insertAdjacentHTML("afterend", artistCompletionSection(b));
  if (["owner", "admin", "manager", "sales"].includes(state!.user.role) && (b.notes || b.giftDetails || b.surpriseDetails)) {
    const privateDetails = `<section class="panel private-planning"><h3>Customer’s planning notes</h3>${b.notes ? `<p>${e(b.notes)}</p>` : ""}${b.giftDetails ? `<p><strong>Gift for ${e(b.giftDetails.recipientName)}</strong>${b.giftDetails.flexibleDate ? " · Date is flexible" : ""}</p><p>${e(b.giftDetails.message)}</p>` : ""}${b.surpriseDetails ? `<div><strong>${b.surpriseDetails.proposal ? "Proposal plan" : "Surprise plan"}${b.surpriseDetails.guestName ? ` for ${e(b.surpriseDetails.guestName)}` : ""}</strong><p>Private detail: ${e(b.surpriseDetails.secret || "None supplied")}</p>${b.surpriseDetails.howWeMet ? `<p>How they met: ${e(b.surpriseDetails.howWeMet)}</p>` : ""}${b.surpriseDetails.specialMoment ? `<p>Sam’s moment: ${e(b.surpriseDetails.specialMoment)}</p>` : ""}</div>` : ""}<small>Keep surprise details within the event team.</small></section>`;
    modal.querySelector(".booking-banner")?.insertAdjacentHTML("afterend", privateDetails);
  }
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
  if (
    staffCan("staffing") &&
    ["accepted", "confirmed"].includes(b.status)
  ) {
    const button = document.createElement("button");
    button.className = "outline small";
    button.textContent = "Edit running order";
    button.addEventListener("click", () => editRunningOrder(b));
    modal.querySelector(".tabs")!.append(button);
    const staffing = document.createElement("button");
    staffing.className = "outline small";
    staffing.textContent = "Show staffing & agreed pay";
    staffing.addEventListener("click", () => {
      editActPlan(b).catch((err) => notify(err.message));
    });
    modal.querySelector(".tabs")!.append(staffing);
  }
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
    staffCan("extraAnswers") &&
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
  on(modal, "[data-job-response]", "click", async (ev) => {
    const response = (ev.currentTarget as HTMLElement).dataset.jobResponse;
    if (!response || !state!.user.performerId) return;
    await api(`/manage/bookings/${b.id}/availability`, "POST", {
      revision: b.revision,
      performerId: state!.user.performerId,
      state: response,
    });
    await loadDashboard();
    await openBooking(b.id);
    notify(response === "available" ? "Your job is confirmed." : "Your response has been sent to the organizer.");
  });
  on(modal, "#artist-complete-job", "click", () => {
    const fields: Field[] = [
      { key: "notes", label: "How did the show go?", type: "textarea", wide: true },
      { key: "problems", label: "Any problems to report?", type: "textarea", wide: true },
      { key: "extraExpense", label: "Extra expense to review (USD)", type: "number", min: 0, step: "0.01", value: 0 },
    ];
    openDialog("Complete your job", formBody(fields, '<p class="hint">An extra expense is a report for the organizer to review; it is not an automatic payment.</p>', "Save completion"));
    submit(modal.querySelector("form")!, async (data) => {
      const values = formValues(data, fields);
      await api(`/manage/bookings/${b.id}/artist-completion`, "POST", { ...values, extraExpense: Math.round(Number(values.extraExpense) * 100), revision: b.revision });
      await loadDashboard();
      await openBooking(b.id);
      notify("Your completion is recorded.");
    });
  });
  for (const [selector, status] of [
    ["#complete-event", "completed"],
    ["#cancel-event", "cancelled"],
  ])
    on(modal, selector, "click", () => statusForm(b, status));
  on(modal, "#refuse-event", "click", () => statusForm(b, "declined"));
  on(modal, "#accept-event", "click", () => acceptanceForm(b));
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
  if (state!.user.role === "sales") {
    modal.querySelectorAll<HTMLInputElement>('[name="performerIds"], [name="backupPerformerIds"], [name="checklist"]').forEach((input) => { input.disabled = true; });
    modal.querySelector("form")?.insertAdjacentHTML("afterbegin", '<p class="hint">Artist assignments and preparation checklists are managed by the owner or manager.</p>');
  }
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
      performerIds: state!.user.role === "sales" ? b.performerIds : selected(data, "performerIds"),
      backupPerformerIds: state!.user.role === "sales" ? b.backupPerformerIds : selected(data, "backupPerformerIds"),
      ...(state!.user.role === "sales" ? { checklist: b.checklist } : {}),
      revision: b.revision,
    });
    await loadDashboard();
    await openBooking(b.id);
    notify("Event updated.");
  });
}
async function editActPlan(b: Booking) {
  const data = await api<{ plan: ActPlan; revision: number; shows: Package[] }>(
    `/manage/bookings/${b.id}/act-plan`,
  );
  const fields: Field[] = data.shows.flatMap((show, i) => {
    const row = data.plan.rows.find((r) => r.packageId === show.id);
    return [
      {
        key: "performer-" + i,
        label: show.name + " · performer",
        type: "select",
        value: row?.performerId ?? "",
        options: [
          { value: "", label: "Unassigned" },
          ...b.performerIds.map((id) => ({
            value: id,
            label: state!.performers.find((p) => p.id === id)?.name ?? id,
          })),
        ],
      },
      {
        key: "pay-" + i,
        label: show.name + " · agreed pay (" + state!.business.currency + ")",
        type: "number",
        value: (row?.agreedPay ?? 0) / 100,
        min: 0,
        max: 1000000,
        step: "0.01",
        required: true,
      },
    ];
  });
  fields.push({
    key: "notes",
    label: "Private staffing notes",
    type: "textarea",
    value: data.plan.notes,
    wide: true,
  });
  openDialog(
    "Show staffing & agreed pay",
    formBody(
      fields,
      "<p>Owner and manager access. Choose from the event’s assigned performers. Leave a show unassigned to remove its plan. Saving requires fresh availability and confirmation. All assigned performers remain reserved for the full event including travel/setup/pack-down. Agreed pay is a plan, not a paid expense; record actual payments separately.</p>",
    ),
  );
  submit(modal.querySelector("form")!, async (values) => {
    const rows = data.shows.flatMap((show, i) => {
      const performerId = String(values.get("performer-" + i) ?? "");
      const amount = Number(values.get("pay-" + i));
      if (!performerId && amount !== 0)
        throw new Error(
          "Choose a performer for each agreed payment, or set unassigned pay to zero.",
        );
      return performerId
        ? [
            {
              packageId: show.id,
              performerId,
              agreedPay: Math.round(amount * 100),
            },
          ]
        : [];
    });
    await api(`/manage/bookings/${b.id}/act-plan`, "PUT", {
      revision: data.revision,
      rows,
      notes: String(values.get("notes") ?? ""),
    });
    state = await api<Dashboard>("/manage/state");
    renderDashboard();
    await openBooking(b.id);
  });
}
function editRunningOrder(b: Booking) {
  const quote = b.quotes.find((q) => q.id === b.acceptedQuoteId)!;
  const shows =
    quote.packageSnapshot ??
    quote.packageIds.map((id) => state!.packages.find((p) => p.id === id)!);
  const sorted = shows.slice().sort((a, c) => {
    const rank = (id: string) =>
      b.runningOrder?.findIndex((row) => row.packageId === id) ?? -1;
    return rank(a.id) - rank(c.id);
  });
  const fields: Field[] = sorted.flatMap((show, i) => [
    {
      key: "order-" + i,
      label: show.name + " · position",
      type: "select",
      value: String(i),
      options: sorted.map((_, n) => ({
        value: String(n),
        label: String(n + 1),
      })),
    },
    {
      key: "break-" + i,
      label: show.name + " · break after (minutes)",
      type: "number",
      value:
        b.runningOrder?.find((r) => r.packageId === show.id)?.breakAfter ??
        (i === sorted.length - 1 ? 0 : b.breakMinutes),
      min: 0,
      max: 120,
      required: true,
    },
  ]);
  fields.push({
    key: "teardown",
    label: "Pack-down time after the final show (minutes)",
    type: "number",
    value: b.teardown ?? 0,
    min: 0,
    max: 240,
    required: true,
  });
  openDialog(
    "Plan the running order",
    formBody(
      fields,
      "<p>Choose a different position for each show. Set the final show’s break to zero. Show durations stay as agreed. Saving requires fresh performer availability and booking confirmation.</p>",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const rows = sorted.map((show, i) => ({
      packageId: show.id,
      breakAfter: Number(data.get("break-" + i)),
      position: Number(data.get("order-" + i)),
    }));
    if (new Set(rows.map((r) => r.position)).size !== rows.length)
      throw new Error("Choose a different position for each show.");
    await api(`/manage/bookings/${b.id}/running-order`, "PUT", {
      revision: b.revision,
      runningOrder: rows
        .sort((a, c) => a.position - c.position)
        .map(({ packageId, breakAfter }) => ({ packageId, breakAfter })),
      teardown: Number(data.get("teardown")),
    });
    state = await api<Dashboard>("/manage/state");
    renderDashboard();
    await openBooking(b.id);
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
  const wallet = await api<{ earned: number; manual: number; spent: number; balance: number }>(
    `/manage/customers/${b.customerId}/tokens`,
  );
  openDialog(
    "A little thank-you, carefully tracked",
    `<section class="panel token-admin"><span class="eyebrow">Referral tokens</span><h3>${wallet.balance} ready to use</h3><p>${wallet.earned} from referred friends · ${wallet.manual} added by you · ${wallet.spent} used</p>${tokenLadder()}<div class="actions"><button type="button" class="small" id="apply-tokens" ${b.status !== "quoted" || wallet.balance < 1 ? "disabled" : ""}>Use tokens on a magic quote</button><button type="button" class="outline small" id="adjust-tokens">Add or correct tokens</button></div><small>One token per referred friend after a Magic, Science or Bubbles show is completed and fully paid. Add extra tokens manually for more shows.</small></section>` +
    "<details><summary>Earlier rewards</summary><p>Issue a reward after reviewing qualifying events. Refunded events suspend unused rewards.</p>" +
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
      ) + "</details>",
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
  on(modal, "#adjust-tokens", "click", () => {
    openDialog("Adjust referral tokens", formBody([
      { key: "amount", label: "Tokens to add (negative number removes)", type: "number", min: -100, max: 100, required: true },
      { key: "reason", label: "Why?", required: true },
    ], "<p>Use this for extra shows or a correction. Every adjustment is recorded.</p>", "Save tokens"));
    submit(modal.querySelector("form")!, async (data) => {
      await api(`/manage/customers/${b.customerId}/tokens`, "POST", {
        amount: Number(data.get("amount")), reason: String(data.get("reason")),
      });
      await refresh();
    });
  });
  on(modal, "#apply-tokens", "click", () => {
    openDialog("Use tokens on a magic show", formBody([
      { key: "tokens", label: "Tokens to use", type: "select", options: [1, 2, 3, 4, 5]
        .filter((cost) => cost <= wallet.balance)
        .map((cost) => ({ value: String(cost), label: `${cost} token${cost === 1 ? "" : "s"} · ${cost === 5 ? "Free magic show" : `${cost * 10}% off`}` })) },
      { key: "quoteId", label: "Magic show quote", type: "select", options: b.quotes.map((quote) => ({ value: quote.id, label: `${quote.name} · ${money(quote.amount)}` })) },
    ], "<p>Tokens are used only when this reward is put on a quote. A cancelled booking returns them. Quote extra shows separately.</p>", "Apply token reward"));
    submit(modal.querySelector("form")!, async (data) => {
      await api(`/manage/bookings/${b.id}/token-reward`, "POST", {
        tokens: Number(data.get("tokens")), quoteId: data.get("quoteId"), revision: b.revision,
      });
      await loadDashboard();
      await openBooking(b.id);
    });
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
function confirmPermanentEvent(id: string) {
  const booking = state!.bookings.find((item) => item.id === id);
  if (!booking || booking.status !== "cancelled") return;
  openDialog("Delete this event permanently?", formBody([
    { key: "name", label: `Type the exact event name: ${booking.name}`, required: true, help: "This removes the event, its private link, reviews and linked reminders. It cannot be undone. Events with money or reward history cannot be deleted here." },
  ], "", "Delete permanently"));
  submit(modal.querySelector("form")!, async (data) => {
    await api(`/manage/bookings/${encodeURIComponent(id)}/permanent`, "DELETE", { name: data.get("name") });
    modal.close();
    await loadDashboard();
    notify("Event permanently deleted.");
  });
}
function acceptanceForm(b: Booking) {
  const agreed = b.quotes.find((quote) => quote.id === b.acceptedQuoteId)?.amount ?? 0;
  openDialog(`Accept & confirm ${b.name}?`, formBody([
    { key: "agreedAmount", label: "Total agreed with customer (USD)", type: "number", min: 0, step: "0.01", value: agreed / 100, required: true, help: "Enter the amount agreed for this event. A quoted amount is filled in automatically." },
    { key: "receivedAmount", label: "Payment received now (USD)", type: "number", min: 0, step: "0.01", value: 0, required: true, help: "Use 0 if the customer will pay later. Previously recorded payments remain in the event." },
    { key: "paymentTerms", label: "Payment agreement", type: "textarea", wide: true, required: true, value: "Balance to be paid after the event", help: "For example: deposit received, balance on the event day; or full payment after the show." },
    { key: "reason", label: "Internal confirmation note", type: "textarea", wide: true, required: true, help: "Record what you checked before accepting. Private surprise details should stay in the event notes." },
  ], '<p class="hint">This confirms the booking to the customer now. Check the date, venue and performer availability first. Zero payment received is allowed.</p>', "Accept, confirm & notify customer"));
  if (!staffCan("money")) {
    const received = modal.querySelector<HTMLInputElement>('[name="receivedAmount"]');
    if (received) { received.readOnly = true; received.setAttribute("aria-describedby", "payment-access-note"); }
    modal.querySelector("form")?.insertAdjacentHTML("afterbegin", '<p id="payment-access-note" class="hint">The owner or accountant records payments. You can confirm with payments already recorded, or an agreement to pay later.</p>');
  }
  submit(modal.querySelector("form")!, async (data) => {
    const result = await api<{ delivery: { email: string; push: string } }>(`/manage/bookings/${b.id}/accept`, "POST", {
      revision: b.revision,
      agreedAmount: Math.round(Number(data.get("agreedAmount")) * 100),
      receivedAmount: Math.round(Number(data.get("receivedAmount")) * 100),
      paymentTerms: String(data.get("paymentTerms") ?? ""),
      reason: String(data.get("reason") ?? ""),
    });
    await loadDashboard();
    await openBooking(b.id);
    notify(`Event confirmed.${result.delivery.email !== "sent" ? " Email is not connected or could not be delivered." : " Email sent."}`);
  });
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
      status === "cancelled" || status === "declined"
        ? '<p class="hint">The event and all payments stay in the history. Record any deposit refund separately.</p>'
        : "",
      status === "confirmed"
        ? "Check & confirm booking"
        : status === "completed"
          ? "Mark event completed"
          : status === "declined" ? "Refuse request & notify customer" : "Cancel event & notify customer",
    ),
  );
  submit(modal.querySelector("form")!, async (data) => {
    const result = await api<{ delivery?: { email: string; push: string } }>(`/manage/bookings/${b.id}/status`, "POST", {
      status: status === "declined" ? "cancelled" : status,
      declined: status === "declined",
      reason: data.get("reason"),
      revision: b.revision,
    });
    await loadDashboard();
    await openBooking(b.id);
    notify(`Event ${status}.${result.delivery ? result.delivery.email === "sent" ? " Email sent." : " Email is not connected or could not be delivered." : ""}`);
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
    { key: "performerId", label: "Artist paid (for an artist expense)", type: "select", options: [{ value: "", label: "Not an artist payment" }, ...state!.performers.map((p) => ({ value: p.id, label: p.name }))], help: "First set agreed pay in the event staffing plan. Advances and partial payments can be recorded separately." },
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
  startsAt: string;
}
let eventCountdownTimer: ReturnType<typeof setInterval> | undefined;
async function renderEvent() {
  const data = await api<EventPageData>("/event");
  catalog = {
    business: data.business,
    packages: data.packages,
    performers: data.performers,
    reviews: [],
  };
  const b = data.booking;
  if (eventCountdownTimer) clearInterval(eventCountdownTimer);
  const descriptions: Record<string, string> = {
    requested:
      "Your idea is in the box! We’ll review the details and check availability.",
    availability_pending:
      "We’re checking who can be there to make your day special.",
    quoted:
      "A few happy possibilities, made just for you. Choose your favourite below.",
    accepted:
      "Your proposal choice is saved. Sam will review it and confirm your event.",
    confirmed:
      "It’s happening! Your event is confirmed. Let the countdown begin.",
    completed:
      "Thank you for sharing your day with us. Tell us how it went below.",
    cancelled:
      b.declined ? "Sam cannot take this request. Please contact us to discuss another date or show." : "This event has been cancelled. Please contact the business about any remaining payment or refund.",
  };
  app.innerHTML = `<main id="main" class="event-page">${brand(data.business.name, data.business.logo)}<p class="eyebrow">Just for your celebration · Private event page</p><h1>${e(b.name)}</h1><span class="badge ${e(b.status)}">${e(customerStatus(b.status, b.declined))}</span><p class="lead">${e(descriptions[b.status])}</p>${customSummary(b)}${requestedServicesSummary(b)}<div class="progress">${[
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
    )}</div><section class="panel"><div class="details-grid"><div><small>When</small><strong>${day(b.date)} · ${e(b.time)}</strong><p>${e(data.business.timezone)}</p></div><div><small>Where</small><strong>${e(b.location)}</strong></div><div><small>Your audience</small><strong>${b.audience} guests · Main age ${b.age}</strong></div><div><small>Venue setup</small><strong>${b.indoor ? "Indoor" : "Outdoor"} · ${b.space} m² · ${b.power ? "Electricity" : "No electricity"}</strong></div></div>${!["completed", "cancelled"].includes(b.status) ? '<button id="event-details" class="outline small">Update venue & audience details</button>' : ""}</section>${b.quotes.length ? `<section><h2>Your happy possibilities</h2><div class="quote-options">${b.quotes.map((q) => `<article class="quote-card"><h3>${e(q.name)}</h3><p>${q.packageIds.map((p) => e(publicPackageLabel(data.packages.find((v) => v.id === p)?.name))).join(" + ")}</p><div class="amount">${money(q.amount)}</div>${b.status === "quoted" ? `<p>Proposed deposit: ${money(q.deposit)}</p>` : ""}<p>${e(q.notes)}</p>${rewardSummary(q)}${b.status === "quoted" ? `<button data-accept="${q.id}">Choose this option</button>` : q.id === b.acceptedQuoteId ? `<span class="badge ${b.status === "accepted" ? "accepted" : "confirmed"}">${b.status === "accepted" ? "Your preferred plan ✓" : "Confirmed plan ✓"}</span>` : ""}</article>`).join("")}</div>${b.status === "quoted" || b.status === "accepted" ? `<p class="privacy">Choosing a proposal saves your preference. Sam confirms the booking after checking the event details and performer availability.</p>` : ""}</section>` : ""}<section class="panel"><h2>The plan for your day</h2><ul class="timeline">${data.timetable.map((t) => `<li><time>${t.at}</time><span>${e(t.label)}${t.duration ? ` · ${t.duration} minutes` : ""}</span></li>`).join("")}</ul><small>Provisional until confirmed. The team reviews travel and setup.</small></section>${b.acceptedQuoteId ? `<section class="panel"><h3>Payments at a glance</h3><div class="details-grid"><div><small>Agreed total</small><strong>${money(data.totals.agreed)}</strong></div><div><small>Recorded payments</small><strong>${money(data.totals.paid)}</strong></div><div><small>Balance remaining</small><strong>${money(data.totals.balance)}</strong></div></div>${b.paymentTerms ? `<p><strong>Payment agreement:</strong> ${e(b.paymentTerms)}</p>` : ""}<p class="privacy">Please arrange payment directly with the business. This page does not collect card details.</p></section>` : ""}${b.status === "completed" ? `<section class="panel"><h2>How was your little moment of wonder?</h2><div class="actions">${[{ id: "", name: "Overall event" }, ...data.performers].map((p) => (data.reviewed.includes(p.id) ? `<span class="badge">${e(p.name)} reviewed ✓</span>` : `<button data-review="${p.id}" class="outline">Review ${e(p.name)}</button>`)).join("")}</div></section>` : ""}<footer class="footer"><span>Keep this link private. It gives access to your event.</span><a href="/b/${e(data.business.slug)}">Back to the shows ↗</a></footer></main>`;
  if (b.giftDetails) {
    const gift = document.createElement("section");
    gift.className = "gift-card";
    gift.innerHTML = `<span class="eyebrow">✦ A gift made of memories</span><h2>For ${e(b.giftDetails.recipientName)}</h2><p>${e(b.giftDetails.message || "A little wonder is on its way.")}</p><strong>${b.status === "confirmed" ? "Your magical day is booked" : "Your magical day is being planned"}</strong><small>${b.giftDetails.flexibleDate ? "The date will be decided together" : `${day(b.date)} · ${e(b.time)}`}</small><span class="gift-brand">Magic by Sam ✦</span><button type="button" id="print-gift" class="outline small">Print gift card</button>`;
    app.querySelector(".progress")?.after(gift);
    on(app, "#print-gift", "click", () => {
      document.body.classList.add("print-gift");
      window.addEventListener("afterprint", () => document.body.classList.remove("print-gift"), { once: true });
      window.print();
    });
  }
  if (b.status === "confirmed" && data.startsAt) {
    const countdown = document.createElement("section");
    countdown.className = "event-countdown";
    countdown.innerHTML = '<span class="eyebrow">✦ Your magic begins in</span><strong id="countdown-value"></strong><p>Your event mission: get ready to be surprised.</p>';
    app.querySelector(".progress")?.after(countdown);
    const updateCountdown = () => {
      const minutes = Math.max(0, Math.ceil((new Date(data.startsAt).getTime() - Date.now()) / 60000));
      const days = Math.floor(minutes / 1440);
      const hours = Math.floor(minutes % 1440 / 60);
      const remainder = minutes % 60;
      const target = countdown.querySelector("#countdown-value");
      if (target) target.textContent = minutes ? `${days} days · ${hours} hours · ${remainder} minutes` : "It's showtime!";
    };
    updateCountdown();
    eventCountdownTimer = setInterval(updateCountdown, 60000);
  }
  if (["confirmed", "completed"].includes(b.status)) {
    const certificate = document.createElement("section");
    certificate.className = "certificate-card";
    certificate.innerHTML = b.certificate
      ? `<span class="eyebrow">✦ Your starring moment</span><h2>Certificate of Wonder</h2><p>Presented to <strong>${e(b.certificate.starName)}</strong></p><p>Honorary assistant ${e(b.certificate.role)} for a magical day with Sam.</p><small>${day(b.date)} · Magic by Sam</small><div class="actions"><button type="button" id="print-certificate">Print certificate</button><button type="button" id="edit-certificate" class="outline">Change name</button></div>`
      : `<span class="eyebrow">✦ A keepsake for your star</span><h2>Make their day official.</h2><p>Create a personalized assistant magician or scientist certificate for a child or an adult.</p><button type="button" id="edit-certificate">Make certificate →</button>`;
    app.querySelector(".event-countdown, .progress")?.after(certificate);
    on(app, "#print-certificate", "click", () => {
      document.body.classList.add("print-certificate");
      window.addEventListener("afterprint", () => document.body.classList.remove("print-certificate"), { once: true });
      window.print();
    });
    on(app, "#edit-certificate", "click", () => {
      const certificateFields: Field[] = [
        { key: "starName", label: "Star’s name", value: b.certificate?.starName ?? "", required: true },
        { key: "role", label: "Assistant role", type: "select", value: b.certificate?.role ?? "magician", options: options(["magician", "scientist"]) },
      ];
      openDialog("A certificate for your star", formBody(certificateFields, "<p class=\"privacy\">Use the name you want to appear on the printable certificate.</p>", "Create certificate"));
      submit(modal.querySelector("form")!, async (form) => {
        await api("/event/certificate", "POST", formValues(form, certificateFields));
        modal.close();
        await renderEvent();
      });
    });
  }
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
    { key: "bestReaction", label: "The moment everyone reacted", type: "textarea", wide: true },
    { key: "personalMoment", label: "A personal moment you loved", type: "textarea", wide: true },
    { key: "rememberedDetail", label: "One detail you will remember", type: "textarea", wide: true },
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
  document.body.classList.add("customer-surface");
  if (location.pathname === "/event") {
    await renderEvent();
    return;
  }
  const slug = location.pathname.startsWith("/b/")
    ? location.pathname.split("/")[2]
    : (await api<{ slug: string }>("/default-business")).slug;
  catalog = await api<Catalog>(`/public/${encodeURIComponent(slug)}`);
  restoreEventBox();
  renderPublic();
  offerNotification();
  setInterval(() => { if (!document.hidden) offerNotification(); }, 60_000);
  const linkOptions = new URLSearchParams(location.search);
  if (linkOptions.get("reset") === "1") {
    customerResetComplete(
      linkOptions.get("username") ?? "",
      location.hash.slice(1),
    );
    history.replaceState(null, "", location.pathname);
  } else if (linkOptions.get("account") === "create") {
    customerAuth(false, true);
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
