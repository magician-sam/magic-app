import { test, expect } from "@playwright/test";
test("a visitor can compare real shows and restore a saved event plan", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-compare="magic"]').click();
  await page.locator('[data-compare="science"]').click();
  await page.getByRole("button", { name: "Compare 2 shows", exact: true }).click();
  const comparison = page.getByRole("dialog");
  await expect(comparison.getByRole("heading", { name: "Compare your shows" })).toBeVisible();
  await expect(comparison.locator(".comparison-card")).toHaveCount(2);
  await expect(comparison).not.toContainText("m²");
  await comparison.getByRole("button", { name: "Close dialog" }).click();
  await page.locator('#shows [data-add="magic"]').click();
  await page.locator("#save-plan").click();
  await page.locator('#event-box [data-remove="magic"]').click();
  await expect(page.locator("#event-box")).not.toContainText("Magic Show");
  await page.locator("#restore-plan").click();
  await expect(page.locator("#event-box")).toContainText("Magic Show");
  await page.reload();
  await expect(page.locator("#event-box")).toContainText("Magic Show");
  await page.locator("#forget-plan").click();
  await expect(page.locator("#restore-plan")).toHaveCount(0);
});
test("occasion shortcut builds a mixed event and keeps it through the account step", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-start-occasion="School event"]').click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "How many guests?" })).toBeVisible();
  await dialog.getByRole("button", { name: "21–50", exact: true }).click();
  await dialog.getByRole("button", { name: "Leave everyone speechless", exact: true }).click();
  await dialog.getByRole("button", { name: "Children 6–12", exact: true }).click();
  await dialog.getByRole("button", { name: "Not decided yet", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Design your event", exact: true })).toBeVisible();
  const shows = dialog.locator("[data-recommend]");
  await shows.nth(0).click();
  await shows.nth(1).click();
  await dialog.locator('[data-guest-idea="Juggling"]').click();
  await expect(dialog.locator("[data-recommend]").nth(0)).toHaveText("✓ Added · remove");
  await expect(dialog.locator("[data-recommend]").nth(1)).toHaveText("✓ Added · remove");
  await dialog.getByRole("button", { name: "Continue with my event ↗", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /^Create account & continue/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await expect(page.locator("#event-box")).toContainText("Juggling");
  await expect(page.locator("#request")).toBeEnabled();
});
test("show details keep the first line and close button visible", async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto("/");
    await page.locator('[data-enquiry-details="Animation"]').first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Animation" })).toBeVisible();
    const positions = await dialog.evaluate((node) => ({
      headingBottom: node.querySelector(".dialog-heading").getBoundingClientRect().bottom,
      firstLineTop: node.querySelector(".show-detail .eyebrow").getBoundingClientRect().top,
      headingHeight: node.querySelector(".dialog-heading").getBoundingClientRect().height,
    }));
    expect(positions.firstLineTop).toBeGreaterThanOrEqual(positions.headingBottom);
    expect(positions.headingHeight).toBeLessThan(75);
    await dialog.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeInViewport();
    await dialog.getByRole("button", { name: "Close dialog" }).click();
  }
});
test("show photos enlarge and return to their details on phone and desktop", async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto("/");
    await page.locator('[data-show-details="magic"]').first().click();
    const details = page.locator("#modal");
    await expect(details.getByRole("heading", { name: /Magic Show/ })).toBeVisible();
    await details.locator("[data-zoom-photo]").first().click();
    const viewer = page.locator(".photo-lightbox");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator(".lightbox-count")).toContainText("1 of");
    await viewer.getByRole("button", { name: "Zoom in" }).click();
    await expect(viewer.locator(".lightbox-level")).toHaveText("200%");
    await viewer.getByRole("button", { name: "Next photo" }).click();
    await expect(viewer.locator(".lightbox-count")).toContainText("2 of");
    await expect(viewer.locator(".lightbox-level")).toHaveText("100%");
    await viewer.getByRole("button", { name: "Close photo viewer" }).click();
    await expect(details).toBeVisible();
    await expect(viewer).not.toBeVisible();
  }
});
test("customer request, owner quote, customer acceptance and owner confirmation", async ({
  browser,
}) => {
  const runId = Date.now();
  const eventName = `Browser celebration ${runId}`;
  const eventDate = new Date(runId + (60 + (runId % 3000)) * 86400000)
    .toISOString()
    .slice(0, 10);
  const customer = await browser.newContext();
  const page = await customer.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Make your event/ })).toBeVisible();
  await page.locator('#shows [data-add="magic"]').click();
  await page.getByRole("button", { name: "Request my event" }).click();
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Browser test family");
  await page.getByLabel("Phone / WhatsApp").fill("+96170011223");
  await page.getByLabel("Your sign-in name").fill(`browser_${Date.now()}`);
  await page.getByLabel("Choose a password").fill("Customer-browser-test-42!");
  await expect(page.getByText("Your 1 chosen show is still in your event box.")).toBeVisible();
  await page.getByRole("button", { name: "Create account & continue" }).click();
  await expect(page.getByText("Still in your event box: Magic Show")).toBeVisible();
  await page
    .getByLabel("Event name", { exact: true })
    .fill(eventName);
  await page.getByLabel("Event date", { exact: true }).fill(eventDate);
  await page.getByLabel(/Show start time/).fill("14:00");
  await page.getByLabel("Venue / location").fill("Browser test venue");
  await page.getByRole("button", { name: "Send my event request" }).click();
  await expect(
    page.getByRole("heading", { name: eventName }),
  ).toBeVisible();

  const staff = await browser.newContext();
  const admin = await staff.newPage();
  await admin.goto("/manage");
  await admin.getByLabel("Email", { exact: true }).fill("preview@example.test");
  await admin
    .getByLabel("Password", { exact: true })
    .fill("Local-preview-only-42!");
  await admin.getByRole("button", { name: "Step inside" }).click();
  await admin
    .getByRole("button", { name: "Events & requests", exact: true })
    .click();
  await admin.locator(".row").filter({ hasText: eventName }).getByRole("button", { name: "Open event" }).click();
  await admin.getByRole("button", { name: "Edit event details" }).click();
  await admin
    .getByRole("group", { name: "Assigned performers" })
    .getByLabel("Sam · preview profile")
    .check();
  await admin.getByRole("button", { name: "Save changes" }).click();
  await admin
    .getByLabel("Availability for Sam · preview profile")
    .selectOption("available");
  await admin.getByRole("button", { name: "Build quote options" }).click();
  await admin.locator('[name="amount-0"]').fill("300");
  await admin.locator('[name="deposit-0"]').fill("0");
  await admin.locator('[name="amount-1"]').fill("450");
  await admin
    .getByRole("button", { name: "Save proposal for customer" })
    .click();
  await expect(admin.locator('.booking-banner')).toContainText('Quoted', { ignoreCase: true });
  await page.reload();
  await page
    .getByRole("button", { name: "Choose this option" })
    .first()
    .click();
  await page.getByRole("button", { name: "Accept this proposal" }).click();
  await expect(page.locator(".event-page > .badge")).toHaveText("Accepted");
  await admin.getByRole("button", { name: "Close dialog" }).click();
  await admin.reload();
  await admin.getByRole("button", { name: "Events & requests", exact: true }).click();
  await admin.locator(".row").filter({ hasText: eventName }).getByRole("button", { name: "Open event" }).click();
  await admin.getByRole("button", { name: "Accept & confirm event" }).click();
  await admin.getByLabel("Payment received now (USD)").fill("0");
  await admin.getByLabel("Payment agreement").fill("Full amount after the show");
  await admin.getByLabel("Internal confirmation note").fill("Browser verified date and availability");
  await admin.getByRole("button", { name: "Accept, confirm & notify customer" }).click();
  await expect(admin.locator(".booking-banner .badge")).toHaveText("Confirmed");
  await page.reload();
  await expect(page.locator(".event-page > .badge")).toHaveText("Confirmed");
  await expect(page.getByText("Payment agreement:")).toBeVisible();
  await expect(page.getByText("Full amount after the show")).toBeVisible();
  expect(errors).toEqual([]);
  await customer.close();
  await staff.close();
});
test("mobile event builder fits viewport and help chooser adds a suitable show", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Help me choose" }).click();
  await expect(
    page.getByLabel("Main audience age", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Birthday" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "21–50" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Make everyone laugh" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Children 6–12" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Indoors", exact: true }).click();
  await expect(
    page
      .locator("#modal")
      .getByRole("heading", { name: "Bubbles & daydreams" }),
  ).toBeVisible();
  await page
    .locator("#modal .chooser-result")
    .filter({ hasText: "Bubbles & daydreams" })
    .getByRole("button", { name: "Add to my event" })
    .click();
  await expect(page.locator("#event-box")).toContainText("Bubbles & daydreams");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

