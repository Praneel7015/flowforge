import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { normalizeConfigText } from '../utils/contentFormat';

const DEFAULT_PLATFORMS = [
  { name: 'gitlab', displayName: 'GitLab CI' },
  { name: 'github', displayName: 'GitHub Actions' },
  { name: 'jenkins', displayName: 'Jenkins' },
  { name: 'circleci', displayName: 'CircleCI' },
];

const SAMPLE_CONFIGS = {
  jenkins: `pipeline {
  agent any
  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }
    stage('Test') {
      steps {
        sh 'npm test'
      }
    }
    stage('Build') {
      steps {
        sh 'npm run build'
      }
    }
    stage('Deploy') {
      steps {
        sh 'echo Deploying application'
      }
    }
  }
}`,
  gitlab: `stages:
  - build
  - test
  - deploy

build_job:
  stage: build
  image: node:20-alpine
  script:
    - npm ci
    - npm run build

test_job:
  stage: test
  image: node:20-alpine
  script:
    - npm test

deploy_job:
  stage: deploy
  script:
    - echo "Deploying to production"
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
      - run: npm ci
      - run: npm test
      - run: npm run build`,
  circleci: `version: 2.1

jobs:
  build:
    docker:
      - image: cimg/node:20.10
    steps:
      - checkout
      - run: npm ci
      - run: npm test
      - run: npm run build

workflows:
  build_and_test:
    jobs:
      - build`,
};

function normalizePlatforms(availablePlatforms = []) {
  if (!Array.isArray(availablePlatforms) || availablePlatforms.length === 0) {
    return DEFAULT_PLATFORMS;
  }

  return availablePlatforms
    .map((platform) => ({
      name: platform.name,
      displayName: platform.displayName || platform.name,
    }))
    .filter((platform) => typeof platform.name === 'string' && platform.name.trim().length > 0);
}

export default function JenkinsConverter({
  onConverted,
  aiProvider,
  cicdPlatform,
  aiOptions,
  availablePlatforms,
}) {
  const platforms = useMemo(() => normalizePlatforms(availablePlatforms), [availablePlatforms]);
  const firstPlatform = platforms[0]?.name || 'gitlab';
  const [sourcePlatform, setSourcePlatform] = useState('jenkins');
  const [targetPlatform, setTargetPlatform] = useState(cicdPlatform || firstPlatform);
  const [pipelineConfig, setPipelineConfig] = useState(SAMPLE_CONFIGS.jenkins);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!platforms.some((platform) => platform.name === sourcePlatform)) {
      setSourcePlatform(firstPlatform);
    }
  }, [firstPlatform, platforms, sourcePlatform]);

  useEffect(() => {
    if (!platforms.some((platform) => platform.name === targetPlatform)) {
      const fallbackTarget = platforms.find((platform) => platform.name !== sourcePlatform)?.name;
      if (fallbackTarget) {
        setTargetPlatform(fallbackTarget);
      }
      return;
    }

    if (sourcePlatform === targetPlatform) {
      const fallbackTarget = platforms.find((platform) => platform.name !== sourcePlatform)?.name;
      if (fallbackTarget) {
        setTargetPlatform(fallbackTarget);
      }
    }
  }, [platforms, sourcePlatform, targetPlatform]);

  useEffect(() => {
    if (
      cicdPlatform &&
      cicdPlatform !== sourcePlatform &&
      platforms.some((platform) => platform.name === cicdPlatform)
    ) {
      setTargetPlatform(cicdPlatform);
    }
  }, [cicdPlatform, platforms, sourcePlatform]);

  const platformNameMap = useMemo(
    () =>
      platforms.reduce((acc, platform) => {
        acc[platform.name] = platform.displayName;
        return acc;
      }, {}),
    [platforms]
  );

  const canConvert =
    sourcePlatform !== targetPlatform &&
    Boolean(sourcePlatform) &&
    Boolean(targetPlatform) &&
    normalizeConfigText(pipelineConfig).trim().length > 0;

  const handleConvert = async () => {
    if (!canConvert) return;

    setLoading(true);
    setError('');

    try {
      const normalizedConfig = normalizeConfigText(pipelineConfig);
      const { data } = await axios.post('/api/migration/convert', {
        pipelineConfig: normalizedConfig,
        sourcePlatform,
        targetPlatform,
        aiProvider,
        aiOptions,
      });

      onConverted({
        ...data,
        sourcePlatform,
        targetPlatform,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Conversion failed. Check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawContent = typeof ev.target?.result === 'string' ? ev.target.result : '';
      setPipelineConfig(normalizeConfigText(rawContent));
    };
    reader.readAsText(file);
  };

  const loadExample = () => {
    setPipelineConfig(SAMPLE_CONFIGS[sourcePlatform] || '');
  };

  const sourceDisplay = platformNameMap[sourcePlatform] || 'Source CI/CD';
  const targetDisplay = platformNameMap[targetPlatform] || 'Target CI/CD';

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5 ff-enter">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ff-muted)]">Migration</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--ff-text)]">
            Convert CI/CD Configurations
          </h2>
          <p className="text-[var(--ff-text-secondary)] text-sm leading-relaxed">
            Choose a source and target platform, paste your configuration, and FlowForge will convert
            it while preserving pipeline intent. Markdown fenced code blocks are supported.
          </p>
        </div>

        <div className="ff-surface-soft p-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.15em] text-[var(--ff-muted)]">Source Platform</label>
            <select
              value={sourcePlatform}
              onChange={(event) => setSourcePlatform(event.target.value)}
              className="ff-select w-full text-sm"
            >
              {platforms.map((platform) => (
                <option key={platform.name} value={platform.name}>
                  {platform.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.15em] text-[var(--ff-muted)]">Target Platform</label>
            <select
              value={targetPlatform}
              onChange={(event) => setTargetPlatform(event.target.value)}
              className="ff-select w-full text-sm"
            >
              {platforms.map((platform) => (
                <option
                  key={platform.name}
                  value={platform.name}
                  disabled={platform.name === sourcePlatform}
                >
                  {platform.displayName}
                  {platform.name === sourcePlatform ? ' (same as source)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sourcePlatform === targetPlatform && (
          <p className="text-amber-400 text-sm">
            Source and target formats are identical. Select a different target to convert.
          </p>
        )}

        <div className="rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] px-4 py-3 text-sm text-[var(--ff-text-secondary)]">
          <span className="font-semibold">Conversion:</span> {sourceDisplay}{' -> '}{targetDisplay}
        </div>

        <div className="flex gap-3">
          <label className="px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ff-btn-secondary hover:border-slate-400">
            Upload Config File
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".groovy,.jenkinsfile,.yml,.yaml,.txt"
            />
          </label>
          <button
            onClick={loadExample}
            className="px-3 py-1.5 rounded-lg text-xs transition-colors ff-btn-secondary hover:border-slate-400"
          >
            Load Example
          </button>
        </div>

        <textarea
          value={pipelineConfig}
          onChange={(event) => setPipelineConfig(event.target.value)}
          placeholder={`Paste your ${sourceDisplay} configuration here...`}
          rows={14}
          className="ff-input p-4 text-sm ff-code resize-none"
        />

        <button
          onClick={handleConvert}
          disabled={loading || !canConvert}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-opacity ff-btn-primary"
        >
          {loading ? 'Converting...' : `Convert ${sourceDisplay} -> ${targetDisplay}`}
        </button>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="flex-1">{error}</p>
            <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-400 hover:text-red-300 flex-shrink-0">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
