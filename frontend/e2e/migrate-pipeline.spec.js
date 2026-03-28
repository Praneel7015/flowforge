import { test, expect } from '@playwright/test';

test.describe('Migrate Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flowforge.onboarding.v1', JSON.stringify({ status: 'completed' }));
      localStorage.setItem('flowforge.preferences.v1', JSON.stringify({
        selectedProviders: { ai: 'ollama', cicd: 'gitlab' },
        llmType: 'local',
        byomConfig: { enabled: false, model: '', baseUrl: '' },
      }));
    });
    await page.reload();
  });

  test('should navigate to Migrate panel', async ({ page }) => {
    await page.waitForSelector('text=Workflow Builder', { timeout: 10000 });
    await page.click('text=Migrate');
    await expect(page.locator('text=Convert CI/CD Configurations')).toBeVisible();
  });

  test('should show source and target platform selectors', async ({ page }) => {
    await page.click('text=Migrate');
    await expect(page.locator('text=Source Platform')).toBeVisible();
    await expect(page.locator('text=Target Platform')).toBeVisible();
  });

  test('should load example config when clicking Load Example', async ({ page }) => {
    await page.click('text=Migrate');
    await page.click('text=Load Example');
    const textarea = page.locator('textarea');
    const value = await textarea.inputValue();
    expect(value.length).toBeGreaterThan(20);
  });

  test('should show conversion direction', async ({ page }) => {
    await page.click('text=Migrate');
    await expect(page.locator('text=Conversion:')).toBeVisible();
  });
});
