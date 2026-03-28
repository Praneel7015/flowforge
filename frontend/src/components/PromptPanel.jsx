import React, { useState } from 'react';
import axios from 'axios';

const FULL_NODE_COVERAGE = [
  'trigger_push',
  'trigger_mr',
  'cache_restore',
  'build',
  'matrix_build',
  'lint',
  'test',
  'integration_test',
  'smoke_test',
  'security_scan',
  'cache_save',
  'package',
  'release',
  'conditional',
  'approval_gate',
  'deploy',
  'canary_deploy',
  'blue_green_deploy',
  'rollback',
  'notify',
];

function buildProductionTemplate(platformLabel) {
  return `Create a production-grade ${platformLabel} pipeline.

Project details:
- Stack: Node.js API + React frontend
- Package manager: npm
- Environments: staging and production
- Deployment branch: main

Pipeline requirements:
- Triggers: push and merge request
- Performance: restore/save dependency cache and use matrix build for Node 18 and 20
- Quality gates: lint, unit tests, integration tests, smoke tests, security scan
- Packaging and release: create artifact/package and release stage
- Deployment safety: approval gate before production
- Deploy strategy: canary deploy, then blue/green cutover
- Reliability: rollback plan if health checks fail
- Communication: notify team on success/failure
- Branch policy: use conditional logic so production deploy only happens on main

Node expectations:
- Use these node types when relevant: ${FULL_NODE_COVERAGE.join(', ')}
- Fill useful config values (matrix, cacheKey/cachePaths, artifactPath, tag, approver, trafficPercent, activeColor, channel, condition)

Output quality:
- YAML must be valid and runnable
- Node graph should be fully connected and easy to read`;
}

function buildFullCoverageExample(platformLabel) {
  return `Generate a comprehensive ${platformLabel} pipeline that demonstrates all available builder node types in a realistic flow.

Use this end-to-end sequence:
trigger_push + trigger_mr -> cache_restore -> build -> matrix_build -> lint -> test -> integration_test -> smoke_test -> security_scan -> cache_save -> package -> release -> conditional -> approval_gate -> deploy -> canary_deploy -> blue_green_deploy -> rollback -> notify

Constraints:
- Production deploy only on main branch
- Canary rollout starts at 10% traffic
- Blue/green switch uses activeColor=green
- Include rollback behavior and team notification
- Use meaningful scripts and config values for each advanced node
- Return robust, clean YAML and matching React Flow nodes/edges`;
}

export default function PromptPanel({ onGenerated, aiProvider, cicdPlatform, aiOptions }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const platformNames = {
    gitlab: 'GitLab CI',
    github: 'GitHub Actions',
    jenkins: 'Jenkins',
    circleci: 'CircleCI',
  };

  const targetPlatformLabel = platformNames[cicdPlatform] || 'CI/CD';

  const examplePrompts = [
    `Create a production-ready ${targetPlatformLabel} pipeline for a Node.js service that uses cache restore/save, matrix builds, lint, unit/integration/smoke tests, security scanning, packaging, release, approval gate, canary deployment, blue/green cutover, rollback, and notifications.`,
    `Design a ${targetPlatformLabel} monorepo pipeline (frontend + backend) with branch-aware conditional deployment, artifact packaging, parallel test strategy, and environment-specific deployment controls with rollback.`,
    `Generate a ${targetPlatformLabel} pipeline for a Python API with security-first defaults: pinned images, dependency scan, secret-safe practices, approval before production, staged canary rollout, and incident notifications.`,
    `Create a highly reliable ${targetPlatformLabel} pipeline for a React app: restore cache, build, lint, test, integration checks, smoke tests, package artifacts, release tag, and deploy only from main via conditional gate.`,
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');

    try {
      const { data } = await axios.post('/api/pipelines/generate', {
        prompt,
        aiProvider,
        cicdPlatform,
        aiOptions,
      });
      onGenerated(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate pipeline. Check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5 ff-enter">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Generator</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
            Build a pipeline from plain language
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Describe your project goals and constraints. FlowForge will generate a
            {' '}
            <span className="font-semibold text-slate-800">{platformNames[cicdPlatform] || 'CI/CD'}</span>
            {' '}
            config and visual workflow.
          </p>
        </div>

        <section className="ff-surface-soft p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-[0.14em]">
            Prompt Boosters
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPrompt(buildProductionTemplate(targetPlatformLabel))}
              className="px-3 py-2 rounded-lg text-xs ff-btn-secondary"
            >
              Load Production Template
            </button>
            <button
              onClick={() => setPrompt(buildFullCoverageExample(targetPlatformLabel))}
              className="px-3 py-2 rounded-lg text-xs ff-btn-secondary"
            >
              Load Full Node Coverage Example
            </button>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            High-quality prompts should include triggers, quality gates, security checks, deploy strategy,
            rollback behavior, notifications, and branch/environment conditions.
          </p>
        </section>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe stack, triggers, environments, quality gates, security requirements, deploy strategy, rollback, and notifications."
          rows={10}
          className="ff-input p-4 text-sm resize-none leading-relaxed"
        />

        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-opacity ff-btn-primary"
        >
          {loading ? 'Generating...' : `Generate ${platformNames[cicdPlatform] || 'Pipeline'}`}
        </button>

        {error && <p className="text-rose-700 text-sm">{error}</p>}

        <div className="pt-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.14em] mb-3">
            Example prompts
          </h3>
          <div className="space-y-2">
            {examplePrompts.map((example, i) => (
              <button
                key={i}
                onClick={() => setPrompt(example)}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-300 bg-white
                  text-sm text-slate-700 hover:border-slate-400 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
