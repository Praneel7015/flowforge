import { test, expect } from '@playwright/test';
import { openStudio, waitForBuilder, openPanel } from './helpers';

test.describe('AI Generator', () => {
  test.beforeEach(async ({ page }) => {
    await openStudio(page, { cicd: 'github' });
    await waitForBuilder(page);
    await openPanel(page, 'AI Generator');
  });

  test('shows the generator for the selected platform', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Generate a GitHub Actions pipeline' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate GitHub Actions Pipeline/ })).toBeVisible();
  });

  test('shows prompt boosters and example prompts', async ({ page }) => {
    await expect(page.getByText('Quick Prompt Boosters')).toBeVisible();
    await expect(page.getByRole('heading', { name: /example prompts/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load Production Template' })).toBeVisible();
  });

  test('Load Production Template fills the prompt', async ({ page }) => {
    await page.getByRole('button', { name: 'Load Production Template' }).click();
    const value = await page.locator('textarea').first().inputValue();
    expect(value.length).toBeGreaterThan(50);
  });

  test('generating without an AI key still returns an editable pipeline', async ({ page }) => {
    // CI has no provider keys, so this exercises the deterministic fallback.
    await page.locator('textarea').first().fill('Node.js service with lint, unit tests and a deploy to production');
    await page.getByRole('button', { name: /Generate GitHub Actions Pipeline/ }).click();
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 45000 });
    expect(await page.locator('.react-flow__node').count()).toBeGreaterThan(2);
  });
});
