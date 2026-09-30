export type EventPlan = { shows: string[]; guests: string[]; occasion: string };

// Shared links contain catalog choices only. They never contain customer or venue details.
export function planLink(base: string, slug: string, plan: EventPlan): string {
  const url = new URL(base);
  url.searchParams.delete("plan-for");
  url.searchParams.delete("plan-show");
  url.searchParams.delete("plan-guest");
  url.searchParams.delete("plan-occasion");
  url.searchParams.set("plan-for", slug);
  for (const id of [...new Set(plan.shows)].slice(0, 20)) url.searchParams.append("plan-show", id);
  for (const name of [...new Set(plan.guests)].slice(0, 20)) url.searchParams.append("plan-guest", name);
  if (plan.occasion) url.searchParams.set("plan-occasion", plan.occasion);
  url.hash = "event-box";
  return url.href;
}

export function readPlanLink(search: string, slug: string, shows: string[], guests: string[], occasions: string[]): EventPlan | null {
  const params = new URLSearchParams(search);
  if (params.get("plan-for") !== slug) return null;
  const validShows = new Set(shows);
  const validGuests = new Set(guests);
  const selectedShows = [...new Set(params.getAll("plan-show").slice(0, 40))].filter((id) => validShows.has(id)).slice(0, 20);
  const selectedGuests = [...new Set(params.getAll("plan-guest").slice(0, 40))].filter((name) => validGuests.has(name)).slice(0, 20);
  if (!selectedShows.length && !selectedGuests.length) return null;
  const occasion = params.get("plan-occasion") ?? "";
  return { shows: selectedShows, guests: selectedGuests, occasion: occasions.includes(occasion) ? occasion : "" };
}
