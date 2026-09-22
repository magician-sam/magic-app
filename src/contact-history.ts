import { writeRoutes } from "./write-routes.js";
import type { Express, Request } from "express";
import { z } from "zod";
import { Store, id } from "./store.js";
import { date, short, requireThat } from "./domain.js";
import type { Booking } from "./models.js";
import type { CustomerExtras } from "./rewards.js";

const contactSchema = z.object({
  bookingId: short.default(""),
  date,
  channel: z.enum(["phone", "whatsapp", "email", "in_person", "note"]),
  direction: z.enum(["inbound", "outbound", "internal"]),
  summary: z.string().trim().min(1).max(5000),
  archived: z.boolean().default(false),
  revision: z.number().int().min(0),
});
export interface ContactEntry extends z.infer<typeof contactSchema> {
  id: string;
  customerId: string;
  createdAt: string;
  updatedAt: string;
}

export function contactHistory(app: Express, store: Store) {
  const writes = writeRoutes(app, store);
  const customer = async (req: Request) => {
    requireThat(req.user.role !== "performer", "Access denied", 403);
    const customerId = String(req.params.customerId);
    requireThat(
      await store.get(req.business.id, "customers", customerId),
      "Customer not found",
      404,
    );
    return customerId;
  };
  app.get("/api/manage/customers/:customerId/history", async (req, res) => {
    const customerId = await customer(req);
    res.json({
      entries: (
        await store.all<ContactEntry>(req.business.id, "contactHistory")
      )
        .filter((n) => n.customerId === customerId)
        .sort((a, b) =>
          (b.date + b.createdAt).localeCompare(a.date + a.createdAt),
        ),
      childrenAges:
        (
          await store.get<CustomerExtras>(
            req.business.id,
            "customerExtras",
            customerId,
          )
        )?.childrenAges ?? [],
    });
  });
  writes.put(
    "/api/manage/customers/:customerId/history/:id",
    async (req, res) => {
      const customerId = await customer(req),
        bid = req.business.id;
      const input = contactSchema.parse(req.body);
      const entry = await store.transaction(async () => {
        const key = String(req.params.id);
        const before =
          key === "new"
            ? undefined
            : await store.get<ContactEntry>(bid, "contactHistory", key);
        requireThat(
          key === "new" || before?.customerId === customerId,
          "Contact entry not found",
          404,
        );
        requireThat(
          input.revision === (before?.revision ?? 0),
          "This note changed. Reopen the history before editing.",
          409,
        );
        if (input.bookingId) {
          const booking = await store.get<Booking>(
            bid,
            "bookings",
            input.bookingId,
          );
          requireThat(
            booking?.customerId === customerId,
            "Choose an event belonging to this customer.",
            400,
          );
        }
        const now = new Date().toISOString();
        const next: ContactEntry = {
          ...input,
          id: before?.id ?? id(),
          customerId,
          revision: (before?.revision ?? 0) + 1,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
        };
        await store.put(bid, "contactHistory", next);
        await store.audit(
          bid,
          req.user.email,
          !before
            ? "contact.recorded"
            : input.archived !== before.archived
              ? input.archived
                ? "contact.archived"
                : "contact.restored"
              : "contact.corrected",
          next.id,
          before ?? null,
          next,
        );
        return next;
      });
      res.json(entry);
    },
  );
}
