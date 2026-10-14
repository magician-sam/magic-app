import { matchesMultilingual, locationTerms } from "./multilingual-search.js";
import type { Express } from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import { requireThat } from "./domain.js";
import { MarketplaceStorage, marketplaceSchemaState } from "./marketplace-storage.js";
import { publicOrganization, type Offering } from "./marketplace.js";

export type PublicPartner = NonNullable<ReturnType<typeof publicOrganization>>;
export type PublicListing = Pick<Offering, "id" | "title" | "kind" | "categories">;
const group = z.enum(["venues", "companies", "artists"]);
const kind = { venues: "venue_operator", companies: "company", artists: "independent_artist" } as const;
const querySchema = z.object({ group, q: z.string().trim().max(200).default(""), area: z.string().trim().max(100).default(""), after: z.string().max(128).default("") }).strict();
const cursorSchema = z.object({ after: z.string().max(128).default("") }).strict();

export class MarketplacePublic {
  private storage: MarketplaceStorage;
  constructor(private store: Store) { this.storage = new MarketplaceStorage(store.db); }
  async directory(input: unknown) {
    const query = querySchema.parse(input);
    // The existing production catalogue has no marketplace tables yet. A
    // public empty-directory read does not need a remote write transaction.
    if (await marketplaceSchemaState(this.store.db) === "absent")
      return { partners: [] as PublicPartner[], total: 0, next: null, workspaceReady: false };
    return this.store.transaction(async () => {
      // Search only the approved public projection. Normalization is shared
      // with customer clients; raw private organization data never enters it.
      const rows = await this.store.db.prepare("SELECT id,slug FROM marketplace_organizations WHERE json_extract(data,'$.status')='approved' AND json_extract(data,'$.kind')=? ORDER BY slug").all(kind[query.group]);
      const matches: PublicPartner[] = [];
      for (const row of rows) {
        const value = publicOrganization(await this.storage.organization(String(row.id)));
        if (!value) continue;
        const loc = value.location;
        const areas = loc ? [loc.country, loc.region, loc.city, loc.area, loc.address, ...loc.aliases].filter((v): v is string => typeof v === 'string') : [];
        const placeTerms=locationTerms(areas);
        if (!matchesMultilingual([],query.area,placeTerms)) continue;
        const values = [value.description ?? '', ...value.categories];
        // Configured listing names are searchable only after publication and
        // only under their owning approved organization.
        const offerings = query.q ? await this.store.db.prepare("SELECT data FROM marketplace_offerings WHERE organization_id=? AND json_extract(data,'$.status')='approved'").all(value.id) : [];
        for (const row of offerings) {
          const item = JSON.parse(String(row.data)) as {title?: string; categories?: string[]};
          if (item.title) values.push(item.title);
          values.push(...(item.categories ?? []));
        }
        // Provider names are literal proper names, not automatic translations
        // of similarly named services. Public locations use geographic aliases.
        if (matchesMultilingual(values,query.q,[value.name,...placeTerms])) matches.push(value);
      }
      const available = matches.filter(value => value.slug > query.after), partners = available.slice(0,25);
      return { partners, total: matches.length, next: available.length > 25 ? partners[24].slug : null, workspaceReady: true };
    });
  }
  async profile(slug: string, input: unknown = {}) {
    z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).parse(slug);
    const query = cursorSchema.parse(input);
    return this.store.transaction(async () => {
      requireThat(await marketplaceSchemaState(this.store.db) === "ready", "Partner profile not found.", 404);
      const row = await this.store.db.prepare("SELECT id FROM marketplace_organizations WHERE slug=? AND json_extract(data,'$.status')='approved'").get(slug);
      const partner = row && publicOrganization(await this.storage.organization(String(row.id)));
      requireThat(partner, "Partner profile not found.", 404);
      const rows = await this.store.db.prepare("SELECT id FROM marketplace_offerings WHERE organization_id=? AND id>? AND json_extract(data,'$.status')='approved' ORDER BY id LIMIT 26").all(partner.id, query.after);
      const count = await this.store.db.prepare("SELECT count(*) AS n FROM marketplace_offerings WHERE organization_id=? AND json_extract(data,'$.status')='approved'").get(partner.id);
      const listings: PublicListing[] = [];
      for (const item of rows.slice(0, 25)) {
        const offering = await this.storage.offering(String(item.id), partner.id);
        if (offering?.status === "approved") listings.push({ id: offering.id, title: offering.title, kind: offering.kind, categories: [...offering.categories] });
      }
      return { partner, listings, total: Number(count?.n ?? 0), next: rows.length > 25 ? String(rows[24].id) : null };
    });
  }
}

export function marketplacePublicRoutes(app: Express, store: Store) {
  const publicData = new MarketplacePublic(store);
  app.get("/api/marketplace/public/directory", async (req, res) => res.json(await publicData.directory(req.query)));
  app.get("/api/marketplace/public/providers/:slug", async (req, res) => res.json(await publicData.profile(String(req.params.slug), req.query)));
}
