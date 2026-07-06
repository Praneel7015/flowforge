/**
 * Lightweight secret scanner for pipeline configuration.
 *
 * FlowForge can push generated YAML straight into a user's repo. This scans that
 * content first so we never help a user commit a hardcoded credential into a CI
 * config — a common and high-impact leak path. It is intentionally conservative:
 * every rule targets a well-known credential shape to keep false positives low.
 */

const RULES = [
  {
    id: 'aws-access-key-id',
    label: 'AWS Access Key ID',
    severity: 'high',
    regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[A-Z0-9]{16}\b/g,
  },
  {
    id: 'gcp-api-key',
    label: 'Google API Key',
    severity: 'high',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: 'github-token',
    label: 'GitHub Token',
    severity: 'high',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[0-9A-Za-z_]{20,}\b/g,
  },
  {
    id: 'gitlab-pat',
    label: 'GitLab Personal Access Token',
    severity: 'high',
    regex: /\bglpat-[0-9A-Za-z_-]{20,}\b/g,
  },
  {
    id: 'slack-token',
    label: 'Slack Token',
    severity: 'high',
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  },
  {
    id: 'openai-key',
    label: 'OpenAI API Key',
    severity: 'high',
    regex: /\bsk-(?:proj-)?[0-9A-Za-z_-]{20,}\b/g,
  },
  {
    id: 'anthropic-key',
    label: 'Anthropic API Key',
    severity: 'high',
    regex: /\bsk-ant-[0-9A-Za-z_-]{20,}\b/g,
  },
  {
    id: 'private-key-block',
    label: 'Private Key Block',
    severity: 'high',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'jwt',
    label: 'JSON Web Token',
    severity: 'medium',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: 'generic-assignment',
    label: 'Hardcoded secret assignment',
    severity: 'medium',
    // key: "value" / key = value where the key name signals a secret and the
    // value is not an obvious CI variable reference or placeholder.
    regex:
      /\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"]?([^\s'"$#{}]{8,})['"]?/gi,
  },
];

// Values that look secret-ish but are references/placeholders, not real secrets.
const IGNORE_VALUE = /^(?:\$|\{\{|<%|%\(|env\.|secrets\.|vault:|xxx+|changeme|your[_-]|placeholder|example|redacted|\*+|_+)/i;

function maskMatch(value) {
  const text = String(value);
  if (text.length <= 8) return `${text.slice(0, 2)}****`;
  return `${text.slice(0, 4)}…${text.slice(-2)} (${text.length} chars)`;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

/**
 * @param {string} content
 * @returns {{ ok: boolean, findings: Array, counts: {high:number, medium:number} }}
 */
function scanForSecrets(content) {
  const findings = [];
  const text = typeof content === 'string' ? content : '';
  const seen = new Set();

  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let match = rule.regex.exec(text);
    while (match !== null) {
      const captured = match[1] !== undefined ? match[1] : match[0];

      if (rule.id === 'generic-assignment' && IGNORE_VALUE.test(captured)) {
        match = rule.regex.exec(text);
        continue;
      }

      const line = lineNumberAt(text, match.index);
      const dedupeKey = `${rule.id}:${line}:${captured}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        findings.push({
          ruleId: rule.id,
          label: rule.label,
          severity: rule.severity,
          line,
          match: maskMatch(captured),
        });
      }

      if (match.index === rule.regex.lastIndex) rule.regex.lastIndex += 1;
      match = rule.regex.exec(text);
    }
  }

  const counts = findings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    { high: 0, medium: 0 }
  );

  return { ok: findings.length === 0, findings, counts };
}

module.exports = { scanForSecrets };
