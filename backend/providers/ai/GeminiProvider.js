/**
 * Google Gemini AI Provider implementation.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIProvider = require('./AIProvider');

class GeminiProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'gemini';
    this.client = null;
    this.model = null;
  }

  _getClient() {
    if (!this.client) {
      this.client = new GoogleGenerativeAI(this.config.apiKey);
    }
    return this.client;
  }

  _getModel() {
    if (!this.model) {
      this.model = this._getClient().getGenerativeModel({
        model: this.config.model || 'gemini-1.5-pro',
      });
    }
    return this.model;
  }

  getMetadata() {
    return {
      name: 'gemini',
      displayName: 'Gemini (Google)',
      model: this.config.model || 'gemini-1.5-pro',
      supportsStreaming: true,
    };
  }

  async validateConfig() {
    if (!this.config.apiKey) {
      return { valid: false, error: 'GEMINI_API_KEY is required' };
    }
    try {
      const model = this._getModel();
      await model.generateContent('ping');
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async complete(systemPrompt, userMessage, options = {}) {
    const model = this._getClient().getGenerativeModel({
      model: this.config.model || 'gemini-1.5-pro',
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
      },
    });

    return result.response.text().trim();
  }

  async chat(systemPrompt, messages, options = {}) {
    const model = this._getClient().getGenerativeModel({
      model: this.config.model || 'gemini-1.5-pro',
      systemInstruction: systemPrompt,
    });

    // Convert messages to Gemini format
    const contents = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const result = await model.generateContent({
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 2048,
      },
    });

    return result.response.text().trim();
  }
}

module.exports = GeminiProvider;
