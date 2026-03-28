import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import MarkdownContent from './MarkdownContent';
import { normalizeConfigText } from '../utils/contentFormat';

const GRADE_COLORS = {
  A: 'text-emerald-400',
  B: 'text-lime-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  F: 'text-rose-400',
};

const DIMENSIONS = ['speed', 'security', 'reliability', 'best_practice'];

const SAMPLE_PIPELINES = {
  gitlab: `stages:
  - build
  - test
  - deploy

build:
  stage: build
  image: node:20-alpine
  script:
    - npm ci
    - npm run build
  cache:
    key: $CI_COMMIT_REF_SLUG
    paths:
      - node_modules/

test:
  stage: test
  image: node:20-alpine
  script:
    - npm test

deploy:
  stage: deploy
  script:
    - echo "Deploying"
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'`,
  github: `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/cache@v4
        with:
          path: node_modules
          key: \${{ runner.os }}-deps-\${{ hashFiles('**/package-lock.json') }}
      - run: npm ci
      - run: npm test
      - run: npm run build`,
  jenkins: `pipeline {
  agent any
  options {
    timeout(time: 20, unit: 'MINUTES')
  }
  stages {
    stage('Build') {
      steps {
        sh 'npm ci'
        sh 'npm run build'
      }
    }
    stage('Test') {
      steps {
        sh 'npm test'
      }
    }
  }
}`,
  circleci: `version: 2.1

jobs:
  build:
    docker:
      - image: cimg/node:20.10
    steps:
      - checkout
      - restore_cache:
          keys:
            - v1-deps-{{ checksum "package-lock.json" }}
      - run: npm ci
      - run: npm test
      - save_cache:
          key: v1-deps-{{ checksum "package-lock.json" }}
          paths:
            - node_modules

workflows:
  build-and-test:
    jobs:
      - build`,
};

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normalizeReport(rawReport) {
  if (!rawReport || typeof rawReport !== 'object') {
    return null;
  }

  const breakdownSource = rawReport.breakdown && typeof rawReport.breakdown === 'object'
    ? rawReport.breakdown
    : {};

  const bestPracticeSource =
    breakdownSource.best_practice ||
    breakdownSource.bestPractice ||
    breakdownSource.best_practices ||
    breakdownSource['best practice'];

  const normalizeDimension = (source, fallbackLabel) => {
    if (!source || typeof source !== 'object') {
      return {
        score: 0,
        issues: [`No ${fallbackLabel} analysis returned.`],
        tips: ['Run analysis again or verify backend connectivity.'],
      };
    }

    return {
      score: clampScore(source.score),
      issues: normalizeList(source.issues),
      tips: normalizeList(source.tips),
    };
  };

  const breakdown = {
    speed: normalizeDimension(breakdownSource.speed, 'speed'),
    security: normalizeDimension(breakdownSource.security, 'security'),
    reliability: normalizeDimension(breakdownSource.reliability, 'reliability'),
    best_practice: normalizeDimension(bestPracticeSource, 'best practice'),
  };

  const averaged = clampScore(
    (breakdown.speed.score +
      breakdown.security.score +
      breakdown.reliability.score +
      breakdown.best_practice.score) /
      4
  );

  const overallScore = clampScore(rawReport.overallScore ?? averaged);
  const normalizedGrade =
    typeof rawReport.grade === 'string' && /^[ABCDF]$/i.test(rawReport.grade.trim())
      ? rawReport.grade.trim().toUpperCase()
      : overallScore >= 90
        ? 'A'
        : overallScore >= 80
          ? 'B'
          : overallScore >= 70
            ? 'C'
            : overallScore >= 60
              ? 'D'
              : 'F';

  const topRecommendations = normalizeList(rawReport.topRecommendations);

  return {
    overallScore,
    grade: normalizedGrade,
    breakdown,
    topRecommendations,
    analysisMode:
      typeof rawReport.analysisMode === 'string' ? rawReport.analysisMode : 'ai',
    summary: typeof rawReport.summary === 'string' ? rawReport.summary : '',
    warning: typeof rawReport.warning === 'string' ? rawReport.warning : '',
  };
}

function ScoreBar({ score, label }) {
  const safeScore = clampScore(score);
  const color =
    safeScore >= 80
      ? 'bg-emerald-500'
      : safeScore >= 60
        ? 'bg-amber-500'
        : safeScore >= 40
          ? 'bg-orange-500'
          : 'bg-rose-500';

  return (
    <div
      role="progressbar"
      aria-valuenow={safeScore}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || `Score: ${safeScore} out of 100`}
      className="h-2 w-full bg-[var(--ff-card-bg-hover)] rounded-full overflow-hidden border border-[var(--ff-card-border)]"
    >
      <div className={`h-full ${color} transition-all`} style={{ width: `${safeScore}%` }} />
    </div>
  );
}

export default function HealthAdvisor({ currentYaml, aiProvider, cicdPlatform, aiOptions }) {
  const [yamlInput, setYamlInput] = useState(currentYaml || '');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const normalizedReport = useMemo(() => normalizeReport(report), [report]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (typeof currentYaml === 'string' && currentYaml.trim()) {
      setYamlInput(normalizeConfigText(currentYaml));
    }
  }, [currentYaml]);

  const lineCount = useMemo(
    () => (yamlInput.trim() ? yamlInput.split('\n').length : 0),
    [yamlInput]
  );

  const handleLoadSample = () => {
    const sample = SAMPLE_PIPELINES[cicdPlatform] || SAMPLE_PIPELINES.gitlab;
    setYamlInput(sample);
    setError('');
  };

  const handleUseBuilderYaml = () => {
    if (!currentYaml?.trim()) {
      setError('No exported YAML found from Builder yet.');
      return;
    }

    setYamlInput(normalizeConfigText(currentYaml));
    setError('');
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const rawContent = typeof loadEvent.target?.result === 'string' ? loadEvent.target.result : '';
      setYamlInput(normalizeConfigText(rawContent));
      setError('');
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!yamlInput?.trim()) {
      setError('Paste pipeline YAML (or load sample) before running analysis.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const normalizedYaml = normalizeConfigText(yamlInput);
      const { data } = await axios.post('/api/advisor/health', {
        yaml: normalizedYaml,
        aiProvider,
        cicdPlatform,
        aiOptions,
      }, { signal: controller.signal });

      setReport(data);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setError(err.response?.data?.error || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5 ff-enter">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ff-muted)]">Insights</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 text-[var(--ff-text)]">
            Pipeline Health Advisor
          </h2>
          <p className="text-[var(--ff-text-secondary)] text-sm leading-relaxed">
            Analyze speed, security, reliability, and best-practice quality from any YAML config.
          </p>
        </div>

        <section className="ff-surface-soft p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)]">
              Platform: {cicdPlatform || 'gitlab'}
            </span>
            <span className="px-2.5 py-1 rounded-full border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)]">
              {lineCount} lines
            </span>
          </div>

          <textarea
            value={yamlInput}
            onChange={(event) => setYamlInput(event.target.value)}
            placeholder="Paste pipeline YAML for health analysis..."
            rows={12}
            className="ff-input p-4 text-sm ff-code resize-y"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleUseBuilderYaml}
              className="px-3 py-1.5 rounded-lg text-xs ff-btn-secondary"
            >
              Use latest Builder YAML
            </button>
            <label className="px-3 py-1.5 rounded-lg text-xs ff-btn-secondary cursor-pointer">
              Upload YAML/Markdown file
              <input
                type="file"
                className="hidden"
                accept=".yml,.yaml,.md,.txt,.groovy,.jenkinsfile"
                onChange={handleFileUpload}
              />
            </label>
            <button
              onClick={handleLoadSample}
              className="px-3 py-1.5 rounded-lg text-xs ff-btn-secondary"
            >
              Load sample
            </button>
          </div>
        </section>

        <button
          onClick={handleAnalyze}
          disabled={loading || !yamlInput.trim()}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-opacity ff-btn-primary"
        >
          {loading ? 'Analyzing...' : 'Analyze Pipeline Health'}
        </button>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="flex-1">{error}</p>
            <button onClick={() => setError('')} aria-label="Dismiss error" className="text-rose-500 hover:text-rose-800 flex-shrink-0">Dismiss</button>
          </div>
        )}

        {!normalizedReport && (
          <div className="rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-surface-inset)] p-4 text-sm text-[var(--ff-text-secondary)]">
            Run an analysis to get an overall score, grade, and actionable recommendations.
          </div>
        )}

        {normalizedReport && (
          <div className="space-y-5">
            {/* Overall score */}
            <div className="ff-surface-soft p-5 flex items-center gap-6">
              <div className="text-center">
                <div className={`text-6xl font-black ${GRADE_COLORS[normalizedReport.grade] || 'text-[var(--ff-text)]'}`}>
                  {normalizedReport.grade}
                </div>
                <div className="text-xs text-[var(--ff-muted)] mt-1">Grade</div>
              </div>
              <div className="flex-1">
                <div className="text-3xl font-bold text-[var(--ff-text)]">
                  {normalizedReport.overallScore}
                  <span className="text-lg text-[var(--ff-muted)]">/100</span>
                </div>
                <div className="text-xs text-[var(--ff-muted)] mb-2">Overall Score</div>
                <ScoreBar score={normalizedReport.overallScore} label="Overall pipeline health score" />
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)]">
                    Mode: {normalizedReport.analysisMode}
                  </span>
                  {normalizedReport.warning && (
                    <span className="px-2 py-1 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-300">
                      Fallback used
                    </span>
                  )}
                </div>
              </div>
            </div>

            {normalizedReport.summary && (
              <div className="rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4 text-sm text-[var(--ff-text-secondary)]">
                <MarkdownContent content={normalizedReport.summary} className="text-sm text-[var(--ff-text-secondary)]" />
              </div>
            )}

            {normalizedReport.warning && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
                <MarkdownContent content={normalizedReport.warning} className="text-sm text-amber-300" />
              </div>
            )}

            {/* Dimension breakdown */}
            {DIMENSIONS.map((dim) => {
              const d = normalizedReport.breakdown?.[dim];
              if (!d) return null;
              return (
                <div key={dim} className="ff-surface-soft p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize text-[var(--ff-text)]">{dim.replace('_', ' ')}</h3>
                    <span className="text-sm font-bold text-[var(--ff-text-secondary)]">{d.score}/100</span>
                  </div>
                  <ScoreBar score={d.score} label={`${dim.replace('_', ' ')} score`} />
                  {d.issues?.length > 0 && (
                    <div>
                      <div className="text-xs text-red-400 font-semibold mb-1">Issues</div>
                      <ul className="space-y-1">
                        {d.issues.map((issue, i) => (
                          <li key={i} className="text-xs text-[var(--ff-text-secondary)] flex gap-2">
                            <span className="text-rose-400 font-medium">-</span>
                            <MarkdownContent
                              content={issue}
                              className="text-xs text-[var(--ff-text-secondary)]"
                              compact
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {d.tips?.length > 0 && (
                    <div>
                      <div className="text-xs text-emerald-400 font-semibold mb-1">Tips</div>
                      <ul className="space-y-1">
                        {d.tips.map((tip, i) => (
                          <li key={i} className="text-xs text-[var(--ff-text-secondary)] flex gap-2">
                            <span className="text-emerald-400 font-medium">+</span>
                            <MarkdownContent
                              content={tip}
                              className="text-xs text-[var(--ff-text-secondary)]"
                              compact
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Top recommendations */}
            {normalizedReport.topRecommendations?.length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <div className="text-sm font-semibold text-blue-300 mb-3">Top Recommendations</div>
                <ol className="space-y-2">
                  {normalizedReport.topRecommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-[var(--ff-text-secondary)] flex gap-3">
                      <span className="text-blue-400 font-bold">{i + 1}.</span>
                      <MarkdownContent content={rec} className="text-sm text-[var(--ff-text-secondary)]" compact />
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
