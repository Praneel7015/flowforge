import { test, expect } from '@playwright/test';

test.describe('Generate Pipeline', () => {
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

  test('should navigate to Generate panel', async ({ page }) => {
    await page.waitForSelector('text=Workflow Builder', { timeout: 10000 });
    await page.click('text=Generate');
    await expect(page.locator('text=Build a pipeline from plain language')).toBeVisible();
  });

  test('should show example prompts', async ({ page }) => {
    await page.click('text=Generate');
    await page.waitForSelector('text=Example prompts', { timeout: 10000 });
    await expect(page.locator('text=Example prompts')).toBeVisible();
  });

  test('should show prompt boosters', async ({ page }) => {
    await page.click('text=Generate');
    await expect(page.locator('text=Prompt Boosters')).toBeVisible();
    await expect(page.locator('text=Load Production Template')).toBeVisible();
  });

  test('should fill prompt area when clicking Load Production Template', async ({ page }) => {
    await page.click('text=Generate');
    await page.click('text=Load Production Template');
    const textarea = page.locator('textarea');
    const value = await textarea.inputValue();
    expect(value.length).toBeGreaterThan(50);
  });
});
