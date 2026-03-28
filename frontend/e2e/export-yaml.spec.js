import { test, expect } from '@playwright/test';

test.describe('Export YAML', () => {
  test.beforeEach(async ({ page }) => {
    // Set up completed onboarding
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

  test('should show Builder page with empty canvas', async ({ page }) => {
    await page.waitForSelector('text=Workflow Builder', { timeout: 10000 });
    await expect(page.locator('text=No nodes yet')).toBeVisible();
  });

  test('should show Export YAML button', async ({ page }) => {
    await page.waitForSelector('text=Export YAML', { timeout: 10000 });
    await expect(page.locator('text=Export YAML')).toBeVisible();
  });

  test('should show node count indicator', async ({ page }) => {
    await page.waitForSelector('text=0 nodes', { timeout: 10000 });
    await expect(page.locator('text=0 nodes')).toBeVisible();
  });
});
