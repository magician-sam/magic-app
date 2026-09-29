import { createHash } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { requireThat } from "./domain.js";
import type { Booking } from "./models.js";
import type { Store } from "./store.js";
import { writeRoutes } from "./write-routes.js";

export interface StaffNoticeState {
  id: string;
  userId: string;
  bookingId: string;
  revision: number;
  label: string;
  readAt: string;
  dismissedAt: string;
}

export function staffNotices(app: Express, store: Store) {
  const writes = writeRoutes(app, store);
  writes.put("/api/manage/notices", async (req, res) => {
    const input = z.object({
      bookingId: z.string().min(1).max(100),
      revision: z.number().int().min(1),
      label: z.enum(["Reply needed", "Coming up", "After the show", "New request", "Artist declined", "Artist reply needed", "Artist report"]),
      state: z.enum(["read", "unread", "dismissed", "restore"]),
    }).parse(req.body);
    const booking = await store.get<Booking>(req.business.id, "bookings", input.bookingId);
    requireThat(booking, "Event not found", 404);
    requireThat(req.user.role !== "performer" || booking.performerIds.includes(req.user.performerId ?? ""), "Access denied", 403);
    requireThat(booking.revision === input.revision, "This update changed. Refresh notifications first.", 409);
    const id = createHash("sha256").update(JSON.stringify([req.user.id, input.bookingId, input.revision, input.label])).digest("hex");
    const before = await store.get<StaffNoticeState>(req.business.id, "staffNoticeStates", id);
    const now = new Date().toISOString();
    const next: StaffNoticeState = {
      id, userId: req.user.id, bookingId: input.bookingId, revision: input.revision, label: input.label,
      readAt: input.state === "unread" ? "" : input.state === "restore" ? before?.readAt ?? "" : now,
      dismissedAt: input.state === "dismissed" ? now : "",
    };
    await store.put(req.business.id, "staffNoticeStates", next);
    res.json(next);
  });
}
