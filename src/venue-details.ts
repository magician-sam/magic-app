import { z } from "zod";

export const venueLocationSchema = z.object({
  country: z.string().trim().max(100).default(""),
  region: z.string().trim().max(100).default(""),
  city: z.string().trim().min(1).max(100),
  area: z.string().trim().max(100).default(""),
  address: z.string().trim().min(3).max(500),
  aliases: z.array(z.string().trim().min(1).max(100)).max(15).default([]),
  coordinates: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().optional(),
}).strict();
export type VenueLocation = z.infer<typeof venueLocationSchema>;

/** URLs are rendered by the browser, never fetched by the server. No embeds or executable schemes. */
export function validPublicMediaUrl(value: string, kind: "photo" | "video") {
  if (value.includes("\\") || [...value].some(char => char.charCodeAt(0) <= 32)) return false;
  try {
    const relative = value.startsWith("/") && !value.startsWith("//");
    if (!relative && !/^https:\/\//i.test(value)) return false;
    const url = new URL(value, "https://magic-app.invalid");
    if ((!relative && url.protocol !== "https:") || url.username || url.password) return false;
    if (relative && url.origin !== "https://magic-app.invalid") return false;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname) || url.hostname.endsWith(".local")) return false;
    return (kind === "photo" ? /\.(jpe?g|png|webp|gif|avif)$/i : /\.(mp4|webm|mov)$/i).test(url.pathname);
  } catch { return false; }
}
export const venueMediaSchema = z.object({
  kind: z.enum(["photo", "video"]), url: z.string().trim().max(2000),
  caption: z.string().trim().min(1).max(200),
  // Kept in the private profile/review record. Never included in public projections.
  permissionReference: z.string().trim().min(1).max(1000),
}).strict().refine(value => validPublicMediaUrl(value.url, value.kind), { message: "Use a direct HTTPS image/video link or a local media path matching its type.", path: ["url"] });

