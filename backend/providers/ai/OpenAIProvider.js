/**
 * OpenAI AI Provider implementation (also used for OpenAI-compatible BYOM base URLs).
 */
const OpenAI = require('openai');
const AIProvider = require('./AIProvider');

const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

// Compare the parsed hostname, not a substring: "api.openai.com.evil.example"
// must not count as the official API.
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

class OpenAIProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'openai';
    this.client = null;
  }

  _getClient() {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
        // Base URLs can be user-supplied; a redirect must not steer the
        // server to a host the SSRF guard never checked.
        fetchOptions: { redirect: 'error' },
      });
    }
    return this.client;
  }

  _model() {
    return this.config.model || DEFAULT_OPENAI_MODEL;
  }

  // Current OpenAI models only accept max_completion_tokens and the default
  // temperature; OpenAI-compatible servers behind a custom base URL usually
  // still expect the classic max_tokens/temperature pair.
  _limits(maxTokens, temperature) {
    const isOfficialApi = !this.config.baseUrl || hostOf(this.config.baseUrl) === 'api.openai.com';
    if (isOfficialApi) return { max_completion_tokens: maxTokens };
    return temperature === undefined ? { max_tokens: maxTokens } : { max_tokens: maxTokens, temperature };
  }

  getMetadata() {
    return {
      name: 'openai',
      displayName: `OpenAI (${this._model()})`,
      model: this._model(),
      supportsStreaming: true,
    };
  }

  async validateConfig() {
    if (!this.config.apiKey) {
      return { valid: false, error: 'OPENAI_API_KEY is required' };
    }
    try {
      await this._getClient().chat.completions.create({
        model: this._model(),
        ...this._limits(16),
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async complete(systemPrompt, userMessage, options = {}) {
    const response = await this._getClient().chat.completions.create({
      model: this._model(),
      ...this._limits(options.maxTokens || 4096, options.temperature ?? 0.7),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    return (response.choices[0].message.content || '').trim();
  }

  async chat(systemPrompt, messages, options = {}) {
    const response = await this._getClient().chat.completions.create({
      model: this._model(),
      ...this._limits(options.maxTokens || 2048),
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });

    return (response.choices[0].message.content || '').trim();
  }
}

module.exports = OpenAIProvider;
