/**
 * Abstract base class for AI providers.
 * All AI providers must implement these methods.
 */
class AIProvider {
  constructor(config) {
    if (new.target === AIProvider) {
      throw new Error('AIProvider is abstract and cannot be instantiated directly');
    }
    this.config = config;
    this.name = 'base';
  }

  /**
   * Get provider metadata for frontend display.
   * @returns {{ name: string, displayName: string, model: string, supportsStreaming: boolean }}
   */
  getMetadata() {
    throw new Error('getMetadata() must be implemented');
  }

  /**
   * Validate that the provider is properly configured.
   * @returns {Promise<{ valid: boolean, error?: string }>}
   */
  async validateConfig() {
    throw new Error('validateConfig() must be implemented');
  }

  /**
   * Core completion method - single turn.
   * @param {string} systemPrompt - System context
   * @param {string} userMessage - User input
   * @param {{ maxTokens?: number, temperature?: number }} options
   * @returns {Promise<string>}
   */
  async complete(systemPrompt, userMessage, options = {}) {
    throw new Error('complete() must be implemented');
  }

  /**
   * Multi-turn conversation support.
   * @param {string} systemPrompt
   * @param {Array<{role: string, content: string}>} messages
   * @param {{ maxTokens?: number }} options
   * @returns {Promise<string>}
   */
  async chat(systemPrompt, messages, options = {}) {
    throw new Error('chat() must be implemented');
  }

  /**
   * Streaming completion (optional - defaults to non-streaming).
   * @param {string} systemPrompt
   * @param {string} userMessage
   * @param {function(string): void} onChunk
   * @param {{ maxTokens?: number }} options
   * @returns {Promise<string>}
   */
  async stream(systemPrompt, userMessage, onChunk, options = {}) {
    // Default fallback to non-streaming
    const result = await this.complete(systemPrompt, userMessage, options);
    onChunk(result);
    return result;
  }
}

module.exports = AIProvider;
