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
const GroqProvider = require('./GroqProvider');
const VertexProvider = require('./VertexProvider');
const BedrockProvider = require('./BedrockProvider');
const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');

// Provider registry. A Map: the provider name comes from the request, so a
// lookup must only ever return one of these classes.
const providers = new Map([
  ['groq', GroqProvider],
  ['anthropic', AnthropicProvider],
  ['gemini', GeminiProvider],
  ['openai', OpenAIProvider],
  ['vertex', VertexProvider],
  ['bedrock', BedrockProvider],
  ['openai_compatible', OpenAICompatibleProvider],
  ['ollama', OllamaProvider],
  ['featherless', FeatherlessProvider],
]);

/** Factory errors describe the request (unknown provider, missing key), not a server fault. */
function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  error.expose = true;
  return error;
}

const CREDENTIAL_FIELDS = ['apiKey', 'accessKeyId', 'secretAccessKey', 'sessionToken', 'serviceAccountJson'];

const CREDENTIAL_HINTS = {
  vertex: 'Add a Vertex API key (express mode) or a service account JSON key in Settings.',
  bedrock: 'Add a Bedrock API key, or an AWS access key ID and secret access key, in Settings.',
  openai_compatible: 'Set the base URL and model of your OpenAI-compatible endpoint in Settings.',
};

/** Whether a merged provider config has enough to authenticate. */
function hasCredentials(name, cfg) {
  switch (name) {
    case 'ollama':
      return true;
    case 'bedrock':
      return Boolean(cfg.apiKey || (cfg.accessKeyId && cfg.secretAccessKey));
    case 'vertex':
      return Boolean(cfg.apiKey || cfg.serviceAccountJson);
    case 'openai_compatible':
      // Key is optional for self-hosted endpoints.
      return Boolean(cfg.baseUrl && cfg.model);
    default:
      return Boolean(cfg.apiKey);
  }
}

// Cached provider instances. A Map (not a plain object) so a request-supplied
// provider name like "__proto__" can never touch Object.prototype.
const instances = new Map();

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
  if (!useRuntimeConfig && instances.has(providerName)) {
    return instances.get(providerName);
  }

  let resolvedName = providerName;
  let config = getAIConfig(resolvedName);

  // Only the implicit default falls back to another configured provider. If the
  // user explicitly picked a provider, answering with a different one would
  // mislabel the result, so that case errors below asking for a key instead.
  if (!name && (!config || !config.enabled) && !useRuntimeConfig) {
    const fallbackOrder = ['groq', 'gemini', 'openai', 'anthropic', 'ollama'];
    const fallback = fallbackOrder.find((candidate) => {
      const c = getAIConfig(candidate);
      return c && c.enabled;
    });
    if (fallback) {
      resolvedName = fallback;
      config = getAIConfig(resolvedName);
      if (instances.has(resolvedName)) {
        return instances.get(resolvedName);
      }
    }
  }

  const ProviderClass = providers.has(resolvedName) ? providers.get(resolvedName) : undefined;
  if (typeof ProviderClass !== 'function') {
    const error = badRequest(
      `Unknown AI provider: ${resolvedName}. Available: ${[...providers.keys()].join(', ')}`
    );
    error.code = 'UNKNOWN_AI_PROVIDER';
    throw error;
  }

  if (!config) {
    throw badRequest(`No configuration found for AI provider: ${resolvedName}`);
  }

  if (!config.enabled && !useRuntimeConfig) {
    throw badRequest(
      `AI provider '${resolvedName}' has no API key on this server. Add your own key in Settings -> Bring Your Own Model, or switch back to the default provider.`
    );
  }

  // Server credentials must never be sent anywhere the user chose: if the
  // request brings its own credentials or points the provider at its own base
  // URL, drop every server-side secret before merging.
  const userBringsCredentials = CREDENTIAL_FIELDS.some((field) => requestConfig[field]);
  const userChangesEndpoint = Boolean(requestConfig.baseUrl) && requestConfig.baseUrl !== config.baseUrl;
  const serverConfig = userBringsCredentials || userChangesEndpoint
    ? Object.fromEntries(Object.entries(config).filter(([key]) => !CREDENTIAL_FIELDS.includes(key)))
    : config;

  const mergedConfig = {
    ...serverConfig,
    ...requestConfig,
    enabled: config.enabled || useRuntimeConfig,
    // Lets providers apply connect-time SSRF checks to request-supplied URLs.
    userSuppliedEndpoint: Boolean(requestConfig.baseUrl),
  };

  if (!hasCredentials(resolvedName, mergedConfig)) {
    throw badRequest(
      userChangesEndpoint && !userBringsCredentials && hasCredentials(resolvedName, { ...config, ...requestConfig })
        ?`A custom base URL needs your own API key: the server's key is only sent to the provider's default endpoint.`
        : `AI provider '${resolvedName}' is missing credentials. ${CREDENTIAL_HINTS[resolvedName] || 'Add an API key in Settings -> Bring Your Own Model.'}`
    );
  }

  const instance = new ProviderClass(mergedConfig);

  if (useRuntimeConfig) {
    // Never cache per-request BYOM credentials.
    return instance;
  }

  // Create and cache the instance
  instances.set(resolvedName, instance);
  return instance;
}

/**
 * Get list of available AI provider names.
 * @returns {string[]}
 */
function getAvailableProviders() {
  return [...providers.keys()];
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
  instances.clear();
}

module.exports = {
  getAIProvider,
  getAvailableProviders,
  isProviderAvailable,
  clearCache,
};
