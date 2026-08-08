import { test, expect } from '@playwright/test';

// First-run smoke test against the production bundle (iPad landscape).
test('first run: configure then land on the role picker', async ({ page }) => {
  await page.goto('/');

  // Settings is the entry view when unconfigured.
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByPlaceholder('5506')).toBeVisible();

  await page.getByPlaceholder('192.168.1.50').fill('192.168.1.50');
  await page.getByRole('button', { name: /Go to Stage/i }).click();

  // Home / role picker.
  await expect(page.getByText('ELIM')).toBeVisible();
  await expect(page.getByRole('button', { name: /Song Navigator/i })).toBeVisible();

  // Navigate into the Song Navigator — its nav chrome is always present.
  await page.getByRole('button', { name: /Song Navigator/i }).click();
  await expect(page.getByRole('button', { name: 'NEXT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PREV' })).toBeVisible();
  // With no FreeShow connected, the empty state is shown.
  await expect(page.getByText('No songs in this service')).toBeVisible();
});

test('every role opens and shows its own empty state', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('192.168.1.50').fill('192.168.1.50');
  await page.getByRole('button', { name: /Go to Stage/i }).click();

  await page.getByRole('button', { name: /Images/i }).click();
  await expect(page.getByText('No images in this service')).toBeVisible();
  await page.getByRole('button', { name: 'Back to home' }).click();

  await page.getByRole('button', { name: /Presentation/i }).click();
  await expect(page.getByText('No presentations in this service')).toBeVisible();
  // Notes are absent by design — FreeShow's API doesn't expose them.
  await expect(page.getByText(/Speaker notes aren’t available/)).toBeVisible();
});

test('the Bible view sends a reference without needing a picker', async ({ page }) => {
  const actions: string[] = [];
  // FreeShow's API is action-based on a single endpoint; capture what we send.
  await page.route('**/*action=**', async (route) => {
    actions.push(new URL(route.request().url()).searchParams.get('action') ?? '');
    await route.fulfill({ status: 200, body: '' });
  });

  await page.goto('/');
  await page.getByPlaceholder('192.168.1.50').fill('192.168.1.50');
  await page.getByRole('button', { name: /Go to Stage/i }).click();
  await page.getByRole('button', { name: /Bible Verses/i }).click();

  await page.getByLabel('Reference').fill('Jóh 3:16');
  await page.getByRole('button', { name: 'SHOW ON SCREEN' }).click();

  await expect.poll(() => actions).toContain('start_scripture');
  // The reference joins the history strip so it can be re-shown in one tap.
  await expect(page.getByRole('button', { name: 'Jóh 3:16' })).toBeVisible();
});
