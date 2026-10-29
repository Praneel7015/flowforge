const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const aiService = require('../services/aiService');
const runController = require('../controllers/runController');
const OpenAIProvider = require('../providers/ai/OpenAIProvider');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const CLOUD_SECRETS = {
  apiKey: 'sk-user',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  sessionToken: 'session-token-value',
  serviceAccountJson: '{"client_email":"a@b.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----"}',
};

test('n8n chat payload never carries credentials, only allowlisted routing fields', () => {
  const payload = aiService.buildN8NChatPayload(
    [{ role: 'user', content: 'hi' }],
    'jobs: {}',
    {
      aiProvider: 'bedrock',
      aiOptions: {
        ...CLOUD_SECRETS,
        model: 'us.anthropic.claude-sonnet-4-6',
        region: 'eu-west-1',
        baseUrl: 'https://user:pass@example.com/v1?key=secret',
      },
    },
    'github',
    { displayName: 'GitHub Actions' }
  );

  const serialized = JSON.stringify(payload);
  for (const secret of Object.values(CLOUD_SECRETS)) {
    assert.ok(!serialized.includes(secret), `payload leaked ${secret}`);
  }
  assert.ok(!serialized.includes('pass@'), 'base URL userinfo leaked');
  assert.ok(!serialized.includes('key=secret'), 'base URL query leaked');

  const options = aiService.sanitizeN8NAIOptions({ ...CLOUD_SECRETS, model: 'm', region: 'eu-west-1' });
  assert.deepStrictEqual(options, { model: 'm', region: 'eu-west-1' });
});

test('diagnose-and-fix rejects an unsupported cicdPlatform with 400', async () => {
  const res = createMockRes();
  await runController.diagnoseAndFix(
    { body: { cicdPlatform: 'travis', failedLogs: [{ jobName: 'test', log: 'boom' }], yaml: 'x: 1' } },
    res
  );
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /cicdPlatform must be one of/);
});

test('remediation fallback returns the YAML unchanged with a warning, not a fake fix', async () => {
  const original = aiService.autoRemediatePipeline;
  aiService.autoRemediatePipeline = async () => {
    throw new Error('no provider');
  };
  try {
    const yaml = 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n';
    const res = createMockRes();
    await runController.diagnoseAndFix(
      { body: { platform: 'github', failedLogs: [{ jobName: 'test', log: 'npm ERR!' }], yaml } },
      res
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.patchedYaml, yaml);
    assert.deepStrictEqual(res.body.changeLog, []);
    assert.match(res.body.warning, /AI remediation unavailable: no provider/);
  } finally {
    aiService.autoRemediatePipeline = original;
  }
});

test('OpenAI-compatible clients refuse to follow redirects from the base URL', async (t) => {
  let baseHit = false;
  let redirectedHit = false;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/internal')) {
      redirectedHit = true;
      res.end('{}');
      return;
    }
    baseHit = true;
    res.writeHead(307, { location: '/internal/chat/completions' });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    // Route the HTTPS test endpoint to the local fixture while preserving the
    // SDK's fetch options so the real fetch still enforces redirect: 'error'.
    const originalFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', (url, options) =>
      originalFetch(String(url).replace('https://openai.example', `http://127.0.0.1:${port}`), options)
    );
    const provider = new OpenAIProvider({ apiKey: 'k', model: 'm', baseUrl: 'https://openai.example/v1' });
    provider._getClient().maxRetries = 0;
    await assert.rejects(() => provider.complete('system', 'user'));
    assert.strictEqual(baseHit, true, 'client never reached the base URL');
    assert.strictEqual(redirectedHit, false, 'client followed the redirect');
  } finally {
    server.close();
  }
});

const { createSafeLookup } = require('../utils/ssrf');
const { buildAIOptions } = require('../utils/aiOptions');
const OllamaProvider = require('../providers/ai/OllamaProvider');

const fakeDns = (addresses) => (_host, _opts, cb) => cb(null, addresses);
const lookupAsync = (lookup, options) =>
  new Promise((resolve, reject) =>
    lookup('rebind.example', options, (err, ...rest) => (err ? reject(err) : resolve(rest)))
  );

test('safe lookup rejects hostnames that resolve to private addresses (DNS rebinding)', async () => {
  for (const addresses of [
    [{ address: '10.0.0.5', family: 4 }],
    [{ address: '169.254.169.254', family: 4 }],
    [{ address: '::1', family: 6 }],
    // One public + one private answer must still be rejected.
    [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }],
  ]) {
    await assert.rejects(lookupAsync(createSafeLookup(fakeDns(addresses)), {}), { code: 'ESSRFBLOCKED' });
  }

  const ok = await lookupAsync(createSafeLookup(fakeDns([{ address: '93.184.216.34', family: 4 }])), {});
  assert.deepStrictEqual(ok, ['93.184.216.34', 4]);
  const all = await lookupAsync(createSafeLookup(fakeDns([{ address: '93.184.216.34', family: 4 }])), { all: true });
  assert.deepStrictEqual(all, [[{ address: '93.184.216.34', family: 4 }]]);
});

test('a user-supplied Ollama URL cannot reach a server that resolves to loopback', async () => {
  let hit = false;
  const server = http.createServer((req, res) => {
    hit = true;
    res.end('{"models":[]}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    // "localhost" resolves to loopback; the connect-time check must refuse it.
    const user = new OllamaProvider({ baseUrl: `http://localhost:${port}`, userSuppliedEndpoint: true });
    const result = await user.validateConfig();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(hit, false, 'request reached the loopback server');

    // A server-configured Ollama (OLLAMA_BASE_URL) on localhost still works.
    const operator = new OllamaProvider({ baseUrl: `http://localhost:${port}` });
    assert.strictEqual((await operator.validateConfig()).valid, true);
  } finally {
    server.close();
  }
});

test('custom base URLs must use https (keys never sent over plain HTTP)', () => {
  assert.throws(() => buildAIOptions({ baseUrl: 'http://openrouter.ai/api/v1' }), /must use https/);
  assert.deepStrictEqual(buildAIOptions({ baseUrl: 'https://openrouter.ai/api/v1' }), {
    baseUrl: 'https://openrouter.ai/api/v1',
  });
});

const { isPrivateIPv6, safeAgents } = require('../utils/ssrf');

test('IPv6 link-local covers the whole fe80::/10 range and nothing past it', () => {
  for (const addr of ['fe80::1', 'fe90::1', 'feab::1', 'febf::1']) assert.strictEqual(isPrivateIPv6(addr), true, addr);
  for (const addr of ['fec0::1', 'ff02::1', '2001:4860:4860::8888']) assert.strictEqual(isPrivateIPv6(addr), false, addr);
});

test('blocked lookups do not reveal the private address to callers', async () => {
  const lookup = createSafeLookup(fakeDns([{ address: '10.1.2.3', family: 4 }]));
  const err = await lookupAsync(lookup, {}).catch((e) => e);
  assert.strictEqual(err.code, 'ESSRFBLOCKED');
  assert.ok(!err.message.includes('10.1.2.3'), err.message);
});

test('safe agents bypass HTTP(S)_PROXY so the real destination is validated', () => {
  assert.strictEqual(safeAgents.proxy, false);
});

test('Jenkins import keeps sh scripts in all common forms', () => {
  const jenkinsfile = `pipeline {
  agent any
  stages {
    stage('Build') {
      steps {
        sh 'npm ci'
        sh "echo 'building' && npm run build"
      }
    }
    stage('Test') {
      steps {
        sh '''
          npm ci
          npm test -- --ci
        '''
        sh(script: 'npm run lint', returnStdout: true)
        sh label: 'Audit', script: "npm audit --audit-level=high"
      }
    }
  }
}`;
  const dag = aiService.parseConfigToDAG(jenkinsfile, 'jenkins');
  const scriptOf = (label) => dag.nodes.find((n) => n.data?.label === label)?.data?.config?.script;
  assert.strictEqual(scriptOf('Build'), "npm ci\necho 'building' && npm run build");
  assert.strictEqual(scriptOf('Test'), 'npm ci\nnpm test -- --ci\nnpm run lint\nnpm audit --audit-level=high');
});

const { inspectUrl } = require('../utils/ssrf');
const { logSafe } = require('../utils/logSafe');

const jenkinsStage = (body) => `pipeline {\n  stages {\n    stage('Build') {\n      steps {\n${body}\n      }\n    }\n  }\n}`;
const buildScript = (jenkinsfile) =>
  aiService.parseConfigToDAG(jenkinsfile, 'jenkins').nodes.find((n) => n.data?.label === 'Build')?.data?.config?.script;

test('Jenkins sh scanning stays fast on inputs that broke the old regex (ReDoS)', () => {
  for (const evil of [`sh${' '.repeat(50000)}x`, `sh(${',script:""'.repeat(20000)}`, `sh label: ${'a: b, '.repeat(20000)}`]) {
    const started = Date.now();
    buildScript(jenkinsStage(evil));
    assert.ok(Date.now() - started < 1000, `took ${Date.now() - started}ms`);
  }
});

test('Jenkins import ignores commented-out sh steps but keeps quoted text', () => {
  const script = buildScript(
    jenkinsStage(`        // sh 'rm -rf /'
        /* sh 'old-step'
           sh 'another' */
        sh "echo 'run sh deploy later' // not a comment"
        sh 'npm ci'`)
  );
  assert.strictEqual(script, "echo 'run sh deploy later' // not a comment\nnpm ci");
});

test('IPv4-mapped IPv6 literals are blocked in both dotted and hex forms', () => {
  for (const url of [
    'http://[::ffff:127.0.0.1]:11434/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a9fe:a9fe]/latest/meta-data',
    'http://[::127.0.0.1]/',
    'http://[0:0:0:0:0:ffff:10.0.0.1]/',
  ]) {
    assert.strictEqual(inspectUrl(url).safe, false, url);
  }
  assert.strictEqual(inspectUrl('https://[::ffff:8.8.8.8]/').safe, true);
  assert.throws(() => buildAIOptions({ baseUrl: 'https://[::ffff:127.0.0.1]/v1' }), /Rejected baseUrl/);
});

test('logSafe strips line breaks so values cannot forge log lines', () => {
  assert.strictEqual(logSafe('bad\nFAKE LOG LINE\r\nmore'), 'bad FAKE LOG LINE more');
  assert.strictEqual(logSafe('x'.repeat(500)).length, 300);
});

test('logSafe removes ANSI escape sequences and other control characters', () => {
  const esc = String.fromCharCode(27);
  const input = `ok${esc}[2J${esc}[31mred${esc}[0m\nnext${String.fromCharCode(7)}bell${String.fromCharCode(0)}end`;
  assert.strictEqual(logSafe(input), 'okred next bell end');
  // Truncation happens after cleaning, so escape codes can't eat the budget.
  assert.strictEqual(logSafe(`${esc}[31m`.repeat(200) + 'tail', 10), 'tail');
});

test('diagnose-and-fix hides provider error details in production', () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const script = `
    const aiService = require('./services/aiService');
    aiService.explainPipelineFailure = async () => { throw new Error('upstream secret detail'); };
    aiService.autoRemediatePipeline = async () => { throw new Error('upstream secret detail'); };
    const runController = require('./controllers/runController');
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    runController.diagnoseAndFix({ body: { platform: 'github', failedLogs: [{ jobName: 't', log: 'x' }], yaml: 'a: 1' } }, res)
      .then(() => process.stdout.write(JSON.stringify(res.body)));
  `;
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString();
  const body = JSON.parse(out);
  assert.ok(!out.includes('upstream secret detail'), out);
  assert.strictEqual(body.explanation.warning, 'AI diagnosis unavailable');
  assert.strictEqual(body.warning, 'AI remediation unavailable');
});

test('validation errors name the field but never echo the typed value', () => {
  const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  for (const field of ['region', 'location', 'projectId', 'accessKeyId']) {
    const err = (() => {
      try {
        buildAIOptions({ [field]: secret });
      } catch (e) {
        return e;
      }
      return null;
    })();
    assert.ok(err, `${field} should be rejected`);
    assert.strictEqual(err.status, 400);
    assert.ok(!err.message.includes(secret), `${field} echoed the value: ${err.message}`);
  }
});

test('user-supplied OpenAI-compatible endpoints are checked at connect time (DNS rebinding)', async () => {
  const net = require('node:net');
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  // "localhost" passes the literal-host check only if it were a public name;
  // here it stands in for a public hostname that resolves to loopback.
  const baseUrl = `https://localhost:${port}/v1`;
  const call = async (config) => {
    const provider = new OpenAIProvider({ apiKey: 'k', model: 'm', baseUrl, ...config });
    provider._getClient().maxRetries = 0;
    await assert.rejects(() => provider.complete('system', 'user'));
  };

  try {
    await call({ userSuppliedEndpoint: true });
    assert.strictEqual(connections, 0, 'connected to a loopback address');

    // Control: without the guard the same request does open a connection,
    // so the zero above is the guard working, not a broken test.
    await call({});
    assert.ok(connections > 0, 'control request never connected');
  } finally {
    server.close();
  }
});
