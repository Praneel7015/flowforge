import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';

import TriggerNode from './nodes/TriggerNode';
import StageNode from './nodes/StageNode';
import ConditionalNode from './nodes/ConditionalNode';
import NodeConfigPanel from './NodeConfigPanel';
import { saveCurrentAsTemplate, BUILT_IN_TEMPLATES } from '../components/NodeTemplates';
import { buildBlueprintShareUrl, readBlueprintFromLocationHash } from '../utils/blueprintShare';

const nodeTypes = {
  trigger_push: TriggerNode,
  trigger_mr: TriggerNode,
  build: StageNode,
  matrix_build: StageNode,
  lint: StageNode,
  test: StageNode,
  integration_test: StageNode,
  smoke_test: StageNode,
  cache_restore: StageNode,
  cache_save: StageNode,
  security_scan: StageNode,
  package: StageNode,
  release: StageNode,
  approval_gate: StageNode,
  deploy: StageNode,
  canary_deploy: StageNode,
  blue_green_deploy: StageNode,
  rollback: StageNode,
  notify: StageNode,
  conditional: ConditionalNode,
};

const defaultNodes = [];
const defaultEdges = [];
const HISTORY_LIMIT = 80;
const STORAGE_KEY = 'flowforge.workflow.builder.v1';

let nodeId = 0;
const getNextId = () => `node_${++nodeId}`;

const cloneWorkflow = (workflow) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(workflow);
  }

  return JSON.parse(JSON.stringify(workflow));
};

const normalizeWorkflow = (workflow) => ({
  nodes: Array.isArray(workflow?.nodes) ? workflow.nodes : [],
  edges: Array.isArray(workflow?.edges) ? workflow.edges : [],
});

const getMaxNodeId = (nodes) =>
  nodes.reduce((maxId, node) => {
    const parsed = Number.parseInt(String(node.id).replace('node_', ''), 10);
    return Number.isNaN(parsed) ? maxId : Math.max(maxId, parsed);
  }, 0);

const isEditableTarget = (target) => {
  const tag = target?.tagName?.toLowerCase();
  return target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
};

const parseDimension = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getNodeBounds = (node) => {
  const x = Number(node?.position?.x) || 0;
  const y = Number(node?.position?.y) || 0;
  const width = parseDimension(node?.width ?? node?.measured?.width ?? node?.style?.width, 180);
  const height = parseDimension(node?.height ?? node?.measured?.height ?? node?.style?.height, 72);

  return {
    minX: x,
    minY: y,
    maxX: x + width,
    maxY: y + height,
  };
};

const createInitialEditorState = () => {
  if (typeof window === 'undefined') {
    return {
      past: [],
      present: { nodes: defaultNodes, edges: defaultEdges },
      future: [],
    };
  }

  try {
    const sharedBlueprint = readBlueprintFromLocationHash();
    if (sharedBlueprint && Array.isArray(sharedBlueprint.nodes) && sharedBlueprint.nodes.length > 0) {
      const normalized = normalizeWorkflow(sharedBlueprint);
      nodeId = Math.max(nodeId, getMaxNodeId(normalized.nodes));
      return {
        past: [],
        present: normalized,
        future: [],
      };
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        past: [],
        present: { nodes: defaultNodes, edges: defaultEdges },
        future: [],
      };
    }

    const persisted = normalizeWorkflow(JSON.parse(raw));
    nodeId = Math.max(nodeId, getMaxNodeId(persisted.nodes));

    return {
      past: [],
      present: persisted,
      future: [],
    };
  } catch {
    return {
      past: [],
      present: { nodes: defaultNodes, edges: defaultEdges },
      future: [],
    };
  }
};

const AUTO_SYNC_STORAGE_KEY = 'flowforge.workflow.autosync.v1';

const readAutoSyncPreference = () => {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(AUTO_SYNC_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

const DEFAULT_NODE_CONFIGS = {
  trigger_push: { branch: 'main' },
  trigger_mr: { targetBranch: 'main' },
  build: { image: 'node:20-alpine', stage: 'build', script: 'npm ci\nnpm run build' },
  matrix_build: {
    image: 'node:20-alpine',
    stage: 'build',
    matrix: '{"NODE_VERSION":["18","20"]}',
    script: 'npm ci\nnpm test',
  },
  lint: { image: 'node:20-alpine', stage: 'test', script: 'npm run lint' },
  test: { image: 'node:20-alpine', stage: 'test', script: 'npm test -- --ci' },
  integration_test: { image: 'node:20-alpine', stage: 'test', script: 'npm run test:integration' },
  smoke_test: { image: 'node:20-alpine', stage: 'test', script: 'curl -f http://localhost:3000/health || exit 1' },
  cache_restore: {
    image: 'node:20-alpine',
    stage: 'build',
    cacheKey: 'deps-$CI_COMMIT_REF_SLUG',
    cachePaths: 'node_modules/',
    script: 'echo "Restoring dependency cache..."',
  },
  cache_save: {
    image: 'node:20-alpine',
    stage: 'build',
    cacheKey: 'deps-$CI_COMMIT_REF_SLUG',
    cachePaths: 'node_modules/',
    script: 'echo "Saving dependency cache..."',
  },
  security_scan: {
    image: 'node:20-alpine',
    stage: 'test',
    script: 'npm audit --audit-level=high',
  },
  package: {
    image: 'node:20-alpine',
    stage: 'build',
    artifactPath: 'dist/',
    script: 'npm run build && tar -czf release.tar.gz dist/',
  },
  release: {
    image: 'node:20-alpine',
    stage: 'deploy',
    tag: 'v1.0.0',
    script: 'echo "Publishing release $TAG..."',
  },
  approval_gate: {
    stage: 'deploy',
    environment: 'production',
    approver: 'release-managers',
    script: 'echo "Waiting for manual approval..."',
  },
  deploy: {
    image: 'node:20-alpine',
    stage: 'deploy',
    environment: 'production',
    script: 'echo "Deploying application to production..."',
  },
  canary_deploy: {
    image: 'node:20-alpine',
    stage: 'deploy',
    environment: 'production',
    trafficPercent: '10',
    script: 'echo "Rolling out 10% canary traffic..."',
  },
  blue_green_deploy: {
    image: 'node:20-alpine',
    stage: 'deploy',
    environment: 'production',
    activeColor: 'green',
    script: 'echo "Switching active production stack to green..."',
  },
  rollback: {
    image: 'node:20-alpine',
    stage: 'deploy',
    environment: 'production',
    script: 'echo "Rolling back to previous stable release..."',
  },
  notify: {
    stage: '.post',
    channel: '#deployments',
    script: 'echo "Notifying #deployments channel of pipeline status"',
  },
  conditional: {
    condition: '$CI_COMMIT_BRANCH == "main"',
  },
};

function getDefaultNodeConfig(type) {
  return { ...(DEFAULT_NODE_CONFIGS[type] || { stage: 'build', script: `echo "Running ${type}"` }) };
}

// Local, offline-safe fallback used when the backend export endpoint is
// unreachable so the live YAML panel still reflects the current graph.
const buildLocalYaml = (nodeList, edgeList = [], platform = 'gitlab') => {
  const stageSet = new Set();
  const stageNodes = nodeList.filter(
    (n) => !n.type?.startsWith('trigger_') && n.type !== 'conditional'
  );
  stageNodes.forEach((n) => stageSet.add(n.data?.config?.stage || 'build'));
  const stages = stageSet.size > 0 ? [...stageSet] : ['build', 'test', 'deploy'];

  const idToJobName = {};
  const usedNames = new Set();
  stageNodes.forEach((n) => {
    const base =
      (n.data?.label || n.type || n.id)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '') || n.id;
    let candidate = base;
    let idx = 2;
    while (usedNames.has(candidate)) {
      candidate = `${base}_${idx++}`;
    }
    usedNames.add(candidate);
    idToJobName[n.id] = candidate;
  });

  if (platform === 'github') {
    const lines = ['name: CI/CD Pipeline', 'on:', '  push:', '    branches: ["main"]', 'jobs:'];
    stageNodes.forEach((node) => {
      const jobName = idToJobName[node.id];
      const cfg = node.data?.config || {};
      const scriptLines = String(cfg.script || `echo "Running ${node.data?.label || jobName}"`)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const parentJobs = edgeList
        .filter((e) => e.target === node.id && idToJobName[e.source])
        .map((e) => idToJobName[e.source]);

      lines.push(`  ${jobName}:`);
      lines.push(`    runs-on: ${cfg.runsOn || 'ubuntu-latest'}`);
      if (cfg.image) lines.push(`    container: ${cfg.image}`);
      if (parentJobs.length > 0) {
        lines.push(`    needs: [${parentJobs.map((p) => `"${p}"`).join(', ')}]`);
      }
      if (cfg.environment) lines.push(`    environment: ${cfg.environment}`);
      lines.push('    steps:');
      lines.push('      - uses: actions/checkout@v4');
      scriptLines.forEach((cmd) => {
        lines.push(`      - name: ${node.data?.label || jobName}`);
        lines.push(`        run: ${cmd}`);
      });
    });
    return lines.join('\n');
  }

  const yamlLines = ['stages:', ...stages.map((s) => `  - ${s}`), ''];
  stageNodes.forEach((node) => {
    const jobName = idToJobName[node.id];
    const cfg = node.data?.config || {};
    const scriptLines = String(cfg.script || `echo "Running ${node.data?.label || jobName}"`)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const parentJobs = edgeList
      .filter((e) => e.target === node.id && idToJobName[e.source])
      .map((e) => idToJobName[e.source]);

    yamlLines.push(`${jobName}:`);
    yamlLines.push(`  stage: ${cfg.stage || 'build'}`);
    if (cfg.image) yamlLines.push(`  image: ${cfg.image}`);
    if (parentJobs.length > 0) {
      yamlLines.push(`  needs: [${parentJobs.join(', ')}]`);
    }
    if (cfg.environment) {
      yamlLines.push(`  environment: ${cfg.environment}`);
    }
    yamlLines.push('  script:');
    scriptLines.forEach((cmd) => {
      yamlLines.push(`    - ${cmd}`);
    });
    yamlLines.push('');
  });
  return yamlLines.join('\n');
};

function resolveNodeRunOverlay(node, nodeRunStatuses) {
  if (!nodeRunStatuses || typeof nodeRunStatuses !== 'object') {
    return null;
  }

  // Direct match by node.id
  if (nodeRunStatuses[node.id]) {
    const entry = nodeRunStatuses[node.id];
    return typeof entry === 'string' ? { runStatus: entry } : entry;
  }

  const normalizeKey = (val) =>
    String(val || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const candidates = [
    normalizeKey(node.id),
    normalizeKey(node.data?.label),
    normalizeKey(node.type),
    normalizeKey(node.data?.config?.stage),
  ].filter(Boolean);

  for (const [key, val] of Object.entries(nodeRunStatuses)) {
    const normKey = normalizeKey(key);
    if (normKey && candidates.some((c) => c === normKey || c.includes(normKey) || normKey.includes(c))) {
      return typeof val === 'string' ? { runStatus: val } : val;
    }
  }

  return null;
}

function WorkflowEditorInner({
  onYamlExport,
  importedWorkflow,
  onImportedWorkflowApplied,
  onRegisterAddNode,
  cicdPlatform,
  onOpenImport,
  onPlatformDetected,
  nodeRunStatuses,
  onGraphChange,
}) {
  const reactFlowWrapper = useRef(null);
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [configNodeId, setConfigNodeId] = useState(null);
  const [rightDragSelection, setRightDragSelection] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedEdgeIds, setSelectedEdgeIds] = useState(new Set());
  const [autoSync, setAutoSync] = useState(readAutoSyncPreference);
  const [syncState, setSyncState] = useState('idle'); // idle | syncing | synced | error
  const [shareCopied, setShareCopied] = useState(false);
  const [blueprintToast, setBlueprintToast] = useState('');
  const importFileInputRef = useRef(null);
  const { nodes, edges } = editorState.present;
  const canUndo = editorState.past.length > 0;
  const canRedo = editorState.future.length > 0;

  // Keep latest graph in refs so the debounced sync effect can read current
  // values without depending on identity that changes on every drag frame.
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Signature of only YAML-relevant structure (node identity/type/config + wiring),
  // so position/selection changes during a drag don't trigger re-exports.
  const graphSignature = useMemo(
    () =>
      JSON.stringify({
        n: nodes.map((node) => [node.id, node.type, node.data?.label, node.data?.config]),
        e: edges.map((edge) => [edge.source, edge.target]),
      }),
    [nodes, edges]
  );
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === configNodeId) || null,
    [nodes, configNodeId]
  );
  const selectionOverlay = useMemo(() => {
    if (!rightDragSelection || !reactFlowWrapper.current) {
      return null;
    }

    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const startX = rightDragSelection.startClientX - bounds.left;
    const startY = rightDragSelection.startClientY - bounds.top;
    const endX = rightDragSelection.currentClientX - bounds.left;
    const endY = rightDragSelection.currentClientY - bounds.top;

    const left = Math.max(0, Math.min(startX, endX));
    const top = Math.max(0, Math.min(startY, endY));
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    return { left, top, width, height };
  }, [rightDragSelection]);

  const applyTrackedWorkflowChange = useCallback((updater) => {
    setEditorState((current) => {
      const nextPresent = normalizeWorkflow(
        typeof updater === 'function' ? updater(current.present) : updater
      );

      if (nextPresent === current.present) {
        return current;
      }

      const nextPast = [...current.past, cloneWorkflow(current.present)];
      if (nextPast.length > HISTORY_LIMIT) {
        nextPast.shift();
      }

      return {
        past: nextPast,
        present: nextPresent,
        future: [],
      };
    });
  }, []);

  const applyUntrackedWorkflowChange = useCallback((updater) => {
    setEditorState((current) => {
      const nextPresent = normalizeWorkflow(
        typeof updater === 'function' ? updater(current.present) : updater
      );

      if (nextPresent === current.present) {
        return current;
      }

      return {
        ...current,
        present: nextPresent,
      };
    });
  }, []);

  const pushHistorySnapshot = useCallback(() => {
    setEditorState((current) => {
      const nextPast = [...current.past, cloneWorkflow(current.present)];
      if (nextPast.length > HISTORY_LIMIT) {
        nextPast.shift();
      }

      return {
        ...current,
        past: nextPast,
        future: [],
      };
    });
  }, []);

  const finalizeRightDragSelection = useCallback(
    (endClientX, endClientY) => {
      if (!rightDragSelection || !reactFlowInstance) {
        setRightDragSelection(null);
        return;
      }

      const minClientX = Math.min(rightDragSelection.startClientX, endClientX);
      const minClientY = Math.min(rightDragSelection.startClientY, endClientY);
      const maxClientX = Math.max(rightDragSelection.startClientX, endClientX);
      const maxClientY = Math.max(rightDragSelection.startClientY, endClientY);

      const minDragDistance = 6;
      if (
        Math.abs(maxClientX - minClientX) < minDragDistance &&
        Math.abs(maxClientY - minClientY) < minDragDistance
      ) {
        setRightDragSelection(null);
        return;
      }

      const startFlow = reactFlowInstance.screenToFlowPosition({ x: minClientX, y: minClientY });
      const endFlow = reactFlowInstance.screenToFlowPosition({ x: maxClientX, y: maxClientY });

      const flowMinX = Math.min(startFlow.x, endFlow.x);
      const flowMinY = Math.min(startFlow.y, endFlow.y);
      const flowMaxX = Math.max(startFlow.x, endFlow.x);
      const flowMaxY = Math.max(startFlow.y, endFlow.y);

      applyUntrackedWorkflowChange((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          const bounds = getNodeBounds(node);
          const intersects =
            bounds.maxX >= flowMinX &&
            bounds.minX <= flowMaxX &&
            bounds.maxY >= flowMinY &&
            bounds.minY <= flowMaxY;

          return { ...node, selected: intersects };
        }),
      }));

      setSelectedNodeId(null);
      setConfigNodeId(null);
      setRightDragSelection(null);
    },
    [applyUntrackedWorkflowChange, reactFlowInstance, rightDragSelection]
  );

  const handleUndo = useCallback(() => {
    setEditorState((current) => {
      if (!current.past.length) {
        return current;
      }

      const previous = current.past[current.past.length - 1];
      const nextFuture = [cloneWorkflow(current.present), ...current.future];
      if (nextFuture.length > HISTORY_LIMIT) {
        nextFuture.pop();
      }

      return {
        past: current.past.slice(0, -1),
        present: cloneWorkflow(previous),
        future: nextFuture,
      };
    });
    setConfigNodeId(null);
  }, []);

  const handleRedo = useCallback(() => {
    setEditorState((current) => {
      if (!current.future.length) {
        return current;
      }

      const [next, ...futureRest] = current.future;
      const nextPast = [...current.past, cloneWorkflow(current.present)];
      if (nextPast.length > HISTORY_LIMIT) {
        nextPast.shift();
      }

      return {
        past: nextPast,
        present: cloneWorkflow(next),
        future: futureRest,
      };
    });
    setConfigNodeId(null);
  }, []);

  // Import workflow from AI generator or Jenkins converter
  useEffect(() => {
    if (!importedWorkflow || !Array.isArray(importedWorkflow.nodes)) {
      return;
    }

    const normalized = normalizeWorkflow(importedWorkflow);
    nodeId = Math.max(nodeId, getMaxNodeId(normalized.nodes));
    setEditorState({
      past: [],
      present: cloneWorkflow(normalized),
      future: [],
    });
    setSelectedNodeId(null);
    setConfigNodeId(null);
    onImportedWorkflowApplied?.();
  }, [importedWorkflow, onImportedWorkflowApplied]);

  useEffect(() => {
    nodeId = Math.max(nodeId, getMaxNodeId(nodes));
    onGraphChange?.({ nodes, edges });
  }, [nodes, edges, onGraphChange]);

  // Check #blueprint=<base64url> on initial mount and on hashchange
  useEffect(() => {
    const applyHashBlueprint = () => {
      const shared = readBlueprintFromLocationHash();
      if (!shared || !Array.isArray(shared.nodes) || shared.nodes.length === 0) return;

      const normalized = normalizeWorkflow(shared);
      nodeId = Math.max(nodeId, getMaxNodeId(normalized.nodes));
      setEditorState({
        past: [],
        present: cloneWorkflow(normalized),
        future: [],
      });
      if (shared.cicdPlatform) {
        onPlatformDetected?.(shared.cicdPlatform);
      }
      setBlueprintToast(`Shared blueprint loaded (${normalized.nodes.length} nodes)`);
      const timer = setTimeout(() => setBlueprintToast(''), 4000);
      return () => clearTimeout(timer);
    };

    const cleanup = applyHashBlueprint();
    window.addEventListener('hashchange', applyHashBlueprint);
    return () => {
      if (typeof cleanup === 'function') cleanup();
      window.removeEventListener('hashchange', applyHashBlueprint);
    };
  }, [onPlatformDetected]);

  const handleShareBlueprint = useCallback(() => {
    if (nodes.length === 0) return;
    const shareUrl = buildBlueprintShareUrl({ nodes, edges, cicdPlatform });
    try {
      window.history.replaceState(null, '', `#blueprint=${shareUrl.split('#blueprint=')[1] || ''}`);
    } catch {
      // Ignore history replace errors
    }
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2200);
  }, [nodes, edges, cicdPlatform]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(editorState.present));
    } catch {
      // Ignore storage write issues.
    }
  }, [editorState.present]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }

    if (configNodeId && !nodes.some((node) => node.id === configNodeId)) {
      setConfigNodeId(null);
    }
  }, [nodes, selectedNodeId, configNodeId]);

  useEffect(() => {
    if (!rightDragSelection) {
      return;
    }

    const handleWindowMouseMove = (event) => {
      setRightDragSelection((current) => {
        if (!current) {
          return null;
        }

        return {
          ...current,
          currentClientX: event.clientX,
          currentClientY: event.clientY,
        };
      });
    };

    const handleWindowMouseUp = (event) => {
      event.preventDefault();
      finalizeRightDragSelection(event.clientX, event.clientY);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [finalizeRightDragSelection, rightDragSelection]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const cmdOrCtrl = event.ctrlKey || event.metaKey;

      if (cmdOrCtrl && !event.shiftKey && key === 'z') {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (cmdOrCtrl && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault();
        handleRedo();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeIds.size > 0) {
        event.preventDefault();
        const edgeIdsToRemove = new Set(selectedEdgeIds);

        applyTrackedWorkflowChange((current) => ({
          ...current,
          edges: current.edges.filter((edge) => !edgeIdsToRemove.has(edge.id)),
        }));

        setSelectedEdgeIds(new Set());
        return;
      }

      const boxSelectedNodeIds = nodes.filter((node) => node.selected).map((node) => node.id);
      const nodeIdsToDelete = Array.from(
        new Set([selectedNodeId, configNodeId, ...boxSelectedNodeIds].filter(Boolean))
      );

      if ((event.key === 'Delete' || event.key === 'Backspace') && nodeIdsToDelete.length > 0) {
        event.preventDefault();
        const targetNodeIdSet = new Set(nodeIdsToDelete);

        applyTrackedWorkflowChange((current) => {
          if (!current.nodes.some((node) => targetNodeIdSet.has(node.id))) {
            return current;
          }

          return {
            nodes: current.nodes.filter((node) => !targetNodeIdSet.has(node.id)),
            edges: current.edges.filter(
              (edge) => !targetNodeIdSet.has(edge.source) && !targetNodeIdSet.has(edge.target)
            ),
          };
        });

        setSelectedNodeId(null);
        setConfigNodeId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    applyTrackedWorkflowChange,
    configNodeId,
    handleRedo,
    handleUndo,
    nodes,
    selectedEdgeIds,
    selectedNodeId,
  ]);

  const onNodesChange = useCallback(
    (changes) => {
      applyUntrackedWorkflowChange((current) => ({
        ...current,
        nodes: applyNodeChanges(changes, current.nodes),
      }));
    },
    [applyUntrackedWorkflowChange]
  );

  const onEdgesChange = useCallback(
    (changes) => {
      applyUntrackedWorkflowChange((current) => ({
        ...current,
        edges: applyEdgeChanges(changes, current.edges),
      }));
    },
    [applyUntrackedWorkflowChange]
  );

  const onConnect = useCallback(
    (params) => {
      applyTrackedWorkflowChange((current) => ({
        ...current,
        edges: addEdge({ ...params, animated: true }, current.edges),
      }));
    },
    [applyTrackedWorkflowChange]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type');
      const label = event.dataTransfer.getData('application/reactflow-label');
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: getNextId(),
        type,
        position,
        data: { label, config: getDefaultNodeConfig(type) },
      };

      applyTrackedWorkflowChange((current) => ({
        ...current,
        nodes: current.nodes.concat(newNode),
      }));
      setSelectedNodeId(newNode.id);
      setConfigNodeId(newNode.id);
    },
    [applyTrackedWorkflowChange, reactFlowInstance]
  );

  const addNodeFromKeyboard = useCallback(
    (type, label) => {
      const offset = (nodes.length % 8) * 32;
      const newNode = {
        id: getNextId(),
        type,
        position: { x: 240 + offset, y: 100 + offset },
        data: { label, config: getDefaultNodeConfig(type) },
      };

      applyTrackedWorkflowChange((current) => ({
        ...current,
        nodes: current.nodes.concat(newNode),
      }));
      setSelectedNodeId(newNode.id);
      setConfigNodeId(newNode.id);
    },
    [applyTrackedWorkflowChange, nodes.length]
  );

  useEffect(() => {
    onRegisterAddNode?.(addNodeFromKeyboard);
  }, [addNodeFromKeyboard, onRegisterAddNode]);

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNodeId(node.id);
    setConfigNodeId(node.id);
    setSelectedEdgeIds(new Set());
  }, []);

  const onEdgeClick = useCallback((_event, edge) => {
    setSelectedNodeId(null);
    setConfigNodeId(null);
    setSelectedEdgeIds((prev) => {
      const next = new Set();
      if (!prev.has(edge.id)) {
        next.add(edge.id);
      }
      return next;
    });
  }, []);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setSelectedNodeId(node.id);
    setConfigNodeId(node.id);
  }, []);

  const onWrapperMouseDown = useCallback((event) => {
    if (event.button !== 2) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const isOnNode = Boolean(target.closest('.react-flow__node'));
    const isOnPane = Boolean(target.closest('.react-flow__pane'));
    if (!isOnPane || isOnNode) {
      return;
    }

    event.preventDefault();

    setSelectedNodeId(null);
    setConfigNodeId(null);
    setRightDragSelection({
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
    });
  }, []);

  const onWrapperContextMenu = useCallback((event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const isOnPane = Boolean(target.closest('.react-flow__pane'));
    const isOnNode = Boolean(target.closest('.react-flow__node'));

    if (isOnPane && !isOnNode) {
      event.preventDefault();
    }
  }, []);

  const onNodeDragStart = useCallback(() => {
    pushHistorySnapshot();
  }, [pushHistorySnapshot]);

  const handleDeleteSelectedNode = useCallback(() => {
    const boxSelectedNodeIds = nodes.filter((node) => node.selected).map((node) => node.id);
    const nodeIdsToDelete = Array.from(
      new Set([selectedNodeId, configNodeId, ...boxSelectedNodeIds].filter(Boolean))
    );

    if (!nodeIdsToDelete.length) {
      return;
    }

    const targetNodeIdSet = new Set(nodeIdsToDelete);

    applyTrackedWorkflowChange((current) => {
      if (!current.nodes.some((node) => targetNodeIdSet.has(node.id))) {
        return current;
      }

      return {
        nodes: current.nodes.filter((node) => !targetNodeIdSet.has(node.id)),
        edges: current.edges.filter(
          (edge) => !targetNodeIdSet.has(edge.source) && !targetNodeIdSet.has(edge.target)
        ),
      };
    });

    setSelectedNodeId(null);
    setConfigNodeId(null);
  }, [applyTrackedWorkflowChange, configNodeId, nodes, selectedNodeId]);

  const handleDeleteNodeById = useCallback(
    (targetNodeId) => {
      if (!targetNodeId) {
        return;
      }

      applyTrackedWorkflowChange((current) => {
        if (!current.nodes.some((node) => node.id === targetNodeId)) {
          return current;
        }

        return {
          nodes: current.nodes.filter((node) => node.id !== targetNodeId),
          edges: current.edges.filter(
            (edge) => edge.source !== targetNodeId && edge.target !== targetNodeId
          ),
        };
      });
      setSelectedNodeId(null);
      setConfigNodeId(null);
    },
    [applyTrackedWorkflowChange]
  );

  const onPaneClick = useCallback(() => {
    applyUntrackedWorkflowChange((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
    }));

    setSelectedNodeId(null);
    setConfigNodeId(null);
    setSelectedEdgeIds(new Set());
  }, [applyUntrackedWorkflowChange]);

  const handleNodeInlineUpdate = useCallback(
    (targetNodeId, patch) => {
      applyTrackedWorkflowChange((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === targetNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...(typeof patch.label === 'string' && patch.label ? { label: patch.label } : {}),
                  ...(patch.config ? { config: patch.config } : {}),
                },
              }
            : node
        ),
      }));
    },
    [applyTrackedWorkflowChange]
  );

  const handleNodeLiveConfigUpdate = useCallback(
    (targetNodeId, config, label) => {
      applyUntrackedWorkflowChange((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === targetNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  config,
                  ...(typeof label === 'string' && label ? { label } : {}),
                },
              }
            : node
        ),
      }));
    },
    [applyUntrackedWorkflowChange]
  );

  const handleNodeConfigSave = (targetNodeId, config, label) => {
    applyTrackedWorkflowChange((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === targetNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                config,
                ...(typeof label === 'string' && label ? { label } : {}),
              },
            }
          : node
      ),
    }));
    setConfigNodeId(null);
  };

  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const overlay = resolveNodeRunOverlay(node, nodeRunStatuses);
        return {
          ...node,
          data: {
            ...node.data,
            ...(overlay?.runStatus ? { runStatus: overlay.runStatus } : {}),
            ...(overlay?.runDuration ? { runDuration: overlay.runDuration } : {}),
            onInlineUpdate: handleNodeInlineUpdate,
          },
        };
      }),
    [nodes, handleNodeInlineUpdate, nodeRunStatuses]
  );

  const handleExport = useCallback(async () => {
    setSyncState('syncing');
    try {
      const { data } = await axios.post('/api/pipelines/export', { nodes, edges, cicdPlatform });
      onYamlExport(data.yaml);
      setSyncState('synced');

      try {
        const rawN8n = window.localStorage.getItem('flowforge.n8n.v1');
        if (rawN8n) {
          const { enabled, webhookUrl } = JSON.parse(rawN8n);
          if (enabled && webhookUrl) {
            axios
              .post('/api/n8n/forward', {
                webhookUrl,
                payload: {
                  event: 'pipeline_exported',
                  cicdPlatform,
                  yaml: data.yaml,
                  nodes,
                  edges,
                  timestamp: new Date().toISOString(),
                },
              })
              .catch(() => {});
          }
        }
      } catch {
        // Ignore localStorage or n8n forward errors
      }
    } catch {
      onYamlExport(buildLocalYaml(nodes, edges, cicdPlatform));
      setSyncState('error');
    }
  }, [cicdPlatform, edges, nodes, onYamlExport]);

  const handleImportYamlFile = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = '';

      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        const configText = typeof loadEvent.target?.result === 'string' ? loadEvent.target.result : '';
        if (!configText.trim()) return;

        try {
          const { data } = await axios.post('/api/pipelines/import', {
            configText,
            cicdPlatform,
          });
          const importedNodes = Array.isArray(data?.nodes) ? data.nodes : [];
          const importedEdges = Array.isArray(data?.edges) ? data.edges : [];
          nodeId = Math.max(nodeId, getMaxNodeId(importedNodes));
          applyTrackedWorkflowChange({ nodes: importedNodes, edges: importedEdges });
          setSelectedNodeId(null);
          setConfigNodeId(null);
          onYamlExport?.(typeof data?.yaml === 'string' ? data.yaml : configText);
        } catch {
          // Fallback to modal if direct file import fails
          onOpenImport?.();
        }
      };
      reader.readAsText(file);
    },
    [applyTrackedWorkflowChange, cicdPlatform, onOpenImport, onYamlExport]
  );

  // Persist the auto-sync preference.
  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(autoSync));
    } catch {
      // Ignore storage write issues.
    }
  }, [autoSync]);

  // Live YAML sync: debounce meaningful graph changes and re-export so the
  // preview panel mirrors the canvas without a manual Export click. Keyed on
  // graphSignature (not node positions) and uses the selected CI/CD platform,
  // falling back to a local render when the backend is unreachable.
  useEffect(() => {
    if (!autoSync) return undefined;

    if (nodesRef.current.length === 0) {
      setSyncState('idle');
      onYamlExport('');
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    setSyncState('syncing');

    const handle = setTimeout(async () => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      try {
        const { data } = await axios.post(
          '/api/pipelines/export',
          { nodes: currentNodes, edges: currentEdges, cicdPlatform },
          { signal: controller.signal }
        );
        if (!cancelled) {
          onYamlExport(data.yaml);
          setSyncState('synced');
        }
      } catch (err) {
        if (cancelled || axios.isCancel(err)) return;
        onYamlExport(buildLocalYaml(currentNodes, currentEdges, cicdPlatform));
        setSyncState('error');
      }
    }, 350);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(handle);
    };
  }, [graphSignature, cicdPlatform, autoSync, onYamlExport]);

  const handleClearCanvas = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) {
      return;
    }
    setShowClearConfirm(true);
  }, [edges.length, nodes.length]);

  const confirmClearCanvas = useCallback(() => {
    applyTrackedWorkflowChange({ nodes: [], edges: [] });
    setSelectedNodeId(null);
    setConfigNodeId(null);
    setRightDragSelection(null);
    setShowClearConfirm(false);
  }, [applyTrackedWorkflowChange]);

  return (
    <div
      className="h-full w-full relative"
      ref={reactFlowWrapper}
      onMouseDown={onWrapperMouseDown}
      onContextMenu={onWrapperContextMenu}
    >
      <ReactFlow
        nodes={renderedNodes}
        edges={edges.map((edge) => ({
          ...edge,
          style: selectedEdgeIds.has(edge.id)
            ? { stroke: 'var(--ff-danger)', strokeWidth: 2.5 }
            : undefined,
          selected: selectedEdgeIds.has(edge.id),
        }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStart={onNodeDragStart}
        onPaneClick={onPaneClick}
        onPaneContextMenu={(event) => event.preventDefault()}
        nodeTypes={nodeTypes}
        panOnDrag={[0, 1]}
        selectionOnDrag={false}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        fitView
        className="bg-transparent"
      >
        <Background variant="dots" gap={20} size={1} color="var(--ff-dots-color)" />
        <Controls position="top-left" />
        <MiniMap
          nodeColor={(node) => {
            const colors = {
              trigger_push: '#22c55e',
              trigger_mr: '#16a34a',
              build: '#38bdf8',
              matrix_build: '#0369a1',
              lint: '#06b6d4',
              test: '#f59e0b',
              integration_test: '#f97316',
              smoke_test: '#84cc16',
              cache_restore: '#059669',
              cache_save: '#0f766e',
              security_scan: '#f43f5e',
              package: '#8b5cf6',
              release: '#d946ef',
              approval_gate: '#b45309',
              deploy: '#6366f1',
              canary_deploy: '#4338ca',
              blue_green_deploy: '#1d4ed8',
              rollback: '#e11d48',
              notify: '#ec4899',
              conditional: '#64748b',
            };
            return colors[node.type] || '#6b7280';
          }}
          className="!bg-[var(--ff-minimap-bg)] !border !border-[var(--ff-card-border-strong)]"
        />
      </ReactFlow>

      {/* Top-right overlay: compact node/edge count pill + Share button when nodes > 0 */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        {blueprintToast && (
          <div className="px-2.5 py-1 bg-emerald-500/15 backdrop-blur-sm border border-emerald-500/30 rounded-lg text-xs text-emerald-400 font-medium flex items-center gap-1.5 whitespace-nowrap ff-enter">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{blueprintToast}</span>
          </div>
        )}
        <input
          ref={importFileInputRef}
          type="file"
          accept=".yml,.yaml,.jenkinsfile,.groovy"
          onChange={handleImportYamlFile}
          className="hidden"
        />
        {nodes.length > 0 && (
          <button
            onClick={handleShareBlueprint}
            className={`px-2.5 py-1 backdrop-blur-sm border rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              shareCopied
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400 font-medium'
                : 'bg-[var(--ff-node-counter-bg)] border-[var(--ff-card-border-strong)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:border-[var(--ff-border-strong)]'
            }`}
            title="Copy zero-database shareable blueprint URL (#blueprint=...)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 9.5l3-3" />
              <path d="M9 5l1.5-1.5a2.1 2.1 0 0 1 3 3L12 8" />
              <path d="M7 11l-1.5 1.5a2.1 2.1 0 0 1-3-3L4 8" />
            </svg>
            <span>{shareCopied ? 'Copied!' : 'Share'}</span>
          </button>
        )}
        <div className="px-2.5 py-1 bg-[var(--ff-node-counter-bg)] backdrop-blur-sm border border-[var(--ff-card-border-strong)] rounded-lg text-xs text-[var(--ff-text-secondary)] ff-code whitespace-nowrap flex items-center gap-1.5">
          {autoSync && nodes.length > 0 && (
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                syncState === 'syncing'
                  ? 'bg-amber-400 animate-pulse'
                  : syncState === 'error'
                    ? 'bg-red-400'
                    : 'bg-emerald-400'
              }`}
              title={syncState === 'syncing' ? 'Syncing YAML' : syncState === 'error' ? 'Offline (local YAML)' : 'YAML synced'}
            />
          )}
          <span>{nodes.length} nodes · {edges.length} edges</span>
        </div>
      </div>

      {/* Bottom-left toolbar: Undo, Redo, Delete, Clear | Auto-sync, Export YAML */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-node-counter-bg)] backdrop-blur-sm p-1 max-w-[calc(100%-14rem)]">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="w-8 h-8 flex items-center justify-center rounded-lg ff-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4.5 2.5 8 6 11.5" /><path d="M2.5 8H9.5a4 4 0 0 1 0 8H7" />
          </svg>
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className="w-8 h-8 flex items-center justify-center rounded-lg ff-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 4.5 13.5 8 10 11.5" /><path d="M13.5 8H6.5a4 4 0 0 0 0 8H9" />
          </svg>
        </button>
        <button
          onClick={handleDeleteSelectedNode}
          disabled={!(selectedNodeId || configNodeId || nodes.some((node) => node.selected))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--ff-danger)] hover:bg-[var(--ff-danger-soft)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Delete selected node"
          aria-label="Delete selected node"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4.5h10M6.5 4.5V3.2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.3M4.8 4.5l.6 9a1 1 0 0 0 1 .9h3.2a1 1 0 0 0 1-.9l.6-9" />
          </svg>
        </button>
        <button
          onClick={handleClearCanvas}
          disabled={nodes.length === 0 && edges.length === 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg ff-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Clear all nodes and connections"
          aria-label="Clear canvas"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="5.5" /><path d="M4.5 4.5l7 7" />
          </svg>
        </button>

        <span className="w-px h-5 bg-[var(--ff-card-border-strong)] mx-0.5" />

        <button
          onClick={() => setAutoSync((prev) => !prev)}
          className={`px-2.5 h-8 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
            autoSync
              ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-border-strong)] text-[var(--ff-accent)]'
              : 'ff-btn-secondary'
          }`}
          title="Automatically re-generate YAML as you edit the canvas"
          aria-pressed={autoSync}
        >
          Auto-sync
        </button>
        <button
          onClick={handleExport}
          className="px-3 h-8 rounded-lg text-xs font-semibold transition-opacity ff-btn-primary whitespace-nowrap"
          title="Export YAML from the canvas"
        >
          Export YAML
        </button>
      </div>

      {selectionOverlay && (
        <div
          className="absolute z-20 pointer-events-none rounded-sm border border-[var(--ff-border-strong)] border-dashed bg-[var(--ff-accent-soft)]"
          style={{
            left: selectionOverlay.left,
            top: selectionOverlay.top,
            width: selectionOverlay.width,
            height: selectionOverlay.height,
          }}
        />
      )}

      {/* Subtle, lightweight empty-state prompt */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none p-4">
          <div className="text-center max-w-sm pointer-events-auto">
            <p className="text-xs font-medium text-[var(--ff-text-secondary)]">
              Drag stages from the left or start with a template
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {BUILT_IN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    nodeId = Math.max(nodeId, getMaxNodeId(tpl.nodes));
                    applyTrackedWorkflowChange({
                      nodes: cloneWorkflow(tpl.nodes),
                      edges: cloneWorkflow(tpl.edges),
                    });
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--ff-surface)]/85 backdrop-blur-sm border border-[var(--ff-card-border-strong)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:border-[var(--ff-accent)] transition-colors"
                >
                  + {tpl.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Node config panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={handleNodeLiveConfigUpdate}
          onSave={handleNodeConfigSave}
          onDelete={handleDeleteNodeById}
          onClose={() => setConfigNodeId(null)}
        />
      )}

      {/* Save template dialog */}
      {showSaveTemplate && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--ff-overlay)] backdrop-blur-sm">
          <div
            className="bg-[var(--ff-modal-bg)] rounded-2xl border border-[var(--ff-card-border-strong)] shadow-[0_20px_40px_rgba(0,0,0,0.4)] p-6 max-w-sm mx-4"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-sm font-semibold text-[var(--ff-text)]">Save as Template</h3>
            <p className="text-xs text-[var(--ff-text-secondary)] mt-2 leading-relaxed">
              Save the current {nodes.length} nodes as a reusable template.
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="ff-input px-3 py-2 text-sm mt-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && templateName.trim()) {
                  saveCurrentAsTemplate(templateName.trim(), `${nodes.length} nodes`, nodes, edges);
                  setShowSaveTemplate(false);
                  setTemplateName('');
                }
              }}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowSaveTemplate(false); setTemplateName(''); }}
                className="flex-1 px-4 py-2 rounded-lg text-sm ff-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (templateName.trim()) {
                    saveCurrentAsTemplate(templateName.trim(), `${nodes.length} nodes`, nodes, edges);
                    setShowSaveTemplate(false);
                    setTemplateName('');
                  }
                }}
                disabled={!templateName.trim()}
                className="flex-1 px-4 py-2 rounded-lg text-sm ff-btn-primary disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear canvas confirmation modal */}
      {showClearConfirm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--ff-overlay)] backdrop-blur-sm">
          <div
            className="bg-[var(--ff-modal-bg)] rounded-2xl border border-[var(--ff-card-border-strong)] shadow-[0_20px_40px_rgba(0,0,0,0.4)] p-6 max-w-sm mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-confirm-title"
          >
            <h3 id="clear-confirm-title" className="text-sm font-semibold text-[var(--ff-text)]">Clear canvas?</h3>
            <p className="text-xs text-[var(--ff-text-secondary)] mt-2 leading-relaxed">
              This will remove all nodes and connections. You can undo this action with Ctrl+Z.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg text-sm ff-btn-secondary"
                autoFocus
              >
                Cancel
              </button>
              <button
                onClick={confirmClearCanvas}
                className="flex-1 px-4 py-2 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 font-medium"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkflowEditor(props) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner
        onYamlExport={props.onYamlExport}
        importedWorkflow={props.importedWorkflow}
        onImportedWorkflowApplied={props.onImportedWorkflowApplied}
        cicdPlatform={props.cicdPlatform}
        onRegisterAddNode={props.onRegisterAddNode}
        onOpenImport={props.onOpenImport}
        onPlatformDetected={props.onPlatformDetected}
        nodeRunStatuses={props.nodeRunStatuses}
        onGraphChange={props.onGraphChange}
      />
    </ReactFlowProvider>
  );
}
