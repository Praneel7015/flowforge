const { test } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const JenkinsGenerator = require('../providers/cicd/JenkinsGenerator');
const { pathSegment, pathSegments, trimTrailingSlashes } = require('../utils/url');
const githubService = require('../services/githubService');
const { getAIProvider } = require('../providers/ai');
const { getCICDGenerator } = require('../providers/cicd');

test('Jenkinsfile output escapes quotes, backslashes and newlines in user text', () => {
  const generator = new JenkinsGenerator();
  const label = "Build') { sh 'pwned' } stage('x";
  const out = generator.generate(
    [
      { id: '1', type: 'trigger_push', data: { label: 'push', config: {} } },
      { id: '2', type: 'build', data: { label, config: { script: 'echo ok \\' } } },
    ],
    [{ id: 'e', source: '1', target: '2' }]
  );
  // The label stays inside one string literal: every quote is escaped.
  assert.ok(out.includes("stage('Build\\') { sh \\'pwned\\' } stage(\\'x')"), out);
  // A trailing backslash is doubled, so it can't escape the closing quote.
  assert.ok(out.includes("sh 'echo ok \\\\'"), out);
});

test('path segments are encoded and traversal is rejected', () => {
  assert.strictEqual(pathSegment('octo/cat'), 'octo%2Fcat');
  for (const bad of ['', '.', '..']) {
    assert.throws(() => pathSegment(bad), { status: 400 });
  }
  assert.strictEqual(pathSegments('feature/new ui'), 'feature/new%20ui');
  assert.strictEqual(pathSegments(''), '');
  assert.throws(() => pathSegments('src/../../user'), { status: 400 });
});

test('GitHub calls refuse a traversal owner before sending any request', async () => {
  const originalCreate = axios.create;
  const requested = [];
  axios.create = () => ({ get: async (url) => (requested.push(url), { data: [] }) });
  try {
    await assert.rejects(() => githubService.listBranches('token', '..', 'repo'), { status: 400 });
    assert.deepStrictEqual(requested, []);
    await githubService.listBranches('token', 'octo', 'my repo');
    assert.deepStrictEqual(requested, ['/repos/octo/my%20repo/branches']);
  } finally {
    axios.create = originalCreate;
  }
});

test('trailing-slash trimming is linear on long slash runs (no ReDoS)', () => {
  const evil = 'https://x' + '/'.repeat(200000) + 'y';
  const started = Date.now();
  assert.strictEqual(trimTrailingSlashes(evil), evil);
  assert.strictEqual(trimTrailingSlashes('https://gitlab.com///'), 'https://gitlab.com');
  assert.ok(Date.now() - started < 200, `took ${Date.now() - started}ms`);
});

test('prototype property names are not treated as providers or platforms', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.throws(() => getAIProvider(name), { status: 400, message: /Unknown AI provider/ });
    assert.throws(() => getCICDGenerator(name), /Unknown CI\/CD platform/);
  }
});

test('a provider without credentials is a 400 (setup issue), not a 500', () => {
  assert.throws(() => getAIProvider('anthropic'), { status: 400 });
});

test('sendError keeps 400 messages and hides 500 details in production', () => {
  const script = `
    const { sendError } = require('./utils/sendError');
    const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    const bad = Object.assign(new Error('missing model'), { status: 400 });
    const out = [sendError(res, bad, 'Chat failed'), sendError({ ...res }, new Error('upstream secret'), 'Chat failed')]
      .map((r) => ({ code: r.code, body: r.body }));
    process.stdout.write(JSON.stringify(out));
  `;
  const run = (env) =>
    JSON.parse(
      execFileSync(process.execPath, ['-e', script], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_ENV: env },
      }).toString()
    );

  const [prodBad, prodServer] = run('production');
  assert.deepStrictEqual(prodBad, { code: 400, body: { error: 'Chat failed: missing model' } });
  assert.deepStrictEqual(prodServer, { code: 500, body: { error: 'Chat failed' } });

  const [, devServer] = run('development');
  assert.deepStrictEqual(devServer, { code: 500, body: { error: 'Chat failed: upstream secret' } });
});
