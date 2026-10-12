import type { PublicPartner, PublicListing } from "./marketplace-public.js";

type Group = "venues" | "companies";
type MountOptions = { root: HTMLElement; businessSlug: string; phone: string; design: (occasion?: string) => void;
  account: () => void; open: (title: string, html: string) => void };
const e = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const iconPaths: Record<string, string> = {
  places: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M8 20v-7h8v7M2 10h20"/>',
  teams: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 4v3"/>',
  magic: '<path d="m4 20 12-12 4 4L8 24M14 10l4 4M4 3v6M1 6h6M18 1v4M16 3h4M21 17v5M19 20h4"/>',
  science: '<path d="M8 3h8M10 3v7L4 20h16l-6-10V3M7 15h10"/><circle cx="11" cy="17" r=".5"/>',
  decorate: '<path d="M4 3c0 10 16 10 16 0M8 8v6M16 8v6M12 9v11"/><circle cx="8" cy="17" r="3"/><circle cx="16" cy="17" r="3"/>',
  music: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
  food: '<path d="M3 3v6c0 4 6 4 6 0V3M6 3v18M17 3c-4 5-4 9 0 10v8M17 3v10"/>',
  sparkle: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  heart: '<path d="M20 4a6 6 0 0 0-8 1 6 6 0 0 0-8-1c-5 5 0 10 8 17 8-7 13-12 8-17Z"/>',
  event: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18M8 15h2M14 15h2"/>',
};
const icon = (name: string) => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.sparkle}</svg>`;
const cards = [
  ["Playgrounds & venues", "places", "#marketplace-playgrounds", "places"],
  ["Entertainment agencies", "teams", "#marketplace-agencies", "teams"],
  ["Artists & shows", "magic", "#shows", "shows"],
  ["Science & workshops", "science", "#sam-shows", "science"],
  ["Decoration & styling", "decorate", "#party-shows", "styling"],
  ["Music & sound", "music", "#event-extras", "music"],
  ["Food & cakes", "food", "#event-extras", "food"],
  ["Schools & festivals", "sparkle", "#marketplace-occasions", "schools"],
] as const;
type Directory = { partners: PublicPartner[]; total: number; next: string | null; workspaceReady: boolean };
async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" }); const data = await response.json();
  if (!response.ok) throw new Error(data.error || "We couldn't open this profile. Please try again.");
  return data as T;
}
function whatsapp(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return /^\d{7,16}$/.test(digits) ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : "";
}
async function directory(group: Group) {
  const partners: PublicPartner[] = []; let after = "", total: number, ready: boolean;
  do {
    const page = await get<Directory>(`/api/marketplace/public/directory?group=${group}${after ? "&after=" + encodeURIComponent(after) : ""}`);
    partners.push(...page.partners); after = page.next || ""; total = page.total; ready = page.workspaceReady;
  } while (after);
  return { partners, total, ready };
}

export function mountMarketplaceDiscovery(options: MountOptions) {
  const { root, phone, businessSlug } = options;
  if (businessSlug !== "magic-by-sam") return;
  document.body.classList.add("marketplace-mode");
  document.title = "Magic App · The people. The place. Your event.";
  const brandText = root.querySelector<HTMLElement>(".site-header .brand > span:last-child");
  if (brandText) brandText.innerHTML = 'Magic App<small class="mp-brand-note">by Magic by Sam</small>';
  const hero = root.querySelector<HTMLElement>(".hero");
  if (!hero) return;
  const previousImages = [...hero.querySelectorAll<HTMLImageElement>(".hero-gallery img")];
  const magicPhoto = previousImages[0]?.getAttribute("src") || "/portfolio/sam-magic-live-2.jpg";
  const sciencePhoto = previousImages[1]?.getAttribute("src") || "/portfolio/sam-science-live-1.jpg";
  hero.className = "mp-hero";
  hero.innerHTML = `<div class="mp-hero-copy"><p class="mp-kicker"><span aria-hidden="true">✦</span> More than a show. Your whole event.</p><h1>The people.<br>The place.<br><em>Your kind of magic.</em></h1><p class="mp-hero-note">Discover shows, playgrounds and creative teams. Bring the people, the place and the little details together.</p><div class="mp-hero-actions"><button type="button" id="help-choose">Design my event ${icon("sparkle")}</button><a class="mp-text-link" href="#marketplace-categories">Explore everything <span aria-hidden="true">↗</span></a></div><div class="mp-hero-foot"><span aria-hidden="true">◌</span> Your ideas first. Availability checked before confirmation.</div></div><div class="mp-hero-art" aria-label="Real moments from the existing event collection"><figure class="mp-photo mp-photo-main"><img src="${e(magicPhoto)}" alt="Sam performing magic at a real event" fetchpriority="high"><figcaption>Real shows. Real reactions.</figcaption></figure><figure class="mp-photo mp-photo-small"><img src="${e(sciencePhoto)}" alt="Sam presenting the Science Show"><figcaption>A little discovery.</figcaption></figure><div class="mp-orbit mp-orbit-one" aria-hidden="true">✧</div><div class="mp-orbit mp-orbit-two" aria-hidden="true">✦</div><span class="mp-art-note">Something wonderful<br>is taking shape.</span></div>`;
  hero.querySelector("#help-choose")!.addEventListener("click", () => options.design());
  for (const image of hero.querySelectorAll<HTMLImageElement>(".mp-photo img")) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.zoomPhoto = "";
    button.setAttribute("aria-label", `Enlarge ${image.alt}`); image.before(button); button.append(image);
  }
  const nav = root.querySelector(".site-nav");
  nav?.insertAdjacentHTML("afterbegin", '<a href="#marketplace-playgrounds">Playgrounds</a><a href="#marketplace-agencies">Entertainment agencies</a>');
  const categorySection = document.createElement("section"); categorySection.id = "marketplace-categories"; categorySection.className = "mp-categories";
  categorySection.innerHTML = `<div class="mp-section-intro"><div><p class="eyebrow">A world of possibilities</p><h2>What will make it yours?</h2></div><p>The whole collection, one celebration.</p></div><nav class="mp-category-grid" aria-label="Marketplace categories">${cards.map(([title, shape, target, theme]) => `<a class="mp-category mp-${theme}" href="${target}"><span class="mp-category-icon">${icon(shape)}</span><strong>${title}</strong><span class="mp-category-arrow" aria-hidden="true">↗</span></a>`).join("")}</nav>`;
  hero.after(categorySection);
  // Category links remain present even when the legacy catalogue has no F&B
  // records yet; route to the full shows section rather than a missing anchor.
  const occasions = document.createElement("section"); occasions.id = "marketplace-occasions"; occasions.className = "mp-occasions";
  occasions.innerHTML = `<div><span class="eyebrow">Start with your moment</span><h2>Big birthday?<br>School adventure?</h2></div><div class="mp-occasion-options">${[["Birthday", "Birthday"], ["School event", "School"], ["Festival", "Festival"], ["Corporate event", "Corporate"], ["Wedding", "Wedding"], ["Christmas", "Christmas"]].map(([value, title]) => `<button type="button" data-mp-occasion="${value}">${title}<span aria-hidden="true">↗</span></button>`).join("")}<p>Choose an occasion. Let’s shape your event together.</p></div>`;
  categorySection.after(occasions);
  occasions.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.addEventListener("click", () => options.design(button.dataset.mpOccasion)));
  const places = directorySection("venues", "marketplace-playgrounds", "Make room for happy", "Playgrounds & venues", "A place to play, celebrate and make memories.", phone);
  const agencies = directorySection("companies", "marketplace-agencies", "Big ideas. The right team.", "Entertainment agencies", "Creative companies and planners, with their own services and profiles.", phone);
  const shows = root.querySelector("#shows"); shows?.before(places, agencies);
  for (const link of categorySection.querySelectorAll<HTMLAnchorElement>("a")) if (!root.querySelector(link.hash)) link.href = "#shows";
  void populate(places, "venues", options); void populate(agencies, "companies", options);
  const footer = document.createElement("section"); footer.className = "mp-partner-invite";
  const join = whatsapp(phone, `Hello, I would like to join Magic App as an artist, playground or entertainment company. ${location.origin}${location.pathname}#marketplace-agencies`);
  footer.innerHTML = `<span class="mp-invite-mark" aria-hidden="true">✧</span><div><span class="eyebrow">Have something extraordinary to share?</span><h2>Your talent belongs here.</h2><p>Artists, playgrounds, creative companies and event suppliers: introduce your experience to us.</p></div>${join ? `<a class="button outline" href="${e(join)}" target="_blank" rel="noopener noreferrer">Introduce your business ↗</a>` : '<a class="button outline" href="/partner?account=customer">Apply to join ↗</a>'}`;
  root.querySelector("main")?.append(footer);
  const phoneNav = document.createElement("nav"); phoneNav.className = "mp-mobile-nav"; phoneNav.setAttribute("aria-label", "Marketplace quick navigation");
  phoneNav.innerHTML = `<a href="#main">${icon("sparkle")}<span>Explore</span></a><a href="#marketplace-categories">${icon("places")}<span>Categories</span></a><a href="#event-box">${icon("event")}<span>My event</span></a><a href="#marketplace-playgrounds">${icon("heart")}<span>Places</span></a><button type="button">${icon("teams")}<span>Account</span></button>`;
  phoneNav.querySelector("button")!.addEventListener("click", options.account); root.append(phoneNav);
  if (location.pathname.startsWith("/providers/")) void openProfile(location.pathname.split("/")[2], options);
}

function directorySection(group: Group, id: string, eyebrow: string, title: string, note: string, phone: string) {
  const section = document.createElement("section"); section.id = id; section.className = `mp-directory mp-directory-${group}`;
  const request = whatsapp(phone, `Hello, I would like help choosing ${group === "venues" ? "a playground or venue" : "an entertainment agency"} for my event. I'm looking at ${location.origin}${location.pathname}#${id}`);
  section.innerHTML = `<div class="mp-section-intro"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div><p>${note}</p></div><div class="mp-directory-layout"><div class="mp-directory-feature" aria-label="${group === "venues" ? "Playground and venue discovery" : "Agency and company discovery"}"><span class="mp-feature-symbol" aria-hidden="true">${icon(group === "venues" ? "places" : "teams")}</span><span class="mp-feature-label">${group === "venues" ? "THE PLACE" : "THE PEOPLE"}</span><h3>${group === "venues" ? "Little adventures.<br>Big memories." : "One idea.<br>A whole team."}</h3><p>${group === "venues" ? "Birthday celebrations or a little playtime. Tell us what kind of place you have in mind." : "From the welcome to the final detail, find a team that understands your occasion."}</p>${request ? `<a href="${e(request)}" target="_blank" rel="noopener noreferrer">Help me find ${group === "venues" ? "a place" : "a team"} <span aria-hidden="true">↗</span></a>` : '<a href="#event-box">Plan my event ↗</a>'}<span class="mp-feature-decoration" aria-hidden="true">✳</span></div><div class="mp-directory-results" aria-live="polite" aria-busy="true"><p class="muted">Opening the directory…</p></div></div>`;
  return section;
}
async function populate(section: HTMLElement, group: Group, options: MountOptions) {
  const results = section.querySelector<HTMLElement>(".mp-directory-results")!;
  try {
    const { partners, total, ready } = await directory(group);
    if (!section.isConnected) return;
    if (!partners.length) {
      results.innerHTML = `<div class="mp-directory-empty"><span class="eyebrow">Your next discovery</span><h3>${group === "venues" ? "Looking for a place that fits?" : "Bring your event idea to life."}</h3><p>${group === "venues" ? "Tell us your area, date and guest count. We’ll help you explore playground and venue options." : "Share your occasion and the services you need. We’ll help you explore the right creative team."}</p><p class="mp-directory-note">Partner profiles will appear here as they are approved. No availability is promised until checked.</p>${ready ? '<a class="mp-text-link" href="/partner?account=customer">Register your business ↗</a>' : '<a class="mp-text-link" href="#shows">Explore all the shows ↗</a>'}</div>`;
    } else {
      results.innerHTML = `<p class="mp-directory-count">${total} ${total === 1 ? "profile" : "profiles"} to explore</p><div class="mp-partner-grid">${partners.map(partner => `<article class="mp-partner-card"><span class="mp-partner-avatar" aria-hidden="true">${e(partner.name.slice(0, 1).toUpperCase())}</span><span class="mp-partner-type">${group === "venues" ? "Playground / venue" : "Company / agency"}</span><h3>${e(partner.name)}</h3><p>${e(partner.description)}</p><div class="mp-partner-tags">${partner.categories.map(value => `<span>${e(value)}</span>`).join("")}</div><button type="button" class="outline" data-mp-profile="${e(partner.slug)}">Explore profile ↗</button></article>`).join("")}</div>`;
      results.querySelectorAll<HTMLButtonElement>("[data-mp-profile]").forEach(button => button.addEventListener("click", () => void openProfile(button.dataset.mpProfile!, options)));
    }
  } catch {
    if (!section.isConnected) return;
    results.innerHTML = '<div class="mp-directory-empty"><h3>The directory couldn’t load.</h3><p>Your show catalogue is still here. Try opening the partner directory again.</p><button type="button" class="outline">Try again</button></div>';
    results.querySelector("button")!.addEventListener("click", () => void populate(section, group, options));
  } finally { results.setAttribute("aria-busy", "false"); }
}
async function openProfile(slug: string, options: MountOptions) {
  try {
    let partner: PublicPartner | undefined, after = ""; const listings: PublicListing[] = [];
    do {
      const page = await get<{ partner: PublicPartner; listings: PublicListing[]; next: string | null }>(`/api/marketplace/public/providers/${encodeURIComponent(slug)}${after ? "?after=" + encodeURIComponent(after) : ""}`);
      partner = page.partner; listings.push(...page.listings); after = page.next || "";
    } while (after);
    if (!partner) return;
    const providerPhone = partner.contact?.phone || "", url = `${location.origin}/providers/${partner.slug}`;
    const ask = whatsapp(providerPhone, `Hello ${partner.name}, I would like to ask about your services for my event. I'm looking at ${url}`)
      || whatsapp(options.phone, `Hello, I would like help with ${partner.name} for my event. I'm looking at ${url}`);
    options.open(partner.name, `<div class="mp-public-profile"><span class="eyebrow">${partner.kind === "venue_operator" ? "Playground / venue" : partner.kind === "company" ? "Company / agency" : "Artist"}</span><p class="mp-profile-description">${e(partner.description)}</p><div class="mp-partner-tags">${partner.categories.map(value => `<span>${e(value)}</span>`).join("")}</div><h3>Services & experiences</h3>${listings.length ? `<div class="mp-profile-listings">${listings.map(value => `<article><h4>${e(value.title)}</h4><span>${value.kind === "birthday_package" ? "Birthday package" : value.kind === "playground_entry" ? "Playground entry" : "Show / service"}</span></article>`).join("")}</div>` : '<p>Ask about the experiences available from this partner.</p>'}<p class="privacy">Dates, location, arrangements and confirmation are agreed before booking. Contacting a partner does not confirm a reservation.</p><div class="actions">${ask ? `<a class="button" href="${e(ask)}" target="_blank" rel="noopener noreferrer">${whatsapp(providerPhone, "test") ? "Chat with " + e(partner.name) : "Ask Magic App about this partner"} ↗</a>` : '<a class="button" href="#event-box">Open my event</a>'}<a class="mp-text-link" href="${e(url)}">Profile link ↗</a></div></div>`);
  } catch (error) { options.open("This profile isn’t available", `<p>${e(error instanceof Error ? error.message : "Please try again.")}</p><p>Explore the current directory or ask us for help choosing a partner.</p>`); }
}
