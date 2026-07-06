const { test } = require('node:test');
const assert = require('node:assert');
const { importPipeline } = require('../services/importService');

test('imports GitHub Actions with needs-based edges', () => {
  const yaml = `
name: CI
on:
  push:
    branches: [main]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: flake8 app.py
  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - run: pytest
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: deploy.sh
`;
  const result = importPipeline(yaml, 'github');
  assert.strictEqual(result.detectedPlatform, 'github');
  // trigger + 3 jobs
  assert.strictEqual(result.nodes.length, 4);
  assert.ok(result.nodes.some((n) => n.type === 'trigger_push'));
  assert.ok(result.nodes.some((n) => n.type === 'lint' && n.data.config.script === 'flake8 app.py'));
  // trigger->lint, lint->test, test->deploy
  assert.strictEqual(result.edges.length, 3);
});

test('imports GitLab CI and wires stages sequentially when no needs', () => {
  const yaml = `
stages:
  - build
  - test
build_job:
  stage: build
  image: node:20
  script:
    - npm ci
    - npm run build
test_job:
  stage: test
  script:
    - npm test
`;
  const result = importPipeline(yaml, 'gitlab');
  assert.strictEqual(result.detectedPlatform, 'gitlab');
  assert.strictEqual(result.nodes.length, 2);
  const build = result.nodes.find((n) => n.data.label === 'Build Job');
  assert.ok(build);
  assert.strictEqual(build.data.config.image, 'node:20');
  assert.match(build.data.config.script, /npm ci/);
  // build stage -> test stage
  assert.strictEqual(result.edges.length, 1);
});

test('imports a Jenkinsfile as a linear stage chain', () => {
  const jenkins = `
pipeline {
  agent any
  stages {
    stage('Build') { steps { sh 'make' } }
    stage('Test') { steps { sh 'make test' } }
    stage('Deploy') { steps { sh 'make deploy' } }
  }
}
`;
  const result = importPipeline(jenkins, 'auto');
  assert.strictEqual(result.detectedPlatform, 'jenkins');
  assert.strictEqual(result.nodes.length, 3);
  assert.strictEqual(result.edges.length, 2);
});

test('rejects content with no jobs or stages', () => {
  assert.throws(() => importPipeline('just: a value\n', 'auto'), /Could not find any jobs/);
});
