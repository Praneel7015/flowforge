import { test, expect } from '@playwright/test';
import { openStudio, waitForBuilder, openPanel } from './helpers';

test.describe('First visit', () => {
  test('a brand-new visitor goes landing page → studio with no forced setup', async ({ page }) => {
    // Truly empty storage: no hasVisited flag, onboarding state or saved preferences.
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole('button', { name: 'Open Studio' }).first().click();
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

  test('switching provider clears the previous model and base URL', async ({ page }) => {
    const model = page.getByPlaceholder('openai/gpt-oss-120b');
    await model.fill('openai/gpt-oss-20b');
    await page.getByPlaceholder('https://api.groq.com/openai/v1').fill('https://api.groq.com/openai/v1');
    await providerSelect(page).selectOption('openai_compatible');
    await expect(page.getByPlaceholder(/deepseek/)).toHaveValue('');
    await expect(page.getByPlaceholder(/openrouter/)).toHaveValue('');
  });

  test('the Cloud/Local toggle also clears the previous model', async ({ page }) => {
    await page.getByPlaceholder('openai/gpt-oss-120b').fill('openai/gpt-oss-20b');
    await page.getByRole('button', { name: /^Local LLM/ }).click();
    await expect(providerSelect(page)).toHaveValue('ollama');
    await expect(page.getByPlaceholder('llama3')).toHaveValue('');
  });

  test('OpenAI-compatible requires a base URL', async ({ page }) => {
    await providerSelect(page).selectOption('openai_compatible');
    await expect(page.getByText('Base URL', { exact: true })).toBeVisible();
  });
});
