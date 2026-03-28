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
function hasConfiguredValue(value) {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value !== undefined && value !== null;
}

function hasRuntimeConfig(runtimeConfig) {
  if (!runtimeConfig || typeof runtimeConfig !== 'object') {
    return false;
  }

  return Object.values(runtimeConfig).some(hasConfiguredValue);
}

function cleanRuntimeConfig(runtimeConfig) {
  if (!runtimeConfig || typeof runtimeConfig !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(runtimeConfig).filter(([, value]) => hasConfiguredValue(value))
  );
}

function getAIProvider(name, runtimeConfig = {}) {
  const providerName = name || getDefaults().aiProvider;
  const requestConfig = cleanRuntimeConfig(runtimeConfig);
  const useRuntimeConfig = hasRuntimeConfig(requestConfig);

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

  const providerRequiresApiKey = providerName !== 'ollama';
  if (!config.enabled && providerRequiresApiKey && !requestConfig.apiKey) {
    throw new Error(
      `AI provider '${providerName}' requires an API key. Provide aiOptions.apiKey when using a custom key.`
    );
  }

  const mergedConfig = {
    ...config,
    ...requestConfig,
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
