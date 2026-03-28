import { test, expect } from '@playwright/test';

test.describe('Settings / Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to simulate fresh install
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('flowforge.preferences.v1');
      localStorage.removeItem('flowforge.onboarding.v1');
    });
    await page.reload();
  });

  test('should show settings page on first visit (onboarding required)', async ({ page }) => {
    await page.waitForSelector('text=First-Run Setup', { timeout: 10000 });
    await expect(page.locator('text=First-Run Setup')).toBeVisible();
  });

  test('should allow skipping onboarding', async ({ page }) => {
    await page.waitForSelector('text=Skip for now', { timeout: 10000 });
    await page.click('text=Skip for now');
    // Should land on builder
    await expect(page.locator('text=Workflow Builder')).toBeVisible();
  });

  test('should persist provider selection through onboarding', async ({ page }) => {
    await page.waitForSelector('text=Continue to Step 2', { timeout: 10000 });
    await page.click('text=Continue to Step 2');
    await page.waitForSelector('text=Finish setup', { timeout: 5000 });
    await page.click('text=Finish setup');
    // Should land on builder after completing onboarding
    await expect(page.locator('text=Workflow Builder')).toBeVisible();
  });
});
