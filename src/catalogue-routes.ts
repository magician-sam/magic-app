import type { Express } from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import type { Package } from "./models.js";
import { userCanStaffAction } from "./staff-permissions.js";
import { requireThat } from "./domain.js";
import { writeRoutes } from "./write-routes.js";
import { guestServiceNames } from "./guest-services.js";
import { marketplaceCategoryCards } from "./catalogue-settings.js";
export const catalogueAppearanceInput = z
  .object({
    revision: z.number().int().min(0),
    name: z.string().trim().max(100),
    nameFr: z.string().trim().max(100).default(""),
    nameAr: z.string().trim().max(100).default(""),
    description: z.string().trim().max(1500).default(""),
    descriptionFr: z.string().trim().max(1500).default(""),
    descriptionAr: z.string().trim().max(1500).default(""),
    cover: z
      .string()
      .trim()
      .max(2000)
      .refine((v) => {
        if (
          !v ||
          /^\/(?:portfolio|playgrounds|demo|category-art)\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/i.test(
            v,
          )
        )
          return true;
        try {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password;
        } catch {
          return false;
        }
      }, "Choose a public HTTPS image or an included catalogue photo."),
  })
  .strict();
export function catalogueRoutes(app: Express, store: Store) {
  writeRoutes(app, store).put(
    "/api/manage/catalogue-appearance/:key",
    async (req, res) => {
      requireThat(
        userCanStaffAction(req.user, "catalog"),
        "Catalogue permission required.",
        403,
      );
      const key = String(req.params.key),
        data = catalogueAppearanceInput.parse(req.body),
        business = (await store.business(req.business.id))!;
      const [kind, ...parts] = key.split(":"),
        id = parts.join(":");
      const valid =
        kind === "category"
          ? marketplaceCategoryCards.some((c) => c[3] === id)
          : kind === "show"
            ? !!(await store.get<Package>(business.id, "packages", id))
            : kind === "service" &&
              guestServiceNames(business.otherShowNames).includes(id);
      requireThat(valid, "Category or service not found.", 404);
      const before = business.catalogueAppearance?.[key];
      requireThat(
        data.revision === (before?.revision ?? 0),
        "This category changed on another device. Reload before saving.",
        409,
      );
      const next = { ...data, revision: data.revision + 1 },
        settings = { ...(business.catalogueAppearance ?? {}), [key]: next };
      requireThat(
        Object.keys(settings).length <= 500,
        "Up to 500 customized catalogue entries are supported.",
      );
      await store.db
        .prepare("UPDATE businesses SET data=? WHERE id=?")
        .run(
          JSON.stringify({ ...business, catalogueAppearance: settings }),
          business.id,
        );
      await store.audit(
        business.id,
        req.user.email,
        "catalogue-appearance.updated",
        key,
        before ?? null,
        next,
      );
      res.json(next);
    },
  );
}
