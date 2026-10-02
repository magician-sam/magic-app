import { z } from "zod";
import type { Express, Request } from "express";
import type { Store } from "./store.js";
import { id } from "./store.js";
import type { User, Business } from "./models.js";
import { userCanStaffAction } from "./staff-permissions.js";
import { writeRoutes } from "./write-routes.js";

export interface OfficeTask {
  id: string; title: string; notes: string; status: "open" | "in_progress" | "done" | "archived";
  priority: "low" | "normal" | "high"; dueDate: string; assignedUserId: string; bookingId: string;
  revision: number; createdAt: string; updatedAt: string;
}
const inputSchema = z.object({
  title: z.string().trim().min(1).max(160), notes: z.string().max(3000),
  status: z.enum(["open", "in_progress", "done", "archived"]), priority: z.enum(["low", "normal", "high"]),
  dueDate: z.union([z.literal(""), z.iso.date()]), assignedUserId: z.string().max(80), bookingId: z.string().max(80),
  revision: z.number().int().min(0),
}).strict();
type StaffRequest = Request & { user: User; business: Business };
const allowed = (user: User) => ["owner", "admin"].includes(user.role) || userCanStaffAction(user, "officeTasks");
export function officeTasks(app: Express, store: Store) {
  app.get("/api/manage/office-tasks", async (request, res) => {
    const req = request as StaffRequest;
    if (!allowed(req.user)) { res.status(403).json({ error: "Office task access denied." }); return; }
    const rows = await store.db.prepare("SELECT data FROM users WHERE business_id=?").all(req.business.id);
    const people = rows.map(row => JSON.parse(String(row.data)) as User).filter(allowed).map(user => ({ id: user.id, name: user.name }));
    res.json({ tasks: await store.all<OfficeTask>(req.business.id, "officeTasks"), people });
  });
  writeRoutes(app, store).put("/api/manage/office-tasks/:id", async (request, res) => {
    const req = request as StaffRequest;
    if (!allowed(req.user)) { res.status(403).json({ error: "Office task access denied." }); return; }
    const input = inputSchema.parse(req.body);
    const key = String(req.params.id);
    const old = key === "new" ? undefined : await store.get<OfficeTask>(req.business.id, "officeTasks", key);
    if (key !== "new" && !old) { res.status(404).json({ error: "Task not found." }); return; }
    if (input.revision !== (old?.revision ?? 0)) { res.status(409).json({ error: "This task changed on another device. Reload before editing." }); return; }
    if (input.assignedUserId) {
      const row = await store.db.prepare("SELECT data FROM users WHERE business_id=? AND id=?").get(req.business.id, input.assignedUserId);
      if (!row || !allowed(JSON.parse(String(row.data)))) { res.status(400).json({ error: "Choose a staff member with office task access." }); return; }
    }
    if (input.bookingId && !await store.get(req.business.id, "bookings", input.bookingId)) { res.status(400).json({ error: "Choose an event belonging to this business." }); return; }
    const now = new Date().toISOString();
    const next: OfficeTask = { ...input, id: old?.id ?? id(), revision: input.revision + 1, createdAt: old?.createdAt ?? now, updatedAt: now };
    await store.put(req.business.id, "officeTasks", next);
    await store.audit(req.business.id, req.user.email, old ? "office-task.updated" : "office-task.created", next.id, old ?? null, next);
    res.json(next);
  });
}
