import type { Express, Request } from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import { writeRoutes } from "./write-routes.js";
import { MarketplaceWorkspaces, workspaceSessionKind } from "./marketplace-workspaces.js";

export function marketplaceRoutes(app: Express, store: Store) {
  const workspaces = new MarketplaceWorkspaces(store), writes = writeRoutes(app, store);
  const context = (req: Request) => ({ cookie: req.headers.cookie, kind: workspaceSessionKind.parse(req.params.kind) });
  const id = (input: unknown) => z.string().min(1).max(128).parse(input);
  const cursor = (req: Request) => z.string().max(128).default("").parse(req.query.after);
  const root = "/api/marketplace/:kind/workspaces";
  writes.post("/api/marketplace/:kind/applications", async (req, res) => {
    const { cookie, kind } = context(req);
    res.status(201).json(await workspaces.apply(cookie, kind, req.body));
  });
  app.get(root, async (req, res) => {
    const { cookie, kind } = context(req);
    res.json(await workspaces.list(cookie, kind, cursor(req)));
  });
  app.get(root + "/:organizationId", async (req, res) => {
    const { cookie, kind } = context(req);
    res.json(await workspaces.view(cookie, kind, id(req.params.organizationId)));
  });
  writes.put(root + "/:organizationId/profile", async (req, res) => {
    const { cookie, kind } = context(req);
    res.json(await workspaces.editProfile(cookie, kind, id(req.params.organizationId), req.body));
  });
  writes.post(root + "/:organizationId/submit", async (req, res) => {
    const { cookie, kind } = context(req);
    res.json(await workspaces.submitProfile(cookie, kind, id(req.params.organizationId), req.body));
  });
  app.get(root + "/:organizationId/listings", async (req, res) => {
    const { cookie, kind } = context(req);
    res.json(await workspaces.listings(cookie, kind, id(req.params.organizationId), cursor(req)));
  });
  writes.post(root + "/:organizationId/listings", async (req, res) => {
    const { cookie, kind } = context(req);
    const listing = await workspaces.createDraft(cookie, kind, id(req.params.organizationId), req.body);
    res.status(201).json(listing);
  });
  writes.put(root + "/:organizationId/listings/:offeringId", async (req, res) => {
    const { cookie, kind } = context(req);
    res.json(await workspaces.editDraft(cookie, kind, id(req.params.organizationId), id(req.params.offeringId), req.body));
  });
  writes.post(root + "/:organizationId/listings/:offeringId/submit", async (req, res) => {
    const { cookie, kind } = context(req);
    res.json(await workspaces.submitListing(cookie, kind, id(req.params.organizationId), id(req.params.offeringId), req.body));
  });
  app.get("/api/marketplace/platform/applications", async (req, res) => {
    res.json(await workspaces.platformQueue(req.headers.cookie, cursor(req)));
  });
  app.get("/api/marketplace/platform/listings", async (req, res) => {
    res.json(await workspaces.platformListingQueue(req.headers.cookie, cursor(req)));
  });
  writes.post("/api/marketplace/platform/organizations/:organizationId/review", async (req, res) => {
    res.json(await workspaces.reviewProfile(req.headers.cookie, id(req.params.organizationId), req.body));
  });
  app.get("/api/marketplace/platform/organizations/:organizationId/listings", async (req, res) => {
    res.json(await workspaces.platformListings(req.headers.cookie, id(req.params.organizationId), cursor(req)));
  });
  writes.post("/api/marketplace/platform/organizations/:organizationId/listings/:offeringId/review", async (req, res) => {
    res.json(await workspaces.reviewListing(req.headers.cookie, id(req.params.organizationId), id(req.params.offeringId), req.body));
  });
}
