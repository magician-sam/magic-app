import { profileDetailFields, readProfileDetails, bindProfileDetails, reviewProfileDetails } from "./partner-profile-details.js";
import type { Organization, Offering } from "./marketplace.js";

type Kind = "staff" | "customer";
type Workspace = { id: string; name: string; kind: string; status: string; role: string };
const workspace = document.querySelector<HTMLDivElement>("#workspace")!;
const feedback = document.querySelector<HTMLParagraphElement>("#feedback")!;
const kindSelect = document.querySelector<HTMLSelectElement>("#login-kind")!;
const modeSelect = document.querySelector<HTMLSelectElement>("#desk-mode")!;
const query = new URLSearchParams(location.search);
kindSelect.value = query.get("account") === "customer" ? "customer" : "staff";
modeSelect.value = query.get("desk") === "review" ? "review" : "partner";
if (modeSelect.value === "review") kindSelect.value = "staff";
let selected = "", profile: Organization | undefined, listings: Offering[] = [];
let loading = false;
let saving = false;
function controls(disabled: boolean) {
  kindSelect.disabled = disabled || modeSelect.value === "review"; modeSelect.disabled = disabled;
  document.querySelector<HTMLButtonElement>("#refresh")!.disabled = disabled;
}
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const kind = () => kindSelect.value as Kind;
const root = () => `/api/marketplace/${kind()}/workspaces`;
const path = (id: string) => `${root()}/${encodeURIComponent(id)}`;
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new RequestError(response.status, data.error || "Could not complete this request.");
  return data as T;
}
function message(text: string, error = false) { feedback.textContent = text; feedback.className = `feedback ${error ? "error" : "success"}`; }
const categories = (text: string) => [...new Set(text.split(",").map(value => value.trim()).filter(Boolean))];
const badge = (status: string) => `<span class="badge ${status === "approved" ? "approved" : ""}">${escape(status)}</span>`;
function profileFields(value?: Organization, application = false) {
  return `<div class="fields"><label class="full">Profile name<input name="name" required maxlength="200" value="${escape(value?.name)}"></label>${application ? '<label>Partner type<select name="kind"><option value="independent_artist">Artist</option><option value="venue_operator">Playground / venue</option><option value="company">Company / planner</option></select></label><label>Profile address<input name="slug" required maxlength="100" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="your-profile-name"><small>Lowercase letters, numbers and hyphens.</small></label>' : ""}<label class="full">About your experience<textarea name="publicDescription" required minlength="20" maxlength="4000">${escape(value?.publicDescription)}</textarea></label><label class="full">Categories<input name="categories" required value="${escape(value?.categories.join(", "))}" placeholder="Playgrounds, birthdays"><small>Separate categories with commas.</small></label><label>Public phone <small>Optional; visible after approval</small><input name="phone" type="tel" maxlength="40" value="${escape(value?.publicContact?.phone)}"></label><label>Public email <small>Optional; visible after approval</small><input name="email" type="email" value="${escape(value?.publicContact?.email)}"></label></div>${profileDetailFields(value)}`;
}
function listingFields(value?: Offering) {
  return `<div class="fields"><label class="full">Service name<input name="title" required maxlength="200" value="${escape(value?.title)}"></label><label>Booking type<select name="kind">${[["service", "Show / service"], ["birthday_package", "Birthday package"], ["playground_entry", "Playground entry"]].map(([id, label]) => `<option value="${id}" ${value?.kind === id ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Categories<input name="categories" required value="${escape(value?.categories.join(", ") || profile?.categories.join(", "))}" placeholder="Magic, birthdays"></label></div>`;
}
function loginView() {
  workspace.innerHTML = `<section class="card"><h2>Sign in to your desk</h2><p class="muted">Use your existing ${kind() === "staff" ? "Backstage" : "customer"} account. Workspace access depends on the permissions assigned to this account.</p><form data-action="login"><div class="fields"><label>${kind() === "staff" ? "Email" : "Username"}<input name="identity" type="${kind() === "staff" ? "email" : "text"}" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="200"></label></div><div class="actions"><button>Sign in</button></div></form><p class="muted">${kind() === "staff" ? '<a href="/manage">Password help in Backstage ↗</a>' : '<a href="/b/magic-by-sam">Need an account or password help? Open My account on the customer site ↗</a>'}</p></section>`;
}
function applicationView() {
  return `<section class="card"><h2>A new partner profile</h2><p class="muted">For an artist, playground, venue or company. Save a private draft first, then send it for review.</p><form data-action="apply">${profileFields(undefined, true)}<div class="actions"><button>Save my application</button></div></form></section>`;
}
async function loadView() {
  if (loading) return;
  loading = true; workspace.setAttribute("aria-busy", "true");
  controls(true);
  try {
    if (modeSelect.value === "review") { await reviewView(); return; }
    const choices: Workspace[] = []; let cursor = "";
    do {
      const page = await api<{ workspaces: Workspace[]; next: string | null }>(root() + (cursor ? `?after=${encodeURIComponent(cursor)}` : ""));
      choices.push(...page.workspaces); cursor = page.next || "";
    } while (cursor);
    if (!choices.some(value => value.id === selected)) selected = choices[0]?.id || "";
    if (!selected) { workspace.innerHTML = applicationView(); return; }
    const view = await api<{ organization: Organization; membership: { role: string }; canEditDrafts: boolean }>(path(selected));
    profile = view.organization;
    listings = [];
    if (["owner", "work"].includes(view.membership.role)) {
      do {
        const page = await api<{ listings: Offering[]; next: string | null }>(path(selected) + "/listings" + (cursor ? `?after=${encodeURIComponent(cursor)}` : ""));
        listings.push(...page.listings); cursor = page.next || "";
      } while (cursor);
    }
    const editableProfile = view.canEditDrafts && ["draft", "pending"].includes(profile.status);
    workspace.innerHTML = `<div class="card"><label for="workspace-choice">Your workspace<select id="workspace-choice">${choices.map(value => `<option value="${escape(value.id)}" ${value.id === selected ? "selected" : ""}>${escape(value.name)} · ${escape(value.role)}</option>`).join("")}</select></label></div><div class="grid"><section class="card"><div class="card-head"><div><h2>${escape(profile.name)}</h2><span class="muted">${escape(view.membership.role)} · ${profile.bookingMode === "managed" ? "Platform coordinates requests" : "Partner handles requests"}</span></div>${badge(profile.status)}</div><form data-action="profile"><fieldset ${editableProfile ? "" : "disabled"}>${profileFields(profile)}<div class="actions"><button>Save profile</button></div></fieldset></form>${profile.status === "draft" && view.membership.role === "owner" ? '<form data-action="submit-profile"><div class="actions"><button class="quiet">Send profile for review</button></div></form>' : '<p class="notice">Published details require platform review. Your permissions remain specific to this workspace.</p>'}</section><section class="card"><h2>Your services</h2><p class="muted">Create a show, birthday package or entry option. Drafts stay private.</p>${view.canEditDrafts ? `<form data-action="create-listing">${listingFields()}<div class="actions"><button>Save a service draft</button></div></form>` : '<p class="notice">Listing editing is not available for this role or profile status.</p>'}${listings.map(value => `<article class="listing"><div class="card-head"><h3>${escape(value.title)}</h3>${badge(value.status)}</div>${value.status === "draft" && view.canEditDrafts ? `<form data-action="edit-listing" data-id="${escape(value.id)}">${listingFields(value)}<div class="actions"><button>Save changes</button><button class="quiet" value="submit" name="intent">Send for review</button></div></form>` : `<p class="muted">${escape(value.kind.replaceAll("_", " "))} · ${escape(value.categories.join(", "))}</p>`}</article>`).join("")}</section></div><details><summary>Add another partner profile</summary>${applicationView()}</details>`;
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) loginView();
    else if (error instanceof RequestError && error.status === 403 && modeSelect.value !== "review") {
      workspace.innerHTML = applicationView(); message(error.message, true);
    } else { workspace.innerHTML = '<section class="card"><h2>Your desk is unavailable</h2><p>Refresh after access is activated, or return to your existing Backstage.</p><a href="/manage">Open Backstage ↗</a></section>'; message(error instanceof Error ? error.message : "Could not open the desk.", true); }
  } finally { loading = false; controls(saving); workspace.setAttribute("aria-busy", "false"); }
}
async function reviewView() {
  const applications: Organization[] = [], queue: { offering: Offering; partner: { name: string; status: string } }[] = []; let cursor = "";
  do {
    const page = await api<{ applications: Organization[]; next: string | null }>("/api/marketplace/platform/applications" + (cursor ? `?after=${encodeURIComponent(cursor)}` : ""));
    applications.push(...page.applications); cursor = page.next || "";
  } while (cursor);
  do {
    const page = await api<{ listings: typeof queue; next: string | null }>("/api/marketplace/platform/listings" + (cursor ? `?after=${encodeURIComponent(cursor)}` : ""));
    queue.push(...page.listings); cursor = page.next || "";
  } while (cursor);
  const reviewForm = (action: string, id: string, revision: number, organizationId = "") => `<form data-action="${action}" data-id="${escape(id)}" data-revision="${revision}" data-organization="${escape(organizationId)}"><label>Review note<textarea name="note" required maxlength="2000" placeholder="Record your decision or explain the changes needed."></textarea></label><div class="actions"><button name="decision" value="approve">Approve</button><button class="quiet" name="decision" value="return">Return for changes</button></div></form>`;
  workspace.innerHTML = `<section class="card"><p class="eyebrow">Master review</p><h2>Ready for your decision</h2><p class="muted">Partner profiles and service listings have separate approvals. Every decision records your account and note.</p></section><h2>Partner applications (${applications.length})</h2><div class="review-grid">${applications.map(value => `<article class="card"><h3>${escape(value.name)}</h3>${badge(value.status)}<p>${escape(value.kind.replaceAll("_", " "))} · ${escape(value.categories.join(", "))}</p><p>${escape(value.publicDescription)}</p><p class="muted">Public contact: ${escape(value.publicContact?.phone || "No phone")} · ${escape(value.publicContact?.email || "No email")}</p>${reviewProfileDetails(value)}${reviewForm("review-profile", value.id, value.revision)}</article>`).join("") || '<p class="empty">No partner applications are waiting.</p>'}</div><h2 class="listing">Service submissions (${queue.length})</h2><div class="review-grid">${queue.map(({ offering, partner }) => `<article class="card"><h3>${escape(offering.title)}</h3><p>${escape(partner.name)} · partner ${escape(partner.status)}</p><p>${escape(offering.kind.replaceAll("_", " "))} · ${escape(offering.categories.join(", "))}</p>${reviewForm("review-listing", offering.id, offering.revision, offering.organizationId)}</article>`).join("") || '<p class="empty">No services are waiting for review.</p>'}</div>`;
}
function profileBody(data: FormData) {
  const phone = String(data.get("phone") || "").trim(), email = String(data.get("email") || "").trim();
  return { name: String(data.get("name")), publicDescription: String(data.get("publicDescription")), categories: categories(String(data.get("categories"))),
    publicContact: { ...(phone ? { phone } : {}), ...(email ? { email } : {}) }, ...readProfileDetails(data) };
}
bindProfileDetails(workspace);
workspace.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving || loading) return;
  saving = true; controls(true);
  const form = event.target as HTMLFormElement, submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
  const data = new FormData(form), action = form.dataset.action;
  const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>("button")); buttons.forEach(value => value.disabled = true);
  try {
    if (action === "login") {
      await api(kind() === "staff" ? "/api/login" : "/api/customer/magic-by-sam/login", "POST", { [kind() === "staff" ? "email" : "username"]: String(data.get("identity")), password: String(data.get("password")) });
      form.reset();
    } else if (action === "apply") {
      const result = await api<Organization>(`/api/marketplace/${kind()}/applications`, "POST", { ...profileBody(data), kind: String(data.get("kind")), slug: String(data.get("slug")) }); selected = result.id;
    } else if (action === "profile" && profile) await api(path(selected) + "/profile", "PUT", { ...profileBody(data), expectedRevision: profile.revision });
    else if (action === "submit-profile" && profile) await api(path(selected) + "/submit", "POST", { expectedRevision: profile.revision });
    else if (action === "create-listing" || action === "edit-listing") {
      const body = { title: String(data.get("title")), kind: String(data.get("kind")), categories: categories(String(data.get("categories"))) };
      if (action === "create-listing") await api(path(selected) + "/listings", "POST", body);
      else {
        const listing = listings.find(value => value.id === form.dataset.id)!;
        if (submitter?.value === "submit") await api(path(selected) + "/listings/" + encodeURIComponent(listing.id) + "/submit", "POST", { ...body, expectedRevision: listing.revision });
        else await api(path(selected) + "/listings/" + encodeURIComponent(listing.id), "PUT", { ...body, expectedRevision: listing.revision });
      }
    } else if (action === "review-profile" || action === "review-listing") {
      const target = action === "review-profile" ? `organizations/${encodeURIComponent(form.dataset.id!)}/review` : `organizations/${encodeURIComponent(form.dataset.organization!)}/listings/${encodeURIComponent(form.dataset.id!)}/review`;
      await api("/api/marketplace/platform/" + target, "POST", { decision: submitter?.value, expectedRevision: Number(form.dataset.revision), note: String(data.get("note")) });
    }
    message(action === "login" ? "Signed in." : "Saved. Your desk now shows the latest status."); await loadView();
  } catch (error) {
    message(error instanceof Error ? error.message : "Could not save. Try refreshing your desk.", true);
    if (error instanceof RequestError && error.status === 409) await loadView();
  }
  finally { saving = false; controls(false); buttons.forEach(value => value.disabled = false); }
});
workspace.addEventListener("change", event => { const target = event.target as HTMLSelectElement; if (target.id === "workspace-choice") { selected = target.value; void loadView(); } });
function switchDesk() {
  if (modeSelect.value === "review") kindSelect.value = "staff";
  selected = ""; profile = undefined; listings = []; message("");
  history.replaceState(null, "", `/partner?account=${kind()}&desk=${encodeURIComponent(modeSelect.value)}`); void loadView();
}
kindSelect.addEventListener("change", switchDesk); modeSelect.addEventListener("change", switchDesk);
document.querySelector("#refresh")!.addEventListener("click", () => { message(""); void loadView(); });
void loadView();
