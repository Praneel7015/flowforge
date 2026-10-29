/**
 * Any OpenAI-compatible Chat Completions endpoint (OpenRouter, Together,
 * Fireworks, DeepSeek, Mistral, vLLM/LM Studio exposed publicly, Azure-style
 * gateways, ...). Needs a base URL and a model; the API key is optional.
 */
const OpenAIProvider = require('./OpenAIProvider');

class OpenAICompatibleProvider extends OpenAIProvider {
  constructor(config) {
    super(config);
    this.name = 'openai_compatible';
  }

  _getClient() {
    if (!this.config.baseUrl) {
      throw new Error('OpenAI-compatible provider needs a base URL (e.g. https://openrouter.ai/api/v1).');
    }
    if (!this.config.model) {
      throw new Error('OpenAI-compatible provider needs a model name.');
    }
    // The OpenAI SDK refuses an empty key; many self-hosted servers ignore it.
    if (!this.config.apiKey) this.config = { ...this.config, apiKey: 'not-needed' };
    return super._getClient();
  }

  // Third-party endpoints expect the classic max_tokens/temperature pair even
  // when they proxy to OpenAI.
  _limits(maxTokens, temperature) {
    return temperature === undefined ? { max_tokens: maxTokens } : { max_tokens: maxTokens, temperature };
  }

  getMetadata() {
    const host = (() => {
      try {
        return new URL(this.config.baseUrl).host;
      } catch {
        return 'custom endpoint';
      }
    })();
    return {
      name: 'openai_compatible',
      displayName: this.config.model ? `OpenAI-compatible (${this.config.model} @ ${host})` : 'OpenAI-compatible endpoint',
      model: this.config.model || '',
      supportsStreaming: false,
    };
  }

  async validateConfig() {
    try {
      this._getClient();
    } catch (err) {
      return { valid: false, error: err.message };
    }
    return super.validateConfig();
  }
}

module.exports = OpenAICompatibleProvider;
