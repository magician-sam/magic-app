import { h, t, copy, setCopy } from "./customer-i18n.js";
import { playtownCard, openPlaytown } from './playtown-client.js';
import { playtownMatches } from './playtown.js';
import { matchesMultilingual } from './multilingual-search.js';
import { locationView, mediaView, partnerCardView } from "./venue-profile-view.js";
import type { PublicPartner, PublicListing } from "./marketplace-public.js";
import { appendMarketplaceHelp, mountDiscoverySearch } from "./discovery-search.js";

type Group = "venues" | "companies";
type MountOptions = { root: HTMLElement; businessSlug: string; phone: string; photoSearchTags?:Record<string,string[]>; design: (occasion?: string) => void;
  reserve: (kind:'visit'|'party') => void; account: () => void; open: (title: string, html: string) => void };
const e = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const iconPaths: Record<string, string> = {
  places: h('<path d="m3 10 9-7 9 7v10H3Z"/><path d="M8 20v-7h8v7M2 10h20"/>'),
  teams: h('<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 4v3"/>'),
  magic: h('<path d="m4 20 12-12 4 4L8 24M14 10l4 4M4 3v6M1 6h6M18 1v4M16 3h4M21 17v5M19 20h4"/>'),
  science: h('<path d="M8 3h8M10 3v7L4 20h16l-6-10V3M7 15h10"/><circle cx="11" cy="17" r=".5"/>'),
  decorate: h('<path d="M4 3c0 10 16 10 16 0M8 8v6M16 8v6M12 9v11"/><circle cx="8" cy="17" r="3"/><circle cx="16" cy="17" r="3"/>'),
  music: h('<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>'),
  food: h('<path d="M3 3v6c0 4 6 4 6 0V3M6 3v18M17 3c-4 5-4 9 0 10v8M17 3v10"/>'),
  gift: h('<path d="M3 10h18v4H3ZM5 14v8h14v-8M12 10v12"/><path d="M12 10C4 10 4 3 8 3c3 0 4 7 4 7Zm0 0c8 0 8-7 4-7-3 0-4 7-4 7Z"/>'),
  candle: h('<path d="M8 12h8v10H8ZM5 22h14M12 12V9"/><path d="M12 2c-5 5-4 7 0 7s5-2 0-7Z"/>'),
  camera: h('<path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/><path d="M18 10h1"/>'),
  sparkle: h('<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>'),
  heart: h('<path d="M20 4a6 6 0 0 0-8 1 6 6 0 0 0-8-1c-5 5 0 10 8 17 8-7 13-12 8-17Z"/>'),
  event: h('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18M8 15h2M14 15h2"/>'),
};
const icon = (name: string) => h`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.sparkle}</svg>`;
const cards = [
  ["Playgrounds & venues", "places", "#marketplace-playgrounds", "places", "Play visits & places to celebrate"],
  ["Entertainment agencies", "teams", "#marketplace-agencies", "teams", "Planners & creative event teams"],
  ["Artists & shows", "magic", "#shows", "shows", "Magic, circus, comedy & more"],
  ["Offers & bundles", "gift", "#offers", "offers", "Ready-made or made for you"],
  ["Science & workshops", "science", "#sam-shows", "science", "Discovery for curious minds"],
  ["Decoration & flowers", "decorate", "#event-styling", "styling", "Full styling, balloons or flowers"],
  ["Photography & video", "camera", "#photography-video", "capture", "Capture the people & the moment"],
  ["Music & sound", "music", "#event-extras", "music", "DJs, live acts & sound systems"],
  ["Food & cakes", "food", "#event-extras", "food", "Menus, treats & celebration cakes"],
  ["Baptism & Communion", "candle", "#family-celebrations", "milestones", "Celebrate a meaningful family moment"],
  ["Favours & keepsakes", "gift", "#favours-keepsakes", "keepsakes", "Thoughtful gifts for your guests"],
  ["Schools & festivals", "sparkle", "#marketplace-occasions", "schools", "Ideas for bringing a crowd together"],
] as const;
type Directory = { partners: PublicPartner[]; total: number; next: string | null; workspaceReady: boolean };
async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try { response = await fetch(path, { credentials: "same-origin" }); }
    catch (error) { if (attempt === 0) continue; throw error; }
    if (attempt === 0 && [408, 429, 500, 502, 503, 504].includes(response.status)) continue;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "We couldn't open this profile. Please try again.");
    return data as T;
  }
}
function whatsapp(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return /^\d{7,16}$/.test(digits) ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : "";
}
type DirectoryFilters = { area: string; q: string };
async function directory(group: Group, filters: DirectoryFilters) {
  const partners: PublicPartner[] = []; let after = "", total: number, ready: boolean;
  do {
    const page = await get<Directory>(`/api/marketplace/public/directory?group=${group}&area=${encodeURIComponent(filters.area)}&q=${encodeURIComponent(filters.q)}${after ? "&after=" + encodeURIComponent(after) : ""}`);
    partners.push(...page.partners); after = page.next || ""; total = page.total; ready = page.workspaceReady;
  } while (after);
  return { partners, total, ready };
}

export function mountMarketplaceDiscovery(options: MountOptions) {
  const { root, phone, businessSlug } = options;
  if (businessSlug !== "magic-by-sam") return;
  document.body.classList.add("marketplace-mode");
  document.title = t("Magic App · Set the scene. Make it yours.");
  document.body.classList.add("marketplace-world");
  const brandNode = root.querySelector<HTMLElement>(".site-header .brand");
  if (brandNode) { brandNode.innerHTML = h('<span class="world-brand-mark" aria-hidden="true">m<span>✦</span></span><span>Magic App<small class="mp-brand-note">THE EVENT MARKETPLACE</small></span>'); brandNode.setAttribute("aria-label", "Magic App event marketplace"); }
  const hero = root.querySelector<HTMLElement>(".hero");
  if (!hero) return;
  hero.className = "mp-hero world-hero";
  hero.innerHTML = h`<div class="mp-hero-copy"><p class="mp-kicker"><span aria-hidden="true">✦</span> The art of coming together</p><h1>Set the scene.<br>Bring the wonder.<br><em>Make it yours.</em></h1><p class="mp-hero-note">Artists, places & everything for your event.</p><div class="mp-hero-actions"><button type="button" id="help-choose">Build my event ${icon("sparkle")}</button><a class="mp-text-link" href="#marketplace-categories">Start exploring ↗</a></div><div class="world-hero-tags"><a href="#marketplace-playgrounds">Find a place ↗</a><a href="#marketplace-agencies">Find a team ↗</a><a href="#shows">Find an artist ↗</a></div></div><div class="world-event-board" aria-label="Ideas for your event"><span class="world-board-label">EVERY MOMENT STARTS WITH AN IDEA</span><div class="world-orbit" aria-hidden="true">✳</div><a class="world-board-card world-board-place" href="#marketplace-playgrounds">${icon("places")}<span>Set the scene<small>Playgrounds & venues</small></span><b>↗</b></a><a class="world-board-card world-board-people" href="#marketplace-agencies">${icon("teams")}<span>Meet the makers<small>Agencies & event creators</small></span><b>↗</b></a><a class="world-board-card world-board-fun" href="#shows">${icon("sparkle")}<span>Cue the wonder<small>Artists, shows & experiences</small></span><b>↗</b></a><p>A place. A talent. A finishing touch.<br><strong>Your event, composed by you.</strong></p></div>`;
  hero.querySelector("#help-choose")!.addEventListener("click", () => options.design());
  for (const image of hero.querySelectorAll<HTMLImageElement>(".mp-photo img")) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.zoomPhoto = "";
    button.setAttribute("aria-label", `Enlarge ${image.alt}`); image.before(button); button.append(image);
  }
  const nav = root.querySelector(".site-nav");
  nav?.insertAdjacentHTML("afterbegin", h('<a href="#marketplace-playgrounds">Playgrounds</a><a href="#marketplace-agencies">Entertainment agencies</a>'));
  const categorySection = document.createElement("section"); categorySection.id = "marketplace-categories"; categorySection.className = "mp-categories";
  categorySection.innerHTML = h`<div class="mp-section-intro"><div><h2>Explore categories</h2></div></div><nav class="mp-category-grid" aria-label="Marketplace categories">${cards.map(([title, shape, target, theme, description]) => h`<a class="mp-category mp-${theme}" href="${target}"><span class="mp-category-icon" aria-hidden="true">${icon(shape)}</span><span class="mp-category-copy"><strong>${copy(title)}</strong><small>${copy(description)}</small></span><span class="mp-category-arrow" aria-hidden="true">↗</span></a>`).join("")}</nav>`;
  hero.after(categorySection);
  const inspiration = document.createElement("section"); inspiration.className = "world-inspiration";
  inspiration.innerHTML = h`<div class="mp-section-intro"><div><h2>Event inspiration</h2></div></div><div class="world-inspiration-grid"><figure class="mp-photo mp-photo-main"><button type="button" data-zoom-photo aria-label="Enlarge celebration decoration"><img src="/portfolio/decoration/garden-birthday.jpg" alt="Garden birthday decoration from the event collection" loading="lazy"></button><figcaption>Decoration ideas</figcaption></figure><figure class="mp-photo mp-photo-small"><button type="button" data-zoom-photo aria-label="Enlarge live music"><img src="/portfolio/guest/live-music.jpg" alt="Live music performance from the event collection" loading="lazy"></button><figcaption>Live music</figcaption></figure><a class="world-inspiration-plan" href="#marketplace-occasions"><span aria-hidden="true">✳</span><h3>Make it yours.</h3><span>Choose your occasion ↗</span></a></div>`;
  categorySection.after(inspiration);
  const proof = root.querySelector(".show-proof"), signatures = root.querySelector("#sam-shows");
  if (proof && signatures) signatures.prepend(proof);
  const peopleHeading = root.querySelector("#performers h2"); if (peopleHeading) setCopy(peopleHeading, "Meet the artists");
  const footerLabel = root.querySelector(".footer > span"); if (footerLabel) setCopy(footerLabel, "✦ Magic App · The art of coming together.");
  const drawer = root.querySelector("#mobile-site-menu"); if (drawer) drawer.setAttribute("aria-label", "Explore the event marketplace");
  const drawerBrand = drawer?.querySelector(".mobile-menu-head > span"); if (drawerBrand) setCopy(drawerBrand, "✦ Magic App");
  const drawerIntro = drawer?.querySelector(".mobile-menu-intro p"); if (drawerIntro) setCopy(drawerIntro, "Artists, places & services");

  // Category links remain present even when the legacy catalogue has no F&B
  // records yet; route to the full shows section rather than a missing anchor.
  const occasions = document.createElement("section"); occasions.id = "marketplace-occasions"; occasions.className = "mp-occasions";
  occasions.innerHTML = h`<div><h2>What’s the occasion?</h2></div><div class="mp-occasion-options">${[["Birthday", "Birthday"], ["School event", "School"], ["Festival", "Festival"], ["Corporate event", "Corporate"], ["Wedding", "Wedding"], ["Christmas", "Christmas"], ["Baptism", "Baptism"], ["First Communion", "First Communion"]].map(([value, title]) => h`<button type="button" data-mp-occasion="${value}">${copy(title)}<span aria-hidden="true">↗</span></button>`).join("")}</div>`;
  inspiration.after(occasions);
  occasions.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.addEventListener("click", () => options.design(button.dataset.mpOccasion)));
  const family = document.createElement("section"); family.id = "family-celebrations"; family.className = "family-celebrations";
  family.innerHTML = h('<div class="mp-section-intro"><div><h2>Baptism & First Communion</h2></div></div><div class="family-occasion-grid"><article class="family-occasion family-baptism"><span class="family-occasion-art" aria-hidden="true">')+icon('heart')+h('</span><h3>Baptism</h3><p>Decor, favours & family moments.</p><button type="button" data-family-occasion="Baptism">Plan a baptism ↗</button></article><article class="family-occasion family-communion"><span class="family-occasion-art" aria-hidden="true">')+icon('candle')+h('</span><h3>First Communion</h3><p>Flowers, keepsakes & children’s fun.</p><button type="button" data-family-occasion="First Communion">Plan a communion ↗</button></article></div><nav class="family-detail-links" aria-label="Ideas for a family celebration"><a href="#event-styling">Balloons & flowers ↗</a><a href="#photography-video">Photos & films ↗</a><a href="#favours-keepsakes">Favours & keepsakes ↗</a></nav>');
  occasions.after(family);
  family.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.addEventListener("click", () => options.design(button.dataset.familyOccasion)));
  const places = directorySection("venues", "marketplace-playgrounds", "Playgrounds & venues", phone);
  const agencies = directorySection("companies", "marketplace-agencies", "Entertainment agencies", phone);
  const playButton = document.createElement("button"); playButton.type = "button"; playButton.className = "outline mp-plan-play";
  setCopy(playButton, "Plan a play visit ↗");
  playButton.addEventListener("click", () => options.design("Playground visit"));
  places.querySelector(".mp-directory-feature")!.append(playButton);
  const shows = root.querySelector("#shows"); shows?.before(places, agencies);
  for (const link of categorySection.querySelectorAll<HTMLAnchorElement>("a")) if (!root.querySelector(link.hash)) link.href = "#shows";
  const search = places.querySelector<HTMLFormElement>(".mp-venue-search")!;
  search.addEventListener("submit", event => {
    event.preventDefault(); const data = new FormData(search);
    void populate(places, "venues", options, { area: String(data.get("area") || "").trim(), q: String(data.get("q") || "").trim() });
  });
  search.querySelector('[data-clear-venues]')!.addEventListener("click", () => { search.reset(); void populate(places, "venues", options); });
  void populate(places, "venues", options); void populate(agencies, "companies", options);
  const footer = document.createElement("section"); footer.className = "mp-partner-invite";
  const join = whatsapp(phone, `Hello, I would like to join Magic App as an artist, playground or entertainment company. ${location.origin}${location.pathname}#marketplace-agencies`);
  footer.innerHTML = h`<span class="mp-invite-mark" aria-hidden="true">✧</span><div><h2>Join the marketplace</h2><p>For artists, venues & event businesses.</p></div>${join ? h`<a class="button outline" href="${e(join)}" target="_blank" rel="noopener noreferrer">Join us ↗</a>` : h('<a class="button outline" href="/partner?account=customer">Apply to join ↗</a>')}`;
  root.querySelector("main")?.append(footer);
  const phoneNav = document.createElement("nav"); phoneNav.className = "mp-mobile-nav"; phoneNav.setAttribute("aria-label", "Marketplace quick navigation");
  phoneNav.innerHTML = h`<a href="#main">${icon("sparkle")}<span>Explore</span></a><a href="#marketplace-categories">${icon("places")}<span>Categories</span></a><a href="#event-box">${icon("event")}<span>My event</span></a><a href="#marketplace-playgrounds">${icon("heart")}<span>Places</span></a><button type="button">${icon("teams")}<span>Account</span></button>`;
  phoneNav.querySelector("button")!.addEventListener("click", options.account); root.append(phoneNav);
  if (location.pathname.startsWith("/providers/")) void openProfile(location.pathname.split("/")[2], options);
  mountDiscoverySearch(root, () => options.design(), async query => {
    search.reset(); (search.elements.namedItem("q") as HTMLInputElement).value=query;
    await Promise.all([populate(places,"venues",options,{area:"",q:query}),populate(agencies,"companies",options,{area:"",q:query})]);
    return [places,agencies].filter(section=>section.querySelector('.playtown-card, .mp-partner-card')).map(section=>'#'+section.id);
  });
  appendMarketplaceHelp(root, businessSlug);
  if(location.hash==='#playtown') openPlaytown(options);
  root.addEventListener('click',event=>{const target=event.target as Element; if(target.closest('[data-playtown-open]'))openPlaytown(options);});
  const searchTop=root.querySelector('.discovery-search');
  if(searchTop) hero.before(searchTop);
  const categoryGrid=root.querySelector('.mp-categories'); if(categoryGrid) hero.before(categoryGrid);
  const context=document.createElement('div');context.className='marketplace-context';context.innerHTML=h('<a href="#marketplace-playgrounds">')+icon('places')+h('<span>Find your place<small>Explore by area ↗</small></span></a><button type="button">')+icon('event')+h('<span>Plan your occasion<small>Choose an event ↗</small></span></button>');hero.before(context);
  context.querySelector('button')!.addEventListener('click',()=>options.design());
}

function directorySection(group: Group, id: string, title: string, phone: string) {
  const section = document.createElement("section"); section.id = id; section.className = `mp-directory mp-directory-${group}`;
  const request = whatsapp(phone, `Hello, I would like help choosing ${group === "venues" ? "a playground or venue" : "an entertainment agency"} for my event. I'm looking at ${location.origin}${location.pathname}#${id}`);
  section.innerHTML = h`<div class="mp-section-intro"><div><h2>${copy(title)}</h2></div></div><div class="mp-directory-layout"><div class="mp-directory-feature" aria-label="${group === "venues" ? "Playground and venue discovery" : "Agency and company discovery"}"><span class="mp-feature-symbol" aria-hidden="true">${icon(group === "venues" ? "places" : "teams")}</span><span class="mp-feature-label">${group === "venues" ? copy("THE PLACE") : copy("THE PEOPLE")}</span><h3>${group === "venues" ? h("Play. Party. Celebrate.") : h("Find your event team.")}</h3>${request ? h`<a href="${e(request)}" target="_blank" rel="noopener noreferrer">${group === "venues" ? copy("Help me find a place") : copy("Help me find a team")} <span aria-hidden="true">↗</span></a>` : h('<a href="#event-box">Plan my event ↗</a>')}<span class="mp-feature-decoration" aria-hidden="true">✳</span></div><div class="mp-directory-results" aria-live="polite" aria-busy="true"><p class="muted">Opening the directory…</p></div></div>`;
  if (group === "venues") section.querySelector(".mp-directory-layout")!.insertAdjacentHTML("beforebegin", h`<form class="mp-venue-search" aria-label="Find a venue"><div class="mp-venue-search-intro"><h3>Find a place</h3></div><div class="mp-venue-search-fields"><label>Area or city<input type="search" name="area" maxlength="100" placeholder="Beirut, Jounieh, بيروت…"></label><label>Venue name or activity<input type="search" name="q" maxlength="200" placeholder="Optional: playground, birthday…"></label><div class="actions"><button type="submit">Find a place ↗</button><button type="button" class="link" data-clear-venues>Show all places</button></div></div></form>`);
  return section;
}
const directoryLoads = new WeakMap<HTMLElement, number>();
async function populate(section: HTMLElement, group: Group, options: MountOptions, filters: DirectoryFilters = { area: "", q: "" }) {
  const results = section.querySelector<HTMLElement>(".mp-directory-results")!;
  const load = (directoryLoads.get(section) || 0) + 1; directoryLoads.set(section, load);
  const current = () => section.isConnected && directoryLoads.get(section) === load;
  results.setAttribute("aria-busy", "true");
  const playTags=Object.entries(options.photoSearchTags??{}).filter(([url])=>url.startsWith('/playgrounds/playtown/')).flatMap(([,tags])=>tags);
  const pilot=group==='venues'&&playtownMatches(filters.area,'')&&(playtownMatches('',filters.q)||matchesMultilingual(playTags,filters.q))?playtownCard():'';
  results.innerHTML = pilot+h('<p class="muted">Finding your next setting…</p>');
  try {
    const { partners, total, ready } = await directory(group, filters);
    if (!current()) return;
    const filtered = Boolean(filters.area || filters.q);
    if (!partners.length) {
      const noMatches = (ready || group === "venues") && filtered;
      results.innerHTML = h`<div class="mp-directory-empty"><span class="eyebrow">Let’s set the scene</span><h3>${noMatches ? copy("No published places match yet.") : group === "venues" ? copy("Looking for a place that fits?") : copy("Need an event team?")}</h3><p>${noMatches ? copy("Try another area or show all places.") : group === "venues" ? copy("Share your area, date & guest count.") : copy("Tell us which services you need.")}</p><p class="mp-directory-note">${ready ? copy("Approved partners. Availability to confirm.") : copy("More partners coming soon. Availability to confirm.")}</p>${ready ? h('<a class="mp-text-link" href="/partner?account=customer">Register your business ↗</a>') : h('<a class="mp-text-link" href="#shows">Explore all the shows ↗</a>')}</div>`;
    } else {
      results.innerHTML = h`<p class="mp-directory-count">${total} ${total === 1 ? "place" : "places"} to explore${filters.area ? " · " + e(filters.area) : ""}</p><div class="mp-partner-grid">${partners.map(partner => partnerCardView(partner, group === "venues")).join("")}</div>`;
      results.querySelectorAll<HTMLButtonElement>("[data-mp-profile]").forEach(button => button.addEventListener("click", () => void openProfile(button.dataset.mpProfile!, options)));
    }
  } catch {
    if (!current()) return;
    results.innerHTML = h('<div class="mp-directory-empty"><h3>The directory couldn’t load.</h3><p>Your show catalogue is still here. Try opening the partner directory again.</p><button type="button" class="outline">Try again</button></div>');
    results.querySelector("button")!.addEventListener("click", () => void populate(section, group, options, filters));
  } finally { if (current()) { if(pilot) {results.insertAdjacentHTML('afterbegin',pilot);const empty=results.querySelector('.mp-directory-empty');if(empty)empty.remove();} results.setAttribute('aria-busy','false'); } }
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
    options.open(partner.name, h`<div class="mp-public-profile"><span class="eyebrow">${partner.kind === "venue_operator" ? copy("Playground / venue") : partner.kind === "company" ? copy("Company / agency") : copy("Artist")}</span><p class="mp-profile-description">${e(partner.description)}</p><div class="mp-partner-tags">${partner.categories.map(value => h`<span>${e(value)}</span>`).join("")}</div>${locationView(partner.location)}${mediaView(partner.media)}<h3>Services & experiences</h3>${listings.length ? h`<div class="mp-profile-listings">${listings.map(value => h`<article><h4>${e(value.title)}</h4><span>${value.kind === "birthday_package" ? "Birthday package" : value.kind === "playground_entry" ? copy("Playground entry") : copy("Show / service")}</span></article>`).join("")}</div>` : h('<p>Ask about the experiences available from this partner.</p>')}<p class="privacy">Dates, location, arrangements and confirmation are agreed before booking. Contacting a partner does not confirm a reservation.</p><div class="actions">${ask ? h`<a class="button" href="${e(ask)}" target="_blank" rel="noopener noreferrer">${whatsapp(providerPhone, "test") ? "Chat with " + e(partner.name) : copy("Ask Magic App about this partner")} ↗</a>` : h('<a class="button" href="#event-box">Open my event</a>')}<a class="mp-text-link" href="${e(url)}">Profile link ↗</a></div></div>`);
  } catch (error) { options.open("This profile isn’t available", h`<p>${e(error instanceof Error ? error.message : "Please try again.")}</p><p>Explore the current directory or ask us for help choosing a partner.</p>`); }
}
