import type { CustomField, CustomAnswer } from "./custom-fields.js";
import type { QuoteReward } from "./reward-ledger.js";
export type Role = "owner" | "assistant" | "performer" | "admin";
export interface User {
  id: string;
  businessId: string;
  email: string;
  name: string;
  role: Role;
  performerId?: string;
}
export interface Business {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  instagram: string;
  whatsapp: string;
  contactEmail?: string;
  logo?: string;
  characterNames?: string[];
  otherShowNames?: string[];
  intro: string;
}
export interface Package {
  bundleIds?: string[];
  bundleBreakMinutes?: number;
  bundleSnapshot?: {
    id: string;
    name: string;
    duration: number;
    priceMode: string;
    price: number;
  }[];
  gallery?: GalleryPhoto[];
  coverPhotoNumber?: number;
  hiddenPhotoUrls?: string[];
  id: string;
  name: string;
  fastOrder?: boolean;
  adultShow?: boolean;
  checkoutExtra?: boolean;
  previewVideo?: string;
  previewVideos?: string[];
  category: string;
  description: string;
  duration: number;
  setup: number;
  minAge: number;
  maxAge: number;
  indoorOnly: boolean;
  needsPower: boolean;
  minSpace: number;
  priceMode: "quote" | "fixed" | "from";
  price: number;
  active: boolean;
  checklist: string[];
}
export interface Performer {
  gallery?: GalleryPhoto[];
  id: string;
  name: string;
  bio: string;
  categories: string[];
  photo: string;
  video: string;
  areas: string;
  active: boolean;
  membershipVerified: boolean;
}
export interface GalleryPhoto {
  url: string;
  caption: string;
  approved: true;
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  kind: "family" | "school" | "organization" | "planner" | "venue";
  children: { name: string; birthday: string }[];
  contacts: { name: string; role: string; phone: string }[];
  notes: string;
  language: string;
  offersConsent: boolean;
  doNotContact: boolean;
  source: string;
  followUp: string;
}
export type Status =
  | "requested"
  | "availability_pending"
  | "quoted"
  | "accepted"
  | "confirmed"
  | "completed"
  | "cancelled";
export interface Quote {
  reward?: QuoteReward;
  id: string;
  name: string;
  packageIds: string[];
  amount: number;
  deposit: number;
  notes: string;
  packageSnapshot?: Package[];
}
export interface Booking {
  requestedServices?: string[];
  customAnswers?: CustomAnswer[];
  giftDetails?: { recipientName: string; message: string; flexibleDate: boolean };
  surpriseDetails?: { guestName: string; secret: string; proposal: boolean; howWeMet: string; specialMoment: string };
  certificate?: { starName: string; role: "magician" | "scientist" };
  id: string;
  customerId: string;
  name: string;
  date: string;
  time: string;
  location: string;
  occasion: string;
  audience: number;
  age: number;
  indoor: boolean;
  power: boolean;
  space: number;
  source: string;
  notes: string;
  packageIds: string[];
  packageSnapshot?: Package[];
  performerIds: string[];
  availability: Record<string, "pending" | "available" | "declined">;
  status: Status;
  quotes: Quote[];
  acceptedQuoteId: string;
  travel: number;
  breakMinutes: number;
  runningOrder?: { packageId: string; breakAfter: number }[];
  teardown?: number;
  checklist: { text: string; done: boolean }[];
  venueNotes: string;
  backupPerformerIds: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface MoneyEntry {
  id: string;
  bookingId: string;
  kind: "payment" | "refund" | "expense";
  amount: number;
  category: string;
  note: string;
  date: string;
}
export interface Reminder {
  draft?: string;
  marketing?: boolean;
  generatedKey?: string;
  revision?: number;
  id: string;
  customerId: string;
  bookingId: string;
  title: string;
  date: string;
  done: boolean;
}
export interface Review {
  id: string;
  bookingId: string;
  performerId: string;
  overall: number;
  punctuality: number;
  engagement: number;
  communication: number;
  text: string;
  bestReaction?: string;
  personalMoment?: string;
  rememberedDetail?: string;
  privateFeedback: string;
  photo: string;
  photoConsent: boolean;
  publishConsent: boolean;
  published: boolean;
  createdAt: string;
}
export interface Audit {
  id: string;
  actor: string;
  action: string;
  entityId: string;
  at: string;
  before: unknown;
  after: unknown;
}
export interface AvailabilityBlock {
  id: string;
  performerId: string;
  date: string;
  start: string;
  end: string;
  note: string;
}
export interface Referral {
  id: string;
  bookingId: string;
  performerId: string;
  fee: number;
  status: "offered" | "accepted" | "declined";
  note: string;
}
export interface ServiceEnquiry {
  id: string;
  service: string;
  name: string;
  phone: string;
  date: string;
  location: string;
  notes: string;
  status: "new" | "contacted";
  createdAt: string;
}
export interface Dashboard {
  uploadsEnabled?: boolean;
  business: Business;
  user: User;
  packages: Package[];
  performers: Performer[];
  customers: Customer[];
  bookings: Booking[];
  money: MoneyEntry[];
  reminders: Reminder[];
  reviews: Review[];
  audit: Audit[];
  blocks: AvailabilityBlock[];
  referrals: Referral[];
  enquiries: ServiceEnquiry[];
  users: User[];
  visits: { source: string; count: number }[];
}
export interface Catalog {
  customFields?: CustomField[];
  business: Business;
  packages: Package[];
  performers: Performer[];
  reviews: Pick<
    Review,
    | "performerId"
    | "overall"
    | "punctuality"
    | "engagement"
    | "communication"
    | "text"
    | "bestReaction"
    | "personalMoment"
    | "rememberedDetail"
    | "photo"
  >[];
}
