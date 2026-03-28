/**
 * Anthropic (Claude) AI Provider implementation.
 */
const Anthropic = require('@anthropic-ai/sdk');
const AIProvider = require('./AIProvider');

class AnthropicProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'anthropic';
    this.client = null;
  }

  _getClient() {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.config.apiKey });
    }
    return this.client;
  }

  getMetadata() {
    return {
      name: 'anthropic',
      displayName: 'Claude (Anthropic)',
      model: this.config.model || 'claude-sonnet-4-5',
      supportsStreaming: true,
    };
  }

  async validateConfig() {
    if (!this.config.apiKey) {
      return { valid: false, error: 'ANTHROPIC_API_KEY is required' };
    }
    try {
      await this._getClient().messages.create({
        model: this.config.model || 'claude-sonnet-4-5',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async complete(systemPrompt, userMessage, options = {}) {
    const response = await this._getClient().messages.create({
      model: this.config.model || 'claude-sonnet-4-5',
      max_tokens: options.maxTokens || 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return response.content[0].text.trim();
  }

  async chat(systemPrompt, messages, options = {}) {
    const response = await this._getClient().messages.create({
      model: this.config.model || 'claude-sonnet-4-5',
      max_tokens: options.maxTokens || 2048,
      system: systemPrompt,
      messages,
    });
    return response.content[0].text.trim();
  }
}

module.exports = AnthropicProvider;
