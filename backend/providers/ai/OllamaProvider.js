/**
 * Ollama (Local LLM) AI Provider implementation.
 * Communicates with a local Ollama server via HTTP.
 */
const axios = require('axios');
const AIProvider = require('./AIProvider');
const { safeAgents } = require('../../utils/ssrf');

// Server-configured Ollama (OLLAMA_BASE_URL) may legitimately be localhost.
// A base URL from a user's request is untrusted: no redirects, and every
// resolved address must be public (blocks DNS rebinding to internal hosts).
const serverClient = axios.create({ maxRedirects: 0 });
const userClient = axios.create({ maxRedirects: 0, ...safeAgents });

class OllamaProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'ollama';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama3';
    this.http = config.userSuppliedEndpoint ? userClient : serverClient;
  }

  getMetadata() {
    return {
      name: 'ollama',
      displayName: 'Ollama (Local)',
      model: this.model,
      supportsStreaming: true,
    };
  }

  async validateConfig() {
    try {
      // Check if Ollama server is running
      const response = await this.http.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000,
      });
      const models = response.data.models || [];
      const hasModel = models.some((m) => m.name.startsWith(this.model));
      if (!hasModel && models.length > 0) {
        return {
          valid: true,
          warning: `Model '${this.model}' not found. Available: ${models.map((m) => m.name).join(', ')}`,
        };
      }
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: `Cannot connect to Ollama at ${this.baseUrl}: ${err.message}`,
      };
    }
  }

  async complete(systemPrompt, userMessage, options = {}) {
    const response = await this.http.post(`${this.baseUrl}/api/generate`, {
      model: this.model,
      prompt: userMessage,
      system: systemPrompt,
      stream: false,
      options: {
        num_predict: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
      },
    });

    return response.data.response.trim();
  }

  async chat(systemPrompt, messages, options = {}) {
    // Convert to Ollama chat format
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const response = await this.http.post(`${this.baseUrl}/api/chat`, {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        num_predict: options.maxTokens || 2048,
      },
    });

    return response.data.message.content.trim();
  }
}

module.exports = OllamaProvider;
