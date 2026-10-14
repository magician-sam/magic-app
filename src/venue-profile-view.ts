import { h, copy } from "./customer-i18n.js";
import type { VenueLocation } from "./venue-details.js";
import type { PublicPartner } from "./marketplace-public.js";

const e = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function addressText(value: VenueLocation) {
  return [...new Set([value.address, value.area, value.city, value.region, value.country].filter(Boolean))].join(", ");
}
export function locationView(value?: VenueLocation | null) {
  if (!value) return "";
  const query = value.coordinates ? `${value.coordinates.latitude},${value.coordinates.longitude}` : addressText(value);
  return h`<section class="mp-profile-location"><h3>Find us here</h3><address>${e(addressText(value))}</address><a class="outline button" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}" target="_blank" rel="noopener noreferrer">Open location in Maps ↗</a><small>${value.coordinates ? copy("Pin supplied by the venue.") : copy("Map search uses the supplied address; confirm the entrance with the venue.")}</small></section>`;
}
export function mediaView(media: PublicPartner["media"] = []) {
  if (!media.length) return "";
  return h`<section class="mp-profile-media"><h3>A look around</h3><div class="gallery-grid">${media.map(item => h`<figure>${item.kind === "photo" ? h`<button type="button" class="zoom-photo" data-zoom-photo aria-label="Enlarge ${e(item.caption)}"><img src="${e(item.url)}" alt="${e(item.caption)}" loading="lazy" referrerpolicy="no-referrer"></button>` : h`<video controls playsinline preload="none" aria-label="${e(item.caption)}" src="${e(item.url)}"></video>`}<figcaption>${e(item.caption)}</figcaption></figure>`).join("")}</div></section>`;
}
export function partnerCardView(partner: PublicPartner, venue: boolean) {
  const cover = partner.media?.find(item => item.kind === "photo");
  const place = partner.location ? [...new Set([partner.location.area, partner.location.city].filter(Boolean))].join(" · ") : "";
  return h`<article class="mp-partner-card">${cover ? h`<img class="mp-partner-cover" src="${e(cover.url)}" alt="${e(cover.caption)}" loading="lazy" referrerpolicy="no-referrer">` : h`<span class="mp-partner-avatar" aria-hidden="true">${e(partner.name.slice(0, 1).toUpperCase())}</span>`}<span class="mp-partner-type">${venue ? copy("Playground / venue") : copy("Company / agency")}</span><h3>${e(partner.name)}</h3>${place ? h`<p class="mp-partner-place">${e(place)}</p>` : ""}<p>${e(partner.description)}</p><div class="mp-partner-tags">${partner.categories.map(value => h`<span>${e(value)}</span>`).join("")}</div><button type="button" class="outline" data-mp-profile="${e(partner.slug)}">Explore profile ↗</button></article>`;
}
