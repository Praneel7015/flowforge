/**
 * Featherless AI Provider implementation.
 * Uses OpenAI-compatible API surface.
 */
const OpenAI = require('openai');
const AIProvider = require('./AIProvider');

class FeatherlessProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'featherless';
    this.client = null;
  }

  _getClient() {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl || 'https://api.featherless.ai/v1',
      });
    }
    return this.client;
  }

  getMetadata() {
    return {
      name: 'featherless',
      displayName: 'Featherless AI',
      model: this.config.model || 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
      supportsStreaming: true,
    };
  }

  async validateConfig() {
    if (!this.config.apiKey) {
      return { valid: false, error: 'FEATHERLESS_API_KEY is required' };
    }
    try {
      await this._getClient().chat.completions.create({
        model: this.config.model || 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
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
      model: this.config.model || 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    return response.choices[0].message.content.trim();
  }

  async chat(systemPrompt, messages, options = {}) {
    const response = await this._getClient().chat.completions.create({
      model: this.config.model || 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
      max_tokens: options.maxTokens || 2048,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });

    return response.choices[0].message.content.trim();
  }
}

module.exports = FeatherlessProvider;