import { test, expect } from "@playwright/test";

test("phone guest selection survives reload and signup returns directly to event details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/b/magic-by-sam");
  await page.locator('[data-add-guest="Football Show"]').click();
  await page.locator('#sam-shows [data-add="magic"]').click();
  await page.reload();
  const bar = page.locator('.mobile-event-bar');
  await expect(bar).toContainText('Your event · 2');
  await expect(bar.getByRole('button', { name: 'Continue' })).toBeInViewport();
  await bar.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your shows are saved' })).toBeVisible();
  await expect(page.getByLabel('Friend’s 10-character code (optional)')).toBeHidden();
  await page.getByLabel('Your name', { exact: true }).fill('Guest journey test');
  await page.getByLabel('Phone / WhatsApp with country code').fill('+96170112233');
  await page.getByLabel('Your sign-in name').fill(`guest_${Date.now()}`);
  await page.getByLabel('Choose a password').fill('Browser-test-only-42!');
  await page.getByRole('button', { name: 'Create account & continue' }).click();
  await expect(page.getByRole('heading', { name: 'Tell us about your event' })).toBeVisible();
  await expect(page.locator('.signup-progress')).toContainText('Football Show');
  await expect(page.locator('.signup-progress')).toContainText('A little hocus pocus');
  await page.getByLabel('Event name', { exact: true }).fill('Guest journey celebration');
  await page.getByLabel('Event date', { exact: true }).fill('2027-08-10');
  await page.getByLabel(/Show start time/).fill('15:00');
  await page.getByLabel('Venue / location').fill('Local test venue');
  await page.getByRole('button', { name: 'Send my event request' }).click();
  await expect(page.locator('.requested-services')).toContainText('Football Show');
  await expect(page.getByRole('heading', { name: 'Guest journey celebration' })).toBeVisible();
});

test("chooser uses audience and venue preferences", async ({ page }) => {
  await page.goto('/b/magic-by-sam');
  await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
  for (const name of ['Birthday', '1–20', 'Make everyone laugh', 'Children 6–12', 'Outdoors']) {
    await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  }
  await expect(page.locator('.chooser-context')).toContainText('Children 6–12');
  await expect(page.locator('.chooser-context')).toContainText('Outdoors');
  await expect(page.locator('.recommendation-reason').first()).toBeVisible();
});
