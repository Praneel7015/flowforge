/**
 * Groq AI Provider implementation.
 * Uses OpenAI-compatible API surface at https://api.groq.com/openai/v1
 * Provides ultra-fast inference with generous free tier rate limits.
 */
const OpenAI = require('openai');
const AIProvider = require('./AIProvider');

const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// Models Groq has shut down. Hosts often pin GROQ_MODEL (and users save BYOM
// presets), so map retired names to a live model instead of 404ing every call.
const RETIRED_GROQ_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'qwen-2.5-coder-32b',
  'qwen/qwen3.6-27b',
]);

function resolveGroqModel(model) {
  if (!model || RETIRED_GROQ_MODELS.has(model)) return DEFAULT_GROQ_MODEL;
  return model;
}

// gpt-oss models reason before answering and those tokens count against
// max_tokens; keep reasoning short so the JSON answer isn't truncated.
function reasoningParams(model) {
  return model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {};
}

function extractContent(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Groq returned an empty completion');
  }
  return content.trim();
}

class GroqProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'groq';
    this.client = null;
  }

  _getClient() {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl || DEFAULT_GROQ_BASE_URL,
      });
    }
    return this.client;
  }

  getMetadata() {
    return {
      name: 'groq',
      displayName: 'Groq (GPT-OSS 120B)',
      model: resolveGroqModel(this.config.model),
      supportsStreaming: true,
    };
  }

  async validateConfig() {
    if (!this.config.apiKey) {
      return { valid: false, error: 'GROQ_API_KEY is required (get a free key at console.groq.com)' };
    }
    try {
      await this._getClient().chat.completions.create({
        model: resolveGroqModel(this.config.model),
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async complete(systemPrompt, userMessage, options = {}) {
    const model = resolveGroqModel(this.config.model);
    const response = await this._getClient().chat.completions.create({
      model,
      ...reasoningParams(model),
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    return extractContent(response);
  }

  async chat(systemPrompt, messages, options = {}) {
    const model = resolveGroqModel(this.config.model);
    const response = await this._getClient().chat.completions.create({
      model,
      ...reasoningParams(model),
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.5,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });

    return extractContent(response);
  }
}

module.exports = GroqProvider;
module.exports.resolveGroqModel = resolveGroqModel;
