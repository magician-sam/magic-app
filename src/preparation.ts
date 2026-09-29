import type { Booking, Package } from "./models.js";

const standardTasks = [
  "Confirm the customer's event plan",
  "Confirm venue, directions and arrival arrangements",
  "Arrange transport",
  "Prepare costumes",
  "Pack props and equipment",
  "Review payment agreement and balance",
];

/** Merge preparation tasks without losing manual notes or completed work. */
export function preparationChecklist(booking: Pick<Booking, "checklist">, shows: Pick<Package, "checklist">[]) {
  const result = booking.checklist.map((item) => ({ ...item }));
  const key = (text: string) => text.trim().toLocaleLowerCase("en");
  const seen = new Set(result.map((item) => key(item.text)));
  for (const text of [...standardTasks, ...shows.flatMap((show) => show.checklist)]) {
    if (result.length === 100) break;
    if (text.trim() && !seen.has(key(text))) {
      result.push({ text: text.trim(), done: false });
      seen.add(key(text));
    }
  }
  return result;
}
