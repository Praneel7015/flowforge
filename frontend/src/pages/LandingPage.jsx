import React, { useState } from 'react';
import ThemeToggleButton from '../components/ThemeToggleButton';

const TARGET_SPECS = {
  gitlab: {
    id: 'gitlab',
    fileName: '.gitlab-ci.yml',
    platform: 'GitLab CI',
    syntax: 'YAML / DAG needs[]',
    lines: [
      { num: 1, text: 'stages: [build, verify, deploy]', node: null },
      { num: 2, text: '', node: null },
      { num: 3, text: 'workflow:', node: 'trigger_push' },
      { num: 4, text: '  rules:', node: 'trigger_push' },
      { num: 5, text: '    - if: $CI_COMMIT_BRANCH == "main"', node: 'trigger_push' },
      { num: 6, text: '', node: null },
      { num: 7, text: 'restore_cache:', node: 'cache_restore' },
      { num: 8, text: '  stage: build', node: 'cache_restore' },
      { num: 9, text: '  cache: { key: "deps-$CI_COMMIT_REF_SLUG", paths: ["node_modules/"] }', node: 'cache_restore' },
      { num: 10, text: '  script: ["npm ci --prefer-offline"]', node: 'cache_restore' },
      { num: 11, text: '', node: null },
      { num: 12, text: 'compile_bundle:', node: 'build' },
      { num: 13, text: '  stage: build', node: 'build' },
      { num: 14, text: '  image: node:20-alpine', node: 'build' },
      { num: 15, text: '  needs: [restore_cache]', node: 'build' },
      { num: 16, text: '  script: ["npm run build"]', node: 'build' },
      { num: 17, text: '', node: null },
      { num: 18, text: 'unit_suite:', node: 'test' },
      { num: 19, text: '  stage: verify', node: 'test' },
      { num: 20, text: '  needs: [compile_bundle]', node: 'test' },
      { num: 21, text: '  script: ["npm test -- --ci"]', node: 'test' },
      { num: 22, text: '', node: null },
      { num: 23, text: 'security_audit:', node: 'security_scan' },
      { num: 24, text: '  stage: verify', node: 'security_scan' },
      { num: 25, text: '  needs: [compile_bundle]', node: 'security_scan' },
      { num: 26, text: '  script: ["npm audit --audit-level=high"]', node: 'security_scan' },
      { num: 27, text: '', node: null },
      { num: 28, text: 'canary_rollout:', node: 'canary_deploy' },
      { num: 29, text: '  stage: deploy', node: 'canary_deploy' },
      { num: 30, text: '  environment: production', node: 'canary_deploy' },
      { num: 31, text: '  needs: [unit_suite, security_audit]', node: 'canary_deploy' },
      { num: 32, text: '  script: ["./scripts/rollout.sh --canary=10%"]', node: 'canary_deploy' },
    ],
  },
  github: {
    id: 'github',
    fileName: '.github/workflows/ci.yml',
    platform: 'GitHub Actions',
    syntax: 'Workflow Dispatch + Jobs DAG',
    lines: [
      { num: 1, text: 'name: FlowForge Production Pipeline', node: null },
      { num: 2, text: 'on:', node: 'trigger_push' },
      { num: 3, text: '  push:', node: 'trigger_push' },
      { num: 4, text: '    branches: ["main"]', node: 'trigger_push' },
      { num: 5, text: '', node: null },
      { num: 6, text: 'jobs:', node: null },
      { num: 7, text: '  restore_cache:', node: 'cache_restore' },
      { num: 8, text: '    runs-on: ubuntu-latest', node: 'cache_restore' },
      { num: 9, text: '    steps:', node: 'cache_restore' },
      { num: 10, text: '      - uses: actions/checkout@v4', node: 'cache_restore' },
      { num: 11, text: '      - uses: actions/cache@v4', node: 'cache_restore' },
      { num: 12, text: '        with: { path: node_modules, key: deps-${{ runner.os }} }', node: 'cache_restore' },
      { num: 13, text: '', node: null },
      { num: 14, text: '  compile_bundle:', node: 'build' },
      { num: 15, text: '    needs: [restore_cache]', node: 'build' },
      { num: 16, text: '    runs-on: ubuntu-latest', node: 'build' },
      { num: 17, text: '    container: node:20-alpine', node: 'build' },
      { num: 18, text: '    steps: [{ run: "npm ci && npm run build" }]', node: 'build' },
      { num: 19, text: '', node: null },
      { num: 20, text: '  unit_suite:', node: 'test' },
      { num: 21, text: '    needs: [compile_bundle]', node: 'test' },
      { num: 22, text: '    runs-on: ubuntu-latest', node: 'test' },
      { num: 23, text: '    steps: [{ run: "npm test -- --ci" }]', node: 'test' },
      { num: 24, text: '', node: null },
      { num: 25, text: '  security_audit:', node: 'security_scan' },
      { num: 26, text: '    needs: [compile_bundle]', node: 'security_scan' },
      { num: 27, text: '    runs-on: ubuntu-latest', node: 'security_scan' },
      { num: 28, text: '    steps: [{ run: "npm audit --audit-level=high" }]', node: 'security_scan' },
      { num: 29, text: '', node: null },
      { num: 30, text: '  canary_rollout:', node: 'canary_deploy' },
      { num: 31, text: '    needs: [unit_suite, security_audit]', node: 'canary_deploy' },
      { num: 32, text: '    environment: production', node: 'canary_deploy' },
      { num: 33, text: '    steps: [{ run: "./scripts/rollout.sh --canary=10%" }]', node: 'canary_deploy' },
    ],
  },
  jenkins: {
    id: 'jenkins',
    fileName: 'Jenkinsfile',
    platform: 'Jenkins Declarative',
    syntax: 'Groovy Pipeline DSL',
    lines: [
      { num: 1, text: 'pipeline {', node: null },
      { num: 2, text: '  agent { docker { image "node:20-alpine" } }', node: 'trigger_push' },
      { num: 3, text: '  triggers { pollSCM("H/5 * * * *") }', node: 'trigger_push' },
      { num: 4, text: '  stages {', node: null },
      { num: 5, text: '    stage("Restore Cache") {', node: 'cache_restore' },
      { num: 6, text: '      steps { sh "npm ci --prefer-offline" }', node: 'cache_restore' },
      { num: 7, text: '    }', node: 'cache_restore' },
      { num: 8, text: '    stage("Compile Bundle") {', node: 'build' },
      { num: 9, text: '      steps { sh "npm run build" }', node: 'build' },
      { num: 10, text: '    }', node: 'build' },
      { num: 11, text: '    stage("Parallel Verification") {', node: null },
      { num: 12, text: '      parallel {', node: null },
      { num: 13, text: '        stage("Unit Suite") {', node: 'test' },
      { num: 14, text: '          steps { sh "npm test -- --ci" }', node: 'test' },
      { num: 15, text: '        }', node: 'test' },
      { num: 16, text: '        stage("Security Audit") {', node: 'security_scan' },
      { num: 17, text: '          steps { sh "npm audit --audit-level=high" }', node: 'security_scan' },
      { num: 18, text: '        }', node: 'security_scan' },
      { num: 19, text: '      }', node: null },
      { num: 20, text: '    }', node: null },
      { num: 21, text: '    stage("Canary Rollout") {', node: 'canary_deploy' },
      { num: 22, text: '      when { branch "main" }', node: 'canary_deploy' },
      { num: 23, text: '      steps { sh "./scripts/rollout.sh --canary=10%" }', node: 'canary_deploy' },
      { num: 24, text: '    }', node: 'canary_deploy' },
      { num: 25, text: '  }', node: null },
      { num: 26, text: '}', node: null },
    ],
  },
  bitbucket: {
    id: 'bitbucket',
    fileName: 'bitbucket-pipelines.yml',
    platform: 'Bitbucket Pipelines',
    syntax: 'Pipelines YAML v2',
    lines: [
      { num: 1, text: 'image: node:20-alpine', node: null },
      { num: 2, text: 'pipelines:', node: 'trigger_push' },
      { num: 3, text: '  branches:', node: 'trigger_push' },
      { num: 4, text: '    main:', node: 'trigger_push' },
      { num: 5, text: '      - step:', node: 'cache_restore' },
      { num: 6, text: '          name: Restore Cache', node: 'cache_restore' },
      { num: 7, text: '          caches: [node]', node: 'cache_restore' },
      { num: 8, text: '          script: ["npm ci --prefer-offline"]', node: 'cache_restore' },
      { num: 9, text: '      - step:', node: 'build' },
      { num: 10, text: '          name: Compile Bundle', node: 'build' },
      { num: 11, text: '          script: ["npm run build"]', node: 'build' },
      { num: 12, text: '      - parallel:', node: null },
      { num: 13, text: '          - step:', node: 'test' },
      { num: 14, text: '              name: Unit Suite', node: 'test' },
      { num: 15, text: '              script: ["npm test -- --ci"]', node: 'test' },
      { num: 16, text: '          - step:', node: 'security_scan' },
      { num: 17, text: '              name: Security Audit', node: 'security_scan' },
      { num: 18, text: '              script: ["npm audit --audit-level=high"]', node: 'security_scan' },
      { num: 19, text: '      - step:', node: 'canary_deploy' },
      { num: 20, text: '          name: Canary Rollout (10%)', node: 'canary_deploy' },
      { num: 21, text: '          deployment: production', node: 'canary_deploy' },
      { num: 22, text: '          script: ["./scripts/rollout.sh --canary=10%"]', node: 'canary_deploy' },
    ],
  },
};

const WORKBENCH_NODES = [
  {
    id: 'trigger_push',
    kind: 'trigger',
    label: 'on: push (main)',
    meta: 'ref: refs/heads/main',
    stage: 'trigger',
    command: 'git rev-parse HEAD',
    tone: 'border-emerald-500/40 text-emerald-500',
    dot: 'bg-emerald-500',
  },
  {
    id: 'cache_restore',
    kind: 'cache',
    label: 'restore_cache',
    meta: 'key: deps-$LOCK_SHA',
    stage: 'build',
    command: 'npm ci --prefer-offline',
    tone: 'border-teal-500/40 text-teal-500',
    dot: 'bg-teal-500',
  },
  {
    id: 'build',
    kind: 'build',
    label: 'compile_bundle',
    meta: 'image: node:20-alpine',
    stage: 'build',
    command: 'npm run build',
    tone: 'border-sky-500/40 text-sky-500',
    dot: 'bg-sky-500',
  },
  {
    id: 'test',
    kind: 'verify',
    label: 'unit_suite',
    meta: 'needs: [compile_bundle]',
    stage: 'verify',
    command: 'npm test -- --ci',
    tone: 'border-amber-500/40 text-amber-500',
    dot: 'bg-amber-500',
  },
  {
    id: 'security_scan',
    kind: 'verify',
    label: 'security_audit',
    meta: 'needs: [compile_bundle]',
    stage: 'verify',
    command: 'npm audit --audit-level=high',
    tone: 'border-rose-500/40 text-rose-500',
    dot: 'bg-rose-500',
  },
  {
    id: 'canary_deploy',
    kind: 'deploy',
    label: 'canary_rollout',
    meta: 'env: production (10%)',
    stage: 'deploy',
    command: './scripts/rollout.sh --canary=10%',
    tone: 'border-indigo-500/40 text-indigo-500',
    dot: 'bg-indigo-500',
  },
];

const ARCHITECTURE_SPECS = [
  {
    id: 'dag-compiler',
    code: 'SYS-DAG',
    title: 'Multi-Target DAG Compiler',
    summary: 'Compiles a single directed acyclic stage graph into idiomatic configuration for 5 CI/CD runtimes.',
    latency: '< 15ms local AST pass',
    guarantee: 'Topological sort + cycle detection',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <path d="M11.5 9v5M9 11.5h5" />
      </svg>
    ),
    specs: [
      'Resolves upstream job dependencies into GitLab `needs: []` and GitHub Actions `needs` arrays.',
      'Translates parallel verification branches into Jenkins Declarative `parallel {}` blocks.',
      'Preserves container images, matrix axes, cache keys, artifact paths, and deployment gates.',
    ],
  },
  {
    id: 'bidirectional-sync',
    code: 'AST-SYNC',
    title: 'Bidirectional YAML ⇄ Graph Sync',
    summary: 'Edit nodes inline on the canvas or type raw YAML directly — changes round-trip without losing stage wiring.',
    latency: '350ms debounced sync',
    guarantee: 'Lossless stage & script mapping',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8a4.5 4.5 0 018.2-2.2" />
        <path d="M12.5 8a4.5 4.5 0 01-8.2 2.2" />
        <path d="M12 3.5V6H9.5" />
      </svg>
    ),
    specs: [
      'Double-click any node label, script command, or condition expression to edit directly on the canvas.',
      'Import existing `.gitlab-ci.yml`, `.github/workflows/*.yml`, or `Jenkinsfile` into editable nodes.',
      'Offline-resilient local compiler fallback keeps the YAML preview live even without backend connectivity.',
    ],
  },
  {
    id: 'groq-synthesis',
    code: 'LPU-GEN',
    title: 'Groq LPU & Repo-Aware Synthesis',
    summary: 'First-class Groq (Llama 3.3 70B) integration synthesizes complete pipelines from repository manifests.',
    latency: 'Sub-second token streaming',
    guarantee: 'BYOM & zero server key storage',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4M4.5 4l2 2M11.5 4l-2 2" />
        <rect x="3" y="8" width="10" height="6" rx="1.5" />
      </svg>
    ),
    specs: [
      'Reads `package.json`, `Dockerfile`, `go.mod`, `Cargo.toml`, and `requirements.txt` from connected repos.',
      'Supports Groq (Llama 3.3 70B) by default, plus Claude, Gemini, OpenAI, and local Ollama instances.',
      'Bring-Your-Own-Model (BYOM) credentials stay in browser storage and are never persisted on the server.',
    ],
  },
  {
    id: 'health-scanner',
    code: 'SEC-lint',
    title: 'Heuristic Secret & Bottleneck Advisor',
    summary: 'Static heuristic rules + LLM analysis grade pipelines across speed, security, and failure recovery.',
    latency: 'Deterministic + AI pass',
    guarantee: '1-click remediated graph load',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2L3 4.2v3.3c0 3.8 5 6 5 6s5-2.2 5-6V4.2L8 2z" />
      </svg>
    ),
    specs: [
      'Flags unpinned `:latest` container tags, missing dependency caches, and hardcoded secret tokens.',
      'Detects serial test bottlenecks that can be parallelized across independent DAG branches.',
      'Applies recommended fixes directly into a new visual workflow with one click.',
    ],
  },
  {
    id: 'git-push',
    code: 'GIT-PR',
    title: 'Direct Repository Commit & PR Push',
    summary: 'Ship validated pipeline configs straight to GitHub, GitLab, or Bitbucket via branch commit or pull request.',
    latency: 'Direct REST API transport',
    guarantee: 'SSRF-guarded outbound proxy',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="4" r="1.5" />
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="11" cy="6" r="1.5" />
        <path d="M5 5.5v5M11 7.5c0 2.5-6 1.5-6 3" />
      </svg>
    ),
    specs: [
      'Creates feature branches and opens Pull Requests / Merge Requests without leaving the workspace.',
      'Legacy Jenkinsfile migrator converts imperative/declarative Groovy pipelines into modern YAML targets.',
      'Optional n8n webhook forwarding dispatches exported pipeline payloads to external automation hooks.',
    ],
  },
];

const SUPPORTED_MODELS = [
  { name: 'Groq (Llama 3.3 70B)', role: 'Primary Default', tag: 'LPU Cloud' },
  { name: 'Claude Sonnet 4.5', role: 'Anthropic', tag: 'Cloud API' },
  { name: 'GPT-4o / 4.1 Mini', role: 'OpenAI', tag: 'Cloud API' },
  { name: 'Gemini 2.5 Pro', role: 'Google', tag: 'Cloud API' },
  { name: 'Ollama (Llama 3 / CodeLlama)', role: 'Local Runtime', tag: 'Air-gapped' },
];

export default function LandingPage({ onEnterApp }) {
  const [activeTarget, setActiveTarget] = useState('gitlab');
  const [selectedNodeId, setSelectedNodeId] = useState('canary_deploy');
  const [activeSpecId, setActiveSpecId] = useState('dag-compiler');

  const currentTarget = TARGET_SPECS[activeTarget] || TARGET_SPECS.gitlab;
  const activeNode = WORKBENCH_NODES.find((n) => n.id === selectedNodeId) || WORKBENCH_NODES[0];
  const activeSpec = ARCHITECTURE_SPECS.find((s) => s.id === activeSpecId) || ARCHITECTURE_SPECS[0];

  return (
    <div className="min-h-screen bg-[var(--ff-bg)] text-[var(--ff-text)] flex flex-col selection:bg-[var(--ff-accent-soft)]">
      {/* ── Top Studio Bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 h-12 border-b border-[var(--ff-border)] bg-[var(--ff-header-bg)] backdrop-blur-xl px-4 md:px-8">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-[var(--ff-accent)] flex items-center justify-center text-[var(--ff-btn-primary-text)]">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="5" height="5" rx="1" />
                <rect x="9" y="2" width="5" height="5" rx="1" />
                <rect x="2" y="9" width="5" height="5" rx="1" />
                <path d="M11.5 9v5M9 11.5h5" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-[var(--ff-text)]">
              FlowForge
            </span>
            <span className="hidden sm:inline-block text-xs text-[var(--ff-muted)] ff-code border-l border-[var(--ff-border)] pl-3">
              pipeline-studio v2.4
            </span>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-[var(--ff-text-secondary)]">
              <a href="#workbench" className="hover:text-[var(--ff-text)] transition-colors">
                Compiler Workbench
              </a>
              <a href="#architecture" className="hover:text-[var(--ff-text)] transition-colors">
                Architecture
              </a>
              <a href="#runtimes" className="hover:text-[var(--ff-text)] transition-colors">
                Runtimes & Models
              </a>
            </nav>

            <div className="flex items-center gap-2">
              <ThemeToggleButton />
              <button
                type="button"
                onClick={onEnterApp}
                className="ff-btn-primary h-8 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <span>Open Studio</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8h9M8.5 4l4 4-4 4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero + Interactive Compiler Workbench ──────────────────── */}
        <section className="border-b border-[var(--ff-border)] py-10 md:py-16 px-4 md:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Editorial Asymmetric Header */}
            <div className="grid lg:grid-cols-12 gap-8 items-end mb-10">
              <div className="lg:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-[var(--ff-card-border-strong)] bg-[var(--ff-surface)] text-xs text-[var(--ff-text-secondary)] ff-code">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--ff-accent)]" />
                  <span>DAG Pipeline Compiler &amp; Groq LPU Synthesis</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-[var(--ff-text)] leading-[1.12]">
                  Visual CI/CD architecture that compiles to native platform YAML.
                </h1>
              </div>

              <div className="lg:col-span-5 space-y-5">
                <p className="text-sm sm:text-base text-[var(--ff-text-secondary)] leading-relaxed">
                  Model stages, caches, security audits, and canary rollouts as an explicit directed acyclic graph. Sync bidirectionally with GitLab CI, GitHub Actions, Jenkins, CircleCI, and Bitbucket Pipelines.
                </p>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onEnterApp}
                    className="ff-btn-primary h-10 px-5 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <span>Launch Pipeline Studio</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 8h9M8.5 4l4 4-4 4" />
                    </svg>
                  </button>
                  <a
                    href="#architecture"
                    className="ff-btn-secondary h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2"
                  >
                    <span>System Specifications</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Interactive Workbench Preview */}
            <div
              id="workbench"
              className="rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-surface)] overflow-hidden shadow-sm"
            >
              {/* Workbench Chrome Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--ff-border)] bg-[var(--ff-bg-soft)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--ff-text)] ff-code">
                    interactive-compiler.ff
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] font-medium">
                    Click any node or target tab to inspect
                  </span>
                </div>

                {/* Live CI/CD Target Tabs */}
                <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="CI/CD compilation targets">
                  {Object.values(TARGET_SPECS).map((target) => {
                    const isSelected = activeTarget === target.id;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => setActiveTarget(target.id)}
                        className={`px-2.5 py-1 rounded-md text-xs ff-code transition-colors ${
                          isSelected
                            ? 'bg-[var(--ff-accent)] text-[var(--ff-btn-primary-text)] font-medium'
                            : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)]'
                        }`}
                      >
                        {target.fileName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Split Canvas + Compiled Output */}
              <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--ff-border)]">
                {/* Left: Interactive DAG Topology */}
                <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col justify-between bg-[var(--ff-bg)]">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <span className="text-xs font-medium text-[var(--ff-muted)] ff-code">
                        DAG TOPOLOGY (6 NODES · 6 EDGES)
                      </span>
                      <span className="text-xs text-[var(--ff-text-secondary)] ff-code">
                        target: {currentTarget.platform}
                      </span>
                    </div>

                    {/* Interactive DAG Grid Layout */}
                    <div className="grid sm:grid-cols-3 gap-3 items-center my-2">
                      {/* Column 1: Trigger + Cache */}
                      <div className="space-y-3">
                        {WORKBENCH_NODES.slice(0, 2).map((node) => {
                          const selected = node.id === selectedNodeId;
                          return (
                            <button
                              key={node.id}
                              type="button"
                              onClick={() => setSelectedNodeId(node.id)}
                              className={`w-full text-left p-3 rounded-lg border transition-all bg-[var(--ff-surface-solid)] ${
                                selected
                                  ? 'border-[var(--ff-accent)] ring-2 ring-[var(--ff-accent-glow)]'
                                  : 'border-[var(--ff-card-border-strong)] hover:border-[var(--ff-border-strong)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ff-text)] ff-code">
                                  <span className={`w-2 h-2 rounded-full ${node.dot}`} />
                                  {node.label}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ff-surface-inset)] text-[var(--ff-muted)] ff-code">
                                  {node.stage}
                                </span>
                              </div>
                              <p className="text-[11px] text-[var(--ff-text-secondary)] ff-code mt-1.5 truncate">
                                {node.meta}
                              </p>
                              <div className="mt-2 px-2 py-1 rounded bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border)] text-[11px] text-[var(--ff-text-secondary)] ff-code truncate">
                                $ {node.command}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Column 2: Build + Parallel Verify */}
                      <div className="space-y-3">
                        {WORKBENCH_NODES.slice(2, 5).map((node) => {
                          const selected = node.id === selectedNodeId;
                          return (
                            <button
                              key={node.id}
                              type="button"
                              onClick={() => setSelectedNodeId(node.id)}
                              className={`w-full text-left p-2.5 rounded-lg border transition-all bg-[var(--ff-surface-solid)] ${
                                selected
                                  ? 'border-[var(--ff-accent)] ring-2 ring-[var(--ff-accent-glow)]'
                                  : 'border-[var(--ff-card-border-strong)] hover:border-[var(--ff-border-strong)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ff-text)] ff-code">
                                  <span className={`w-2 h-2 rounded-full ${node.dot}`} />
                                  {node.label}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ff-surface-inset)] text-[var(--ff-muted)] ff-code">
                                  {node.stage}
                                </span>
                              </div>
                              <div className="mt-1.5 px-2 py-0.5 rounded bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border)] text-[11px] text-[var(--ff-text-secondary)] ff-code truncate">
                                $ {node.command}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Column 3: Canary Deploy */}
                      <div className="space-y-3">
                        {WORKBENCH_NODES.slice(5).map((node) => {
                          const selected = node.id === selectedNodeId;
                          return (
                            <button
                              key={node.id}
                              type="button"
                              onClick={() => setSelectedNodeId(node.id)}
                              className={`w-full text-left p-3 rounded-lg border transition-all bg-[var(--ff-surface-solid)] ${
                                selected
                                  ? 'border-[var(--ff-accent)] ring-2 ring-[var(--ff-accent-glow)]'
                                  : 'border-[var(--ff-card-border-strong)] hover:border-[var(--ff-border-strong)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ff-text)] ff-code">
                                  <span className={`w-2 h-2 rounded-full ${node.dot}`} />
                                  {node.label}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] ff-code">
                                  {node.stage}
                                </span>
                              </div>
                              <p className="text-[11px] text-[var(--ff-text-secondary)] ff-code mt-1.5 truncate">
                                {node.meta}
                              </p>
                              <div className="mt-2 px-2 py-1 rounded bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border)] text-[11px] text-[var(--ff-text-secondary)] ff-code truncate">
                                $ {node.command}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Selected Node Inspector Footer */}
                  <div className="mt-5 pt-3.5 border-t border-[var(--ff-border)] flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[var(--ff-muted)] ff-code">INSPECTING:</span>
                      <span className="font-semibold text-[var(--ff-text)] ff-code">{activeNode.label}</span>
                      <span className="text-[var(--ff-text-secondary)] hidden sm:inline">
                        ({activeNode.meta})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onEnterApp}
                      className="text-xs font-semibold text-[var(--ff-accent-text)] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Open in Visual Builder</span>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3.5 8h9M8.5 4l4 4-4 4" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Right: Live Compiled YAML Output */}
                <div className="lg:col-span-5 flex flex-col bg-[var(--ff-code-bg)]">
                  <div className="px-4 py-2.5 border-b border-[var(--ff-border)] flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--ff-text)] ff-code">
                      {currentTarget.fileName}
                    </span>
                    <span className="text-[11px] text-[var(--ff-muted)] ff-code">
                      {currentTarget.syntax}
                    </span>
                  </div>

                  <div className="p-3 sm:p-4 overflow-x-auto flex-1 max-h-[380px] overflow-y-auto ff-code text-xs leading-relaxed">
                    {currentTarget.lines.map((line) => {
                      const isHighlighted = line.node && line.node === selectedNodeId;
                      return (
                        <div
                          key={line.num}
                          onClick={() => {
                            if (line.node) setSelectedNodeId(line.node);
                          }}
                          className={`flex items-start px-2 py-0.5 rounded transition-colors ${
                            line.node ? 'cursor-pointer' : ''
                          } ${
                            isHighlighted
                              ? 'bg-[var(--ff-accent-soft)] text-[var(--ff-text)] font-medium'
                              : 'text-[var(--ff-text-secondary)] hover:bg-[var(--ff-nav-hover)]'
                          }`}
                        >
                          <span className="w-7 flex-shrink-0 select-none text-[var(--ff-muted)] text-[11px]">
                            {line.num}
                          </span>
                          <span className="whitespace-pre">{line.text || ' '}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Interactive Architecture Specification Matrix ──────────── */}
        <section id="architecture" className="border-b border-[var(--ff-border)] py-12 md:py-16 px-4 md:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-2xl mb-8">
              <p className="text-xs font-semibold text-[var(--ff-accent-text)] ff-code mb-2">
                SYSTEM ARCHITECTURE
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ff-text)]">
                Built around an explicit pipeline AST, not string templates.
              </h2>
              <p className="text-sm text-[var(--ff-text-secondary)] mt-2 leading-relaxed">
                Every canvas interaction, YAML edit, repository scan, and health audit operates on the same normalized node-and-edge graph.
              </p>
            </div>

            <div className="grid lg:grid-cols-12 gap-6 items-start">
              {/* Left Selector List */}
              <div className="lg:col-span-5 space-y-2">
                {ARCHITECTURE_SPECS.map((item) => {
                  const selected = item.id === activeSpec.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSpecId(item.id)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selected
                          ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]'
                          : 'border-[var(--ff-card-border-strong)] bg-[var(--ff-surface)] hover:border-[var(--ff-border-strong)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border-strong)] flex items-center justify-center text-[var(--ff-accent-text)]">
                            {item.icon}
                          </span>
                          <span className="text-sm font-semibold text-[var(--ff-text)]">
                            {item.title}
                          </span>
                        </div>
                        <span className="text-[11px] ff-code text-[var(--ff-muted)]">
                          {item.code}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--ff-text-secondary)] mt-2 leading-relaxed">
                        {item.summary}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Right Specification Detail Panel */}
              <div className="lg:col-span-7 rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-surface)] p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ff-border)] pb-4">
                  <div>
                    <span className="text-xs font-semibold text-[var(--ff-accent-text)] ff-code">
                      MODULE // {activeSpec.code}
                    </span>
                    <h3 className="text-xl font-bold text-[var(--ff-text)] mt-1">
                      {activeSpec.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs ff-code">
                    <span className="px-2.5 py-1 rounded-md bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border-strong)] text-[var(--ff-text-secondary)]">
                      {activeSpec.latency}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)]">
                      {activeSpec.guarantee}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-[var(--ff-text-secondary)] leading-relaxed">
                  {activeSpec.summary}
                </p>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-[var(--ff-muted)] ff-code">
                    IMPLEMENTATION SPECIFICATIONS
                  </p>
                  <ul className="space-y-2.5">
                    {activeSpec.specs.map((spec, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-sm text-[var(--ff-text)] leading-relaxed p-3 rounded-lg bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border)]"
                      >
                        <svg
                          className="w-4 h-4 text-[var(--ff-accent-text)] flex-shrink-0 mt-0.5"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3.5 8.5l3 3 6-6.5" />
                        </svg>
                        <span>{spec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 flex items-center justify-between gap-4 border-t border-[var(--ff-border)]">
                  <span className="text-xs text-[var(--ff-muted)] ff-code">
                    20 built-in stage node types · full keyboard &amp; drag support
                  </span>
                  <button
                    type="button"
                    onClick={onEnterApp}
                    className="ff-btn-primary px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <span>Try in Workspace</span>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 8h9M8.5 4l4 4-4 4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Runtimes, AI Inference & Privacy Matrix ────────────────── */}
        <section id="runtimes" className="py-12 md:py-16 px-4 md:px-8">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-6 rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-surface)] p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <p className="text-xs font-semibold text-[var(--ff-accent-text)] ff-code">
                    INFERENCE ENGINES
                  </p>
                  <h3 className="text-lg font-bold text-[var(--ff-text)] mt-0.5">
                    Groq LPU default + Bring Your Own Model
                  </h3>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-md bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border-strong)] text-[var(--ff-text-secondary)] ff-code">
                  Zero telemetry
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[var(--ff-text-secondary)] leading-relaxed mb-5">
                Groq (Llama 3.3 70B) powers instant pipeline synthesis out of the box. Override the model, endpoint URL, or API key per session—or run 100% locally via Ollama.
              </p>

              <div className="divide-y divide-[var(--ff-border)] border border-[var(--ff-card-border-strong)] rounded-lg overflow-hidden">
                {SUPPORTED_MODELS.map((m) => (
                  <div
                    key={m.name}
                    className="px-3.5 py-2.5 bg-[var(--ff-surface-inset)] flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-semibold text-[var(--ff-text)] ff-code">{m.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--ff-muted)]">{m.role}</span>
                      <span className="px-2 py-0.5 rounded bg-[var(--ff-surface)] border border-[var(--ff-card-border-strong)] text-[var(--ff-text-secondary)] ff-code text-[11px]">
                        {m.tag}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-surface)] p-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--ff-accent-text)] ff-code">
                  COMPILER TARGETS &amp; SECURITY
                </p>
                <h3 className="text-lg font-bold text-[var(--ff-text)] mt-0.5">
                  Five CI/CD targets. Browser-scoped credentials.
                </h3>
                <p className="text-xs sm:text-sm text-[var(--ff-text-secondary)] leading-relaxed mt-2 mb-5">
                  Switch target platforms at any time to recompile your current graph. Repository tokens and custom LLM keys remain in local storage and are validated directly against official platform APIs.
                </p>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  {[
                    { name: 'GitLab CI', file: '.gitlab-ci.yml' },
                    { name: 'GitHub Actions', file: '.github/workflows/ci.yml' },
                    { name: 'Jenkins Pipeline', file: 'Jenkinsfile' },
                    { name: 'CircleCI', file: '.circleci/config.yml' },
                    { name: 'Bitbucket Pipelines', file: 'bitbucket-pipelines.yml' },
                  ].map((target) => (
                    <div
                      key={target.name}
                      className="p-3 rounded-lg bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border-strong)] flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-semibold text-[var(--ff-text)]">{target.name}</span>
                      <span className="text-[11px] text-[var(--ff-muted)] ff-code">{target.file}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--ff-border)] flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[var(--ff-text-secondary)]">
                  Ready to design or import a pipeline?
                </div>
                <button
                  type="button"
                  onClick={onEnterApp}
                  className="ff-btn-primary h-9 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <span>Enter FlowForge Studio</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8h9M8.5 4l4 4-4 4" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--ff-border)] py-5 px-4 md:px-8 bg-[var(--ff-bg-soft)]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--ff-muted)]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--ff-text)]">FlowForge</span>
            <span>—</span>
            <span>Visual CI/CD DAG Studio &amp; Multi-Target YAML Compiler</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/praneel7015/flowforge"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--ff-text)] transition-colors"
            >
              GitHub Repository
            </a>
            <button
              type="button"
              onClick={onEnterApp}
              className="text-[var(--ff-accent-text)] font-medium hover:underline"
            >
              Open Studio
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
