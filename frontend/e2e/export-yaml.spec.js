import { test, expect } from '@playwright/test';
import { openStudio, waitForBuilder, TWO_NODE_WORKFLOW } from './helpers';

test.describe('Builder canvas', () => {
  test.beforeEach(async ({ page }) => {
    await openStudio(page);
    await waitForBuilder(page);
  });

  test('shows an empty canvas with starter templates', async ({ page }) => {
    await expect(page.getByText('0 nodes · 0 edges')).toBeVisible();
    await expect(page.getByText('Drag stages from the left or start with a template')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Node.js Production CI/CD' })).toBeVisible();
  });

  test('auto-sync is on by default and can be toggled', async ({ page }) => {
    const autoSync = page.getByRole('button', { name: 'Auto-sync' });
    await expect(autoSync).toHaveAttribute('aria-pressed', 'true');
    await autoSync.click();
    await expect(autoSync).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Export YAML' })).toBeVisible();
  });

  test('loading a template fills the canvas and the YAML panel', async ({ page }) => {
    await page.getByRole('button', { name: '+ Node.js Production CI/CD' }).click();
    await expect(page.getByText('7 nodes · 8 edges')).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(7);
    await expect(page.getByText(/stages:|jobs:/).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('YAML inspector + push', () => {
  test.beforeEach(async ({ page }) => {
    await openStudio(page, { workflow: TWO_NODE_WORKFLOW, cicd: 'github' });
    await waitForBuilder(page);
  });

  test('auto-sync renders GitHub Actions YAML for the saved canvas', async ({ page }) => {
    await expect(page.getByText('2 nodes · 1 edges')).toBeVisible();
    await expect(page.getByText('.github/workflows/ci.yml')).toBeVisible();
    await expect(page.getByText('runs-on: ubuntu-latest').first()).toBeVisible({ timeout: 15000 });
  });

  test('Push opens the push modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Push', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Push to Repository' })).toBeVisible();
  });

  test('inspector collapses and expands again', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Push', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse Studio Inspector' }).click();
    await expect(page.getByRole('button', { name: 'Push', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand Studio Inspector' }).click();
    await expect(page.getByRole('button', { name: 'Push', exact: true })).toBeVisible();
  });
});
