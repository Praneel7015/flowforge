import { expect } from '@playwright/test';

/**
 * Opens the studio with a known local state: landing page skipped,
 * onboarding done (unless overridden) and an optional saved canvas.
 */
export async function openStudio(page, { workflow, cicd = 'gitlab', onboarding = 'completed' } = {}) {
  await page.goto('/');
  await page.evaluate(
    ({ workflow, cicd, onboarding }) => {
      localStorage.clear();
      localStorage.setItem('flowforge.hasVisited.v1', 'true');
      if (onboarding) localStorage.setItem('flowforge.onboarding.v1', JSON.stringify({ status: onboarding }));
      localStorage.setItem(
        'flowforge.preferences.v1',
        JSON.stringify({
          selectedProviders: { ai: 'groq', cicd },
          llmType: 'cloud',
          byomConfig: { enabled: false, model: '', baseUrl: '' },
        })
      );
      if (workflow) localStorage.setItem('flowforge.workflow.builder.v1', JSON.stringify(workflow));
    },
    { workflow, cicd, onboarding }
  );
  await page.reload();
}

/** Waits for the builder canvas and node library to be ready. */
export async function waitForBuilder(page) {
  await expect(page.getByRole('button', { name: 'Import Pipeline' })).toBeVisible({ timeout: 15000 });
  // The canvas is lazy-loaded; the default 5s wait flakes on slow machines.
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
}

/** Clicks a top-level nav item. The nav renders twice (off-screen mobile drawer, then the header), so use the last. */
export async function openPanel(page, name) {
  await page.getByRole('button', { name, exact: true }).last().click();
}

export const TWO_NODE_WORKFLOW = {
  nodes: [
    { id: 'node_1', type: 'trigger_push', position: { x: 220, y: 80 }, data: { label: 'Push', config: {} } },
    { id: 'node_2', type: 'build', position: { x: 220, y: 220 }, data: { label: 'Build', config: { script: 'npm ci\nnpm run build' } } },
  ],
  edges: [{ id: 'e1', source: 'node_1', target: 'node_2' }],
};
