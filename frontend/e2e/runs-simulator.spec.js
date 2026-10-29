import { test, expect } from '@playwright/test';
import { openStudio, waitForBuilder } from './helpers';

const job = (id, type, label, script, y) => ({
  id,
  type,
  position: { x: 240, y },
  data: { label, config: { image: 'node:20-alpine', stage: 'test', script } },
});

const pipeline = (testScript) => ({
  nodes: [
    { id: 'n1', type: 'trigger_push', position: { x: 240, y: 40 }, data: { label: 'Push', config: {} } },
    job('n2', 'build', 'Build', 'npm ci\nnpm run build', 160),
    job('n3', 'test', 'Unit Tests', testScript, 280),
    job('n4', 'deploy', 'Deploy', 'echo deploy', 400),
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
  ],
});

async function simulate(page) {
  await page.getByTitle('Switch inspector to Runs').click();
  await page.getByRole('button', { name: /Simulate Live Run/ }).click();
}

test.describe('Live run simulator', () => {
  test('fails a job that runs tests without installing dependencies', async ({ page }) => {
    await openStudio(page, { workflow: pipeline('npm test -- --ci') });
    await waitForBuilder(page);
    await simulate(page);

    await expect(page.getByText('View failure log')).toBeVisible({ timeout: 15000 });
    await page.getByText('View failure log').click();
    await expect(page.getByText(/never installs dependencies/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Diagnose & Fix/ })).toBeVisible();
  });

  test('passes once the job installs dependencies (rerun stays green)', async ({ page }) => {
    await openStudio(page, { workflow: pipeline('npm ci\nnpm test -- --ci') });
    await waitForBuilder(page);

    for (let run = 0; run < 2; run += 1) {
      await simulate(page);
      await expect(page.getByText('View failure log')).toHaveCount(0);
      await expect(page.locator('.react-flow__node', { hasText: 'Deploy' })).toContainText(/passed/i, { timeout: 15000 });
    }
  });
});
