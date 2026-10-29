/**
 * Deterministic checks for the Live Runs simulator and AI fix review.
 *
 * The simulator evaluates the pipeline actually on the canvas instead of
 * failing a fixed node, so a correct fix makes the next run pass and a broken
 * one keeps failing for a reason that is shown in the job log.
 */

const NON_JOB_TYPES = new Set(['conditional']);

function isJobNode(node) {
  return node && !node.type?.startsWith('trigger_') && !NON_JOB_TYPES.has(node.type);
}

function scriptLines(node) {
  const script = node?.data?.config?.script;
  const text = Array.isArray(script) ? script.join('\n') : String(script || '');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// Each CI job starts in a fresh container, so project tooling only works if
// the same job installed dependencies first. Caches can be empty on a cold
// run, so they don't count as an install.
const TOOLCHAINS = [
  {
    name: 'node',
    needsDeps: /^(npm\s+(test|t|run|run-script)\b|npx\s|yarn\s+(test|run|lint|build)\b|pnpm\s+(test|run|lint|build)\b)/,
    installsDeps: /^(npm\s+(ci|install|i)\b(?!.*\s-g\b)|yarn(\s+install)?\s*$|pnpm\s+(i|install)\b)/,
    installHint: 'npm ci',
    failure: (cmd) => {
      const script = cmd.match(/^npm\s+run(?:-script)?\s+(\S+)/)?.[1] || (/^npm\s+t(est)?\b/.test(cmd) ? 'test' : null);
      return [
        `$ ${cmd}`,
        script ? `> ${script}` : null,
        'Error: Cannot find module: node_modules does not exist in this container',
        script ? `npm ERR! Lifecycle script "${script}" failed (exit code 127)` : 'npm ERR! code 127',
      ].filter(Boolean);
    },
  },
  {
    name: 'python',
    needsDeps: /^(pytest\b|python3?\s+-m\s+(pytest|ruff|black|mypy|flake8)\b|ruff\b|black\b|mypy\b|flake8\b)/,
    installsDeps: /^(pip3?\s+install\b|python3?\s+-m\s+pip\s+install\b|poetry\s+install\b|uv\s+(sync|pip\s+install)\b)/,
    installHint: 'pip install -r requirements.txt',
    failure: (cmd) => [
      `$ ${cmd}`,
      `/bin/sh: 1: ${cmd.split(/\s+/)[0]}: not found`,
      'ERROR: tool is not installed in this container (exit code 127)',
    ],
  },
];

/** Returns null if the job would pass, or { reason, log } if it fails. */
export function checkJob(node) {
  const lines = scriptLines(node);
  const installed = new Set();

  for (const cmd of lines) {
    for (const chain of TOOLCHAINS) {
      if (chain.installsDeps.test(cmd)) installed.add(chain.name);
    }
    for (const chain of TOOLCHAINS) {
      if (chain.needsDeps.test(cmd) && !installed.has(chain.name)) {
        const label = node.data?.label || node.type;
        return {
          reason: `"${cmd}" runs before any dependency install in this job`,
          log: [
            ...chain.failure(cmd),
            '',
            `FlowForge check: job "${label}" runs "${cmd}" but never installs dependencies.`,
            `Each CI job starts in a fresh container. Add "${chain.installHint}" before "${cmd}" in this job.`,
          ].join('\n'),
        };
      }
    }
  }

  return null;
}

/**
 * Job nodes with no script. The simulator can only check commands it can
 * see, so these pass without being verified.
 */
export function jobsWithoutScripts(nodes = []) {
  return nodes.filter((node) => isJobNode(node) && scriptLines(node).length === 0);
}

/** Nearest upstream job nodes, looking through triggers and conditionals. */
function jobParents(nodeId, nodesById, sourcesByTarget, seen = new Set()) {
  const parents = [];
  for (const sourceId of sourcesByTarget.get(nodeId) || []) {
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    const source = nodesById.get(sourceId);
    if (isJobNode(source)) parents.push(sourceId);
    else parents.push(...jobParents(sourceId, nodesById, sourcesByTarget, seen));
  }
  return parents;
}

/**
 * Simulates a run of the canvas pipeline.
 * Returns jobs in execution order: { node, status: passed|failed|skipped, log, reason }.
 */
export function simulatePipeline(nodes = [], edges = []) {
  const jobs = nodes.filter(isJobNode);
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const sourcesByTarget = new Map();
  for (const edge of edges) {
    if (!sourcesByTarget.has(edge.target)) sourcesByTarget.set(edge.target, []);
    sourcesByTarget.get(edge.target).push(edge.source);
  }

  const parentsOf = new Map(jobs.map((n) => [n.id, jobParents(n.id, nodesById, sourcesByTarget)]));

  // Kahn's algorithm; anything left over (a cycle) runs last in canvas order.
  const indegree = new Map(jobs.map((n) => [n.id, parentsOf.get(n.id).length]));
  const queue = jobs.filter((n) => indegree.get(n.id) === 0);
  const ordered = [];
  const done = new Set();
  while (queue.length > 0) {
    const node = queue.shift();
    if (done.has(node.id)) continue;
    done.add(node.id);
    ordered.push(node);
    for (const child of jobs) {
      if (parentsOf.get(child.id).includes(node.id)) {
        indegree.set(child.id, indegree.get(child.id) - 1);
        if (indegree.get(child.id) === 0) queue.push(child);
      }
    }
  }
  ordered.push(...jobs.filter((n) => !done.has(n.id)));

  const statusById = new Map();
  return ordered.map((node) => {
    const blocked = parentsOf
      .get(node.id)
      .some((id) => ['failed', 'skipped'].includes(statusById.get(id)));
    if (blocked) {
      statusById.set(node.id, 'skipped');
      return { node, status: 'skipped', log: 'Skipped: an upstream job did not succeed.' };
    }

    const failure = checkJob(node);
    const status = failure ? 'failed' : 'passed';
    statusById.set(node.id, status);
    return {
      node,
      status,
      reason: failure?.reason,
      log: failure ? failure.log : `$ ${scriptLines(node).join('\n$ ') || 'true'}\nJob succeeded (exit code 0).`,
    };
  });
}

// ─── AI fix review ───────────────────────────────────────────────────────────

/** Line diff (LCS). Returns [{ type: 'same'|'add'|'del', text }]. */
export function diffLines(before = '', after = '') {
  const a = String(before).split('\n');
  const b = String(after).split('\n');
  // Guard the O(n*m) table for very large configs.
  if (a.length * b.length > 400_000) {
    return [...a.map((text) => ({ type: 'del', text })), ...b.map((text) => ({ type: 'add', text }))];
  }

  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++] });
  while (j < b.length) out.push({ type: 'add', text: b[j++] });
  return out;
}

function parseVersion(tag) {
  const match = String(tag).match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : null;
}

function compareVersions(x, y) {
  for (let k = 0; k < 3; k += 1) {
    if (x[k] !== y[k]) return x[k] - y[k];
  }
  return 0;
}

// image: node:20-alpine · node-version: 18 · python-version: '3.12'
const VERSION_PATTERNS = [
  { regex: /\bimage:\s*['"]?([\w./-]+):([\w.-]+)/g, name: (m) => m[1], tag: (m) => m[2] },
  { regex: /\b(node|python|java|go)-version:\s*['"]?([\w.]+)/g, name: (m) => m[1], tag: (m) => m[2] },
];

function collectVersions(yaml) {
  const versions = new Map();
  for (const pattern of VERSION_PATTERNS) {
    for (const match of String(yaml).matchAll(pattern.regex)) {
      const version = parseVersion(pattern.tag(match));
      if (!version) continue;
      const name = pattern.name(match);
      if (!versions.has(name)) versions.set(name, []);
      versions.get(name).push({ version, tag: pattern.tag(match) });
    }
  }
  return versions;
}

function commandOf(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const run = trimmed.match(/^-?\s*run:\s*(.+)$/);
  if (run) return run[1].trim();
  const item = trimmed.match(/^-\s+(.+)$/);
  if (item && !/^[\w-]+:(\s|$)/.test(item[1])) return item[1].replace(/\s+#.*$/, '').trim();
  return null;
}

/**
 * Reviews an AI-proposed fix. Returns { diff, warnings, changed } where
 * warnings flag version downgrades and removed commands.
 */
export function reviewFix(beforeYaml = '', afterYaml = '') {
  const diff = diffLines(beforeYaml, afterYaml);
  const changed = diff.some((d) => d.type !== 'same');
  const warnings = [];

  const before = collectVersions(beforeYaml);
  const after = collectVersions(afterYaml);
  for (const [name, afterList] of after) {
    const beforeList = before.get(name);
    if (!beforeList) continue;
    const oldest = beforeList.reduce((lo, v) => (compareVersions(v.version, lo.version) < 0 ? v : lo));
    for (const v of afterList) {
      if (compareVersions(v.version, oldest.version) < 0) {
        warnings.push(`Downgrades ${name} from ${oldest.tag} to ${v.tag}`);
        break;
      }
    }
  }

  const afterCommands = new Set(
    String(afterYaml).split('\n').map(commandOf).filter(Boolean)
  );
  const removed = new Set();
  for (const line of diff) {
    if (line.type !== 'del') continue;
    const cmd = commandOf(line.text);
    if (cmd && !afterCommands.has(cmd)) removed.add(cmd);
  }
  for (const cmd of removed) warnings.push(`Removes command: ${cmd}`);

  return { diff, warnings, changed };
}
