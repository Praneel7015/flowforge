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

test('CIDR boundaries: 172.16.0.0/12 and 100.64.0.0/10', () => {
  const cases = {
    'http://172.15.255.255': true,
    'http://172.16.0.0': false,
    'http://172.31.255.255': false,
    'http://172.32.0.0': true,
    'http://100.63.255.255': true,
    'http://100.64.0.0': false,
    'http://100.127.255.255': false,
    'http://100.128.0.0': true,
  };
  for (const [url, safe] of Object.entries(cases)) assert.strictEqual(isSafePublicUrl(url), safe, url);
});

test('non-routable IPv4 ranges are blocked with exact boundaries', () => {
  const blocked = [
    '192.0.0.1', '192.0.2.10', '198.18.0.1', '198.19.255.255', '198.51.100.7',
    '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
  ];
  const allowed = ['192.0.1.1', '198.17.255.255', '198.20.0.0', '198.51.101.1', '203.0.114.1', '223.255.255.255'];
  for (const host of blocked) assert.strictEqual(isSafePublicUrl(`http://${host}`), false, host);
  for (const host of allowed) assert.strictEqual(isSafePublicUrl(`http://${host}`), true, host);
});

test('IPv6 multicast, NAT64 and 6to4 forms of private IPv4 are blocked', () => {
  for (const host of ['[ff02::1]', '[64:ff9b::127.0.0.1]', '[64:ff9b::a9fe:a9fe]', '[2002:7f00:1::]', '[2002:a00:1::1]']) {
    assert.strictEqual(isSafePublicUrl(`http://${host}/`), false, host);
  }
  // Their public-IPv4 counterparts stay allowed.
  for (const host of ['[64:ff9b::808:808]', '[2002:808:808::1]']) {
    assert.strictEqual(isSafePublicUrl(`http://${host}/`), true, host);
  }
});

test('a trailing dot does not get a blocked hostname past the checks', () => {
  for (const url of ['http://localhost./', 'https://metadata.google.internal./', 'http://foo.localhost../']) {
    assert.strictEqual(isSafePublicUrl(url), false, url);
  }
});

test('embedded IPv4 is found in every IPv6 spelling (compressed or not)', () => {
  const { isPrivateIPv6 } = require('../utils/ssrf');
  const privateForms = [
    '2002:a01::1', // 6to4 of 10.1.0.0, second group compressed
    '2002:0a01:0000::1',
    '2002:c0a8:101::', // 192.168.1.1
    '64:ff9b::1', // NAT64 of 0.0.0.1
    '64:ff9b:0:0:0:0:a00:1', // 10.0.0.1, uncompressed
    '64:ff9b::10.0.0.1',
    '0:0:0:0:0:ffff:7f00:1', // mapped loopback, uncompressed
    '::ffff:169.254.169.254',
    '0::1',
    'fe80:0:0:0::1',
    'fd12:3456::1',
    'ff05::2',
    'not-an-address',
  ];
  for (const addr of privateForms) assert.strictEqual(isPrivateIPv6(addr), true, addr);
  const publicForms = ['2002:808:808::1', '64:ff9b::8.8.8.8', '64:ff9b::808:808', '2606:4700::1111', '::ffff:8.8.8.8'];
  for (const addr of publicForms) assert.strictEqual(isPrivateIPv6(addr), false, addr);
});
