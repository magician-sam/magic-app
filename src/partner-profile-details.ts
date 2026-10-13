import type { Organization } from "./marketplace.js";
import { locationView, mediaView } from "./venue-profile-view.js";
const e = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function mediaRow(item?: NonNullable<Organization["publicMedia"]>[number]) {
  return `<div class="partner-media-row"><label>Media type<select name="media-kind"><option value="photo">Photo</option><option value="video" ${item?.kind === "video" ? "selected" : ""}>Video</option></select></label><label>Media link<input name="media-url" value="${e(item?.url)}" maxlength="2000" placeholder="https://…/venue.jpg"><small>Direct HTTPS photo/video link or a file already in the app library.</small></label><label>Caption / description<input name="media-caption" value="${e(item?.caption)}" maxlength="200"></label><label>Permission / owner reference<input name="media-permission" value="${e(item?.permissionReference)}" maxlength="1000"><small>Private review note; include who owns it and your permission to publish. Never put passwords here.</small></label><button class="quiet" type="button" data-remove-profile-media>Remove this media</button></div>`;
}
export function profileDetailFields(value?: Organization) {
  const place = value?.publicLocation;
  return `<section class="partner-details"><h3>Public location</h3><p class="muted">For a venue or branch: add the address customers may see after approval. Area search uses these fields, including alternate spellings.</p><div class="fields">${[["country", "Country"], ["region", "Region / district"], ["city", "City / town"], ["area", "Area / neighbourhood"], ["address", "Full street address"]].map(([key, label]) => `<label${key === "address" ? ' class="full"' : ""}>${label}<input name="location-${key}" maxlength="${key === "address" ? 500 : 100}" value="${e(place?.[key as "city"])}"></label>`).join("")}<label class="full">Other area spellings<input name="location-aliases" value="${e(place?.aliases.join(", "))}" placeholder="Beirut, Beyrouth, بيروت"><small>Separate English, Arabic or local spellings with commas. Use only names for this location.</small></label><label>Map latitude<input name="location-latitude" type="number" min="-90" max="90" step="any" value="${e(place?.coordinates?.latitude)}"></label><label>Map longitude<input name="location-longitude" type="number" min="-180" max="180" step="any" value="${e(place?.coordinates?.longitude)}"></label></div><p class="muted">City and full address are required when adding a location. The map pin is optional; enter both coordinates to use it.</p><h3>Photos & videos</h3><p class="muted">Up to 20 files. The first photo becomes the cover. Add a caption and permission reference for every file; the platform reviews media before publication.</p><div data-profile-media>${value?.publicMedia?.length ? value.publicMedia.map(mediaRow).join("") : mediaRow()}</div><button class="quiet" type="button" data-add-profile-media>+ Add a photo or video</button></section>`;
}
export function readProfileDetails(data: FormData) {
  const read = (key: string) => String(data.get("location-" + key) || "").trim();
  const latitude = read("latitude"), longitude = read("longitude");
  if (Boolean(latitude) !== Boolean(longitude)) throw new Error("Enter both map coordinates, or leave both empty.");
  const hasLocation = ["country", "region", "city", "area", "address", "aliases", "latitude", "longitude"].some(key => read(key));
  const kinds = data.getAll("media-kind"), captions = data.getAll("media-caption"), references = data.getAll("media-permission");
  const media = data.getAll("media-url").map((url, i) => ({ kind: String(kinds[i]), url: String(url).trim(), caption: String(captions[i] || "").trim(), permissionReference: String(references[i] || "").trim() })).filter(item => item.url || item.caption || item.permissionReference);
  return { publicLocation: hasLocation ? { country: read("country"), region: read("region"), city: read("city"), area: read("area"), address: read("address"), aliases: read("aliases").split(/[,،]/).map(value => value.trim()).filter(Boolean), ...(latitude ? { coordinates: { latitude: Number(latitude), longitude: Number(longitude) } } : {}) } : null, publicMedia: media };
}
export function bindProfileDetails(root: HTMLElement) {
  root.addEventListener("click", event => {
    const target = event.target as Element;
    const remove = target.closest<HTMLButtonElement>("[data-remove-profile-media]");
    if (remove && !remove.matches(":disabled")) remove.closest(".partner-media-row")?.remove();
    const add = target.closest<HTMLButtonElement>("[data-add-profile-media]");
    if (add && !add.matches(":disabled")) {
      const rows = add.closest(".partner-details")!.querySelector("[data-profile-media]")!;
      if (rows.children.length < 20) rows.insertAdjacentHTML("beforeend", mediaRow());
      rows.lastElementChild?.querySelector<HTMLInputElement>('input[name="media-url"]')?.focus();
    }
  });
}
export function reviewProfileDetails(value: Organization) {
  return locationView(value.publicLocation) + mediaView(value.publicMedia) + (value.publicMedia?.length ? `<details><summary>Private media permission notes</summary><ul>${value.publicMedia.map(item => `<li>${e(item.caption)}: ${e(item.permissionReference)}</li>`).join("")}</ul></details>` : "");
}
