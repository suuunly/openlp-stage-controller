import { test, expect } from '@playwright/test';

// First-run smoke test against the production bundle (iPad landscape).
test('first run: configure then land on the role picker', async ({ page }) => {
  await page.goto('/');

  // Settings is the entry view when unconfigured.
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.getByPlaceholder('192.168.1.50').fill('192.168.1.50');
  await page.getByRole('button', { name: /Go to Stage/i }).click();

  // Home / role picker.
  await expect(page.getByText('ELIM')).toBeVisible();
  await expect(page.getByRole('button', { name: /Song Navigator/i })).toBeVisible();

  // Navigate into the Song Navigator — its nav chrome is always present.
  await page.getByRole('button', { name: /Song Navigator/i }).click();
  await expect(page.getByRole('button', { name: 'NEXT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PREV' })).toBeVisible();
  // With no OpenLP connected, the empty state is shown.
  await expect(page.getByText('No songs in this service')).toBeVisible();
});
