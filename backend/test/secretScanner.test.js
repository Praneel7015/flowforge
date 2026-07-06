const { test } = require('node:test');
const assert = require('node:assert');
const { scanForSecrets } = require('../utils/secretScanner');

test('clean pipeline using CI variables has no findings', () => {
  const yaml = `
deploy:
  script:
    - echo "deploying"
  variables:
    API_TOKEN: $DEPLOY_TOKEN
    AWS_KEY: \${{ secrets.AWS_ACCESS_KEY_ID }}
`;
  const result = scanForSecrets(yaml);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.findings.length, 0);
});

test('detects AWS access key id', () => {
  const result = scanForSecrets('env:\n  AWS_ACCESS_KEY_ID: AKIAIOSFODNN7EXAMPLE');
  assert.strictEqual(result.ok, false);
  assert.ok(result.findings.some((f) => f.ruleId === 'aws-access-key-id'));
  assert.ok(result.counts.high >= 1);
});

test('detects Google API key', () => {
  const result = scanForSecrets(`key: AIza${'b'.repeat(35)}`);
  assert.ok(result.findings.some((f) => f.ruleId === 'gcp-api-key'));
});

test('detects private key blocks and github tokens', () => {
  const gh = scanForSecrets('token: ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  assert.ok(gh.findings.some((f) => f.ruleId === 'github-token'));

  const pk = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIE...');
  assert.ok(pk.findings.some((f) => f.ruleId === 'private-key-block'));
});

test('masks the matched secret value', () => {
  const result = scanForSecrets('password: SuperSecretValue123');
  const finding = result.findings.find((f) => f.ruleId === 'generic-assignment');
  assert.ok(finding);
  assert.ok(!finding.match.includes('SuperSecretValue123'));
});

test('ignores placeholder/reference assignments', () => {
  const result = scanForSecrets('password: changeme\napi_key: your_api_key_here');
  assert.strictEqual(result.findings.filter((f) => f.ruleId === 'generic-assignment').length, 0);
});
