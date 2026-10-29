import { test, expect } from '@playwright/test';
import { openStudio, waitForBuilder, openPanel } from './helpers';

test.describe('Migrate', () => {
  test.beforeEach(async ({ page }) => {
    await openStudio(page, { cicd: 'github' });
    await waitForBuilder(page);
    await openPanel(page, 'Migrate');
  });

  test('shows the converter with source and target platforms', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Convert CI/CD Configurations' })).toBeVisible();
    await expect(page.getByText('Source Platform', { exact: true })).toBeVisible();
    await expect(page.getByText('Target Platform', { exact: true })).toBeVisible();
    await expect(page.getByText('Conversion: Jenkins Pipeline -> GitHub Actions')).toBeVisible();
  });

  test('Load Example fills the source config', async ({ page }) => {
    await page.getByRole('button', { name: 'Load Example' }).click();
    const value = await page.locator('textarea').first().inputValue();
    expect(value).toContain('stage(');
  });
});
