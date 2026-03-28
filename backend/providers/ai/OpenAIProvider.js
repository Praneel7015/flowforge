/**
 * OpenAI (GPT-4) AI Provider implementation.
 */
const OpenAI = require('openai');
const AIProvider = require('./AIProvider');

class OpenAIProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'openai';
    this.client = null;
  }

  _getClient() {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: this.config.apiKey });
    }
    return this.client;
  }

  getMetadata() {
    return {
      name: 'openai',
      displayName: 'GPT-4 (OpenAI)',
      model: this.config.model || 'gpt-4-turbo',
      supportsStreaming: true,
    };
  }

  async validateConfig() {
    if (!this.config.apiKey) {
      return { valid: false, error: 'OPENAI_API_KEY is required' };
    }
    try {
      await this._getClient().chat.completions.create({
        model: this.config.model || 'gpt-4-turbo',
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
      model: this.config.model || 'gpt-4-turbo',
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
    // Prepend system message
    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const response = await this._getClient().chat.completions.create({
      model: this.config.model || 'gpt-4-turbo',
      max_tokens: options.maxTokens || 2048,
      messages: allMessages,
    });

    return response.choices[0].message.content.trim();
  }
}

module.exports = OpenAIProvider;
