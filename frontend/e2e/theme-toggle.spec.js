import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
  test('should start with dark theme by default', async ({ page }) => {
    await page.goto('/');
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('should toggle to light theme when toggle is clicked', async ({ page }) => {
    await page.goto('/');
    await page.locator('.ff-theme-toggle').click();
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('light');
  });

  test('should toggle back to dark theme on second click', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('.ff-theme-toggle');
    await toggle.click();
    await toggle.click();
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('should persist theme choice across navigation', async ({ page }) => {
    await page.goto('/');
    await page.locator('.ff-theme-toggle').click();
    // Reload
    await page.reload();
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('light');
  });
});
