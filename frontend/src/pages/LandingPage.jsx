import React, { useState } from 'react';
import ThemeToggleButton from '../components/ThemeToggleButton';

const TARGET_SPECS = {
  gitlab: {
    id: 'gitlab',
    fileName: '.gitlab-ci.yml',
    lines: [
      { num: 1, text: 'stages: [build, test, deploy]', node: null },
      { num: 2, text: '', node: null },
      { num: 3, text: 'workflow:', node: 'trigger' },
      { num: 4, text: '  rules:', node: 'trigger' },
      { num: 5, text: '    - if: $CI_COMMIT_BRANCH == "main"', node: 'trigger' },
      { num: 6, text: '', node: null },
      { num: 7, text: 'build_app:', node: 'build' },
      { num: 8, text: '  stage: build', node: 'build' },
      { num: 9, text: '  image: node:20-alpine', node: 'build' },
      { num: 10, text: '  script: ["npm ci && npm run build"]', node: 'build' },
      { num: 11, text: '', node: null },
      { num: 12, text: 'unit_tests:', node: 'test' },
      { num: 13, text: '  stage: test', node: 'test' },
      { num: 14, text: '  needs: [build_app]', node: 'test' },
      { num: 15, text: '  script: ["npm test -- --ci"]', node: 'test' },
      { num: 16, text: '', node: null },
      { num: 17, text: 'security_scan:', node: 'security' },
      { num: 18, text: '  stage: test', node: 'security' },
      { num: 19, text: '  needs: [build_app]', node: 'security' },
      { num: 20, text: '  script: ["npm audit --audit-level=high"]', node: 'security' },
      { num: 21, text: '', node: null },
      { num: 22, text: 'deploy_prod:', node: 'deploy' },
      { num: 23, text: '  stage: deploy', node: 'deploy' },
      { num: 24, text: '  needs: [unit_tests, security_scan]', node: 'deploy' },
      { num: 25, text: '  script: ["./scripts/rollout.sh"]', node: 'deploy' },
    ],
  },
  github: {
    id: 'github',
    fileName: '.github/workflows/ci.yml',
    lines: [
      { num: 1, text: 'name: CI Pipeline', node: null },
      { num: 2, text: 'on:', node: 'trigger' },
      { num: 3, text: '  push:', node: 'trigger' },
      { num: 4, text: '    branches: [main]', node: 'trigger' },
      { num: 5, text: '', node: null },
      { num: 6, text: 'jobs:', node: null },
      { num: 7, text: '  build:', node: 'build' },
      { num: 8, text: '    runs-on: ubuntu-latest', node: 'build' },
      { num: 9, text: '    steps: [{ run: "npm ci && npm run build" }]', node: 'build' },
      { num: 10, text: '', node: null },
      { num: 11, text: '  test:', node: 'test' },
      { num: 12, text: '    needs: [build]', node: 'test' },
      { num: 13, text: '    runs-on: ubuntu-latest', node: 'test' },
      { num: 14, text: '    steps: [{ run: "npm test -- --ci" }]', node: 'test' },
      { num: 15, text: '', node: null },
      { num: 16, text: '  security:', node: 'security' },
      { num: 17, text: '    needs: [build]', node: 'security' },
      { num: 18, text: '    runs-on: ubuntu-latest', node: 'security' },
      { num: 19, text: '    steps: [{ run: "npm audit --audit-level=high" }]', node: 'security' },
      { num: 20, text: '', node: null },
      { num: 21, text: '  deploy:', node: 'deploy' },
      { num: 22, text: '    needs: [test, security]', node: 'deploy' },
      { num: 23, text: '    runs-on: ubuntu-latest', node: 'deploy' },
      { num: 24, text: '    steps: [{ run: "./scripts/rollout.sh" }]', node: 'deploy' },
    ],
  },
  jenkins: {
    id: 'jenkins',
    fileName: 'Jenkinsfile',
    lines: [
      { num: 1, text: 'pipeline {', node: null },
      { num: 2, text: '  agent { docker { image "node:20-alpine" } }', node: 'trigger' },
      { num: 3, text: '  stages {', node: null },
      { num: 4, text: '    stage("Build") {', node: 'build' },
      { num: 5, text: '      steps { sh "npm ci && npm run build" }', node: 'build' },
      { num: 6, text: '    }', node: 'build' },
      { num: 7, text: '    stage("Verify") {', node: null },
      { num: 8, text: '      parallel {', node: null },
      { num: 9, text: '        stage("Test") {', node: 'test' },
      { num: 10, text: '          steps { sh "npm test -- --ci" }', node: 'test' },
      { num: 11, text: '        }', node: 'test' },
      { num: 12, text: '        stage("Security") {', node: 'security' },
      { num: 13, text: '          steps { sh "npm audit --audit-level=high" }', node: 'security' },
      { num: 14, text: '        }', node: 'security' },
      { num: 15, text: '      }', node: null },
      { num: 16, text: '    }', node: null },
      { num: 17, text: '    stage("Deploy") {', node: 'deploy' },
      { num: 18, text: '      steps { sh "./scripts/rollout.sh" }', node: 'deploy' },
      { num: 19, text: '    }', node: 'deploy' },
      { num: 20, text: '  }', node: null },
      { num: 21, text: '}', node: null },
    ],
  },
  bitbucket: {
    id: 'bitbucket',
    fileName: 'bitbucket-pipelines.yml',
    lines: [
      { num: 1, text: 'image: node:20-alpine', node: null },
      { num: 2, text: 'pipelines:', node: 'trigger' },
      { num: 3, text: '  branches:', node: 'trigger' },
      { num: 4, text: '    main:', node: 'trigger' },
      { num: 5, text: '      - step:', node: 'build' },
      { num: 6, text: '          name: Build', node: 'build' },
      { num: 7, text: '          script: ["npm ci && npm run build"]', node: 'build' },
      { num: 8, text: '      - parallel:', node: null },
      { num: 9, text: '          - step:', node: 'test' },
      { num: 10, text: '              name: Test', node: 'test' },
      { num: 11, text: '              script: ["npm test -- --ci"]', node: 'test' },
      { num: 12, text: '          - step:', node: 'security' },
      { num: 13, text: '              name: Security', node: 'security' },
      { num: 14, text: '              script: ["npm audit --audit-level=high"]', node: 'security' },
      { num: 15, text: '      - step:', node: 'deploy' },
      { num: 16, text: '          name: Deploy', node: 'deploy' },
      { num: 17, text: '          script: ["./scripts/rollout.sh"]', node: 'deploy' },
    ],
  },
};

const PREVIEW_STAGES = [
  { id: 'trigger', label: 'Trigger', command: 'on: push (main)', dot: 'bg-emerald-500' },
  { id: 'build', label: 'Build', command: 'npm ci && npm run build', dot: 'bg-sky-500' },
  { id: 'test', label: 'Test', command: 'npm test -- --ci', dot: 'bg-amber-500' },
  { id: 'security', label: 'Security', command: 'npm audit --audit-level=high', dot: 'bg-rose-500' },
  { id: 'deploy', label: 'Deploy', command: './scripts/rollout.sh', dot: 'bg-indigo-500' },
];

const FEATURES = [
  {
    title: 'Visual DAG Builder',
    description: 'Drag stages, wire dependencies, and edit shell commands inline.',
  },
  {
    title: '5 Native Targets',
    description: 'Instant compilation to GitHub Actions, GitLab CI, Jenkins, CircleCI, and Bitbucket.',
  },
  {
    title: 'AI & Git Ready',
    description: 'Generate from your repo with Groq LPU, audit secrets, and push a PR in one click.',
  },
];

export default function LandingPage({ onEnterApp }) {
  const [activeTarget, setActiveTarget] = useState('gitlab');
  const [selectedStageId, setSelectedStageId] = useState('deploy');

  const currentTarget = TARGET_SPECS[activeTarget] || TARGET_SPECS.gitlab;

  const renderNodeCard = (stage) => {
    const selected = stage.id === selectedStageId;
    return (
      <button
        key={stage.id}
        type="button"
        onClick={() => setSelectedStageId(stage.id)}
        className={`w-full text-left p-3 rounded-lg border transition-all bg-[var(--ff-surface-solid)] ${
          selected
            ? 'border-[var(--ff-accent)] ring-2 ring-[var(--ff-accent-glow)]'
            : 'border-[var(--ff-card-border-strong)] hover:border-[var(--ff-border-strong)]'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
          <span className="text-xs font-semibold text-[var(--ff-text)]">
            {stage.label}
          </span>
        </div>
        <div className="mt-1.5 text-[11px] text-[var(--ff-text-secondary)] ff-code truncate">
          $ {stage.command}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--ff-bg)] text-[var(--ff-text)] flex flex-col selection:bg-[var(--ff-accent-soft)]">
      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 h-14 border-b border-[var(--ff-border)] bg-[var(--ff-header-bg)] backdrop-blur-xl px-4 md:px-8">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between">
          <span className="text-base font-semibold tracking-tight text-[var(--ff-text)]">
            FlowForge
          </span>

          <div className="flex items-center gap-2.5">
            <ThemeToggleButton />
            <button
              type="button"
              onClick={onEnterApp}
              className="ff-btn-primary h-8 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <span>Open Studio</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero + Interactive Preview ────────────────────────────── */}
        <section className="py-12 md:py-20 px-4 md:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Hero */}
            <div className="max-w-2xl mb-10 md:mb-12">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[var(--ff-text)] leading-[1.1]">
                Visual CI/CD pipelines, compiled to YAML.
              </h1>
              <p className="text-base sm:text-lg text-[var(--ff-text-secondary)] mt-4 leading-relaxed">
                Build your workflow graph once. Export native GitLab, GitHub, Jenkins, CircleCI, or Bitbucket configs.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={onEnterApp}
                  className="ff-btn-primary h-10 px-5 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
                >
                  <span>Open Studio</span>
                </button>
                <a
                  href="https://github.com/praneel7015/flowforge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ff-btn-secondary h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center"
                >
                  View on GitHub
                </a>
              </div>
            </div>

            {/* Interactive DAG-to-YAML Preview Card */}
            <div className="rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-surface)] overflow-hidden shadow-sm">
              {/* Top Bar with Target Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--ff-border)] bg-[var(--ff-bg-soft)]">
                <span className="text-xs text-[var(--ff-muted)]">
                  Select a stage to highlight compiled output
                </span>

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

              {/* Split DAG + YAML */}
              <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--ff-border)]">
                {/* Left: Clean 5-Stage DAG */}
                <div className="lg:col-span-7 p-5 sm:p-6 flex items-center bg-[var(--ff-bg)]">
                  <div className="w-full grid sm:grid-cols-3 gap-3 items-center">
                    {/* Column 1: Trigger + Build */}
                    <div className="space-y-3">
                      {PREVIEW_STAGES.slice(0, 2).map(renderNodeCard)}
                    </div>

                    {/* Column 2: Test + Security */}
                    <div className="space-y-3">
                      {PREVIEW_STAGES.slice(2, 4).map(renderNodeCard)}
                    </div>

                    {/* Column 3: Deploy */}
                    <div className="space-y-3">
                      {PREVIEW_STAGES.slice(4).map(renderNodeCard)}
                    </div>
                  </div>
                </div>

                {/* Right: Live YAML Output */}
                <div className="lg:col-span-5 flex flex-col bg-[var(--ff-code-bg)]">
                  <div className="p-3 sm:p-4 overflow-x-auto flex-1 max-h-[340px] overflow-y-auto ff-code text-xs leading-relaxed">
                    {currentTarget.lines.map((line) => {
                      const isHighlighted = line.node && line.node === selectedStageId;
                      return (
                        <div
                          key={line.num}
                          onClick={() => {
                            if (line.node) setSelectedStageId(line.node);
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

            {/* ── 3-Column Minimal Feature Strip ──────────────────────── */}
            <div className="grid md:grid-cols-3 gap-4 mt-10">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="p-5 rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-surface)]"
                >
                  <h2 className="text-sm font-semibold text-[var(--ff-text)]">
                    {feature.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--ff-text-secondary)] mt-1.5 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Minimal Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-[var(--ff-border)] py-5 px-4 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-[var(--ff-muted)]">
          <span className="font-semibold text-[var(--ff-text)]">FlowForge</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onEnterApp}
              className="hover:text-[var(--ff-text)] transition-colors"
            >
              Open Studio
            </button>
            <a
              href="https://github.com/praneel7015/flowforge"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--ff-text)] transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
