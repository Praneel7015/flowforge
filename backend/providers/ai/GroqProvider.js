/**
 * Groq AI Provider implementation.
 * Uses OpenAI-compatible API surface at https://api.groq.com/openai/v1
 * Provides ultra-fast inference with generous free tier rate limits.
 */
const OpenAI = require('openai');
const AIProvider = require('./AIProvider');

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

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
      displayName: 'Groq (Llama 3.3 / Mixtral)',
      model: this.config.model || DEFAULT_GROQ_MODEL,
      supportsStreaming: true,
    };
  }

  async validateConfig() {
    if (!this.config.apiKey) {
      return { valid: false, error: 'GROQ_API_KEY is required (get a free key at console.groq.com)' };
    }
    try {
      await this._getClient().chat.completions.create({
        model: this.config.model || DEFAULT_GROQ_MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async complete(systemPrompt, userMessage, options = {}) {
    const response = await this._getClient().chat.completions.create({
      model: this.config.model || DEFAULT_GROQ_MODEL,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    return response.choices[0].message.content.trim();
  }

  async chat(systemPrompt, messages, options = {}) {
    const response = await this._getClient().chat.completions.create({
      model: this.config.model || DEFAULT_GROQ_MODEL,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.5,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });

    return response.choices[0].message.content.trim();
  }
}

module.exports = GroqProvider;
