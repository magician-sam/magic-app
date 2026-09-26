import { test, expect } from "@playwright/test";
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
test("customer request, owner quote, customer acceptance and owner confirmation", async ({
  browser,
}) => {
  const customer = await browser.newContext();
  const page = await customer.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Make your day/ })).toBeVisible();
  await page.locator('#shows [data-add="magic"]').click();
  await page.getByRole("button", { name: "Request my event" }).click();
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Browser test family");
  await page.getByLabel("Phone / WhatsApp").fill("+96170011223");
  await page.getByLabel("Choose a password").fill("Customer-browser-test-42!");
  await expect(page.getByText("Your 1 chosen show is still in your event box.")).toBeVisible();
  await page.getByRole("button", { name: "Create account & continue" }).click();
  await expect(page.getByText("Still in your event box: A little hocus pocus")).toBeVisible();
  await page
    .getByLabel("Event name", { exact: true })
    .fill("Browser test celebration");
  await page.getByLabel("Event date", { exact: true }).fill("2027-07-10");
  await page.getByLabel(/Show start time/).fill("14:00");
  await page.getByLabel("Venue / location").fill("Browser test venue");
  await page.getByRole("button", { name: "Send my event request" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser test celebration" }),
  ).toBeVisible();
  const eventUrl = page.url();
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
  await admin.getByRole("button", { name: "Open event" }).first().click();
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
  await page.goto(eventUrl);
  await page
    .getByRole("button", { name: "Choose this option" })
    .first()
    .click();
  await page.getByRole("button", { name: "Accept this proposal" }).click();
  await expect(page.locator(".event-page > .badge")).toHaveText("Accepted");
  await admin.getByRole("button", { name: "Close dialog" }).click();
  await admin.reload();
  await admin.getByRole("button", { name: "Open event" }).first().click();
  await admin
    .getByRole("button", { name: "Confirm booking", exact: true })
    .click();
  await admin
    .getByLabel("Reason / confirmation note")
    .fill("Browser verified availability and zero deposit");
  await admin.getByRole("button", { name: "Check & confirm booking" }).click();
  await expect(admin.locator(".booking-banner .badge")).toHaveText("Confirmed");
  await page.reload();
  await expect(page.locator(".event-page > .badge")).toHaveText("Confirmed");
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
