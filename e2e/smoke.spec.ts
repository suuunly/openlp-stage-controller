import { test, expect } from '@playwright/test';

// First-run smoke test against the production bundle (iPad landscape).
test('first run: configure then land on the role picker', async ({ page }) => {
  await page.goto('/');

  // Settings is the entry view when unconfigured.
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByPlaceholder('5510')).toBeVisible();
  await expect(page.getByPlaceholder('0000')).toBeVisible();

  await page.getByPlaceholder('192.168.1.50').fill('192.168.1.50');
  await page.getByRole('button', { name: /Connect|Go to Stage/i }).click();

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
  await page.getByRole('button', { name: /Connect|Go to Stage/i }).click();

  await page.getByRole('button', { name: /Images/i }).click();
  await expect(page.getByText('No images in this service')).toBeVisible();
  await page.getByRole('button', { name: 'Back to home' }).click();

  await page.getByRole('button', { name: /Presentation/i }).click();
  await expect(page.getByText('No presentations in this service')).toBeVisible();
  // Notes come from get_show's per-slide `notes`; with nothing live there are
  // none to show yet.
  await expect(page.getByText('No notes for this slide')).toBeVisible();
});

test('the Bible view refuses a reference it cannot resolve', async ({ page }) => {
  // With no FreeShow there is no bible loaded, so nothing can be resolved to
  // FreeShow's numeric book.chapter.verse form. Saying so beats sending a
  // reference that would silently land on the wrong verse.
  await page.goto('/');
  await page.getByPlaceholder('192.168.1.50').fill('192.168.1.50');
  await page.getByRole('button', { name: /Connect|Go to Stage/i }).click();
  await page.getByRole('button', { name: /Bible Verses/i }).click();

  await page.getByLabel('Reference').fill('Jóh 3:16');
  await page.getByRole('button', { name: 'SHOW ON SCREEN' }).click();

  await expect(page.getByText(/check the book name/i)).toBeVisible();
});
