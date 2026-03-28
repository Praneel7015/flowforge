/**
 * AI Service - Platform-agnostic AI operations for CI/CD
 * Uses the AI provider factory to support multiple AI backends.
 */
const { getAIProvider } = require('../providers/ai');
const { getCICDGenerator } = require('../providers/cicd');
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

const SUPPORTED_CICD_PLATFORMS = ['gitlab', 'github', 'jenkins', 'circleci'];

const PLATFORM_DISPLAY_NAMES = {
  gitlab: 'GitLab CI',
  github: 'GitHub Actions',
  jenkins: 'Jenkins Pipeline',
  circleci: 'CircleCI',
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

function extractJobNamesFromConfig(configText, cicdPlatform) {
  if (!configText || typeof configText !== 'string') {
    return [];
  }

  if (cicdPlatform === 'jenkins') {
    const jobs = [];
    const stageRegex = /stage\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match = stageRegex.exec(configText);
    while (match) {
      jobs.push(match[1]);
      match = stageRegex.exec(configText);
    }
    return jobs;
  }

  let document = null;
  try {
    document = yaml.load(configText);
  } catch {
    return [];
  }

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return [];
  }

  if ((cicdPlatform === 'github' || cicdPlatform === 'circleci') && document.jobs) {
    const jobs = Object.keys(document.jobs || {});
    return jobs.filter((jobName) => jobName && !jobName.startsWith('.'));
  }

  const reservedTopLevel = new Set([
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
    'name',
    'on',
    'env',
    'version',
    'executors',
    'workflows',
  ]);

  return Object.keys(document).filter((key) => {
    if (!key || key.startsWith('.')) return false;
    if (reservedTopLevel.has(key)) return false;

    const value = document[key];
    return value && typeof value === 'object' && !Array.isArray(value);
  });
}

function buildFallbackWorkflow(configText, cicdPlatform) {
  const supportedNodeTypes = getSupportedNodeTypes();
  const jobNames = extractJobNamesFromConfig(configText, cicdPlatform);
  const robustFallbackSequence = [
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
  ].filter((type) => supportedNodeTypes.includes(type));

  const inferredJobs =
    jobNames.length > 0
      ? jobNames
      : robustFallbackSequence.length > 0
        ? robustFallbackSequence
        : ['build', 'test', 'deploy'];

  const nodes = [
    {
      id: 'node_1',
      type: supportedNodeTypes.includes('trigger_push') ? 'trigger_push' : supportedNodeTypes[0],
      position: { x: 220, y: 80 },
      data: { label: 'Git Push Trigger', config: {} },
    },
  ];

  let previousId = 'node_1';
  const edges = [];

  inferredJobs.forEach((jobName, index) => {
    const nodeId = `node_${index + 2}`;
    const type = supportedNodeTypes.includes(jobName)
      ? jobName
      : classifyNodeType(jobName, supportedNodeTypes);

    nodes.push({
      id: nodeId,
      type,
      position: {
        x: 220 + (index % 2) * 280,
        y: 220 + index * 130,
      },
      data: {
        label: humanizeLabel(jobName),
        config: {},
      },
    });

    edges.push({
      id: `e_${previousId}_${nodeId}`,
      source: previousId,
      target: nodeId,
      animated: true,
    });

    previousId = nodeId;
  });

  return { nodes, edges };
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
      const fallback = buildFallbackWorkflow(yamlText, cicdPlatform);
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
  const fallback = buildFallbackWorkflow(yamlText, cicdPlatform);

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
// 1. AI Pipeline Generator (Platform-Agnostic)
// ─────────────────────────────────────────────────────────────────────────────

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

  const text = await ask(system, prompt, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 4096,
  });

  return parsePipelineResult(text, cicdPlatform);
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

  try {
    return JSON.parse(text);
  } catch {
    return {
      summary: text,
      explanation: text,
      rootCause: 'Unknown',
      suggestedFixes: [],
      hasSecurityIssue: false,
    };
  }
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

  const text = await ask(system, userMessage, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 4096,
  });

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
  - Add missing deps, fix scripts, pin unstable images, add retry where appropriate.
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

  try {
    return JSON.parse(text);
  } catch {
    return {
      patchedYaml: yaml,
      changeLog: [],
      commitMessage: 'fix: auto-remediation by FlowForge',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Pipeline Chat Assistant
// ─────────────────────────────────────────────────────────────────────────────

async function pipelineChat(messages, currentYaml, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  const n8nWebhookUrl = process.env.N8N_CHAT_WEBHOOK_URL;
  if (n8nWebhookUrl) {
    const authHeader = process.env.N8N_WEBHOOK_AUTH_HEADER || 'X-FlowForge-Token';
    const authToken = process.env.N8N_WEBHOOK_AUTH_TOKEN;
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers[authHeader] = authToken;

    const payload = {
      messages,
      currentYaml,
      aiProvider: options.aiProvider || null,
      aiOptions: options.aiOptions || null,
      cicdPlatform,
      platformDisplayName: metadata.displayName,
      source: 'flowforge-pipeline-chat',
      timestamp: new Date().toISOString(),
    };

    const { data } = await axios.post(n8nWebhookUrl, payload, {
      headers,
      timeout: Number(process.env.N8N_CHAT_TIMEOUT_MS || 30000),
    });

    return extractN8NReply(data);
  }

  // Fallback keeps local development unblocked if n8n is not configured yet.
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
  return provider.chat(system, messages, { maxTokens: 2048 });
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
};
