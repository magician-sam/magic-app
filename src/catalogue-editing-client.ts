import type { Dashboard, Package } from "./models.js";
import {
  catalogueName,
  marketplaceCategoryCards,
  type CatalogueAppearance,
} from "./catalogue-settings.js";
import { userCanStaffAction } from "./staff-permissions.js";
type Options = {
  state: Dashboard;
  api: <T = unknown>(
    path: string,
    method?: string,
    body?: unknown,
  ) => Promise<T>;
  reload: () => Promise<void>;
  guestPhoto: (name: string) => { url: string; caption: string }[];
  showPhoto: (show: Package) => string;
  editGallery: (name: string) => void;
  editShow: (id: string) => void;
  editShowPhotos: (id: string) => void;
  editPrice: (id: string) => void;
  upload: (file: File) => Promise<string>;
};
const e = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function mountCatalogueEditing(root: Element, o: Options) {
  const b = o.state.business,
    canPrice =
      userCanStaffAction(o.state.user, "money") &&
      userCanStaffAction(o.state.user, "catalog");
  const intro = root.querySelector(".panel p");
  if (intro)
    intro.textContent =
      "Edit names, cover photos and prices here. Open Photos & videos for the full gallery.";
  const heading = root.querySelector(".panel h2");
  if (heading) heading.textContent = "Shows & services";
  const categoryPanel = document.createElement("section");
  categoryPanel.className = "panel catalogue-manager";
  categoryPanel.innerHTML = `<div class="section-heading"><div><h2>Homepage categories</h2><p>Change a category’s name or photo. Set individual prices on the shows and services below.</p></div></div><div class="catalogue-category-grid">${marketplaceCategoryCards
    .map(([name, , , key]) => {
      const value = b.catalogueAppearance?.["category:" + key];
      return `<article><div class="catalogue-tile-cover">${value?.cover ? `<img src="${e(value.cover)}" alt="" loading="lazy">` : '<span aria-hidden="true">✦</span>'}</div><h3>${e(catalogueName(b, "category:" + key, name))}</h3><button type="button" class="small outline" data-appearance-key="category:${key}" data-fallback-name="${e(name)}">Edit category</button></article>`;
    })
    .join("")}</div>`;
  root.prepend(categoryPanel);
  const shows = document.createElement("section");
  shows.className = "catalogue-show-manager";
  shows.innerHTML = `<h2>Your shows & bundles</h2><div class="profile-grid">${o.state.packages
    .map((p) => {
      const key = "show:" + p.id,
        name = catalogueName(
          b,
          key,
          (
            {
              magic: "Magic Show",
              science: "Science Show",
              bubbles: "Bubble Show",
            } as Record<string, string>
          )[p.category.toLowerCase()] ?? p.name,
        ),
        cover = b.catalogueAppearance?.[key]?.cover || o.showPhoto(p);
      return `<article class="panel catalogue-service-card">${cover ? `<img class="catalogue-preview" src="${e(cover)}" alt="" loading="lazy">` : ""}<span class="badge">${p.active ? "Public" : "Archived"}</span><h3>${e(name)}</h3><p>${p.priceMode === "quote" ? "Quote required" : (p.priceMode === "from" ? "From " : "") + new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency }).format(p.price / 100)}</p><div class="actions"><button type="button" class="small" data-appearance-key="${e(key)}" data-fallback-name="${e(name)}">Edit name & cover</button><button type="button" class="small outline" data-catalogue-details="${e(p.id)}">Full details</button><button type="button" class="small outline" data-catalogue-photos="${e(p.id)}">Photos & videos</button>${canPrice ? `<button type="button" class="small outline" data-catalogue-price="${e(p.id)}">Edit price</button>` : ""}</div></article>`;
    })
    .join("")}</div>`;
  categoryPanel.after(shows);
  root
    .querySelectorAll<HTMLElement>("[data-guest-visibility]")
    .forEach((button) => {
      const id = button.dataset.guestVisibility!,
        card = button.closest("article")!,
        key = "service:" + id;
      const value = b.catalogueAppearance?.[key],
        saved = o.state.guestGalleries.find(
          (g) => g.id === id.toLocaleLowerCase("en"),
        );
      const hidden = new Set(saved?.hiddenPhotoUrls ?? []),
        cover =
          value?.cover ||
          o.guestPhoto(id).find((p) => !hidden.has(p.url))?.url ||
          saved?.gallery[0]?.url;
      if (cover)
        card.insertAdjacentHTML(
          "afterbegin",
          `<img class="catalogue-preview" src="${e(cover)}" alt="" loading="lazy">`,
        );
      card.classList.add("catalogue-service-card");
      card.querySelector("h3")!.textContent = catalogueName(b, key, id);
      card.dataset.guestShowCard +=
        " " + catalogueName(b, key, id).toLowerCase();
      button.insertAdjacentHTML(
        "beforebegin",
        `<p data-catalogue-current-price="${e(id)}">Loading price…</p><div class="actions"><button type="button" class="small" data-appearance-key="${e(key)}" data-fallback-name="${e(id)}">Edit name & cover</button><button type="button" class="small outline" data-catalogue-gallery="${e(id)}">Photos & videos</button>${canPrice ? `<button type="button" class="small outline" data-catalogue-price="${e(id)}">Edit price</button>` : ""}</div>`,
      );
    });
  root
    .querySelectorAll<HTMLElement>("[data-appearance-key]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        edit(button.dataset.appearanceKey!, button.dataset.fallbackName!),
      ),
    );
  root
    .querySelectorAll<HTMLElement>("[data-catalogue-price]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        o.editPrice(button.dataset.cataloguePrice!),
      ),
    );
  root
    .querySelectorAll<HTMLElement>("[data-catalogue-gallery]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        o.editGallery(button.dataset.catalogueGallery!),
      ),
    );
  root
    .querySelectorAll<HTMLElement>("[data-catalogue-photos]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        o.editShowPhotos(button.dataset.cataloguePhotos!),
      ),
    );
  root
    .querySelectorAll<HTMLElement>("[data-catalogue-details]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        o.editShow(button.dataset.catalogueDetails!),
      ),
    );
  void o
    .api<{
      publicPrices?: {
        serviceId: string;
        priceMode: string;
        price: number;
        taxApplied: boolean;
      }[];
    }>("/public/" + encodeURIComponent(b.slug))
    .then((result) => {
      root
        .querySelectorAll<HTMLElement>("[data-catalogue-current-price]")
        .forEach((label) => {
          const p = result.publicPrices?.find(
            (p) => p.serviceId === label.dataset.catalogueCurrentPrice,
          );
          label.textContent =
            !p || p.priceMode === "quote"
              ? "Quote required"
              : (p.priceMode === "from" ? "From " : "") +
                new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: b.currency,
                }).format(p.price / 100) +
                (p.taxApplied ? " · VAT included" : "");
        });
    })
    .catch(() =>
      root
        .querySelectorAll<HTMLElement>("[data-catalogue-current-price]")
        .forEach(
          (label) =>
            (label.textContent = "Open price to check the latest value."),
        ),
    );
  function edit(key: string, fallback: string) {
    const saved = b.catalogueAppearance?.[key],
      dialog = document.createElement("dialog");
    dialog.className = "finance-dialog catalogue-editor";
    const fields = [
      ["name", "Customer-facing name"],
      ["nameFr", "French name (optional)"],
      ["nameAr", "Arabic name (optional)"],
      ["description", "Description"],
      ["descriptionFr", "French description (optional)"],
      ["descriptionAr", "Arabic description (optional)"],
      ["cover", "Cover photo link"],
    ];
    dialog.innerHTML = `<div class="dialog-heading"><h2>Edit ${key.startsWith("category:") ? "category" : "service"}</h2><button type="button" class="close" aria-label="Close category editor">×</button></div><form><p class="form-error" role="alert"></p><div class="finance-form-grid">${fields.map(([field, label]) => `<label>${label}${field.startsWith("description") ? `<textarea name="${field}" aria-label="${label}" maxlength="1500" rows="2">${e(saved?.[field as keyof CatalogueAppearance] ?? "")}</textarea>` : `<input name="${field}" aria-label="${label}" maxlength="${field === "cover" ? 2000 : 100}" value="${e(saved?.[field as keyof CatalogueAppearance] ?? (field === "name" ? fallback : ""))}" placeholder="${field === "name" ? e(fallback) : ""}" ${field === "nameAr" ? 'dir="auto"' : ""}>`}</label>`).join("")}</div><div class="catalogue-cover-preview">${saved?.cover ? `<img src="${e(saved.cover)}" alt="Cover preview">` : ""}</div>${o.state.uploadsEnabled ? '<label>Upload a cover photo<input type="file" name="photo" accept="image/*"></label>' : ""}<p class="catalogue-upload-status" role="status"></p><p class="muted">Blank fields use the original name, description or photo. Existing bookings and links keep working.</p><div class="actions"><button type="submit">Save changes</button><button type="button" class="outline" data-original>Use original</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector("form")!,
      cover = form.elements.namedItem("cover") as HTMLInputElement;
    const preview = () => {
      dialog.querySelector(".catalogue-cover-preview")!.innerHTML = cover.value
        ? `<img src="${e(cover.value)}" alt="Cover preview">`
        : "";
    };
    cover.addEventListener("change", preview);
    dialog
      .querySelector(".close")!
      .addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.querySelector("[data-original]")!.addEventListener("click", () => {
      for (const [field] of fields)
        (form.elements.namedItem(field) as HTMLInputElement).value = "";
      preview();
    });
    (
      form.elements.namedItem("photo") as HTMLInputElement | null
    )?.addEventListener("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement,
        file = input.files?.[0];
      if (!file) return;
      const save = form.querySelector<HTMLButtonElement>("[type=submit]")!,
        status = dialog.querySelector(".catalogue-upload-status")!;
      save.disabled = true;
      input.disabled = true;
      status.textContent = "Uploading photo…";
      try {
        cover.value = await o.upload(file);
        preview();
        status.textContent = "Photo ready. Save changes to publish.";
      } catch (err) {
        status.textContent =
          err instanceof Error ? err.message : "Unable to upload photo.";
      } finally {
        save.disabled = false;
        input.disabled = false;
        input.value = "";
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const save = form.querySelector<HTMLButtonElement>("[type=submit]")!;
      save.disabled = true;
      try {
        const fd = new FormData(form),
          data: Record<string, unknown> = { revision: saved?.revision ?? 0 };
        for (const [field] of fields)
          data[field] = String(fd.get(field) ?? "").trim();
        await o.api(
          "/manage/catalogue-appearance/" + encodeURIComponent(key),
          "PUT",
          data,
        );
        dialog.close();
        await o.reload();
      } catch (err) {
        dialog.querySelector(".form-error")!.textContent =
          err instanceof Error ? err.message : "Unable to save.";
      } finally {
        save.disabled = false;
      }
    });
    dialog.showModal();
  }
}
