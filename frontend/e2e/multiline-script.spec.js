import { test, expect } from '@playwright/test';
import { openStudio, waitForBuilder } from './helpers';

const IF_BLOCK = 'if [ -f package.json ]; then\n  npm test -- --ci\nfi';

const workflowWith = (script) => ({
  nodes: [
    { id: 'n1', type: 'trigger_push', position: { x: 240, y: 40 }, data: { label: 'Push', config: {} } },
    { id: 'n2', type: 'test', position: { x: 240, y: 180 }, data: { label: 'Unit Tests', config: { image: 'node:20-alpine', stage: 'test', script } } },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
});

test.describe('Multi-line commands', () => {
  test('stay one command on the canvas, in the inspector and in the YAML', async ({ page }) => {
    await openStudio(page, { workflow: workflowWith(['npm ci', IF_BLOCK]), cicd: 'github' });
    await waitForBuilder(page);

    const node = page.locator('.react-flow__node', { hasText: 'Unit Tests' });
    await expect(node).toContainText('$ npm ci');
    // The exported step keeps the whole block as one literal `run:`.
    await expect(page.getByText('run: |-').first()).toBeVisible({ timeout: 15000 });

    await node.click();
    const block = page.getByRole('textbox', { name: 'Command 2' });
    await expect(block).toHaveValue(IF_BLOCK);
    await expect(page.getByRole('textbox', { name: 'Command 1' })).toHaveValue('npm ci');

    await block.fill(`${IF_BLOCK}\necho done`);
    await expect(block).toHaveValue(`${IF_BLOCK}\necho done`);
    await expect(page.getByText('run: |-').first()).toBeVisible({ timeout: 15000 });
  });

  test('a legacy script can gain a multi-line command without losing its lines', async ({ page }) => {
    await openStudio(page, { workflow: workflowWith('npm ci\nnpm test') });
    await waitForBuilder(page);

    await page.locator('.react-flow__node', { hasText: 'Unit Tests' }).click();
    await page.getByRole('button', { name: '+ Multi-line command' }).click();
    await expect(page.getByRole('textbox', { name: 'Command 1' })).toHaveValue('npm ci');
    await expect(page.getByRole('textbox', { name: 'Command 2' })).toHaveValue('npm test');
    await expect(page.getByRole('textbox', { name: 'Command 3' })).toHaveValue('');
  });

  test('the run simulator checks the lines inside a multi-line command', async ({ page }) => {
    await openStudio(page, { workflow: workflowWith([IF_BLOCK]) });
    await waitForBuilder(page);
    await page.getByTitle('Switch inspector to Runs').click();
    await page.getByRole('button', { name: /Simulate Live Run/ }).click();

    await expect(page.getByText('View failure log')).toBeVisible({ timeout: 15000 });
    await page.getByText('View failure log').click();
    await expect(page.getByText(/never installs dependencies/)).toBeVisible();
  });
});
