import { test, expect } from '@playwright/test';

test.describe('Export YAML', () => {
  test.beforeEach(async ({ page }) => {
    // Set up completed onboarding
    await page.goto('/');
    await page.evaluate(() => {
      // Skip the landing page gate so the app shell renders directly.
      localStorage.setItem('flowforge.hasVisited.v1', 'true');
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

  test('should show sync/export controls', async ({ page }) => {
    // Auto-sync is on by default, so the primary button reads "Sync Now".
    await page.waitForSelector('text=Sync Now', { timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Sync Now' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Auto-sync On/ })).toBeVisible();
  });

  test('toggling auto-sync off reveals Export YAML button', async ({ page }) => {
    await page.waitForSelector('text=Auto-sync On', { timeout: 10000 });
    await page.getByRole('button', { name: /Auto-sync On/ }).click();
    await expect(page.getByRole('button', { name: 'Export YAML' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Auto-sync Off/ })).toBeVisible();
  });

  test('should show node count indicator', async ({ page }) => {
    await page.waitForSelector('text=0 nodes', { timeout: 10000 });
    await expect(page.locator('text=0 nodes')).toBeVisible();
  });
});

test.describe('Live YAML sync + push', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      // Skip the landing page gate so the app shell renders directly.
      localStorage.setItem('flowforge.hasVisited.v1', 'true');
      localStorage.setItem('flowforge.onboarding.v1', JSON.stringify({ status: 'completed' }));
      localStorage.setItem('flowforge.preferences.v1', JSON.stringify({
        selectedProviders: { ai: 'ollama', cicd: 'gitlab' },
        llmType: 'local',
        byomConfig: { enabled: false, model: '', baseUrl: '' },
      }));
      // Seed a saved workflow so the builder loads with nodes and auto-sync fires.
      localStorage.setItem('flowforge.workflow.builder.v1', JSON.stringify({
        nodes: [
          { id: 'node_1', type: 'trigger_push', position: { x: 220, y: 80 }, data: { label: 'Push', config: {} } },
          { id: 'node_2', type: 'build', position: { x: 220, y: 220 }, data: { label: 'Build', config: {} } },
        ],
        edges: [{ id: 'e1', source: 'node_1', target: 'node_2', animated: true }],
      }));
    });
    await page.reload();
  });

  test('auto-sync renders the YAML panel and a Push button', async ({ page }) => {
    await page.waitForSelector('text=Workflow Builder', { timeout: 10000 });
    // The YAML preview panel appears automatically once auto-sync produces output.
    await expect(page.getByRole('button', { name: 'Push', exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=/2 nodes/')).toBeVisible();
  });

  test('Push opens the push modal', async ({ page }) => {
    await page.waitForSelector('text=Workflow Builder', { timeout: 10000 });
    await page.getByRole('button', { name: 'Push', exact: true }).click({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Push to Repository' })).toBeVisible();
  });

  test('YAML panel collapses to a strip and expands again', async ({ page }) => {
    await page.waitForSelector('text=Workflow Builder', { timeout: 10000 });
    // Wait for the panel (Push button lives in its header).
    await expect(page.getByRole('button', { name: 'Push', exact: true })).toBeVisible({ timeout: 15000 });

    // Collapse it.
    await page.getByRole('button', { name: 'Collapse YAML preview' }).click();
    await expect(page.getByRole('button', { name: 'Expand YAML panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Push', exact: true })).toHaveCount(0);

    // Expand it again.
    await page.getByRole('button', { name: 'Expand YAML panel' }).click();
    await expect(page.getByRole('button', { name: 'Push', exact: true })).toBeVisible();
  });
});
