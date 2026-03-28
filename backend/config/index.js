/**
 * Central configuration loader for all providers.
 * Reads from environment variables and tracks which providers are enabled.
 */

function readFeatureFlag(name, defaultValue = true) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return defaultValue;
}

const config = {
  ai: {
    anthropic: {
      name: 'anthropic',
      displayName: 'Claude (Anthropic)',
      enabled: !!process.env.ANTHROPIC_API_KEY,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    },
    gemini: {
      name: 'gemini',
      displayName: 'Gemini (Google)',
      enabled: !!process.env.GEMINI_API_KEY,
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    },
    openai: {
      name: 'openai',
      displayName: 'GPT-4 (OpenAI)',
      enabled: !!process.env.OPENAI_API_KEY,
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
    },
    featherless: {
      name: 'featherless',
      displayName: 'Featherless AI',
      enabled: !!process.env.FEATHERLESS_API_KEY,
      apiKey: process.env.FEATHERLESS_API_KEY,
      baseUrl: process.env.FEATHERLESS_BASE_URL || 'https://api.featherless.ai/v1',
      model: process.env.FEATHERLESS_MODEL || 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
    },
    ollama: {
      name: 'ollama',
      displayName: 'Ollama (Local)',
      enabled: !!process.env.OLLAMA_BASE_URL || process.env.OLLAMA_ENABLED === 'true',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3',
    },
  },
  cicd: {
    gitlab: {
      name: 'gitlab',
      displayName: 'GitLab CI',
      fileName: '.gitlab-ci.yml',
      enabled: true,
    },
    github: {
      name: 'github',
      displayName: 'GitHub Actions',
      fileName: '.github/workflows/ci.yml',
      enabled: true,
    },
    jenkins: {
      name: 'jenkins',
      displayName: 'Jenkins Pipeline',
      fileName: 'Jenkinsfile',
      enabled: true,
    },
    circleci: {
      name: 'circleci',
      displayName: 'CircleCI',
      fileName: '.circleci/config.yml',
      enabled: true,
    },
  },
  defaults: {
    aiProvider: process.env.DEFAULT_AI_PROVIDER || 'featherless',
    cicdPlatform: process.env.DEFAULT_CICD_PLATFORM || 'gitlab',
  },
  features: {
    advancedNodes: readFeatureFlag('ENABLE_ADVANCED_NODES', true),
    providerSelfTest: readFeatureFlag('ENABLE_PROVIDER_SELF_TEST', true),
  },
};

/**
 * Get configuration for a specific AI provider.
 * @param {string} name - Provider name (anthropic, gemini, openai, ollama)
 * @returns {object|null}
 */
function getAIConfig(name) {
  return config.ai[name] || null;
}

/**
 * Get configuration for a specific CI/CD platform.
 * @param {string} name - Platform name (gitlab, github, jenkins, circleci)
 * @returns {object|null}
 */
function getCICDConfig(name) {
  return config.cicd[name] || null;
}

/**
 * Get list of enabled AI providers.
 * @returns {Array<{name: string, displayName: string, enabled: boolean}>}
 */
function getEnabledAIProviders() {
  return Object.values(config.ai).filter((p) => p.enabled);
}

/**
 * Get list of all CI/CD platforms.
 * @returns {Array<{name: string, displayName: string, fileName: string}>}
 */
function getCICDPlatforms() {
  return Object.values(config.cicd);
}

/**
 * Get default provider names.
 * @returns {{aiProvider: string, cicdPlatform: string}}
 */
function getDefaults() {
  return config.defaults;
}

/**
 * Get server feature flags.
 * @returns {{advancedNodes: boolean, providerSelfTest: boolean}}
 */
function getFeatureFlags() {
  return { ...config.features };
}

/**
 * Get full provider summary for API response.
 * @returns {object}
 */
function getProviderSummary() {
  return {
    ai: Object.values(config.ai).map((p) => ({
      name: p.name,
      displayName: p.displayName,
      enabled: p.enabled,
    })),
    cicd: Object.values(config.cicd).map((p) => ({
      name: p.name,
      displayName: p.displayName,
      fileName: p.fileName,
      enabled: p.enabled,
    })),
    defaults: config.defaults,
    features: getFeatureFlags(),
  };
}

module.exports = {
  config,
  getAIConfig,
  getCICDConfig,
  getEnabledAIProviders,
  getCICDPlatforms,
  getDefaults,
  getFeatureFlags,
  getProviderSummary,
};
