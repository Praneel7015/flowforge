/**
 * AI Provider Factory
 * Returns the appropriate AI provider based on name.
 */
const { getAIConfig, getDefaults } = require('../../config');
const AnthropicProvider = require('./AnthropicProvider');
const GeminiProvider = require('./GeminiProvider');
const OpenAIProvider = require('./OpenAIProvider');
const OllamaProvider = require('./OllamaProvider');
const FeatherlessProvider = require('./FeatherlessProvider');

// Provider registry
const providers = {
  anthropic: AnthropicProvider,
  gemini: GeminiProvider,
  openai: OpenAIProvider,
  ollama: OllamaProvider,
  featherless: FeatherlessProvider,
};

// Cached provider instances
const instances = {};

/**
 * Get an AI provider instance by name.
 * @param {string} [name] - Provider name. Defaults to DEFAULT_AI_PROVIDER env var.
 * @returns {AIProvider}
 * @throws {Error} If provider is not found or not configured.
 */
function hasRuntimeConfig(runtimeConfig) {
  return !!(runtimeConfig && Object.keys(runtimeConfig).length > 0);
}

function getAIProvider(name, runtimeConfig = {}) {
  const providerName = name || getDefaults().aiProvider;
  const useRuntimeConfig = hasRuntimeConfig(runtimeConfig);

  // Return cached instance if available
  if (!useRuntimeConfig && instances[providerName]) {
    return instances[providerName];
  }

  const ProviderClass = providers[providerName];
  if (!ProviderClass) {
    throw new Error(
      `Unknown AI provider: ${providerName}. Available: ${Object.keys(providers).join(', ')}`
    );
  }

  const config = getAIConfig(providerName);
  if (!config) {
    throw new Error(`No configuration found for AI provider: ${providerName}`);
  }

  if (!config.enabled && !useRuntimeConfig) {
    throw new Error(
      `AI provider '${providerName}' is not enabled. Check your environment variables.`
    );
  }

  const mergedConfig = {
    ...config,
    ...runtimeConfig,
    enabled: config.enabled || useRuntimeConfig,
  };

  const instance = new ProviderClass(mergedConfig);

  if (useRuntimeConfig) {
    // Never cache per-request BYOM credentials.
    return instance;
  }

  // Create and cache the instance
  instances[providerName] = instance;
  return instances[providerName];
}

/**
 * Get list of available AI provider names.
 * @returns {string[]}
 */
function getAvailableProviders() {
  return Object.keys(providers);
}

/**
 * Check if a provider is available and configured.
 * @param {string} name - Provider name
 * @returns {boolean}
 */
function isProviderAvailable(name) {
  const config = getAIConfig(name);
  return config && config.enabled;
}

/**
 * Clear cached provider instances (useful for testing).
 */
function clearCache() {
  Object.keys(instances).forEach((key) => delete instances[key]);
}

module.exports = {
  getAIProvider,
  getAvailableProviders,
  isProviderAvailable,
  clearCache,
};
