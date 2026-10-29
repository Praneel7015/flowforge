/**
 * Google Vertex AI Provider (Gemini models via generateContent).
 *
 * Auth, in order of preference:
 *   1. Vertex API key (express mode) -> global endpoint, x-goog-api-key header
 *   2. Service account JSON          -> signed JWT exchanged for an OAuth token,
 *      then the project/location endpoint (no google-auth-library needed)
 */
const crypto = require('crypto');
const AIProvider = require('./AIProvider');

const DEFAULT_VERTEX_MODEL = 'gemini-3.8-flash';
const DEFAULT_VERTEX_LOCATION = 'global';
// Fixed on purpose: never use token_uri from user-supplied JSON (SSRF).
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const REQUEST_TIMEOUT_MS = Number(process.env.VERTEX_TIMEOUT_MS || 60000);

const base64Url = (input) => Buffer.from(input).toString('base64url');

function toVertexContents(messages) {
  const out = [];
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'model' : 'user';
    const text = String(message.content ?? '');
    if (!text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n\n${text}`;
    } else {
      out.push({ role, parts: [{ text }] });
    }
  }
  return out;
}

class VertexProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'vertex';
    this.token = null;
  }

  _model() {
    return this.config.model || DEFAULT_VERTEX_MODEL;
  }

  _location() {
    return this.config.location || DEFAULT_VERTEX_LOCATION;
  }

  getMetadata() {
    return {
      name: 'vertex',
      displayName: `Vertex AI (${this._model()})`,
      model: this._model(),
      supportsStreaming: false,
    };
  }

  _serviceAccount() {
    const raw = this.config.serviceAccountJson;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  async _accessToken(account) {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(JSON.stringify({
      iss: account.client_email,
      scope: CLOUD_PLATFORM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }));
    const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key, 'base64url');

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new Error(`Vertex auth failed: ${data.error_description || data.error || response.status}`);
    }

    this.token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    return this.token.value;
  }

  async _endpointAndHeaders() {
    const modelPath = `publishers/google/models/${encodeURIComponent(this._model())}:generateContent`;

    if (this.config.apiKey) {
      return {
        url: `https://aiplatform.googleapis.com/v1/${modelPath}`,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.config.apiKey },
      };
    }

    const account = this._serviceAccount();
    if (!account) {
      throw new Error('Vertex AI needs an API key (express mode) or a service account JSON key.');
    }
    const projectId = this.config.projectId || account.project_id;
    if (!projectId) throw new Error('Vertex AI needs a project ID.');

    const location = this._location();
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    return {
      url: `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${location}/${modelPath}`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await this._accessToken(account)}` },
    };
  }

  async _generate(system, messages, { maxTokens, temperature }) {
    const { url, headers } = await this._endpointAndHeaders();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: toVertexContents(messages),
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(temperature !== undefined ? { temperature } : {}),
        },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Vertex AI ${response.status}: ${data.error?.message || response.statusText}`);
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join('')
      .trim();
    if (!text) throw new Error('Vertex AI returned an empty completion');
    return text;
  }

  async validateConfig() {
    try {
      await this._generate(null, [{ role: 'user', content: 'ping' }], { maxTokens: 16 });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async complete(systemPrompt, userMessage, options = {}) {
    return this._generate(systemPrompt, [{ role: 'user', content: userMessage }], {
      maxTokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.4,
    });
  }

  async chat(systemPrompt, messages, options = {}) {
    return this._generate(systemPrompt, messages, {
      maxTokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.5,
    });
  }
}

module.exports = VertexProvider;
