import { DateTime } from "luxon";
import { z } from "zod";
import type {
  AvailabilityBlock,
  Booking,
  MoneyEntry,
  Package,
} from "./models.js";

export class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireThat(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new Problem(status, message);
}
export const short = z.string().trim().max(240);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((x) => DateTime.fromISO(x).isValid, "Choose a valid date");
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const cents = z.number().int().min(0).max(100_000_000);
export const url = z.union([
  z.literal(""),
  z.url().refine((x) => x.startsWith("https://"), "Use an HTTPS link"),
]);
export const customerSchema = z.object({
  name: short.min(2),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(40)
    .refine((value) => {
      const length = value.replace(/\D/g, "").length;
      return length >= 7 && length <= 16;
    }, "Enter a phone number with 7–16 digits"),
  email: z.union([z.literal(""), z.email()]).default(""),
  kind: z
    .enum(["family", "school", "organization", "planner", "venue"])
    .default("family"),
  children: z
    .array(z.object({ name: short.min(1), birthday: date }))
    .max(20)
    .default([]),
  contacts: z
    .array(z.object({ name: short, role: short, phone: short }))
    .max(30)
    .default([]),
  notes: z.string().max(5000).default(""),
  language: short.default("English"),
  offersConsent: z.boolean().default(false),
  doNotContact: z.boolean().default(false),
  source: short.default("direct"),
  followUp: z.union([date, z.literal("")]).default(""),
});
export const eventSchema = z.object({
  name: short.min(2),
  date,
  time,
  location: short.min(3),
  occasion: short.min(1),
  audience: z.number().int().min(1).max(10000),
  age: z.number().int().min(0).max(99),
  indoor: z.boolean(),
  power: z.boolean(),
  space: z.number().min(1).max(100000),
  source: short.default("direct"),
  notes: z.string().max(5000).default(""),
  packageIds: z.array(short.min(1)).min(1).max(12),
  performerIds: z.array(short).max(20).default([]),
});
export const packageSchema = z
  .object({
    name: short.min(2),
    fastOrder: z.boolean().optional(),
    checkoutExtra: z.boolean().optional(),
    previewVideo: url.optional(),
    category: short.min(1).max(40),
    description: z.string().max(3000),
    duration: z.number().int().min(5).max(480),
    setup: z.number().int().min(0).max(240),
    minAge: z.number().int().min(0).max(99),
    maxAge: z.number().int().min(0).max(99),
    indoorOnly: z.boolean(),
    needsPower: z.boolean(),
    minSpace: z.number().min(0).max(10000),
    priceMode: z.enum(["quote", "fixed", "from"]),
    price: cents,
    active: z.boolean(),
    checklist: z.array(short).max(50),
  })
  .refine(
    (p) => p.maxAge >= p.minAge,
    "Maximum age must be at least minimum age",
  );
export const performerSchema = z.object({
  name: short.min(2),
  bio: z.string().max(3000),
  categories: z.array(short.min(1).max(40)).min(1).max(30),
  photo: url,
  video: url,
  areas: short,
  active: z.boolean(),
  membershipVerified: z.boolean(),
});
export function selectedPackages(booking: Booking, packages: Package[]) {
  const quote = booking.quotes.find((q) => q.id === booking.acceptedQuoteId);
  if (quote?.packageSnapshot) return quote.packageSnapshot;
  if (!quote && booking.packageSnapshot) return booking.packageSnapshot;
  return (quote?.packageIds ?? booking.packageIds)
    .map((key) => packages.find((p) => p.id === key))
    .filter((p): p is Package => !!p);
}
export function compatibility(
  booking: Pick<Booking, "age" | "indoor" | "power" | "space">,
  packages: Package[],
) {
  return packages.flatMap((p) => [
    ...(booking.age < p.minAge || booking.age > p.maxAge
      ? [`${p.name}: audience age is outside the recommended range.`]
      : []),
    ...(p.indoorOnly && !booking.indoor
      ? [`${p.name}: an indoor venue is required.`]
      : []),
    ...(p.needsPower && !booking.power
      ? [`${p.name}: electricity is required.`]
      : []),
    ...(booking.space < p.minSpace
      ? [`${p.name}: at least ${p.minSpace} m² of clear space is required.`]
      : []),
  ]);
}
export function timetable(
  booking: Booking,
  packages: Package[],
  timezone: string,
) {
  let cursor = DateTime.fromISO(`${booking.date}T${booking.time}`, {
    zone: timezone,
  });
  const chosen = selectedPackages(booking, packages);
  const setup = Math.max(0, ...chosen.map((p) => p.setup));
  const rows = [
    {
      label: "Arrival & setup",
      at: cursor.minus({ minutes: setup }).toFormat("HH:mm"),
      duration: setup,
    },
  ];
  chosen.forEach((p, i) => {
    rows.push({
      label: p.name,
      at: cursor.toFormat("HH:mm"),
      duration: p.duration,
    });
    cursor = cursor.plus({ minutes: p.duration });
    if (i < chosen.length - 1) {
      rows.push({
        label: "Changeover / break",
        at: cursor.toFormat("HH:mm"),
        duration: booking.breakMinutes,
      });
      cursor = cursor.plus({ minutes: booking.breakMinutes });
    }
  });
  rows.push({ label: "Finish", at: cursor.toFormat("HH:mm"), duration: 0 });
  return rows;
}
function interval(booking: Booking, packages: Package[], timezone: string) {
  const chosen = selectedPackages(booking, packages);
  const start = DateTime.fromISO(`${booking.date}T${booking.time}`, {
    zone: timezone,
  });
  const length =
    chosen.reduce((n, p) => n + p.duration, 0) +
    Math.max(0, chosen.length - 1) * booking.breakMinutes;
  return [
    start
      .minus({
        minutes: Math.max(0, ...chosen.map((p) => p.setup)) + booking.travel,
      })
      .toMillis(),
    start.plus({ minutes: length + booking.travel }).toMillis(),
  ];
}
export function conflicts(
  booking: Booking,
  bookings: Booking[],
  packages: Package[],
  blocks: AvailabilityBlock[],
  timezone: string,
) {
  const [start, end] = interval(booking, packages, timezone);
  const conflicts = bookings
    .filter(
      (b) =>
        b.id !== booking.id &&
        b.status === "confirmed" &&
        b.performerIds.some((p) => booking.performerIds.includes(p)),
    )
    .filter((b) => {
      const [s, e] = interval(b, packages, timezone);
      return start < e && end > s;
    })
    .map(
      (b) =>
        `Conflicts with ${b.name} on ${b.date} at ${b.time}, including travel and setup.`,
    );
  for (const block of blocks.filter((b) =>
    booking.performerIds.includes(b.performerId),
  )) {
    const s = DateTime.fromISO(`${block.date}T${block.start}`, {
      zone: timezone,
    }).toMillis();
    const e = DateTime.fromISO(`${block.date}T${block.end}`, {
      zone: timezone,
    }).toMillis();
    if (start < e && end > s)
      conflicts.push(
        `Performer unavailable on ${block.date}, ${block.start}–${block.end}.`,
      );
  }
  return conflicts;
}
export function totals(booking: Booking, money: MoneyEntry[]) {
  const quote = booking.quotes.find((q) => q.id === booking.acceptedQuoteId);
  const entries = money.filter((m) => m.bookingId === booking.id);
  const paid = entries.reduce(
    (n, m) =>
      n +
      (m.kind === "payment" ? m.amount : m.kind === "refund" ? -m.amount : 0),
    0,
  );
  const expenses = entries
    .filter((m) => m.kind === "expense")
    .reduce((n, m) => n + m.amount, 0);
  return {
    agreed: quote?.amount ?? 0,
    deposit: quote?.deposit ?? 0,
    paid,
    expenses,
    balance: (quote?.amount ?? 0) - paid,
    profit: (quote?.amount ?? 0) - expenses,
  };
}
export const normalizePhone = (value: string) =>
  value.replace(/\D/g, "").replace(/^00/, "");
