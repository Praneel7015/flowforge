import { test, expect } from '@playwright/test';

const GITHUB_YAML = `name: CI
on:
  push:
    branches: [main]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: flake8 app.py
  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - run: pytest
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: deploy.sh`;

async function bootstrap(page, seedWorkflow) {
  await page.goto('/');
  await page.evaluate((seed) => {
    localStorage.setItem('flowforge.hasVisited.v1', 'true');
    localStorage.setItem('flowforge.onboarding.v1', JSON.stringify({ status: 'completed' }));
    localStorage.setItem('flowforge.preferences.v1', JSON.stringify({
      selectedProviders: { ai: 'ollama', cicd: 'github' },
      llmType: 'local',
      byomConfig: { enabled: false, model: '', baseUrl: '' },
    }));
    if (seed) {
      localStorage.setItem('flowforge.workflow.builder.v1', JSON.stringify(seed));
    } else {
      localStorage.removeItem('flowforge.workflow.builder.v1');
    }
  }, seedWorkflow);
  await page.reload();
  await page.waitForSelector('text=Workflow Builder', { timeout: 10000 });
}

test.describe('Import existing pipeline', () => {
  test('imports a YAML into an editable node graph', async ({ page }) => {
    await bootstrap(page);

    await page.getByRole('button', { name: 'Import Pipeline' }).click();
    await expect(page.getByRole('heading', { name: 'Import Existing Pipeline' })).toBeVisible();

    await page.locator('textarea').fill(GITHUB_YAML);
    await page.getByRole('button', { name: 'Visualize Pipeline' }).click();

    // Nodes render on the canvas: trigger + lint + test + deploy = 4.
    await page.waitForSelector('.react-flow__node', { timeout: 15000 });
    await expect(page.locator('text=/4 nodes/')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(4);
  });
});

test.describe('Edit block text', () => {
  test('renaming a node updates its label on the canvas', async ({ page }) => {
    await bootstrap(page, {
      nodes: [
        { id: 'node_1', type: 'build', position: { x: 260, y: 160 }, data: { label: 'Build', config: {} } },
      ],
      edges: [],
    });

    const node = page.locator('.react-flow__node').first();
    await expect(node).toContainText('Build');

    // Right-click opens the node config panel.
    await node.click({ button: 'right' });
    const nameInput = page.getByPlaceholder('Block name (e.g. Build & Test)');
    await expect(nameInput).toBeVisible();

    await nameInput.fill('Compile App');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.locator('.react-flow__node').first()).toContainText('Compile App');
  });
});
