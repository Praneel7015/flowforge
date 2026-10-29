/**
 * AWS Bedrock AI Provider (Converse API).
 *
 * Auth, in order of preference:
 *   1. Bedrock API key  -> Authorization: Bearer <key>
 *   2. IAM access keys  -> AWS Signature Version 4 (signed here with node:crypto,
 *      so no AWS SDK dependency is needed)
 */
const crypto = require('crypto');
const AIProvider = require('./AIProvider');

const DEFAULT_BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-6';
const DEFAULT_BEDROCK_REGION = 'us-east-1';
const REQUEST_TIMEOUT_MS = Number(process.env.BEDROCK_TIMEOUT_MS || 60000);

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/**
 * AWS Signature Version 4 for a request with no query string.
 * Returns the full header set to send (lower-case names, incl. authorization).
 */
function signV4({ method, host, path, body = '', region, service, headers = {}, credentials, amzDate }) {
  const timestamp = amzDate || new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = timestamp.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const allHeaders = { ...headers, host, 'x-amz-date': timestamp };
  const names = Object.keys(allHeaders).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(allHeaders).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonicalHeaders = names.map((h) => `${h}:${lower[h]}\n`).join('');
  const signedHeaders = names.join(';');

  // Non-S3 services sign each path segment URI-encoded a second time.
  const canonicalUri = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, sha256Hex(body)].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', timestamp, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, dateStamp), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    ...lower,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/**
 * Bedrock requires strict user/assistant alternation starting with a user turn,
 * so merge consecutive same-role messages and drop leading assistant turns.
 */
function toConverseMessages(messages) {
  const out = [];
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const text = String(message.content ?? '');
    if (!text.trim()) continue;
    if (out.length === 0 && role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content[0].text += `\n\n${text}`;
    } else {
      out.push({ role, content: [{ text }] });
    }
  }
  return out;
}

class BedrockProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'bedrock';
  }

  _model() {
    return this.config.model || DEFAULT_BEDROCK_MODEL;
  }

  _region() {
    return this.config.region || DEFAULT_BEDROCK_REGION;
  }

  getMetadata() {
    return {
      name: 'bedrock',
      displayName: `AWS Bedrock (${this._model()})`,
      model: this._model(),
      supportsStreaming: false,
    };
  }

  _signRequest(host, path, body) {
    const { accessKeyId, secretAccessKey, sessionToken } = this.config;
    return signV4({
      method: 'POST',
      host,
      path,
      body,
      region: this._region(),
      service: 'bedrock',
      headers: {
        'content-type': 'application/json',
        ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
      },
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async _converse(system, messages, { maxTokens, temperature }) {
    const host = `bedrock-runtime.${this._region()}.amazonaws.com`;
    const path = `/model/${encodeURIComponent(this._model())}/converse`;
    const body = JSON.stringify({
      ...(system ? { system: [{ text: system }] } : {}),
      messages: toConverseMessages(messages),
      inferenceConfig: {
        maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
      },
    });

    let headers;
    if (this.config.apiKey) {
      headers = { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` };
    } else if (this.config.accessKeyId && this.config.secretAccessKey) {
      // fetch sets Host itself (to the same value that was signed).
      const { host: _signedHost, ...signed } = this._signRequest(host, path, body);
      headers = signed;
    } else {
      throw new Error('AWS Bedrock needs a Bedrock API key or an access key ID + secret access key.');
    }

    const response = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Bedrock ${response.status}: ${data.message || data.Message || response.statusText}`);
    }

    const text = (data.output?.message?.content || [])
      .map((part) => part.text || '')
      .join('')
      .trim();
    if (!text) throw new Error('Bedrock returned an empty completion');
    return text;
  }

  async validateConfig() {
    try {
      await this._converse(null, [{ role: 'user', content: 'ping' }], { maxTokens: 16 });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async complete(systemPrompt, userMessage, options = {}) {
    return this._converse(systemPrompt, [{ role: 'user', content: userMessage }], {
      maxTokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.4,
    });
  }

  async chat(systemPrompt, messages, options = {}) {
    return this._converse(systemPrompt, messages, {
      maxTokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.5,
    });
  }
}

module.exports = BedrockProvider;
module.exports.toConverseMessages = toConverseMessages;
module.exports.signV4 = signV4;
