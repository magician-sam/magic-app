import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import webpush from "web-push";
import { id, type Store } from "./store.js";
import type { Booking, Business, Customer } from "./models.js";

export interface CustomerNotice {
  id: string;
  customerId: string;
  bookingId: string;
  title: string;
  body: string;
  kind: "accepted" | "confirmed" | "declined" | "cancelled" | "updated" | "offer";
  at: string;
  readAt: string;
}
export interface PushDevice {
  id: string;
  customerId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export const deviceId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");
export const pushPublicKey = () => process.env.WEB_PUSH_PUBLIC_KEY ?? "";

async function deliver(store: Store, business: Business, customer: Customer, notice: CustomerNotice, origin: string) {
  let email: "sent" | "not_configured" | "no_address" | "failed" = "not_configured";
  const sender = process.env.GMAIL_SENDER_EMAIL;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!customer.email) email = "no_address";
  else if (sender && appPassword) {
    try {
      const transport = nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: sender, pass: appPassword },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      await transport.sendMail({
        from: `Magic by Sam <${sender}>`,
        to: customer.email,
        subject: notice.title,
        text: `${notice.body}\n\nOpen Magic by Sam to see your event: ${origin}/b/${encodeURIComponent(business.slug)}\n\nMagic by Sam`,
      });
      email = "sent";
    } catch {
      email = "failed";
    }
  }
  let push: "sent" | "not_configured" | "no_device" | "failed" = "not_configured";
  const publicKey = pushPublicKey();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(`mailto:${sender || business.contactEmail || "sam.wehbi@gmail.com"}`, publicKey, privateKey);
      const devices = (await store.all<PushDevice>(business.id, "pushDevices"))
        .filter((device) => device.customerId === customer.id);
      push = devices.length ? "failed" : "no_device";
      if (devices.length) {
        const results = await Promise.allSettled(devices.map(async (device) => {
          try {
            await webpush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify({ title: notice.title, body: notice.body, url: `/b/${business.slug}` }));
            return true;
          } catch (error) {
            if (typeof error === "object" && error && "statusCode" in error && [404, 410].includes(Number(error.statusCode)))
              await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='pushDevices' AND id=?").run(business.id, device.id);
            return false;
          }
        }));
        if (results.some((result) => result.status === "fulfilled" && result.value)) push = "sent";
      }
    } catch {
      push = "failed";
    }
  }
  await store.put(business.id, "notificationDeliveries", { id: notice.id, customerId: customer.id, email, push, at: new Date().toISOString() });
  return { email, push };
}

export async function eventNotice(store: Store, business: Business, booking: Booking, kind: CustomerNotice["kind"], origin: string) {
  const customer = await store.get<Customer>(business.id, "customers", booking.customerId);
  if (!customer) return { email: "no_address", push: "no_device" };
  const language = {
    accepted: ["Your event is accepted", "Sam has accepted your event and is starting the preparations."],
    confirmed: ["Your event is confirmed", "Your event is confirmed. Open your event page for the latest details."],
    declined: ["About your event request", "Sam is unable to take this event request. Please contact us if you would like to discuss another date or show."],
    cancelled: ["Your event was cancelled", "Your event has been cancelled. Please contact us about any payment or refund."],
    updated: ["Your event details changed", "The details of your event were updated. Please open your event page to review them."],
    offer: ["A new offer from Magic by Sam", "See the latest offer in your account."],
  }[kind];
  const confirmation = `Sam has confirmed ${booking.name} for ${booking.date} at ${booking.time}. ${booking.paymentTerms ? `Payment agreement: ${booking.paymentTerms}. ` : ""}Open your private event page for the agreed plan and recorded payments.`;
  const notice: CustomerNotice = { id: id(), customerId: customer.id, bookingId: booking.id, kind, title: `${language[0]} · ${booking.name}`, body: kind === "confirmed" ? confirmation : language[1], at: new Date().toISOString(), readAt: "" };
  await store.put(business.id, "customerNotifications", notice);
  return await deliver(store, business, customer, notice, origin);
}

export async function offerNotice(store: Store, business: Business, title: string, description: string, origin: string) {
  const customers = (await store.all<Customer>(business.id, "customers")).filter((customer) => customer.offersConsent);
  for (const customer of customers) {
    const notice: CustomerNotice = { id: id(), customerId: customer.id, bookingId: "", kind: "offer", title: `New offer · ${title}`, body: description, at: new Date().toISOString(), readAt: "" };
    await store.put(business.id, "customerNotifications", notice);
    await deliver(store, business, customer, notice, origin);
  }
}
