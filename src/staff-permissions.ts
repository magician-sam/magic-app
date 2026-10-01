import type { Role } from "./models.js";

export type StaffAction = "events" | "quotes" | "status" | "staffing" | "money" | "catalog" | "customers" | "followups" | "availability" | "checklist" | "history" | "links" | "referrals" | "reviews" | "extraAnswers";
const actions: Record<Role, readonly StaffAction[]> = {
  owner: ["events", "quotes", "status", "staffing", "money", "catalog", "customers", "followups", "availability", "checklist", "history", "links", "referrals", "reviews", "extraAnswers"],
  admin: ["events", "quotes", "status", "staffing", "money", "catalog", "customers", "followups", "availability", "checklist", "history", "links", "referrals", "reviews", "extraAnswers"],
  manager: ["events", "quotes", "status", "staffing", "catalog", "customers", "followups", "availability", "checklist", "history", "links", "reviews", "extraAnswers"],
  sales: ["events", "quotes", "customers", "followups", "history", "links", "extraAnswers"],
  accountant: ["money"],
  assistant: ["events", "customers", "followups", "availability", "checklist", "history", "links"],
  performer: ["availability", "checklist"],
};
export function canStaffAction(role: Role, action: StaffAction) {
  return actions[role]?.includes(action) ?? false;
}
export function limitedStaff(role: Role) {
  return ["manager", "sales", "accountant"].includes(role);
}
export function canSeeAccounts(role: Role) {
  return ["owner", "admin", "manager", "accountant", "assistant"].includes(role);
}
export function canSeeArtistPay(role: Role) {
  return ["owner", "admin", "manager", "accountant"].includes(role);
}
export const roleDescriptions: Record<Role, string> = {
  owner: "Full business control, including logins, settings, exports and permanent deletion.",
  admin: "Platform support access, disclosed and recorded in the activity history.",
  manager: "Manage bookings, artists, shows, media and customers. View reports. Payment entries, logins, business settings and permanent deletion stay with the owner or accountant.",
  sales: "Manage customers, enquiries, event details and proposals. View customer payment totals. Artist fees, costs, account settings and final booking confirmation are restricted.",
  accountant: "View booking finances and agreed artist fees; record and correct payments, refunds and costs. Customer planning notes, event changes and account settings are restricted.",
  assistant: "Legacy assistant access to customers, event details, availability and follow-ups.",
  performer: "View assigned jobs, reply to assignments, manage personal availability and record job completion. Company calendar access is optional.",
};
export function staffViews(role: Role): readonly string[] | undefined {
  if (role === "performer") return ["today", "notices", "bookings", "calendar", "settings"];
  if (role === "sales") return ["today", "notices", "bookings", "enquiries", "calendar", "customers", "reminders", "settings"];
  if (role === "accountant") return ["today", "bookings", "money", "settings"];
  if (role === "manager") return ["today", "notices", "bookings", "enquiries", "calendar", "customers", "packages", "guest-shows", "guest-photos", "offers", "performers", "money", "reminders", "reviews", "settings"];
  return undefined;
}

// New staff roles use a closed route list. Unknown and future endpoints remain owner-only.
export function staffRouteAllowed(role: Role, method: string, fullPath: string) {
  if (!limitedStaff(role)) return true;
  const path = fullPath.split("?")[0].replace(/^\/api\/manage/, "");
  if (method === "GET") {
    if (path === "/office-tasks") return ["manager", "accountant"].includes(role);
    if (path === "/state" || /^\/bookings\/[^/]+\/checks$/.test(path)) return true;
    if (/^\/bookings\/[^/]+\/act-plan$/.test(path)) return canSeeArtistPay(role);
    if (/^\/customers\/[^/]+\/history$/.test(path)) return canStaffAction(role, "history");
    if (path === "/custom-fields") return canStaffAction(role, "extraAnswers");
    return false;
  }
  if (method === "POST" && path === "/password") return true;
  if (method === "PUT" && /^\/office-tasks\/[^/]+$/.test(path)) return ["manager", "accountant"].includes(role);
  if (method === "PUT" && path === "/notices") return role !== "accountant";
  const routes: [string, RegExp, StaffAction][] = [
    ["POST", /^\/enquiries\/[^/]+\/contacted$/, "customers"],
    ["POST", /^\/enquiries\/[^/]+\/archive$/, "customers"],
    ["PUT", /^\/enquiries\/[^/]+$/, "customers"],
    ["POST", /^\/bookings\/[^/]+\/quotes$/, "quotes"],
    ["POST", /^\/bookings\/[^/]+\/(status|accept)$/, "status"],
    ["POST", /^\/bookings\/[^/]+\/availability$/, "availability"],
    ["POST", /^\/bookings\/[^/]+\/link$/, "links"],
    ["PUT", /^\/bookings\/[^/]+\/details$/, "events"],
    ["PUT", /^\/bookings\/[^/]+\/custom-answers$/, "extraAnswers"],
    ["PUT", /^\/bookings\/[^/]+\/(act-plan|running-order)$/, "staffing"],
    ["PUT", /^\/bookings\/[^/]+\/checklist$/, "checklist"],
    ["PUT", /^\/customers\/[^/]+$/, "customers"],
    ["PUT", /^\/customers\/[^/]+\/history\/[^/]+$/, "history"],
    ["PUT", /^\/reminders\/[^/]+$/, "followups"],
    ["POST", /^\/reminders\/[^/]+\/contact$/, "followups"],
    ["PUT", /^\/blocks\/[^/]+$/, "availability"],
    ["PUT", /^\/(packages|performers)\/[^/]+$/, "catalog"],
    ["PUT", /^\/(site-media|guest-galleries)\/[^/]+$/, "catalog"],
    ["POST", /^\/(show-categories|guest-services|upload-photo|upload-video)$/, "catalog"],
    ["POST", /^\/reviews\/[^/]+\/moderate$/, "reviews"],
    ["POST", /^\/money(?:\/[^/]+\/correct)?$/, "money"],
  ];
  return routes.some(([verb, pattern, action]) => verb === method && pattern.test(path) && canStaffAction(role, action));
}

// Apply to every staff JSON response, including records returned after a write.
// Always copy: masking a response must never change the stored booking.
export function staffResponse(value: unknown, role: Role): unknown {
  if (!limitedStaff(role) || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => staffResponse(item, role));
  const record = { ...value } as Record<string, unknown>;
  if (Array.isArray(record.quotes) && Array.isArray(record.performerIds) && typeof record.customerId === "string") {
    if (role === "sales") {
      delete record.surpriseDetails;
      record.availabilityResponses = {};
      record.artistCompletion = {};
    }
    if (role === "accountant") {
      record.notes = ""; record.venueNotes = ""; record.checklist = [];
      for (const key of ["customAnswers", "giftDetails", "surpriseDetails", "certificate"]) delete record[key];
      record.availabilityResponses = {};
      record.artistCompletion = Object.fromEntries(Object.entries((record.artistCompletion ?? {}) as Record<string, Record<string, unknown>>).map(([id, done]) => [id, { ...done, notes: "", problems: "" }]));
    }
  }
  if (role === "accountant" && Array.isArray(record.children) && Array.isArray(record.contacts)) {
    record.children = []; record.contacts = []; record.notes = ""; record.followUp = ""; record.source = "";
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, staffResponse(item, role)]));
}
