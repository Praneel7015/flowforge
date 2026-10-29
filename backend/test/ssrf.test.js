const { test } = require('node:test');
const assert = require('node:assert');
const { isSafePublicUrl, inspectUrl } = require('../utils/ssrf');

test('allows normal public https URLs', () => {
  assert.strictEqual(isSafePublicUrl('https://api.openai.com/v1'), true);
  assert.strictEqual(isSafePublicUrl('https://api.featherless.ai/v1'), true);
});

test('HTTPS-only inspection rejects public HTTP endpoints', () => {
  const url = 'http://openrouter.ai/api/v1';
  assert.strictEqual(inspectUrl(url).safe, true);
  assert.deepStrictEqual(inspectUrl(url, { requireHttps: true }), {
    safe: false,
    reason: 'custom endpoints must use https://',
  });
  assert.strictEqual(inspectUrl('https://openrouter.ai/api/v1', { requireHttps: true }).safe, true);
});

test('blocks loopback and localhost', () => {
  assert.strictEqual(isSafePublicUrl('http://localhost:11434'), false);
  assert.strictEqual(isSafePublicUrl('http://127.0.0.1/v1'), false);
  assert.strictEqual(isSafePublicUrl('http://[::1]/v1'), false);
});

test('blocks cloud metadata endpoint', () => {
  assert.strictEqual(isSafePublicUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.strictEqual(isSafePublicUrl('http://metadata.google.internal/'), false);
});

test('blocks private IPv4 ranges', () => {
  assert.strictEqual(isSafePublicUrl('http://10.0.0.5'), false);
  assert.strictEqual(isSafePublicUrl('http://172.16.4.4'), false);
  assert.strictEqual(isSafePublicUrl('http://192.168.1.1'), false);
});

test('blocks non-http protocols and malformed URLs', () => {
  assert.strictEqual(isSafePublicUrl('file:///etc/passwd'), false);
  assert.strictEqual(isSafePublicUrl('ftp://example.com'), false);
  assert.strictEqual(isSafePublicUrl('not a url'), false);
  assert.strictEqual(isSafePublicUrl(''), false);
});

test('inspectUrl returns a reason', () => {
  assert.match(inspectUrl('http://127.0.0.1').reason, /private|loopback/i);
});
