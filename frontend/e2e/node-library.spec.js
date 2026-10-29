import { test, expect } from '@playwright/test';

// Draggable nodes render as role="button" with an "Add X node to canvas" label;
// category headers are native <button> elements with aria-expanded.
const nodeItem = (page, label) => page.getByRole('button', { name: `Add ${label} node to canvas` });
const categoryHeader = (page, label) => page.locator('button[aria-expanded]', { hasText: label });

test.describe('Categorized node library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flowforge.hasVisited.v1', 'true');
      localStorage.setItem('flowforge.onboarding.v1', JSON.stringify({ status: 'completed' }));
      localStorage.setItem('flowforge.preferences.v1', JSON.stringify({
        selectedProviders: { ai: 'ollama', cicd: 'github' },
        llmType: 'local',
        byomConfig: { enabled: false, model: '', baseUrl: '' },
      }));
      localStorage.removeItem('flowforge.nodeLibrary.expanded.v1');
    });
    await page.reload();
    await page.waitForSelector('text=Node Library', { timeout: 10000 });
  });

  test('groups nodes under category headers', async ({ page }) => {
    for (const label of ['Triggers', 'Build & Cache', 'Test & Quality', 'Deploy']) {
      await expect(categoryHeader(page, label)).toBeVisible();
    }
    await expect(nodeItem(page, 'Git Push Trigger')).toBeVisible();
  });

  test('collapsing a category hides its nodes', async ({ page }) => {
    await expect(nodeItem(page, 'Git Push Trigger')).toBeVisible();

    await categoryHeader(page, 'Triggers').click();
    await expect(nodeItem(page, 'Git Push Trigger')).toHaveCount(0);

    // Re-expanding brings them back.
    await categoryHeader(page, 'Triggers').click();
    await expect(nodeItem(page, 'Git Push Trigger')).toBeVisible();
  });

  test('search filters nodes across categories', async ({ page }) => {
    await page.getByPlaceholder('Search nodes...').fill('canary');
    await expect(nodeItem(page, 'Canary Deploy')).toBeVisible();
    await expect(nodeItem(page, 'Git Push Trigger')).toHaveCount(0);
    await expect(nodeItem(page, 'Unit Tests')).toHaveCount(0);
  });
});
