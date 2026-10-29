const { test } = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const axios = require('axios');

const { safeAgents } = require('../utils/ssrf');

test('GitLab: only a caller-supplied URL is passed on to the service', () => {
  const { resolveCredentials } = require('../controllers/runController');
  const saved = process.env.GITLAB_TOKEN;
  process.env.GITLAB_TOKEN = 'server-token';
  try {
    assert.strictEqual(resolveCredentials('gitlab', {}, { operator: true }).instanceUrl, undefined);
    assert.strictEqual(
      resolveCredentials('gitlab', { url: 'https://gitlab.example.com', token: 'mine' }).instanceUrl,
      'https://gitlab.example.com'
    );
  } finally {
    if (saved === undefined) delete process.env.GITLAB_TOKEN;
    else process.env.GITLAB_TOKEN = saved;
  }
});

test("GitLab: the operator's GITLAB_URL is trusted, a caller's URL keeps the SSRF agents", async () => {
  const saved = { url: process.env.GITLAB_URL, token: process.env.GITLAB_TOKEN };
  process.env.GITLAB_URL = 'https://gitlab.internal.corp';
  process.env.GITLAB_TOKEN = 'server-token';
  const originalCreate = axios.create;
  const configs = [];
  axios.create = (config) => {
    configs.push(config);
    return { get: async () => ({ data: [] }) };
  };
  try {
    const gitlabService = require('../services/gitlabService');
    await gitlabService.listPipelines('group/app', { token: 'server-token' });
    await gitlabService.listPipelines('group/app', { token: 'mine', instanceUrl: 'https://gitlab.example.com' });

    const [operator, caller] = configs.slice(-2);
    assert.strictEqual(operator.baseURL, 'https://gitlab.internal.corp/api/v4');
    assert.strictEqual(operator.headers['PRIVATE-TOKEN'], 'server-token');
    assert.strictEqual(operator.httpsAgent, undefined);
    assert.strictEqual(operator.maxRedirects, 0);

    assert.strictEqual(caller.baseURL, 'https://gitlab.example.com/api/v4');
    assert.strictEqual(caller.headers['PRIVATE-TOKEN'], 'mine');
    assert.strictEqual(caller.httpsAgent, safeAgents.httpsAgent);
    assert.strictEqual(caller.httpAgent, safeAgents.httpAgent);
    assert.strictEqual(caller.maxRedirects, 0);

    // A caller URL without the caller's own token never borrows the server's.
    await assert.rejects(
      () => gitlabService.listPipelines('group/app', { instanceUrl: 'https://gitlab.example.com' }),
      /token is required/
    );
  } finally {
    axios.create = originalCreate;
    for (const [key, value] of [['GITLAB_URL', saved.url], ['GITLAB_TOKEN', saved.token]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('GitHub Actions YAML keeps double-quoted scalars (js-yaml 5 quoteStyle)', () => {
  const GitHubActionsGenerator = require('../providers/cicd/GitHubActionsGenerator');
  const out = new GitHubActionsGenerator().generate(
    [
      { id: '1', type: 'trigger_push', data: { label: 'push', config: {} } },
      { id: '2', type: 'build', data: { label: 'Build', config: { script: 'npm ci' } } },
    ],
    [{ id: 'e', source: '1', target: '2' }]
  );
  assert.ok(out.includes('"on":'), out);
  assert.ok(!out.includes("'on':"), out);
});

test('the server exits non-zero when it cannot bind its port', async () => {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, resolve));
  const { port } = blocker.address();
  try {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const code = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve('timeout');
      }, 15000);
      child.on('exit', (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    assert.strictEqual(code, 1, output);
    assert.match(output, /Failed to start on port/);
    assert.doesNotMatch(output, /backend running/);
  } finally {
    blocker.close();
  }
});

test('GitLab: env proxies are never used, and the operator URL must be https (or loopback)', async () => {
  const saved = { url: process.env.GITLAB_URL, token: process.env.GITLAB_TOKEN };
  process.env.GITLAB_TOKEN = 'server-token';
  const originalCreate = axios.create;
  const configs = [];
  axios.create = (config) => {
    configs.push(config);
    return { get: async () => ({ data: [] }) };
  };
  try {
    const gitlabService = require('../services/gitlabService');

    process.env.GITLAB_URL = 'https://gitlab.internal.corp';
    await gitlabService.listPipelines('group/app', { token: 'server-token' });
    await gitlabService.listPipelines('group/app', { token: 'mine', instanceUrl: 'https://gitlab.example.com' });
    for (const config of configs.slice(-2)) assert.strictEqual(config.proxy, false);

    // The server token would travel in cleartext.
    process.env.GITLAB_URL = 'http://gitlab.internal.corp';
    await assert.rejects(() => gitlabService.listPipelines('group/app', { token: 'server-token' }), /must use https/);

    process.env.GITLAB_URL = 'http://localhost:8080';
    await gitlabService.listPipelines('group/app', { token: 'server-token' });
    assert.strictEqual(configs.at(-1).baseURL, 'http://localhost:8080/api/v4');
  } finally {
    axios.create = originalCreate;
    for (const [key, value] of [['GITLAB_URL', saved.url], ['GITLAB_TOKEN', saved.token]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('runs: server CI tokens are used only for requests with the operator key', () => {
  const { resolveCredentials, isOperatorRequest } = require('../controllers/runController');
  const keys = ['RUNS_OPERATOR_KEY', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'CIRCLECI_TOKEN', 'BITBUCKET_USERNAME', 'BITBUCKET_APP_PASSWORD'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    GITHUB_TOKEN: 'srv-gh',
    GITLAB_TOKEN: 'srv-gl',
    CIRCLECI_TOKEN: 'srv-cc',
    BITBUCKET_USERNAME: 'srv-user',
    BITBUCKET_APP_PASSWORD: 'srv-pass',
  });
  const req = (key) => ({ get: (name) => (name.toLowerCase() === 'x-flowforge-operator-key' ? key : undefined) });
  try {
    // An anonymous visitor never gets the server's tokens, on any platform.
    for (const platform of ['github', 'gitlab', 'circleci', 'bitbucket']) {
      assert.throws(() => resolveCredentials(platform, {}), { status: 400 }, platform);
    }
    // Their own token still works.
    assert.strictEqual(resolveCredentials('github', { token: 'mine' }).token, 'mine');

    // No RUNS_OPERATOR_KEY configured: nobody is an operator.
    delete process.env.RUNS_OPERATOR_KEY;
    assert.strictEqual(isOperatorRequest(req('anything')), false);

    process.env.RUNS_OPERATOR_KEY = 'op-secret';
    assert.strictEqual(isOperatorRequest(req('op-secret')), true);
    assert.strictEqual(isOperatorRequest(req('op-secreT')), false);
    assert.strictEqual(isOperatorRequest(req(undefined)), false);
    assert.strictEqual(isOperatorRequest({}), false);

    const operator = { operator: true };
    assert.strictEqual(resolveCredentials('github', {}, operator).token, 'srv-gh');
    assert.strictEqual(resolveCredentials('gitlab', {}, operator).token, 'srv-gl');
    assert.strictEqual(resolveCredentials('circleci', {}, operator).token, 'srv-cc');
    assert.deepStrictEqual(
      { ...resolveCredentials('bitbucket', {}, operator), workspace: undefined },
      { username: 'srv-user', appPassword: 'srv-pass', workspace: undefined }
    );
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
