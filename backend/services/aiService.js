/**
 * AI Service - Platform-agnostic AI operations for CI/CD
 * Uses the AI provider factory to support multiple AI backends.
 */
const { getAIProvider } = require('../providers/ai');
const { getCICDGenerator } = require('../providers/cicd');
const { scanForSecrets } = require('../utils/secretScanner');
const crypto = require('crypto');
const { logSafe } = require('../utils/logSafe');
const axios = require('axios');
const yaml = require('js-yaml');

/**
 * Helper to get provider instance.
 * @param {string} [providerName] - Optional provider name override.
 * @param {object} [runtimeConfig] - Optional per-request AI config (BYOM).
 * @returns {AIProvider}
 */
function getProvider(providerName, runtimeConfig = {}) {
  return getAIProvider(providerName, runtimeConfig);
}

/**
 * Core helper: call AI with a system prompt and user message.
 * @param {string} system - System prompt
 * @param {string} userMessage - User message
 * @param {object} options - { maxTokens, aiProvider }
 * @returns {Promise<string>}
 */
async function ask(system, userMessage, options = {}) {
  const provider = getProvider(options.aiProvider, options.aiOptions || {});
  return provider.complete(system, userMessage, {
    maxTokens: options.maxTokens || 4096,
  });
}

const STANDARD_NODE_TYPES = [
  'trigger_push',
  'trigger_mr',
  'build',
  'matrix_build',
  'lint',
  'test',
  'integration_test',
  'smoke_test',
  'cache_restore',
  'cache_save',
  'security_scan',
  'package',
  'release',
  'approval_gate',
  'deploy',
  'canary_deploy',
  'blue_green_deploy',
  'rollback',
  'notify',
  'conditional',
];

const ADVANCED_NODE_TYPES = [
  'matrix_build',
  'cache_restore',
  'cache_save',
  'approval_gate',
  'canary_deploy',
  'blue_green_deploy',
];

const SUPPORTED_CICD_PLATFORMS = ['gitlab', 'github', 'jenkins', 'circleci', 'bitbucket'];

const PLATFORM_DISPLAY_NAMES = {
  gitlab: 'GitLab CI',
  github: 'GitHub Actions',
  jenkins: 'Jenkins Pipeline',
  circleci: 'CircleCI',
  bitbucket: 'Bitbucket Pipelines',
};

function getSupportedNodeTypes() {
  if (process.env.ENABLE_ADVANCED_NODES === 'false') {
    return STANDARD_NODE_TYPES.filter((type) => !ADVANCED_NODE_TYPES.includes(type));
  }

  return STANDARD_NODE_TYPES;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonObjectFromText(text) {
  const cleaned = stripCodeFences(text);
  const candidates = [cleaned];

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const parsed = safeJsonParse(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }

    if (typeof parsed === 'string') {
      const nested = safeJsonParse(parsed);
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return nested;
      }
    }
  }

  return null;
}

function toStringList(value, maxLen = 6) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .slice(0, maxLen);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function clampScore(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.min(100, Math.round(fallback)));
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function gradeForScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function buildHeuristicHealthReport(configText, platformDisplayName = 'CI/CD') {
  const lower = String(configText || '').toLowerCase();

  const breakdown = {
    speed: {
      score: 55,
      issues: [],
      tips: [],
    },
    security: {
      score: 50,
      issues: [],
      tips: [],
    },
    reliability: {
      score: 55,
      issues: [],
      tips: [],
    },
    best_practice: {
      score: 60,
      issues: [],
      tips: [],
    },
  };

  const hasParallelism = /(matrix|parallelism|parallel\s*:|strategy\s*:|needs\s*:|parallel:)/i.test(
    lower
  );
  const hasCaching = /(cache\s*:|actions\/cache|restore_cache|save_cache|cache_restore|cache_save)/i.test(
    lower
  );
  const hasSecurityScan =
    /(security|sast|trivy|dependency.?scan|vulnerability|bandit|semgrep)/i.test(lower);
  const hasSecretsHandling = /(secrets\.|vault|masked|secret|credentials)/i.test(lower);
  const hasRetriesOrTimeout = /(retry\s*:|retries|timeout|timeout-minutes|options\s*\{\s*timeout)/i.test(
    lower
  );
  const hasArtifacts = /(artifacts\s*:|upload-artifact|stash\s+name|archiveartifacts)/i.test(lower);
  const hasTests = /(\btest\b|pytest|npm test|go test|unit test|integration test)/i.test(lower);
  const hasPinnedImages = /:[0-9][\w.-]*/.test(lower) && !/:latest\b/.test(lower);
  const usesLatestImage = /:latest\b/.test(lower);
  const hasWorkflowStructure = /(stages\s*:|jobs\s*:|workflows\s*:|pipeline\s*\{)/i.test(lower);

  if (hasParallelism) {
    breakdown.speed.score += 12;
  } else {
    breakdown.speed.issues.push('No clear parallelism strategy detected.');
    breakdown.speed.tips.push('Use matrix/parallel jobs to reduce total pipeline time.');
  }

  if (hasCaching) {
    breakdown.speed.score += 12;
  } else {
    breakdown.speed.issues.push('Dependency or build caching is not obvious.');
    breakdown.speed.tips.push('Add dependency caching to speed up repeated runs.');
  }

  if (/npm install/.test(lower) && !/npm ci/.test(lower)) {
    breakdown.speed.issues.push('Using npm install instead of npm ci can slow reproducible builds.');
    breakdown.speed.tips.push('Prefer npm ci in CI environments for deterministic installs.');
    breakdown.speed.score -= 4;
  }

  // Graph Bottleneck Analysis: check for sequential critical-path bottleneck
  try {
    const dag = parseConfigToDAG(configText, 'gitlab');
    const stageNodes = (dag.nodes || []).filter(
      (n) => n && !String(n.type || '').startsWith('trigger_') && n.type !== 'conditional'
    );
    const stageIds = new Set(stageNodes.map((n) => n.id));
    if (stageNodes.length >= 3) {
      const fanOutCounts = new Map();
      for (const edge of dag.edges || []) {
        if (stageIds.has(edge.source) && stageIds.has(edge.target)) {
          fanOutCounts.set(edge.source, (fanOutCounts.get(edge.source) || 0) + 1);
        }
      }
      const maxFanOut = fanOutCounts.size > 0 ? Math.max(...fanOutCounts.values()) : 0;
      if (maxFanOut <= 1) {
        breakdown.speed.score -= 8;
        breakdown.speed.issues.push(
          'Sequential critical-path bottleneck: all stages run in a single straight line with zero parallelism (max fan-out <= 1).'
        );
        breakdown.speed.tips.push(
          'Fan out independent stages (lint, test, security_scan) in parallel using needs/requires after build.'
        );
      }
    }
  } catch {
    // Ignore DAG parse errors during heuristic check
  }

  if (hasSecurityScan) {
    breakdown.security.score += 15;
  } else {
    breakdown.security.issues.push('No explicit security scanning job detected.');
    breakdown.security.tips.push('Add SAST/dependency/container scanning in CI.');
  }

  if (hasSecretsHandling) {
    breakdown.security.score += 8;
  } else {
    breakdown.security.issues.push('Secrets handling is not obvious from configuration.');
    breakdown.security.tips.push('Use CI secrets/variables and avoid hardcoded credentials.');
  }

  // Hardcoded Secret Scanner (uses unified 10-rule secretScanner)
  const secretScan = scanForSecrets(String(configText || ''));
  if (!secretScan.ok && secretScan.findings.length > 0) {
    const labels = [...new Set(secretScan.findings.map((f) => f.label))].join(', ');
    breakdown.security.score -= 25;
    breakdown.security.issues.push(
      `CRITICAL: Potential hardcoded secret or credential literal (${labels}) detected in pipeline configuration.`
    );
    breakdown.security.tips.push(
      'Immediately revoke leaked credentials and move all secrets to encrypted CI/CD environment variables or a secret manager.'
    );
  }

  if (usesLatestImage) {
    breakdown.security.score -= 10;
    breakdown.security.issues.push('Found :latest image tags, which reduce reproducibility and auditability.');
    breakdown.security.tips.push('Pin container images to specific versions or digests.');
  } else if (hasPinnedImages) {
    breakdown.security.score += 5;
  }

  if (hasRetriesOrTimeout) {
    breakdown.reliability.score += 10;
  } else {
    breakdown.reliability.issues.push('Retry/timeout controls are not clearly defined.');
    breakdown.reliability.tips.push('Add retries and timeout limits to stabilize flaky steps.');
  }

  if (hasArtifacts) {
    breakdown.reliability.score += 8;
  } else {
    breakdown.reliability.issues.push('Artifact handoff between jobs is not evident.');
    breakdown.reliability.tips.push('Persist and share build artifacts explicitly between stages.');
  }

  if (hasTests) {
    breakdown.reliability.score += 8;
  } else {
    breakdown.reliability.issues.push('No explicit test execution stage detected.');
    breakdown.reliability.tips.push('Add automated tests as a required pipeline gate.');
  }

  if (hasWorkflowStructure) {
    breakdown.best_practice.score += 10;
  } else {
    breakdown.best_practice.issues.push('Pipeline structure declarations are not clearly defined.');
    breakdown.best_practice.tips.push('Use explicit jobs/stages/workflows for readability and maintenance.');
  }

  if (/\bbuild\b/.test(lower) && /\bdeploy\b/.test(lower)) {
    breakdown.best_practice.score += 6;
  } else {
    breakdown.best_practice.issues.push('End-to-end flow (build, test, deploy) is incomplete.');
    breakdown.best_practice.tips.push('Define a clear progression across build, validation, and deployment stages.');
  }

  for (const key of Object.keys(breakdown)) {
    breakdown[key].score = clampScore(breakdown[key].score);

    if (!breakdown[key].issues.length) {
      breakdown[key].issues.push('No major issues detected by heuristic analysis.');
    }

    if (!breakdown[key].tips.length) {
      breakdown[key].tips.push('Continue refining this area with platform-specific best practices.');
    }
  }

  const overallScore = clampScore(
    (breakdown.speed.score +
      breakdown.security.score +
      breakdown.reliability.score +
      breakdown.best_practice.score) /
      4
  );

  const recommendationPool = [
    ...breakdown.speed.tips,
    ...breakdown.security.tips,
    ...breakdown.reliability.tips,
    ...breakdown.best_practice.tips,
  ];

  return {
    overallScore,
    grade: gradeForScore(overallScore),
    breakdown,
    topRecommendations: recommendationPool.filter(Boolean).slice(0, 3),
    analysisMode: 'heuristic',
    summary: `Heuristic health analysis for ${platformDisplayName}.`,
  };
}

function normalizeHealthReport(rawReport, fallbackConfigText, platformDisplayName) {
  const heuristic = buildHeuristicHealthReport(fallbackConfigText, platformDisplayName);
  if (!rawReport || typeof rawReport !== 'object' || Array.isArray(rawReport)) {
    return heuristic;
  }

  const breakdownSource =
    rawReport.breakdown && typeof rawReport.breakdown === 'object' ? rawReport.breakdown : {};

  const bestPracticeSource =
    breakdownSource.best_practice ||
    breakdownSource.bestPractice ||
    breakdownSource.best_practices ||
    breakdownSource['best practice'];

  const normalizeDimension = (source, fallback) => {
    if (!source || typeof source !== 'object') {
      return fallback;
    }

    const score = clampScore(source.score, fallback.score);
    const issues = toStringList(source.issues);
    const tips = toStringList(source.tips);

    return {
      score,
      issues: issues.length ? issues : fallback.issues,
      tips: tips.length ? tips : fallback.tips,
    };
  };

  const breakdown = {
    speed: normalizeDimension(breakdownSource.speed, heuristic.breakdown.speed),
    security: normalizeDimension(breakdownSource.security, heuristic.breakdown.security),
    reliability: normalizeDimension(breakdownSource.reliability, heuristic.breakdown.reliability),
    best_practice: normalizeDimension(bestPracticeSource, heuristic.breakdown.best_practice),
  };

  const averagedScore = clampScore(
    (breakdown.speed.score +
      breakdown.security.score +
      breakdown.reliability.score +
      breakdown.best_practice.score) /
      4
  );

  const overallScore = clampScore(rawReport.overallScore, averagedScore);

  const rawGrade = typeof rawReport.grade === 'string' ? rawReport.grade.trim().toUpperCase() : '';
  const grade = ['A', 'B', 'C', 'D', 'F'].includes(rawGrade) ? rawGrade : gradeForScore(overallScore);

  const topRecommendations = toStringList(rawReport.topRecommendations, 8);
  const fallbackRecommendations = [
    ...breakdown.speed.tips,
    ...breakdown.security.tips,
    ...breakdown.reliability.tips,
    ...breakdown.best_practice.tips,
  ]
    .filter(Boolean)
    .slice(0, 3);

  return {
    overallScore,
    grade,
    breakdown,
    topRecommendations: topRecommendations.length ? topRecommendations : fallbackRecommendations,
    analysisMode: 'ai',
    summary: typeof rawReport.summary === 'string' ? rawReport.summary.trim() : undefined,
  };
}

function stripCodeFences(text) {
  if (typeof text !== 'string') return '';

  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json|yaml)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }

  return trimmed;
}

function normalizeYamlString(rawYaml) {
  if (typeof rawYaml !== 'string') return '';

  let yamlText = rawYaml.trim();
  if (!yamlText) return '';

  if (yamlText.startsWith('"') && yamlText.endsWith('"')) {
    const parsedQuoted = safeJsonParse(yamlText);
    if (typeof parsedQuoted === 'string') {
      yamlText = parsedQuoted;
    }
  }

  if (/\\n/.test(yamlText)) {
    yamlText = yamlText
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"');
  }

  return yamlText;
}

function extractPipelinePayload(text) {
  const cleaned = stripCodeFences(text);
  const candidates = [cleaned];

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const parsed = safeJsonParse(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }

    if (typeof parsed === 'string') {
      const nested = safeJsonParse(parsed);
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return nested;
      }
    }
  }

  return null;
}

function extractYamlFromText(text) {
  const cleaned = stripCodeFences(text);

  const yamlFieldMatch = cleaned.match(/"yaml"\s*:\s*"([\s\S]*)/);
  if (yamlFieldMatch && yamlFieldMatch[1]) {
    let fragment = yamlFieldMatch[1];
    const stopIndex = fragment.search(/",\s*"(nodes|edges)"/);
    if (stopIndex !== -1) {
      fragment = fragment.slice(0, stopIndex);
    }

    fragment = fragment.replace(/"\s*}\s*$/, '');
    return normalizeYamlString(fragment);
  }

  return normalizeYamlString(cleaned);
}

function humanizeLabel(value) {
  return String(value || 'build')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function classifyNodeType(value, supportedNodeTypes) {
  const text = String(value || '').toLowerCase();
  const normalizedText = text.replace(/[_-]+/g, ' ');

  const rules = [
    { type: 'matrix_build', includes: ['matrix'] },
    { type: 'cache_restore', includes: ['cache restore', 'restore cache'] },
    { type: 'cache_save', includes: ['cache save', 'save cache'] },
    { type: 'approval_gate', includes: ['approval', 'manual gate', 'manual'] },
    { type: 'canary_deploy', includes: ['canary'] },
    { type: 'blue_green_deploy', includes: ['blue green', 'blue/green', 'blue-green'] },
    { type: 'rollback', includes: ['rollback', 'roll back'] },
    { type: 'release', includes: ['release'] },
    { type: 'package', includes: ['package', 'artifact', 'bundle'] },
    { type: 'security_scan', includes: ['security', 'sast', 'scan', 'vulnerability'] },
    { type: 'integration_test', includes: ['integration'] },
    { type: 'smoke_test', includes: ['smoke'] },
    { type: 'lint', includes: ['lint', 'static analysis'] },
    { type: 'test', includes: ['test'] },
    { type: 'deploy', includes: ['deploy', 'ship', 'publish'] },
    { type: 'notify', includes: ['notify', 'notification', 'slack', 'teams'] },
    { type: 'build', includes: ['build', 'compile'] },
  ];

  for (const rule of rules) {
    if (!supportedNodeTypes.includes(rule.type)) continue;
    if (rule.includes.some((keyword) => normalizedText.includes(keyword))) {
      return rule.type;
    }
  }

  return supportedNodeTypes.includes('build') ? 'build' : supportedNodeTypes[0] || 'build';
}

function sanitizeNodes(rawNodes, supportedNodeTypes) {
  if (!Array.isArray(rawNodes)) return [];

  const seenIds = new Set();

  return rawNodes.map((node, index) => {
    let id = typeof node?.id === 'string' && node.id.trim() ? node.id.trim() : `node_${index + 1}`;
    while (seenIds.has(id)) {
      id = `${id}_${index + 1}`;
    }
    seenIds.add(id);

    const preferredType =
      typeof node?.type === 'string' && supportedNodeTypes.includes(node.type)
        ? node.type
        : classifyNodeType(`${node?.type || ''} ${node?.data?.label || ''}`, supportedNodeTypes);

    const x = Number(node?.position?.x);
    const y = Number(node?.position?.y);

    return {
      id,
      type: preferredType,
      position: {
        x: Number.isFinite(x) ? x : 220 + (index % 2) * 280,
        y: Number.isFinite(y) ? y : 120 + index * 130,
      },
      data: {
        label:
          typeof node?.data?.label === 'string' && node.data.label.trim()
            ? node.data.label.trim()
            : humanizeLabel(node?.id || preferredType),
        config:
          node?.data?.config && typeof node.data.config === 'object' && !Array.isArray(node.data.config)
            ? node.data.config
            : {},
      },
    };
  });
}

function sanitizeEdges(rawEdges, nodes) {
  if (!Array.isArray(rawEdges) || nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((node) => node.id));

  return rawEdges
    .map((edge, index) => {
      const source = typeof edge?.source === 'string' ? edge.source : '';
      const target = typeof edge?.target === 'string' ? edge.target : '';
      return {
        id: typeof edge?.id === 'string' && edge.id.trim() ? edge.id : `e_${source}_${target}_${index}`,
        source,
        target,
        animated: edge?.animated !== false,
      };
    })
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target);
}

function normalizeDepList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') return String(entry.job || entry.name || '').trim();
      return '';
    })
    .filter(Boolean);
}

function joinCommands(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'string') return value.trim();
  return '';
}

// Jenkins `sh` steps in the forms people actually write:
//   sh 'cmd'   sh "echo 'x'"   sh '''multi\nline'''   sh """..."""
//   sh(script: 'cmd', returnStdout: true)   sh label: 'Build', script: 'cmd'
// A single forward scan (no regex backtracking, so a crafted Jenkinsfile
// can't stall the server) that skips Groovy comments and unrelated strings.
const GROOVY_QUOTES = ["'''", '"""', "'", '"'];
const isIdentChar = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);

/** Reads a Groovy string literal at `i`; returns { value, end } or null. */
function readGroovyString(src, i) {
  const quote = GROOVY_QUOTES.find((q) => src.startsWith(q, i));
  if (!quote) return null;
  let j = i + quote.length;
  let value = '';
  while (j < src.length) {
    if (src[j] === '\\') {
      value += src.slice(j, j + 2);
      j += 2;
      continue;
    }
    if (src.startsWith(quote, j)) return { value, end: j + quote.length };
    if (quote.length === 1 && src[j] === '\n') return null;
    value += src[j];
    j += 1;
  }
  return null;
}

const skipSpaces = (src, j) => {
  while (j < src.length && /\s/.test(src[j])) j += 1;
  return j;
};

/** Parses the arguments after `sh` at `j`; returns { script, end } or null. */
function readShCall(src, j) {
  j = skipSpaces(src, j);
  if (src[j] === '(') j = skipSpaces(src, j + 1);

  const positional = readGroovyString(src, j);
  if (positional) return { script: positional.value, end: positional.end };

  // Named arguments: name: value, name: value, ... (script: is the command)
  let script = null;
  for (;;) {
    const nameStart = j;
    while (isIdentChar(src[j])) j += 1;
    if (j === nameStart) break;
    const name = src.slice(nameStart, j);
    j = skipSpaces(src, j);
    if (src[j] !== ':') break;
    j = skipSpaces(src, j + 1);
    const str = readGroovyString(src, j);
    if (str) {
      if (name === 'script') script = str.value;
      j = str.end;
    } else {
      const valueStart = j;
      while (isIdentChar(src[j]) || src[j] === '.') j += 1;
      if (j === valueStart) break;
    }
    j = skipSpaces(src, j);
    if (src[j] !== ',') break;
    j = skipSpaces(src, j + 1);
  }
  return script === null ? null : { script, end: j };
}

function extractJenkinsShScripts(stageBody) {
  const src = String(stageBody || '');
  const commands = [];
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('//', i)) {
      const eol = src.indexOf('\n', i);
      i = eol === -1 ? src.length : eol + 1;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const close = src.indexOf('*/', i + 2);
      i = close === -1 ? src.length : close + 2;
      continue;
    }
    if (src[i] === "'" || src[i] === '"') {
      const str = readGroovyString(src, i);
      i = str ? str.end : i + 1;
      continue;
    }
    if (src.startsWith('sh', i) && !isIdentChar(src[i - 1]) && !isIdentChar(src[i + 2])) {
      const call = readShCall(src, i + 2);
      if (call) {
        for (const line of call.script.split('\n')) {
          const command = line.trim();
          if (command) commands.push(command);
        }
        i = call.end;
        continue;
      }
    }
    i += 1;
  }
  return commands;
}

function parseConfigToDAG(configText, cicdPlatform = 'gitlab') {
  const supportedNodeTypes = getSupportedNodeTypes();
  const rawText = typeof configText === 'string' ? stripCodeFences(configText) : '';

  const isJenkins =
    cicdPlatform === 'jenkins' ||
    (/stage\s*\(\s*['"]/.test(rawText) && /pipeline\s*\{|steps\s*\{|sh\s+['"]/.test(rawText));

  const rawJobs = []; // [{ key, label, type, config, deps: [] }]
  let hasPushTrigger = true;
  let hasMrTrigger = false;
  let detectedPlatform = isJenkins ? 'jenkins' : cicdPlatform || 'gitlab';

  if (isJenkins && rawText) {
    // Jenkins jobs run on SCM changes whether or not a triggers {} block is
    // declared, so keep the push trigger; add an MR trigger only when the file
    // branches on change requests.
    hasMrTrigger = /changeRequest\s*\(|\bCHANGE_ID\b/.test(rawText);
    const stageRegex = /stage\(\s*['"]([^'"]+)['"]\s*\)\s*\{([\s\S]*?)(?=stage\(\s*['"]|\}\s*\}\s*$|$)/g;
    let match = stageRegex.exec(rawText);
    let prevKey = null;

    while (match) {
      const stageName = match[1].trim();
      const body = match[2] || '';
      const key = `stage_${rawJobs.length + 1}`;
      const scripts = extractJenkinsShScripts(body);

      const config = { stage: stageName };
      if (scripts.length > 0) config.script = scripts.join('\n');

      rawJobs.push({
        key,
        label: stageName,
        type: classifyNodeType(stageName, supportedNodeTypes),
        config,
        deps: prevKey ? [prevKey] : [],
      });

      prevKey = key;
      match = stageRegex.exec(rawText);
    }
  } else if (rawText) {
    let doc;
    try {
      doc = yaml.load(rawText);
    } catch {
      doc = null;
    }

    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      if (doc.pipelines && typeof doc.pipelines === 'object') {
        detectedPlatform = 'bitbucket';
      } else if (doc.workflows && doc.jobs) {
        detectedPlatform = 'circleci';
      } else if (doc.jobs && (doc.on || doc.true)) {
        detectedPlatform = 'github';
      } else if (doc.stages) {
        detectedPlatform = 'gitlab';
      }

      if (detectedPlatform === 'github' || (doc.jobs && !doc.workflows && !doc.pipelines)) {
        const triggers = doc.on || doc.true;
        if (triggers && typeof triggers === 'object' && !Array.isArray(triggers)) {
          hasPushTrigger = Boolean(triggers.push) || Object.keys(triggers).length === 0;
          hasMrTrigger = Boolean(triggers.pull_request || triggers.pull_request_target);
        } else if (Array.isArray(triggers)) {
          hasPushTrigger = triggers.includes('push');
          hasMrTrigger = triggers.includes('pull_request');
        }

        const jobsObj = doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {};
        for (const [jobKey, job] of Object.entries(jobsObj)) {
          if (!job || typeof job !== 'object') continue;
          const steps = Array.isArray(job.steps) ? job.steps : [];
          const runCommands = steps
            .map((step) => (step && typeof step.run === 'string' ? step.run.trim() : ''))
            .filter(Boolean)
            .join('\n');

          const config = {};
          if (job['runs-on']) {
            config.runsOn = Array.isArray(job['runs-on']) ? job['runs-on'][0] : String(job['runs-on']);
          }
          if (job.container) {
            config.image = typeof job.container === 'string' ? job.container : job.container.image;
          }
          if (runCommands) config.script = runCommands;
          if (job.environment) {
            config.environment =
              typeof job.environment === 'string' ? job.environment : job.environment.name;
          }

          const label = typeof job.name === 'string' && job.name.trim() ? job.name.trim() : humanizeLabel(jobKey);
          rawJobs.push({
            key: jobKey,
            label,
            type: classifyNodeType(`${jobKey} ${label}`, supportedNodeTypes),
            config,
            deps: normalizeDepList(job.needs),
          });
        }
      } else if (detectedPlatform === 'circleci') {
        const jobsObj = doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {};
        const workflowDeps = {};
        const workflowOrder = [];

        if (doc.workflows && typeof doc.workflows === 'object') {
          for (const wf of Object.values(doc.workflows)) {
            if (!wf || typeof wf !== 'object' || !Array.isArray(wf.jobs)) continue;
            for (const entry of wf.jobs) {
              if (typeof entry === 'string') {
                workflowOrder.push(entry);
                workflowDeps[entry] = workflowDeps[entry] || [];
              } else if (entry && typeof entry === 'object') {
                const [jobName, cfg] = Object.entries(entry)[0] || [];
                if (jobName) {
                  workflowOrder.push(jobName);
                  workflowDeps[jobName] = normalizeDepList(cfg?.requires);
                  if (cfg?.type === 'approval' && !jobsObj[jobName]) {
                    jobsObj[jobName] = { __approval: true };
                  }
                }
              }
            }
          }
        }

        const keys = workflowOrder.length > 0
          ? [...new Set([...workflowOrder, ...Object.keys(jobsObj)])]
          : Object.keys(jobsObj);

        for (const jobKey of keys) {
          const job = jobsObj[jobKey];
          if (!job || typeof job !== 'object') continue;

          const steps = Array.isArray(job.steps) ? job.steps : [];
          const runCommands = steps
            .map((step) => {
              if (!step || typeof step !== 'object') return '';
              if (typeof step.run === 'string') return step.run.trim();
              if (step.run && typeof step.run.command === 'string') return step.run.command.trim();
              return '';
            })
            .filter(Boolean)
            .join('\n');

          const config = {};
          if (job.docker?.[0]?.image) config.image = job.docker[0].image;
          if (runCommands) config.script = runCommands;

          const type = job.__approval
            ? 'approval_gate'
            : classifyNodeType(jobKey, supportedNodeTypes);

          rawJobs.push({
            key: jobKey,
            label: humanizeLabel(jobKey),
            type,
            config,
            deps: workflowDeps[jobKey] || [],
          });
        }
      } else if (detectedPlatform === 'bitbucket') {
        const defaultImage = typeof doc.image === 'string' ? doc.image : undefined;
        const p = doc.pipelines || {};
        hasMrTrigger = Boolean(p['pull-requests']);
        const collectSteps = (arr) => {
          const out = [];
          for (const item of Array.isArray(arr) ? arr : []) {
            if (item?.step) out.push({ step: item.step, parallel: false });
            else if (Array.isArray(item?.parallel)) {
              const group = [];
              for (const sub of item.parallel) {
                if (sub?.step) group.push(sub.step);
              }
              if (group.length) out.push({ steps: group, parallel: true });
            }
          }
          return out;
        };

        const branchMain = p.branches?.main || p.branches?.master;
        const prSteps = p['pull-requests']?.['**'];
        const stepEntries = collectSteps(branchMain || p.default || prSteps || []);

        let prevKeys = [];
        let idx = 0;
        for (const entry of stepEntries) {
          if (entry.parallel && Array.isArray(entry.steps)) {
            const currentLayerKeys = [];
            for (const stepObj of entry.steps) {
              idx += 1;
              const name = stepObj.name || `step_${idx}`;
              const key = `${name}_${idx}`;
              const config = {};
              if (stepObj.image || defaultImage) config.image = stepObj.image || defaultImage;
              const script = joinCommands(stepObj.script);
              if (script) config.script = script;
              if (stepObj.deployment) config.environment = String(stepObj.deployment);

              rawJobs.push({
                key,
                label: humanizeLabel(name),
                type:
                  stepObj.trigger === 'manual'
                    ? 'approval_gate'
                    : classifyNodeType(name, supportedNodeTypes),
                config,
                deps: [...prevKeys],
              });
              currentLayerKeys.push(key);
            }
            prevKeys = currentLayerKeys;
          } else if (entry.step) {
            idx += 1;
            const stepObj = entry.step;
            const name = stepObj.name || `step_${idx}`;
            const key = `${name}_${idx}`;
            const config = {};
            if (stepObj.image || defaultImage) config.image = stepObj.image || defaultImage;
            const script = joinCommands(stepObj.script);
            if (script) config.script = script;
            if (stepObj.deployment) config.environment = String(stepObj.deployment);

            rawJobs.push({
              key,
              label: humanizeLabel(name),
              type:
                stepObj.trigger === 'manual'
                  ? 'approval_gate'
                  : classifyNodeType(name, supportedNodeTypes),
              config,
              deps: [...prevKeys],
            });
            prevKeys = [key];
          }
        }
      } else {
        // GitLab CI or generic YAML
        const reserved = new Set([
          'stages',
          'variables',
          'workflow',
          'default',
          'include',
          'image',
          'services',
          'before_script',
          'after_script',
          'cache',
          'pages',
          'name',
          'on',
          'env',
          'version',
          'executors',
          'workflows',
          'pipelines',
        ]);

        const stageOrder = Array.isArray(doc.stages) ? doc.stages.map(String) : [];
        const stageGroups = new Map();
        const defaultImage = typeof doc.image === 'string' ? doc.image : doc.image?.name;

        for (const [key, job] of Object.entries(doc)) {
          if (!key || key.startsWith('.') || reserved.has(key)) continue;
          if (!job || typeof job !== 'object' || Array.isArray(job)) continue;

          const stage = typeof job.stage === 'string' ? job.stage : stageOrder[0] || 'build';
          if (!stageGroups.has(stage)) stageGroups.set(stage, []);
          stageGroups.get(stage).push(key);

          const config = { stage };
          const img = typeof job.image === 'string' ? job.image : job.image?.name || defaultImage;
          if (img) config.image = img;
          const script = joinCommands(job.script);
          if (script) config.script = script;
          if (job.environment) {
            config.environment =
              typeof job.environment === 'string' ? job.environment : job.environment.name;
          }

          if (Array.isArray(job.rules)) {
            for (const rule of job.rules) {
              if (typeof rule?.if === 'string' && rule.if.includes('merge_request_event')) {
                hasMrTrigger = true;
              }
            }
          }

          const explicitDeps = [
            ...normalizeDepList(job.needs),
            ...normalizeDepList(job.dependencies),
          ];

          rawJobs.push({
            key,
            label: humanizeLabel(key),
            type:
              job.when === 'manual'
                ? 'approval_gate'
                : classifyNodeType(`${key} ${stage}`, supportedNodeTypes),
            config,
            deps: [...new Set(explicitDeps)],
            stage,
          });
        }

        // For jobs without explicit `needs`/`dependencies`, infer dependencies from sequential `stages` order
        const orderedStages =
          stageOrder.length > 0 ? stageOrder : [...stageGroups.keys()];
        for (const job of rawJobs) {
          if (job.deps.length === 0 && job.stage) {
            const stageIdx = orderedStages.indexOf(job.stage);
            if (stageIdx > 0) {
              for (let prevIdx = stageIdx - 1; prevIdx >= 0; prevIdx -= 1) {
                const prevStageJobs = stageGroups.get(orderedStages[prevIdx]) || [];
                if (prevStageJobs.length > 0) {
                  job.deps = [...prevStageJobs];
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  // Minimal fallback if config could not be parsed into jobs
  if (rawJobs.length === 0) {
    const fallbackTypes = ['build', 'test', 'deploy'].filter((t) =>
      supportedNodeTypes.includes(t)
    );
    let prev = null;
    fallbackTypes.forEach((t, idx) => {
      const key = `${t}_${idx + 1}`;
      rawJobs.push({
        key,
        label: humanizeLabel(t),
        type: t,
        config: { stage: t },
        deps: prev ? [prev] : [],
      });
      prev = key;
    });
  }

  // Build trigger nodes
  const nodes = [];
  const edges = [];
  const triggerIds = [];

  if (hasPushTrigger && supportedNodeTypes.includes('trigger_push')) {
    const id = 'node_1';
    triggerIds.push(id);
    nodes.push({
      id,
      type: 'trigger_push',
      position: { x: 220, y: 80 },
      data: { label: 'Git Push Trigger', config: {} },
    });
  }

  if (hasMrTrigger && supportedNodeTypes.includes('trigger_mr')) {
    const id = `node_${nodes.length + 1}`;
    triggerIds.push(id);
    nodes.push({
      id,
      type: 'trigger_mr',
      position: { x: 520, y: 80 },
      data: { label: 'Merge Request Trigger', config: {} },
    });
  }

  if (triggerIds.length === 0) {
    const id = 'node_1';
    triggerIds.push(id);
    nodes.push({
      id,
      type: supportedNodeTypes.includes('trigger_push') ? 'trigger_push' : supportedNodeTypes[0],
      position: { x: 220, y: 80 },
      data: { label: 'Git Push Trigger', config: {} },
    });
  }

  const jobByKey = new Map(rawJobs.map((j) => [j.key, j]));
  const nodeIdByKey = new Map();
  rawJobs.forEach((job, idx) => {
    nodeIdByKey.set(job.key, `node_${nodes.length + idx + 1}`);
  });

  // Compute topological depth for each job: depth = max(parentDepths) + 1 (roots at depth 1)
  const depthMemo = new Map();
  const computeDepth = (key, visiting = new Set()) => {
    if (depthMemo.has(key)) return depthMemo.get(key);
    if (visiting.has(key)) return 1;
    visiting.add(key);

    const job = jobByKey.get(key);
    const validParents = (job?.deps || []).filter((dep) => jobByKey.has(dep) && dep !== key);
    let depth = 1;
    if (validParents.length > 0) {
      depth = Math.max(...validParents.map((p) => computeDepth(p, new Set(visiting)))) + 1;
    }

    depthMemo.set(key, depth);
    return depth;
  };

  for (const job of rawJobs) {
    computeDepth(job.key);
  }

  // Group jobs by topological depth layer for horizontal side-by-side layout
  const layerCounts = new Map();
  for (const job of rawJobs) {
    const depth = depthMemo.get(job.key) || 1;
    const colIndex = layerCounts.get(depth) || 0;
    layerCounts.set(depth, colIndex + 1);

    const nodeId = nodeIdByKey.get(job.key);
    nodes.push({
      id: nodeId,
      type: supportedNodeTypes.includes(job.type) ? job.type : 'build',
      position: {
        x: 220 + colIndex * 280,
        y: 80 + depth * 140,
      },
      data: {
        label: job.label,
        config: job.config || {},
      },
    });

    const validParents = (job.deps || []).filter((dep) => nodeIdByKey.has(dep) && dep !== job.key);
    if (validParents.length > 0) {
      for (const parentKey of validParents) {
        const sourceId = nodeIdByKey.get(parentKey);
        edges.push({
          id: `e_${sourceId}_${nodeId}`,
          source: sourceId,
          target: nodeId,
          animated: true,
        });
      }
    } else {
      for (const trigId of triggerIds) {
        edges.push({
          id: `e_${trigId}_${nodeId}`,
          source: trigId,
          target: nodeId,
          animated: true,
        });
      }
    }
  }

  return { nodes, edges, detectedPlatform };
}

function parsePipelineResult(text, cicdPlatform) {
  const supportedNodeTypes = getSupportedNodeTypes();
  const payload = extractPipelinePayload(text);

  if (payload) {
    const yamlText = normalizeYamlString(payload.yaml || '');
    let nodes = sanitizeNodes(payload.nodes, supportedNodeTypes);
    let edges = sanitizeEdges(payload.edges, nodes);

    if (nodes.length > 0 && edges.length === 0) {
      edges = nodes.slice(1).map((node, index) => ({
        id: `e_${nodes[index].id}_${node.id}`,
        source: nodes[index].id,
        target: node.id,
        animated: true,
      }));
    }

    if (nodes.length === 0 && yamlText) {
      const fallback = parseConfigToDAG(yamlText, cicdPlatform);
      nodes = fallback.nodes;
      edges = fallback.edges;
    }

    return {
      yaml: yamlText,
      nodes,
      edges,
    };
  }

  const yamlText = extractYamlFromText(text);
  const fallback = parseConfigToDAG(yamlText, cicdPlatform);

  return {
    yaml: yamlText,
    nodes: fallback.nodes,
    edges: fallback.edges,
  };
}

const NODE_GENERATION_GUIDANCE = {
  trigger_push: 'Use for git push triggers. Optional config: { branch }.',
  trigger_mr: 'Use for merge/pull request triggers. Optional config: { targetBranch }.',
  build: 'Compile/build job. Suggested config: { image, script, stage }.',
  matrix_build: 'Parallel matrix build/test strategy. Suggested config: { matrix, image, script, stage }.',
  lint: 'Static analysis or lint checks. Suggested config: { image, script, stage }.',
  test: 'Unit tests. Suggested config: { image, script, stage }.',
  integration_test: 'Integration tests against dependencies/services.',
  smoke_test: 'Post-build smoke validation before promotion.',
  cache_restore: 'Restore dependency/build cache. Suggested config: { cacheKey, cachePaths }.',
  cache_save: 'Save dependency/build cache. Suggested config: { cacheKey, cachePaths }.',
  security_scan: 'Security checks (SAST/dependency/container scan).',
  package: 'Build and publish artifacts/packages. Suggested config: { artifactPath }.',
  release: 'Tag/release orchestration. Suggested config: { tag }.',
  approval_gate: 'Manual approval before sensitive promotion. Suggested config: { approver, environment }.',
  deploy: 'Primary deployment step. Suggested config: { environment, script }.',
  canary_deploy: 'Progressive rollout with traffic split. Suggested config: { trafficPercent, environment }.',
  blue_green_deploy: 'Blue/green cutover. Suggested config: { activeColor, environment }.',
  rollback: 'Rollback strategy if rollout fails. Suggested config: { environment, script }.',
  notify: 'Send Slack/Teams/email notifications. Suggested config: { channel, script }.',
  conditional: 'Branch/env conditional gate. Suggested config: { condition }.',
};

function buildNodeGenerationGuide(supportedNodeTypes) {
  return supportedNodeTypes
    .map((type) => `- ${type}: ${NODE_GENERATION_GUIDANCE[type] || 'Use when relevant.'}`)
    .join('\n');
}

function buildRobustDefaultBlueprint(supportedNodeTypes) {
  const preferredSequence = [
    'trigger_push',
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

  const selected = preferredSequence.filter((type) => supportedNodeTypes.includes(type));
  if (selected.length === 0) {
    return 'trigger_push -> build -> test -> deploy';
  }

  return selected.join(' -> ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo context builder
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TOTAL_CONTEXT_CHARS = 80000; // ~20K tokens — leaves room for system + output

function buildRepoContextSection(repoContext) {
  if (!Array.isArray(repoContext) || repoContext.length === 0) return '';

  const lines = [
    '\n\nRepository Context (files selected by the user from their repo):',
    'Use these files to understand the project stack, dependencies, scripts, and structure.',
    'Tailor the generated pipeline to match what is actually in this codebase.',
  ];

  let totalChars = 0;
  for (const file of repoContext) {
    if (!file.path || typeof file.content !== 'string') continue;
    const header = `\n--- ${file.path} ---\n`;
    const available = MAX_TOTAL_CONTEXT_CHARS - totalChars;
    if (available <= 0) {
      lines.push(`\n[${file.path} omitted — context limit reached]`);
      continue;
    }
    const content = file.content.slice(0, available);
    lines.push(header + content);
    totalChars += header.length + content.length;
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AI Pipeline Generator (Platform-Agnostic)
// ─────────────────────────────────────────────────────────────────────────────

function buildDeterministicPipelineFromPrompt(prompt, cicdPlatform = 'gitlab', repoContext = []) {
  const generator = getCICDGenerator(cicdPlatform);
  const supportedNodeTypes = getSupportedNodeTypes();
  const text = `${prompt || ''}\n${(repoContext || []).map((f) => `${f.path}\n${f.content || ''}`).join('\n')}`.toLowerCase();

  const isPython = /\b(python|pytest|pip|poetry|django|flask|fastapi|requirements\.txt)\b/.test(text);
  const isGo = /\b(golang|go\s+build|go\s+test|go\.mod)\b/.test(text);
  const isDocker = /\b(docker|dockerfile|container|image)\b/.test(text);

  const image = isPython
    ? 'python:3.12-slim'
    : isGo
      ? 'golang:1.22-alpine'
      : 'node:20-alpine';

  const installAndBuildScript = isPython
    ? 'pip install --no-cache-dir -r requirements.txt\npython -m compileall .'
    : isGo
      ? 'go mod download\ngo build -v ./...'
      : 'npm ci\nnpm run build';

  const lintScript = isPython
    ? 'ruff check . || flake8 .'
    : isGo
      ? 'go vet ./...'
      : 'npm run lint';

  const testScript = isPython
    ? 'pytest --maxfail=1 --disable-warnings -q'
    : isGo
      ? 'go test -race -v ./...'
      : 'npm test -- --ci';

  const nodes = [
    {
      id: 'node_1',
      type: 'trigger_push',
      position: { x: 260, y: 60 },
      data: { label: 'Git Push Trigger', config: { branch: 'main' } },
    },
    {
      id: 'node_2',
      type: 'cache_restore',
      position: { x: 260, y: 180 },
      data: {
        label: 'Restore Dependencies Cache',
        config: {
          stage: 'build',
          image,
          cacheKey: 'deps-$CI_COMMIT_REF_SLUG',
          cachePaths: isPython ? '.cache/pip' : 'node_modules/',
          script: 'echo "Restoring dependency cache..."',
        },
      },
    },
    {
      id: 'node_3',
      type: 'build',
      position: { x: 260, y: 300 },
      data: {
        label: isDocker ? 'Build Container & App' : 'Build Application',
        config: {
          stage: 'build',
          image,
          script: installAndBuildScript,
        },
      },
    },
    {
      id: 'node_4',
      type: 'lint',
      position: { x: 40, y: 440 },
      data: {
        label: 'Static Analysis & Lint',
        config: {
          stage: 'test',
          image,
          script: lintScript,
        },
      },
    },
    {
      id: 'node_5',
      type: 'test',
      position: { x: 260, y: 440 },
      data: {
        label: 'Unit & Integration Tests',
        config: {
          stage: 'test',
          image,
          script: testScript,
        },
      },
    },
    {
      id: 'node_6',
      type: 'security_scan',
      position: { x: 480, y: 440 },
      data: {
        label: 'Security & Vulnerability Scan',
        config: {
          stage: 'test',
          image,
          script: isPython ? 'pip-audit || true' : 'npm audit --audit-level=high || true',
        },
      },
    },
    {
      id: 'node_7',
      type: 'package',
      position: { x: 260, y: 580 },
      data: {
        label: 'Package Artifacts',
        config: {
          stage: 'build',
          image,
          artifactPath: 'dist/',
          script: 'mkdir -p dist && echo "Packaging release bundle..."',
        },
      },
    },
    {
      id: 'node_8',
      type: 'deploy',
      position: { x: 260, y: 720 },
      data: {
        label: 'Deploy to Production',
        config: {
          stage: 'deploy',
          image,
          environment: 'production',
          script: 'echo "Deploying verified release to production..."',
        },
      },
    },
  ].filter((n) => supportedNodeTypes.includes(n.type));

  const edges = [
    { id: 'e_node_1_node_2', source: 'node_1', target: 'node_2', animated: true },
    { id: 'e_node_2_node_3', source: 'node_2', target: 'node_3', animated: true },
    { id: 'e_node_3_node_4', source: 'node_3', target: 'node_4', animated: true },
    { id: 'e_node_3_node_5', source: 'node_3', target: 'node_5', animated: true },
    { id: 'e_node_3_node_6', source: 'node_3', target: 'node_6', animated: true },
    { id: 'e_node_4_node_7', source: 'node_4', target: 'node_7', animated: true },
    { id: 'e_node_5_node_7', source: 'node_5', target: 'node_7', animated: true },
    { id: 'e_node_6_node_7', source: 'node_6', target: 'node_7', animated: true },
    { id: 'e_node_7_node_8', source: 'node_7', target: 'node_8', animated: true },
  ];

  const yamlText = generator.generate(nodes, edges);
  return {
    yaml: yamlText,
    nodes,
    edges,
    generationMode: 'template-fallback',
  };
}

async function generatePipelineFromPrompt(prompt, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();
  const supportedNodeTypes = getSupportedNodeTypes();
  const nodeGuide = buildNodeGenerationGuide(supportedNodeTypes);
  const robustBlueprint = buildRobustDefaultBlueprint(supportedNodeTypes);

  const system = `You are an expert DevOps engineer specializing in CI/CD automation.
Given project requirements, produce:
1. A valid ${metadata.displayName} configuration file (${metadata.fileName}).
2. React Flow workflow nodes for the visual editor that mirror the YAML flow.

Node shape: { "id": "<unique>", "type": "<nodeType>", "data": { "label": "<name>", "config": {} }, "position": { "x": <n>, "y": <n> } }
Valid nodeTypes: ${supportedNodeTypes.join(', ')}.
Edge shape: { "id": "e<src>-<tgt>", "source": "<id>", "target": "<id>", "animated": true }

Node intent and config guidance:
${nodeGuide}

Pipeline quality requirements:
- Build a coherent DAG with all nodes connected through edges.
- Use meaningful stage/job names and realistic scripts.
- Unless the user explicitly requests a minimal pipeline, include strong quality gates before deployment: lint, tests, security scanning, and deployment safety checks.
- For production-grade prompts, prefer comprehensive coverage with matrix, cache, package/release, approval, progressive deploy, rollback, and notifications when those node types are available.
- Use the conditional node for branch/environment gating around deployment decisions when applicable.
- Provide useful config values for advanced nodes (matrix, cacheKey/cachePaths, approver, trafficPercent, activeColor, artifactPath, tag, condition, channel).
- Ensure generated YAML is valid and runnable for ${metadata.displayName}.

Default robust blueprint when prompt is broad or underspecified:
${robustBlueprint}

Target platform: ${metadata.displayName}
${getPlatformGuidelines(cicdPlatform)}

Return ONLY raw JSON, no markdown fences:
{ "yaml": "...", "nodes": [...], "edges": [...] }`;

  const repoContextSection = buildRepoContextSection(options.repoContext);
  const userMessage = repoContextSection ? `${repoContextSection}\n\nUser request:\n${prompt}` : prompt;

  try {
    const text = await ask(system, userMessage, {
      aiProvider: options.aiProvider,
      aiOptions: options.aiOptions,
      maxTokens: 4096,
    });

    return parsePipelineResult(text, cicdPlatform);
  } catch (err) {
    // Graceful smart-template synthesis if the AI key is depleted or not configured
    const fallback = buildDeterministicPipelineFromPrompt(prompt, cicdPlatform, options.repoContext);
    return {
      ...fallback,
      warning: `AI provider unavailable (${err.message}); generated from the built-in template instead. Check the AI provider and API key in Settings.`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pipeline Failure Explainer
// ─────────────────────────────────────────────────────────────────────────────

async function explainPipelineFailure(logs, options = {}) {
  const system = `You are an expert CI/CD debugging assistant.
Analyse the provided pipeline failure logs and return ONLY raw JSON — no markdown fences:
{
  "summary": "<one-line>",
  "explanation": "<detailed>",
  "rootCause": "<root cause>",
  "suggestedFixes": ["<fix1>", "<fix2>"],
  "hasSecurityIssue": false,
  "securityDetails": ""
}`;

  const logText = logs
    .map((l) => `=== Job: ${l.jobName} | stage: ${l.stage} ===\n${l.log}`)
    .join('\n\n')
    .slice(-14000);

  const text = await ask(system, logText, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 2048,
  });

  const parsed = parseJsonObjectFromText(text);
  if (parsed) return parsed;
  return {
    summary: text,
    explanation: text,
    rootCause: 'Unknown',
    suggestedFixes: [],
    hasSecurityIssue: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Source Platform → Target Platform Migration
// ─────────────────────────────────────────────────────────────────────────────

async function convertPipelineConfig(pipelineConfig, options = {}) {
  const sourcePlatform = options.sourcePlatform || 'jenkins';
  const targetPlatform = options.targetPlatform || options.cicdPlatform || 'gitlab';

  if (!SUPPORTED_CICD_PLATFORMS.includes(sourcePlatform)) {
    throw new Error(`Unsupported source platform: ${sourcePlatform}`);
  }

  if (!SUPPORTED_CICD_PLATFORMS.includes(targetPlatform)) {
    throw new Error(`Unsupported target platform: ${targetPlatform}`);
  }

  if (sourcePlatform === targetPlatform) {
    throw new Error('Source and target CI/CD platforms must be different');
  }

  const generator = getCICDGenerator(targetPlatform);
  const targetMetadata = generator.getMetadata();
  const sourceDisplayName =
    PLATFORM_DISPLAY_NAMES[sourcePlatform] ||
    sourcePlatform.charAt(0).toUpperCase() + sourcePlatform.slice(1);

  const system = `You are a senior DevOps migration specialist.
Convert a CI/CD configuration from ${sourceDisplayName} to ${targetMetadata.displayName}.

Requirements:
- Preserve pipeline intent and stage/job behavior.
- Output valid ${targetMetadata.displayName} syntax (${targetMetadata.fileName}).
- Keep the result practical and production-friendly.
- Return React Flow nodes and edges for the visual editor.
- Never output markdown fences.

Valid nodeTypes: ${getSupportedNodeTypes().join(', ')}.

Source platform: ${sourceDisplayName}
${getPlatformGuidelines(sourcePlatform)}

Target platform: ${targetMetadata.displayName}
${getPlatformGuidelines(targetPlatform)}

Return ONLY raw JSON:
{ "yaml": "...", "nodes": [...], "edges": [...] }`;

  const userMessage = `Source platform: ${sourcePlatform}\nTarget platform: ${targetPlatform}\n\nConfiguration to migrate:\n${pipelineConfig}`;

  let text;
  try {
    text = await ask(system, userMessage, {
      aiProvider: options.aiProvider,
      aiOptions: options.aiOptions,
      maxTokens: 4096,
    });
  } catch (err) {
    // Deterministic DAG-to-target conversion fallback when AI provider is unavailable
    const dag = parseConfigToDAG(pipelineConfig, sourcePlatform);
    const yamlText = generator.generate(dag.nodes, dag.edges);
    return {
      yaml: yamlText,
      nodes: dag.nodes,
      edges: dag.edges,
      sourcePlatform,
      targetPlatform,
      warning: `AI provider unavailable (${err.message}); converted structurally without AI. Review the result before using it.`,
    };
  }

  const parsed = parsePipelineResult(text, targetPlatform);
  return {
    ...parsed,
    sourcePlatform,
    targetPlatform,
  };
}

async function convertJenkinsfile(jenkinsfile, options = {}) {
  return convertPipelineConfig(jenkinsfile, {
    ...options,
    sourcePlatform: 'jenkins',
    targetPlatform: options.targetPlatform || options.cicdPlatform || 'gitlab',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Pipeline Health Advisor
// ─────────────────────────────────────────────────────────────────────────────

async function scorePipelineHealth(yaml, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  const system = `You are a senior DevOps architect.
Score the ${metadata.displayName} configuration on four dimensions (0-100 each):
  speed        — parallelism, caching, dependency optimization, unnecessary sequential stages
  security     — secret handling, security scanning present, pinned images, least privilege
  reliability  — retry logic, artifacts, test coverage enforcement, timeout settings
  best_practice— DRY principles, image hygiene, modern syntax usage

Return ONLY raw JSON — no markdown fences:
{
  "overallScore": <0-100>,
  "grade": "<A-F>",
  "breakdown": {
    "speed":         { "score": <n>, "issues": ["..."], "tips": ["..."] },
    "security":      { "score": <n>, "issues": ["..."], "tips": ["..."] },
    "reliability":   { "score": <n>, "issues": ["..."], "tips": ["..."] },
    "best_practice": { "score": <n>, "issues": ["..."], "tips": ["..."] }
  },
  "topRecommendations": ["<highest impact fix 1>", "<2>", "<3>"]
}`;

  let text;
  try {
    text = await ask(system, yaml, {
      aiProvider: options.aiProvider,
      aiOptions: options.aiOptions,
      maxTokens: 2048,
    });
  } catch (err) {
    const fallback = buildHeuristicHealthReport(yaml, metadata.displayName);
    return {
      ...fallback,
      summary: `AI analysis unavailable, showing heuristic report for ${metadata.displayName}.`,
      warning: err.message,
    };
  }

  const parsed = parseJsonObjectFromText(text);
  return normalizeHealthReport(parsed, yaml, metadata.displayName);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Auto-Remediation Agent
// ─────────────────────────────────────────────────────────────────────────────

async function autoRemediatePipeline(yaml, failureAnalysis, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  const system = `You are a senior DevOps engineer performing automated pipeline remediation.
You are given a broken ${metadata.displayName} configuration and an AI failure analysis.
Fix all identified issues. Rules:
  - Preserve existing jobs unless they are the direct cause of the failure.
  - Each CI job runs in a fresh container: a job that runs project tooling
    (npm test, npm run <script>, npx, pytest, ...) must install dependencies
    itself (e.g. npm ci, pip install -r requirements.txt) before running them.
    A cache only speeds the install up; it does not replace it.
  - Add missing deps, fix scripts, add retry where appropriate.
  - NEVER downgrade a runtime or image version (node:20 must not become
    node:18). Pinning is only allowed to the same or a newer version.
  - Do not remove existing commands unless they are the direct cause of the failure.
  - Every changeLog entry must describe a change that is actually present in
    patchedYaml; do not list changes you did not make.
  - Annotate every changed line with: # FlowForge-fix: <reason>

Target platform: ${metadata.displayName}

Return ONLY raw JSON — no markdown fences:
{
  "patchedYaml": "<corrected ${metadata.fileName}>",
  "changeLog": [
    { "job": "<job name>", "change": "<what was fixed and why>" }
  ],
  "commitMessage": "<conventional-commits format: fix: ...>"
}`;

  const user = `Failure analysis:\n${JSON.stringify(failureAnalysis, null, 2)}\n\nOriginal configuration:\n${yaml}`;
  const text = await ask(system, user, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 4096,
  });

  // Models often wrap JSON in fences or prose; a bare JSON.parse would drop a
  // valid fix and silently return the original YAML.
  const parsed = parseJsonObjectFromText(text);
  if (parsed && typeof parsed.patchedYaml === 'string' && parsed.patchedYaml.trim()) {
    return parsed;
  }
  return {
    patchedYaml: yaml,
    changeLog: [],
    commitMessage: 'fix: auto-remediation by FlowForge',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Pipeline Chat Assistant
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeChatContextValue(value, maxLen = 200) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function extractLatestMessageText(messages, preferredRole = 'user') {
  if (!Array.isArray(messages)) return '';

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message.content !== 'string') continue;
    if (preferredRole && message.role !== preferredRole) continue;

    const content = message.content.trim();
    if (content) return content;
  }

  return preferredRole ? extractLatestMessageText(messages, '') : '';
}

const N8N_SAFE_AI_OPTION_KEYS = ['model', 'region', 'location', 'projectId'];

function sanitizeN8NAIOptions(aiOptions) {
  if (!aiOptions || typeof aiOptions !== 'object' || Array.isArray(aiOptions)) {
    return null;
  }

  // Allowlist, not a blocklist: new credential fields (AWS keys, service
  // account JSON, ...) must never reach the webhook just because nobody
  // remembered to block their names.
  const sanitized = {};

  for (const key of N8N_SAFE_AI_OPTION_KEYS) {
    const rawValue = aiOptions[key];
    if (typeof rawValue !== 'string' || !rawValue.trim()) continue;
    sanitized[key] = rawValue.trim().slice(0, 200);
  }

  // Base URLs can carry secrets in userinfo or the query string; keep the origin only.
  if (typeof aiOptions.baseUrl === 'string' && aiOptions.baseUrl.trim()) {
    try {
      sanitized.baseUrl = new URL(aiOptions.baseUrl.trim()).origin;
    } catch {
      // Malformed URLs are dropped.
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function buildN8NUserContext(messages, options = {}) {
  const rawContext =
    options.userContext && typeof options.userContext === 'object' ? options.userContext : {};

  // n8n uses these ids as memory/session keys, so they must not be guessable.
  const fallbackUserId = `anon-${crypto.randomUUID()}`;

  const userId = sanitizeChatContextValue(rawContext.userId, 120) || fallbackUserId;
  const username =
    sanitizeChatContextValue(rawContext.username, 120) || `flowforge-${userId.slice(-6)}`;

  const conversationId =
    sanitizeChatContextValue(rawContext.conversationId, 160) ||
    sanitizeChatContextValue(rawContext.chatId, 160) ||
    `${userId}-default`;

  const chatId = sanitizeChatContextValue(rawContext.chatId, 160) || conversationId;

  const text = extractLatestMessageText(messages, 'user') || extractLatestMessageText(messages, '');

  return {
    userId,
    username,
    chatId,
    conversationId,
    text,
  };
}

function buildN8NChatPayload(messages, currentYaml, options, cicdPlatform, metadata) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const yamlContext = typeof currentYaml === 'string' ? currentYaml : '';
  const userContext = buildN8NUserContext(safeMessages, options);

  return {
    text: userContext.text,
    input: userContext.text,
    userId: userContext.userId,
    username: userContext.username,
    chatId: userContext.chatId,
    conversationId: userContext.conversationId,
    currentYaml: yamlContext,
    yamlContext,
    messages: safeMessages,
    messageCount: safeMessages.length,
    aiProvider: options.aiProvider || null,
    aiOptions: sanitizeN8NAIOptions(options.aiOptions),
    cicdPlatform,
    platformDisplayName: metadata.displayName,
    source: 'flowforge-pipeline-chat',
    timestamp: new Date().toISOString(),
    userContext: {
      userId: userContext.userId,
      username: userContext.username,
      chatId: userContext.chatId,
      conversationId: userContext.conversationId,
    },
  };
}

function buildProductionWebhookUrl(webhookUrl) {
  if (typeof webhookUrl !== 'string') return null;
  if (!webhookUrl.includes('/webhook-test/')) return null;

  return webhookUrl.replace('/webhook-test/', '/webhook/');
}

async function postN8NChatPayload(webhookUrl, payload, requestConfig) {
  try {
    return await axios.post(webhookUrl, payload, requestConfig);
  } catch (err) {
    const status = err.response?.status;
    const productionUrl = buildProductionWebhookUrl(webhookUrl);

    if (status === 404 && productionUrl && productionUrl !== webhookUrl) {
      return axios.post(productionUrl, payload, requestConfig);
    }

    throw err;
  }
}

async function pipelineChat(messages, currentYaml, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  // The server's n8n webhook is opt-in per request (the user turned n8n on).
  // Otherwise chat goes straight to the selected AI provider: the server's
  // Groq key by default, or the user's own key/model from Settings.
  const n8nWebhookUrl = process.env.N8N_CHAT_WEBHOOK_URL;
  if (options.useN8n && n8nWebhookUrl) {
    const authHeader = process.env.N8N_WEBHOOK_AUTH_HEADER || 'X-FlowForge-Token';
    const authToken = process.env.N8N_WEBHOOK_AUTH_TOKEN;
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers[authHeader] = authToken;

    const payload = buildN8NChatPayload(messages, currentYaml, options, cicdPlatform, metadata);

    try {
      const { data } = await postN8NChatPayload(n8nWebhookUrl, payload, {
        headers,
        timeout: Number(process.env.N8N_CHAT_TIMEOUT_MS || 30000),
        maxRedirects: 0,
      });
      return extractN8NReply(data);
    } catch (err) {
      console.warn('[chat] n8n webhook failed, answering with the AI provider: %s', logSafe(err.message));
    }
  }

  const system = `You are FlowForge Assistant — an expert CI/CD engineer embedded inside the FlowForge visual pipeline builder.

You have full visibility of the user's current pipeline (shown below).
Help users understand, debug, optimize, and evolve their CI/CD configuration.
Be concise and precise. Always include runnable configuration or shell snippets when relevant.
If the user asks you to modify the pipeline, return the full corrected configuration inside a fenced code block.

Current platform: ${metadata.displayName}
Current pipeline:
\`\`\`yaml
${currentYaml || '# No pipeline loaded yet — drag nodes onto the canvas or use AI Generator.'}
\`\`\``;

  const provider = getProvider(options.aiProvider, options.aiOptions || {});
  try {
    return await provider.chat(system, messages, { maxTokens: 2048 });
  } catch (err) {
    const health = buildHeuristicHealthReport(currentYaml || '', metadata.displayName);
    const tips = health.topRecommendations.map((t) => `- ${t}`).join('\n');
    return `**FlowForge Assistant (Offline Diagnostic Mode)**\n\nI analyzed your **${metadata.displayName}** pipeline locally (Current Health Grade: **${health.grade}** — ${health.overallScore}/100).\n\n**Top actionable improvements for your pipeline:**\n${tips || '- Add parallel test stages and dependency caching.'}\n\n*Note: Live LLM chat encountered an issue (${err.message}). Check the AI provider and API key in **Settings**.*`;
  }
}

function extractN8NReply(data) {
  if (typeof data === 'string' && data.trim()) return data;
  if (Array.isArray(data) && data.length > 0) return extractN8NReply(data[0]);
  if (data && typeof data === 'object') {
    const keys = ['reply', 'response', 'message', 'output', 'text'];
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  throw new Error('n8n webhook did not return a valid chat response');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Platform-specific guidelines for AI prompts
// ─────────────────────────────────────────────────────────────────────────────

function getPlatformGuidelines(platform) {
  const guidelines = {
    gitlab: `
Guidelines for GitLab CI:
- Use 'stages:' to define pipeline stages
- Jobs use 'script:', 'image:', 'needs:', 'rules:'
- Use 'artifacts:' for passing data between jobs
- Use '$CI_*' variables for GitLab CI context`,

    github: `
Guidelines for GitHub Actions:
- Use 'on:' to define triggers (push, pull_request)
- Jobs run on 'runs-on:' runners (ubuntu-latest, etc.)
- Use 'steps:' with 'uses:' for actions and 'run:' for commands
- Use 'needs:' for job dependencies
- Use '\${{ secrets.* }}' for secrets`,

    jenkins: `
Guidelines for Jenkins Pipeline:
- Use declarative pipeline syntax with 'pipeline { }'
- Define 'agent any' or specific agents
- Use 'stages { }' containing 'stage() { steps { } }'
- Use 'sh' for shell commands
- Use 'environment { }' for environment variables`,

    circleci: `
Guidelines for CircleCI:
- Use 'version: 2.1'
- Define 'jobs:' with 'docker:' executors
- Use 'steps:' with 'checkout', 'run:', etc.
- Define 'workflows:' to orchestrate jobs
- Use 'requires:' for job dependencies`,

    bitbucket: `
Guidelines for Bitbucket Pipelines:
- Use 'image:' at the top level or per step
- Define 'pipelines:' with 'default:', 'branches:', or 'pull-requests:'
- Use '- step:' blocks containing 'name:', 'script:', 'caches:', and 'artifacts:'
- Use 'deployment:' for environment tracking and 'trigger: manual' for approval gates`,
  };

  return guidelines[platform] || '';
}

module.exports = {
  generatePipelineFromPrompt,
  explainPipelineFailure,
  convertPipelineConfig,
  convertJenkinsfile,
  scorePipelineHealth,
  autoRemediatePipeline,
  pipelineChat,
  parseConfigToDAG,
  // Exported for tests.
  sanitizeN8NAIOptions,
  buildN8NChatPayload,
};
