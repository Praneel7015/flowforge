/**
 * Central configuration loader for all providers.
 * Reads from environment variables and tracks which providers are enabled.
 */
const { resolveGroqModel } = require('../providers/ai/GroqProvider');

// Label the Groq option with the model actually used (after retired-model
// remapping) so the UI never advertises a model the server isn't calling.
const GROQ_MODEL = resolveGroqModel(process.env.GROQ_MODEL);
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const VERTEX_MODEL = process.env.VERTEX_MODEL || 'gemini-3.8-flash';
const BEDROCK_MODEL = process.env.BEDROCK_MODEL || 'us.anthropic.claude-sonnet-4-6';
const OPENAI_COMPATIBLE_MODEL = process.env.OPENAI_COMPATIBLE_MODEL || '';

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
    groq: {
      name: 'groq',
      displayName: `Groq (${GROQ_MODEL})`,
      enabled: !!process.env.GROQ_API_KEY,
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      model: GROQ_MODEL,
    },
    anthropic: {
      name: 'anthropic',
      displayName: `Claude (${ANTHROPIC_MODEL})`,
      enabled: !!process.env.ANTHROPIC_API_KEY,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: ANTHROPIC_MODEL,
    },
    gemini: {
      name: 'gemini',
      displayName: `Gemini (${GEMINI_MODEL})`,
      enabled: !!process.env.GEMINI_API_KEY,
      apiKey: process.env.GEMINI_API_KEY,
      model: GEMINI_MODEL,
    },
    openai: {
      name: 'openai',
      displayName: `OpenAI (${OPENAI_MODEL})`,
      enabled: !!process.env.OPENAI_API_KEY,
      apiKey: process.env.OPENAI_API_KEY,
      model: OPENAI_MODEL,
    },
    vertex: {
      name: 'vertex',
      displayName: `Vertex AI (${VERTEX_MODEL})`,
      enabled: !!(process.env.VERTEX_API_KEY || process.env.VERTEX_SERVICE_ACCOUNT_JSON),
      apiKey: process.env.VERTEX_API_KEY,
      serviceAccountJson: process.env.VERTEX_SERVICE_ACCOUNT_JSON,
      projectId: process.env.VERTEX_PROJECT_ID,
      location: process.env.VERTEX_LOCATION || 'global',
      model: VERTEX_MODEL,
    },
    bedrock: {
      name: 'bedrock',
      displayName: `AWS Bedrock (${BEDROCK_MODEL})`,
      enabled: !!(
        process.env.AWS_BEARER_TOKEN_BEDROCK ||
        (process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY)
      ),
      apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
      accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID,
      secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY,
      sessionToken: process.env.BEDROCK_SESSION_TOKEN,
      region: process.env.BEDROCK_REGION || 'us-east-1',
      model: BEDROCK_MODEL,
    },
    openai_compatible: {
      name: 'openai_compatible',
      displayName: OPENAI_COMPATIBLE_MODEL
        ? `OpenAI-compatible (${OPENAI_COMPATIBLE_MODEL})`
        : 'OpenAI-compatible endpoint',
      enabled: !!(process.env.OPENAI_COMPATIBLE_BASE_URL && OPENAI_COMPATIBLE_MODEL),
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL,
      model: OPENAI_COMPATIBLE_MODEL,
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
    bitbucket: {
      name: 'bitbucket',
      displayName: 'Bitbucket Pipelines',
      fileName: 'bitbucket-pipelines.yml',
      enabled: true,
    },
  },
  defaults: {
    aiProvider: process.env.DEFAULT_AI_PROVIDER || 'groq',
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
