import type { Package } from "./models.js";
import { requireThat } from "./domain.js";

export function prepareBundle(
  input: Omit<Package, "id">,
  catalog: Package[],
  recordId: string,
): Omit<Package, "id"> {
  if (!input.bundleIds?.length) return { ...input, bundleSnapshot: [] };
  requireThat(
    input.bundleIds.length >= 2,
    "Choose at least two shows for a bundle.",
  );
  requireThat(
    new Set(input.bundleIds).size === input.bundleIds.length,
    "Choose each included show once.",
  );
  requireThat(
    !input.bundleIds.includes(recordId),
    "A bundle cannot include itself.",
  );
  const shows = input.bundleIds.map((id) => catalog.find((p) => p.id === id));
  requireThat(
    shows.every((p) => p?.active && !p.bundleIds?.length),
    "Choose active individual shows, not another bundle.",
  );
  requireThat(
    input.priceMode === "fixed",
    "Set a fixed total price for the bundle.",
  );
  const parts = shows as Package[],
    breaks = input.bundleBreakMinutes ?? 10;
  const duration =
    parts.reduce((n, p) => n + p.duration, 0) + breaks * (parts.length - 1);
  requireThat(
    duration <= 480,
    "Bundle duration must be no more than eight hours.",
  );
  return {
    ...input,
    bundleBreakMinutes: breaks,
    bundleSnapshot: parts.map((p) => ({
      id: p.id,
      name: p.name,
      duration: p.duration,
      priceMode: p.priceMode,
      price: p.price,
    })),
    duration,
    setup: Math.max(...parts.map((p) => p.setup)),
    needsPower: parts.some((p) => p.needsPower),
    indoorOnly: parts.some((p) => p.indoorOnly),
    minSpace: Math.max(...parts.map((p) => p.minSpace)),
    checklist: [...new Set(parts.flatMap((p) => p.checklist))],
  };
}

export function validateBundleSelection(packages: Package[]) {
  const included = packages.flatMap((p) =>
    p.bundleIds?.length ? p.bundleIds : [p.id],
  );
  requireThat(
    new Set(included).size === included.length,
    "Your selection repeats a show already included in a bundle. Remove the duplicate show or bundle.",
  );
}
