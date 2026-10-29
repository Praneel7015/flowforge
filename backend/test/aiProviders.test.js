const { test } = require('node:test');
const assert = require('node:assert');

// Server has a Groq key; set before the config module is loaded.
process.env.GROQ_API_KEY = 'gsk_server_key';

const { buildAIOptions } = require('../utils/aiOptions');
const { getAIProvider } = require('../providers/ai');
const { signV4, toConverseMessages } = require('../providers/ai/BedrockProvider');

test('server key is never sent to a user-supplied base URL', () => {
  assert.throws(
    () => getAIProvider('groq', { baseUrl: 'https://attacker.example/v1' }),
    /needs your own API key/
  );
  const own = getAIProvider('groq', { baseUrl: 'https://attacker.example/v1', apiKey: 'user-key' });
  assert.strictEqual(own.config.apiKey, 'user-key');
});

test('server key is kept for model-only overrides on the default endpoint', () => {
  const provider = getAIProvider('groq', { model: 'openai/gpt-oss-20b' });
  assert.strictEqual(provider.config.apiKey, 'gsk_server_key');
});

test('explicitly chosen provider without credentials errors instead of swapping', () => {
  assert.throws(() => getAIProvider('bedrock'), /no API key on this server/);
  assert.throws(() => getAIProvider('vertex', { projectId: 'my-proj-123' }), /missing credentials/);
});

test('new providers accept their credential shapes', () => {
  assert.strictEqual(getAIProvider('bedrock', { apiKey: 'k' }).name, 'bedrock');
  assert.strictEqual(
    getAIProvider('bedrock', { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 's' }).name,
    'bedrock'
  );
  assert.strictEqual(getAIProvider('vertex', { apiKey: 'k' }).name, 'vertex');
  assert.strictEqual(
    getAIProvider('openai_compatible', { baseUrl: 'https://openrouter.ai/api/v1', model: 'a/b' }).name,
    'openai_compatible'
  );
});

test('region, location and project values are validated (no host injection)', () => {
  assert.deepStrictEqual(buildAIOptions({ region: 'eu-west-1' }), { region: 'eu-west-1' });
  assert.deepStrictEqual(buildAIOptions({ location: 'us-central1' }), { location: 'us-central1' });
  assert.throws(() => buildAIOptions({ region: 'evil.com/x' }), /Invalid AWS region/);
  assert.throws(() => buildAIOptions({ location: 'x.attacker.com#' }), /Invalid Vertex location/);
  assert.throws(() => buildAIOptions({ projectId: '../../etc' }), /Invalid GCP project ID/);
});

test('service account JSON must be valid and complete', () => {
  assert.throws(() => buildAIOptions({ serviceAccountJson: '{bad' }), /not valid JSON/);
  assert.throws(() => buildAIOptions({ serviceAccountJson: '{"a":1}' }), /client_email and private_key/);
  const ok = buildAIOptions({ serviceAccountJson: { client_email: 'a@b', private_key: 'k' } });
  assert.ok(ok.serviceAccountJson.includes('client_email'));
});

test('SigV4 signer matches the official AWS test vectors', () => {
  const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
  const sign = (method) =>
    signV4({
      method,
      host: 'example.amazonaws.com',
      path: '/',
      region: 'us-east-1',
      service: 'service',
      credentials,
      amzDate: '20150830T123600Z',
    }).authorization.split('Signature=')[1];

  assert.strictEqual(sign('GET'), '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  assert.strictEqual(sign('POST'), '5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b');
});

test('Bedrock messages alternate and start with a user turn', () => {
  const out = toConverseMessages([
    { role: 'assistant', content: 'welcome' },
    { role: 'user', content: 'a' },
    { role: 'user', content: 'b' },
    { role: 'assistant', content: 'c' },
  ]);
  assert.deepStrictEqual(out, [
    { role: 'user', content: [{ text: 'a\n\nb' }] },
    { role: 'assistant', content: [{ text: 'c' }] },
  ]);
});
