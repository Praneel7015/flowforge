const { test } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const githubService = require('../services/githubService');
const aiService = require('../services/aiService');
const runController = require('../controllers/runController');

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

test('normalizeExecutionStatus maps platform states to queued/running/passed/failed/skipped', () => {
  const { normalizeExecutionStatus } = runController;
  assert.strictEqual(normalizeExecutionStatus('completed', 'success'), 'passed');
  assert.strictEqual(normalizeExecutionStatus('completed', 'failure'), 'failed');
  assert.strictEqual(normalizeExecutionStatus('completed', 'cancelled'), 'skipped');
  assert.strictEqual(normalizeExecutionStatus('in_progress', null), 'running');
  assert.strictEqual(normalizeExecutionStatus('queued', null), 'queued');
  assert.strictEqual(normalizeExecutionStatus('COMPLETED', 'SUCCESSFUL'), 'passed');
  assert.strictEqual(normalizeExecutionStatus('COMPLETED', 'FAILED'), 'failed');
  assert.strictEqual(normalizeExecutionStatus('running', 'running'), 'running');
  assert.strictEqual(normalizeExecutionStatus('on_hold', 'on_hold'), 'queued');
});

test('githubService.getWorkflowRunLogs truncates raw logs to 4000 chars and falls back gracefully', async () => {
  const origCreate = axios.create;
  try {
    const longLog = 'A'.repeat(1000) + 'B'.repeat(4000);
    axios.create = () => ({
      get: async (url) => {
        if (url.endsWith('/jobs')) {
          return {
            data: {
              jobs: [
                {
                  id: 101,
                  name: 'unit-test',
                  conclusion: 'failure',
                  steps: [{ name: 'Run pytest', conclusion: 'failure' }],
                },
                {
                  id: 102,
                  name: 'integration-test',
                  conclusion: 'failure',
                  steps: [{ name: 'Run e2e', conclusion: 'failure' }],
                },
              ],
            },
          };
        }
        if (url.includes('/jobs/101/logs')) {
          return { data: longLog };
        }
        if (url.includes('/jobs/102/logs')) {
          throw new Error('Log download expired');
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    const result = await githubService.getWorkflowRunLogs('ghp_test', 'octocat', 'hello-world', 555);
    assert.strictEqual(result.failedLogs.length, 2);

    // Job 101 has step summary + last 4000 chars of raw log ('B'.repeat(4000))
    assert.ok(result.failedLogs[0].log.includes('Step: Run pytest'));
    assert.ok(result.failedLogs[0].log.includes('B'.repeat(4000)));
    assert.ok(!result.failedLogs[0].log.includes('A'));

    // Job 102 falls back to step summary when raw log download fails
    assert.strictEqual(result.failedLogs[1].log, 'Step: Run e2e\nConclusion: failure');
  } finally {
    axios.create = origCreate;
  }
});

test('githubService.getWorkflowRunStatus returns normalized run metadata and per-job durations', async () => {
  const origCreate = axios.create;
  try {
    axios.create = () => ({
      get: async (url) => {
        if (url.endsWith('/runs/777')) {
          return {
            data: {
              id: 777,
              run_number: 42,
              name: 'CI Pipeline',
              status: 'completed',
              conclusion: 'success',
              head_branch: 'main',
              head_sha: 'abc1234',
              html_url: 'https://github.com/octocat/hello-world/actions/runs/777',
              created_at: '2026-10-21T10:00:00Z',
              updated_at: '2026-10-21T10:01:30Z',
            },
          };
        }
        if (url.endsWith('/runs/777/jobs')) {
          return {
            data: {
              jobs: [
                {
                  id: 1,
                  name: 'build',
                  status: 'completed',
                  conclusion: 'success',
                  started_at: '2026-10-21T10:00:00Z',
                  completed_at: '2026-10-21T10:00:45Z',
                  html_url: 'https://github.com/octocat/hello-world/actions/runs/777/job/1',
                },
              ],
            },
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    const status = await githubService.getWorkflowRunStatus('ghp_test', 'octocat', 'hello-world', 777);
    assert.strictEqual(status.id, 777);
    assert.strictEqual(status.jobs.length, 1);
    assert.strictEqual(status.jobs[0].name, 'build');
    assert.strictEqual(status.jobs[0].durationSeconds, 45);
  } finally {
    axios.create = origCreate;
  }
});

test('runController blocks private/SSRF URLs in credentials and diagnoses provided logs', async () => {
  // 1. SSRF check on custom GitLab instanceUrl
  const ssrRes = createMockRes();
  await runController.listRuns(
    {
      body: {
        platform: 'gitlab',
        credentials: { token: 'glpat-test', instanceUrl: 'http://169.254.169.254' },
        projectId: '123',
      },
    },
    ssrRes
  );
  assert.strictEqual(ssrRes.statusCode, 400);
  assert.match(ssrRes.body.error, /safe public HTTP/i);

  // 2. diagnoseAndFix with provided failedLogs + YAML. The AI calls are
  // stubbed so the test never reaches a real provider and checks both paths.
  const yamlIn = 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n';
  const diagnose = async () => {
    const res = createMockRes();
    await runController.diagnoseAndFix(
      {
        body: {
          platform: 'github',
          failedLogs: [{ jobId: 1, jobName: 'test', stage: 'test', log: 'npm ERR! Test failed' }],
          yaml: yamlIn,
        },
      },
      res
    );
    return res;
  };
  const original = {
    explain: aiService.explainPipelineFailure,
    remediate: aiService.autoRemediatePipeline,
  };
  try {
    aiService.explainPipelineFailure = async () => ({
      summary: 'Tests fail',
      explanation: 'npm test exits 1',
      rootCause: 'Dependencies not installed',
      suggestedFixes: ['Run npm ci first'],
    });
    aiService.autoRemediatePipeline = async () => ({
      patchedYaml: yamlIn.replace('- run: npm test', '- run: npm ci\n      - run: npm test'),
      changeLog: ['Added npm ci'],
      commitMessage: 'fix: install deps',
    });
    const ok = await diagnose();
    assert.strictEqual(ok.statusCode, 200);
    assert.strictEqual(ok.body.rootCause, 'Dependencies not installed');
    assert.strictEqual(ok.body.failedJobs.length, 1);
    assert.match(ok.body.remediation.patchedYaml, /npm ci/);
    assert.deepStrictEqual(ok.body.changeLog, ['Added npm ci']);
    assert.strictEqual(ok.body.warning, undefined);

    // Provider failures fall back to a heuristic diagnosis and the original YAML.
    aiService.explainPipelineFailure = async () => {
      throw new Error('provider down');
    };
    aiService.autoRemediatePipeline = async () => {
      throw new Error('provider down');
    };
    const fallback = await diagnose();
    assert.strictEqual(fallback.statusCode, 200);
    assert.match(fallback.body.rootCause, /job "test"/);
    assert.strictEqual(fallback.body.remediation.patchedYaml, yamlIn);
    assert.match(fallback.body.warning, /AI remediation unavailable/);
  } finally {
    aiService.explainPipelineFailure = original.explain;
    aiService.autoRemediatePipeline = original.remediate;
  }
});

test('aiService heuristic health report uses 10-rule secretScanner', async () => {
  const yamlWithOpenAIKey = `
stages:
  - build
build_job:
  stage: build
  image: node:20-alpine
  script:
    - export OPENAI_API_KEY=sk-proj-1234567890abcdefghijklmnop
    - npm ci
`;
  const report = await aiService.scorePipelineHealth(yamlWithOpenAIKey, {
    cicdPlatform: 'gitlab',
    aiProvider: 'invalid-provider-to-trigger-heuristic',
  });
  assert.ok(
    report.breakdown.security.issues.some((issue) => /OpenAI API Key/i.test(issue)),
    'Expected heuristic security issues to mention OpenAI API Key from secretScanner'
  );
});
