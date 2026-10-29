const { test } = require('node:test');
const assert = require('node:assert');
const yaml = require('js-yaml');
const aiService = require('../services/aiService');
const { getCICDGenerator } = require('../providers/cicd');
const { importPipeline } = require('../services/importService');
const { normalizeCommand, toCommandList, toScriptConfig } = require('../utils/scriptCommands');

const PLATFORMS = ['gitlab', 'github', 'jenkins', 'circleci', 'bitbucket'];

// Quotes and backslashes make sure the Jenkins ''' block escaping round-trips too.
const IF_BLOCK = [
  'if [ -f package.json ]; then',
  '  npm ci',
  'else',
  `  echo "no package.json" 'skipping' \\ done`,
  'fi',
].join('\n');

const pipeline = (script) => ({
  nodes: [
    { id: 't', type: 'trigger_push', data: { label: 'Push', config: {} } },
    { id: 'b', type: 'build', data: { label: 'Build', config: { script } } },
  ],
  edges: [{ id: 'e', source: 't', target: 'b' }],
});

const generate = (platform, script) => {
  const { nodes, edges } = pipeline(script);
  return getCICDGenerator(platform).generate(nodes, edges);
};

const importedScript = (text, platform) =>
  aiService.parseConfigToDAG(text, platform).nodes.find((n) => n.type === 'build')?.data?.config?.script;

test('Jenkins import keeps a multi-line sh body as one dedented command', () => {
  const jenkinsfile = `pipeline {
  stages {
    stage('Build') {
      steps {
        sh 'echo start'
        sh '''
          if [ -f package.json ]; then
            npm ci
          fi
        '''
      }
    }
  }
}`;
  assert.deepStrictEqual(importedScript(jenkinsfile, 'jenkins'), [
    'echo start',
    'if [ -f package.json ]; then\n  npm ci\nfi',
  ]);
});

for (const platform of PLATFORMS) {
  test(`${platform}: an if/fi block round-trips export -> import as one command`, () => {
    const out = generate(platform, ['echo start', IF_BLOCK]);
    assert.deepStrictEqual(importedScript(out, platform), ['echo start', IF_BLOCK]);
  });

  test(`${platform}: a legacy newline-separated string still means one command per line`, () => {
    const out = generate(platform, 'npm ci\n  npm test\n');
    assert.strictEqual(importedScript(out, platform), 'npm ci\nnpm test');
  });
}

test('YAML platforms emit a multi-line command as a literal block', () => {
  for (const platform of ['gitlab', 'github', 'circleci', 'bitbucket']) {
    const out = generate(platform, [IF_BLOCK]);
    assert.match(out, /[:-] \|-?\n\s+if \[ -f package\.json \]; then\n/, platform);
    assert.ok(yaml.load(out), platform);
  }
});

test('Jenkins emits a multi-line command as one sh block and one-liners inline', () => {
  const out = generate('jenkins', ['npm ci', IF_BLOCK]);
  assert.match(out, /sh 'npm ci'\n/);
  assert.match(out, /sh '''\\\nif \[ -f package\.json \]; then\n {2}npm ci\nelse\n/);
  assert.ok(out.includes(`echo "no package.json" \\'skipping\\' \\\\ done`), out);
  assert.strictEqual((out.match(/\bsh /g) || []).length, 2);
});

test('legacy string scripts generate exactly what they did before', () => {
  const legacy = 'npm ci\nnpm test';
  assert.match(generate('jenkins', legacy), /sh 'npm ci'\n\s+sh 'npm test'\n/);
  assert.deepStrictEqual(yaml.load(generate('gitlab', legacy)).build.script, ['npm ci', 'npm test']);
  assert.deepStrictEqual(toCommandList(legacy), ['npm ci', 'npm test']);
  // A one-line-per-command import stays in the legacy string shape.
  assert.strictEqual(toScriptConfig(['npm ci', '  npm test  ']), 'npm ci\nnpm test');
});

test('YAML import keeps a multi-line script entry whole', () => {
  const gitlab = `build:
  stage: build
  script:
    - npm ci
    - |
      if [ "$CI" = true ]; then
        npm test
      fi
`;
  const build = importPipeline(gitlab, 'gitlab').nodes.find((n) => n.data?.config?.script);
  assert.deepStrictEqual(build.data.config.script, ['npm ci', 'if [ "$CI" = true ]; then\n  npm test\nfi']);
});

test('normalizeCommand trims only outer whitespace and the shared indent', () => {
  assert.strictEqual(normalizeCommand('\n    cat <<EOF\n      a  \n\n    EOF\n   \n'), 'cat <<EOF\n  a  \n\nEOF');
  assert.strictEqual(normalizeCommand('   \n  '), '');
});
