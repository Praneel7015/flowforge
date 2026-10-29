const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const BACKEND = path.join(__dirname, '..');

function mockRes() {
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

// Runs a snippet with NODE_ENV=production and returns its JSON output.
function inProduction(script) {
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: BACKEND,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  return JSON.parse(out.toString());
}

test('production: unexposed 4xx and all 5xx details are hidden, exposed 4xx are kept', () => {
  const results = inProduction(`
    const { errorHandler } = require('./middleware/errorHandler');
    const { sendStatusError } = require('./utils/sendError');
    const res = () => ({ status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
    const quiet = console.error; console.error = () => {};
    const run = (err) => { const r = res(); errorHandler(err, { method: 'GET', originalUrl: '/api/x' }, r, () => {}); return [r.code, r.body.error]; };
    const out = {
      sdk400: run(Object.assign(new Error('upstream said: secret-host.internal'), { status: 400 })),
      cors403: run(Object.assign(new Error('CORS: Origin https://x.example not allowed'), { status: 403, expose: true })),
      crash500: run(new Error('ECONNREFUSED 10.0.0.5:5432')),
      status400: (() => { const r = res(); sendStatusError(r, Object.assign(new Error('projectId is required'), { status: 400 }), 'Failed'); return [r.code, r.body.error]; })(),
      status502: (() => { const r = res(); sendStatusError(r, new Error('socket hang up at 10.0.0.5'), 'Failed to list runs'); return [r.code, r.body.error]; })(),
    };
    console.error = quiet;
    process.stdout.write(JSON.stringify(out));
  `);
  assert.deepStrictEqual(results.sdk400, [400, 'Request failed']);
  assert.deepStrictEqual(results.cors403, [403, 'CORS: Origin https://x.example not allowed']);
  assert.deepStrictEqual(results.crash500, [500, 'Internal server error']);
  assert.deepStrictEqual(results.status400, [400, 'projectId is required']);
  assert.deepStrictEqual(results.status502, [500, 'Failed to list runs']);
});

test('webhooks are acknowledged before processing, and a redelivery is skipped', async () => {
  const controller = require('../controllers/webhookController');
  const gitlabService = require('../services/gitlabService');
  const original = gitlabService.getPipelineLogs;
  let resolveLogs;
  let calls = 0;
  gitlabService.getPipelineLogs = () => {
    calls += 1;
    return new Promise((resolve) => {
      resolveLogs = () => resolve({ failedLogs: [] });
    });
  };
  const quiet = console.log;
  console.log = () => {};
  try {
    const req = {
      headers: { 'x-gitlab-event': 'Pipeline Hook', 'x-gitlab-event-uuid': 'uuid-audit-1' },
      body: { object_attributes: { status: 'failed', id: 7 }, project: { id: 1 } },
    };
    const first = mockRes();
    const pending = controller.handleWebhook(req, first);
    // Answered while the log fetch is still running.
    assert.strictEqual(first.statusCode, 202);
    assert.strictEqual(calls, 1);

    const again = mockRes();
    await controller.handleWebhook(req, again);
    assert.deepStrictEqual([again.statusCode, again.body.status], [200, 'duplicate']);
    assert.strictEqual(calls, 1);

    resolveLogs();
    await pending;
  } finally {
    gitlabService.getPipelineLogs = original;
    console.log = quiet;
  }
});

test('GitLab job names never take a global keyword', () => {
  const yaml = require('js-yaml');
  const GitLabCIGenerator = require('../providers/cicd/GitLabCIGenerator');
  const nodes = [
    { id: 't', type: 'trigger_push', data: { label: 'push', config: {} } },
    { id: 'a', type: 'build', data: { label: 'Stages', config: { script: 'npm ci' } } },
    { id: 'b', type: 'test', data: { label: 'Variables', config: { script: 'npm test' } } },
  ];
  const edges = [
    { id: 'e1', source: 't', target: 'a' },
    { id: 'e2', source: 'a', target: 'b' },
  ];
  const doc = yaml.load(new GitLabCIGenerator().generate(nodes, edges));
  assert.ok(Array.isArray(doc.stages), JSON.stringify(doc));
  assert.ok(doc.stages_job, 'job renamed');
  assert.ok(doc.variables_job, 'job renamed');
  assert.strictEqual(doc.variables, undefined);
  // needs: points at the renamed job.
  const needs = (doc.variables_job.needs || []).map((n) => (typeof n === 'string' ? n : n.job));
  assert.deepStrictEqual(needs, ['stages_job']);
});

// Starts server.js on a free port and returns { port, stop, output }.
async function startServer(env) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND,
    env: { ...process.env, PORT: '0', NODE_ENV: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (d) => (output += d));
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 15000);
    child.stdout.on('data', (d) => {
      output += d;
      const match = String(d).match(/running on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}: ${output}`));
    });
  });
  return { port, stop: () => child.kill(), output: () => output };
}

test('TRUST_PROXY=false and a hop count start the server; CORS checks hostnames exactly', async () => {
  for (const value of ['false', '2', 'true', 'loopback']) {
    const server = await startServer({ TRUST_PROXY: value, FRONTEND_URL: '' });
    server.stop();
  }

  const server = await startServer({ FRONTEND_URL: '' });
  try {
    const origin = async (value) => {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/health`, { headers: { Origin: value } });
      return res.status;
    };
    assert.strictEqual(await origin('http://localhost:5174'), 200);
    assert.strictEqual(await origin('http://127.0.0.1:5174'), 200);
    assert.strictEqual(await origin('https://flowforge-git-main-praneelss.vercel.app'), 200);
    // Substring and shared-host tricks are refused.
    assert.strictEqual(await origin('https://localhost.attacker.example'), 403);
    assert.strictEqual(await origin('https://evil-127.0.0.1.example'), 403);
    assert.strictEqual(await origin('https://anything.vercel.app'), 403);
    assert.strictEqual(await origin('https://my-app.onrender.com'), 403);
  } finally {
    server.stop();
  }
});
