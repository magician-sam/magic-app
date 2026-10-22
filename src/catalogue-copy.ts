import {inflatableItem} from './inflatable-catalogue.js';
import type { Business } from "./models.js";
import { catalogueName, catalogueDescription } from "./catalogue-settings.js";
import { copy, customerLanguage } from "./customer-i18n.js";
const e = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let current: Pick<Business, "catalogueAppearance"> = {};
function marked(
  b: Pick<Business, "catalogueAppearance">,
  key: string,
  fallback: string,
  field: "name" | "description",
) {
  current = b;
  if(field==='name'&&key.startsWith('service:'))fallback=inflatableItem(key.slice(8))?.name??fallback;
  const value =
    field === "name"
      ? catalogueName(b, key, fallback, customerLanguage())
      : catalogueDescription(b, key, fallback, customerLanguage());
  if (!b.catalogueAppearance?.[key]) return copy(fallback);
  return `<span data-catalogue-copy="${e(key)}" data-catalogue-field="${field}" data-catalogue-original="${e(fallback)}">${copy(value)}</span>`;
}
export const catalogueNameCopy = (
  b: Pick<Business, "catalogueAppearance">,
  key: string,
  fallback: string,
) => marked(b, key, fallback, "name");
export const catalogueDescriptionCopy = (
  b: Pick<Business, "catalogueAppearance">,
  key: string,
  fallback: string,
) => marked(b, key, fallback, "description");
document.addEventListener("customerlanguagechange", () => {
  document
    .querySelectorAll<HTMLElement>("[data-catalogue-copy]")
    .forEach((node) => {
      const key = node.dataset.catalogueCopy!,
        fallback = node.dataset.catalogueOriginal ?? "";
      node.innerHTML = copy(
        node.dataset.catalogueField === "description"
          ? catalogueDescription(current, key, fallback, customerLanguage())
          : catalogueName(current, key, fallback, customerLanguage()),
      );
    });
});
