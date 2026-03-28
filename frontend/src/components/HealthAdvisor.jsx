import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import MarkdownContent from './MarkdownContent';
import { normalizeConfigText } from '../utils/contentFormat';

const GRADE_COLORS = {
  A: 'text-emerald-600',
  B: 'text-lime-600',
  C: 'text-amber-600',
  D: 'text-orange-600',
  F: 'text-rose-600',
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

function ScoreBar({ score }) {
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
    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden border border-slate-300/80">
      <div className={`h-full ${color} transition-all`} style={{ width: `${safeScore}%` }} />
    </div>
  );
}

export default function HealthAdvisor({ currentYaml, aiProvider, cicdPlatform, aiOptions }) {
  const [yamlInput, setYamlInput] = useState(currentYaml || '');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const normalizedReport = useMemo(() => normalizeReport(report), [report]);

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
      const normalizedYaml = normalizeConfigText(yamlInput);
      const { data } = await axios.post('/api/advisor/health', {
        yaml: normalizedYaml,
        aiProvider,
        cicdPlatform,
        aiOptions,
      });

      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5 ff-enter">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Insights</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 text-slate-900">
            Pipeline Health Advisor
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Analyze speed, security, reliability, and best-practice quality from any YAML config.
          </p>
        </div>

        <section className="ff-surface-soft p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full border border-slate-300 bg-white text-slate-700">
              Platform: {cicdPlatform || 'gitlab'}
            </span>
            <span className="px-2.5 py-1 rounded-full border border-slate-300 bg-white text-slate-700">
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
              className="px-3 py-2 rounded-lg text-xs ff-btn-secondary"
            >
              Use latest Builder YAML
            </button>
            <label className="px-3 py-2 rounded-lg text-xs ff-btn-secondary cursor-pointer">
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
              className="px-3 py-2 rounded-lg text-xs ff-btn-secondary"
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

        {error && <p className="text-rose-700 text-sm">{error}</p>}

        {!normalizedReport && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Run an analysis to get an overall score, grade, and actionable recommendations.
          </div>
        )}

        {normalizedReport && (
          <div className="space-y-5">
            {/* Overall score */}
            <div className="ff-surface-soft p-5 flex items-center gap-6">
              <div className="text-center">
                <div className={`text-6xl font-black ${GRADE_COLORS[normalizedReport.grade] || 'text-slate-900'}`}>
                  {normalizedReport.grade}
                </div>
                <div className="text-xs text-slate-500 mt-1">Grade</div>
              </div>
              <div className="flex-1">
                <div className="text-3xl font-bold text-slate-900">
                  {normalizedReport.overallScore}
                  <span className="text-lg text-slate-500">/100</span>
                </div>
                <div className="text-xs text-slate-500 mb-2">Overall Score</div>
                <ScoreBar score={normalizedReport.overallScore} />
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full border border-slate-300 bg-white text-slate-600">
                    Mode: {normalizedReport.analysisMode}
                  </span>
                  {normalizedReport.warning && (
                    <span className="px-2 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800">
                      Fallback used
                    </span>
                  )}
                </div>
              </div>
            </div>

            {normalizedReport.summary && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <MarkdownContent content={normalizedReport.summary} className="text-sm text-slate-700" />
              </div>
            )}

            {normalizedReport.warning && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <MarkdownContent content={normalizedReport.warning} className="text-sm text-amber-900" />
              </div>
            )}

            {/* Dimension breakdown */}
            {DIMENSIONS.map((dim) => {
              const d = normalizedReport.breakdown?.[dim];
              if (!d) return null;
              return (
                <div key={dim} className="ff-surface-soft p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize text-slate-900">{dim.replace('_', ' ')}</h3>
                    <span className="text-sm font-bold text-slate-700">{d.score}/100</span>
                  </div>
                  <ScoreBar score={d.score} />
                  {d.issues?.length > 0 && (
                    <div>
                      <div className="text-xs text-rose-700 font-semibold mb-1">Issues</div>
                      <ul className="space-y-1">
                        {d.issues.map((issue, i) => (
                          <li key={i} className="text-xs text-slate-700 flex gap-2">
                            <span className="text-rose-600">✗</span>
                            <MarkdownContent
                              content={issue}
                              className="text-xs text-slate-700"
                              compact
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {d.tips?.length > 0 && (
                    <div>
                      <div className="text-xs text-emerald-700 font-semibold mb-1">Tips</div>
                      <ul className="space-y-1">
                        {d.tips.map((tip, i) => (
                          <li key={i} className="text-xs text-slate-700 flex gap-2">
                            <span className="text-emerald-600">→</span>
                            <MarkdownContent
                              content={tip}
                              className="text-xs text-slate-700"
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
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-sky-800 mb-3">Top Recommendations</div>
                <ol className="space-y-2">
                  {normalizedReport.topRecommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-3">
                      <span className="text-sky-700 font-bold">{i + 1}.</span>
                      <MarkdownContent content={rec} className="text-sm text-slate-700" compact />
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
