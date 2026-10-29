import { test, expect } from '@playwright/test';
import { openStudio, waitForBuilder, openPanel } from './helpers';

test.describe('First visit', () => {
  test('a new visitor lands straight in the studio (no forced setup)', async ({ page }) => {
    await openStudio(page, { onboarding: null });
    await waitForBuilder(page);
    await expect(page.getByText('First-Run Setup')).toHaveCount(0);
  });
});

test.describe('Provider settings', () => {
  test.beforeEach(async ({ page }) => {
    await openStudio(page);
    await waitForBuilder(page);
    await openPanel(page, 'Settings');
    await expect(page.getByRole('heading', { name: 'Step 1: LLM and Provider' })).toBeVisible();
  });

  const providerSelect = (page) =>
    page.getByRole('heading', { name: 'Step 1: LLM and Provider' }).locator('xpath=..').getByRole('combobox').first();

  test('AWS Bedrock shows region and access-key fields, no base URL', async ({ page }) => {
    await providerSelect(page).selectOption('bedrock');
    await expect(page.getByText('AWS region')).toBeVisible();
    await expect(page.getByText('Secret access key (optional)')).toBeVisible();
    await expect(page.getByText(/^Base URL/)).toHaveCount(0);
  });

  test('Vertex AI shows project, location and service account fields', async ({ page }) => {
    await providerSelect(page).selectOption('vertex');
    await expect(page.getByText('GCP project ID')).toBeVisible();
    await expect(page.getByText(/Service account JSON key/)).toBeVisible();
  });

  test('OpenAI-compatible requires a base URL', async ({ page }) => {
    await providerSelect(page).selectOption('openai_compatible');
    await expect(page.getByText('Base URL', { exact: true })).toBeVisible();
  });
});
