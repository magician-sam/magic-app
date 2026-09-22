export interface ActPlan {
  id: string;
  rows: { packageId: string; performerId: string; agreedPay: number }[];
  notes: string;
}

// Project only schedule fields, never private notes or agreed fees.
export function performerAssignments(
  booking: Booking,
  packages: Package[],
  timezone: string,
  performerId: string,
  plan?: ActPlan,
) {
  if (!booking.performerIds.includes(performerId) || !booking.acceptedQuoteId)
    return [];
  const assigned = new Set(
    plan?.rows
      .filter((row) => row.performerId === performerId)
      .map((row) => row.packageId),
  );
  return timetable(booking, packages, timezone).filter(
    (row) => row.packageId && assigned.has(row.packageId),
  );
}
import { timetable } from "./domain.js";
import type { Booking, Package } from "./models.js";
