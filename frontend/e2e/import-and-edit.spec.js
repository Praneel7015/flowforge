import { test, expect } from '@playwright/test';
import { openStudio, waitForBuilder } from './helpers';

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

async function bootstrap(page, workflow) {
  await openStudio(page, { workflow, cicd: 'github' });
  await waitForBuilder(page);
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
    await expect(page.getByText(/4 nodes/)).toBeVisible({ timeout: 15000 });
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
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    await expect(page.locator('.react-flow__node').first()).toContainText('Compile App');
  });
});
