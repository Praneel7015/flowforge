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

test('OpenAI-compatible clients refuse to follow redirects from the base URL', async () => {
  let redirectedHit = false;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/internal')) {
      redirectedHit = true;
      res.end('{}');
      return;
    }
    res.writeHead(307, { location: '/internal/chat/completions' });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const provider = new OpenAIProvider({ apiKey: 'k', model: 'm', baseUrl: `http://127.0.0.1:${port}/v1` });
    provider._getClient().maxRetries = 0;
    await assert.rejects(() => provider.complete('system', 'user'));
    assert.strictEqual(redirectedHit, false, 'client followed the redirect');
  } finally {
    server.close();
  }
});
