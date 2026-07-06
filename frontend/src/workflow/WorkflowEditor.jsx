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
import { saveCurrentAsTemplate } from '../components/NodeTemplates';

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

// Local, offline-safe fallback used when the backend export endpoint is
// unreachable so the live YAML panel still reflects the current graph.
const buildLocalYaml = (nodeList) => {
  const yamlLines = ['stages:', '  - build', '  - test', '  - deploy', ''];
  nodeList.forEach((node) => {
    if (node.type?.startsWith('trigger_') || node.type === 'conditional') return;
    const name = node.data?.label?.toLowerCase().replace(/\s+/g, '_') || node.id;
    yamlLines.push(`${name}:`);
    yamlLines.push(`  stage: ${node.data?.config?.stage || node.type}`);
    yamlLines.push(`  script:`);
    yamlLines.push(`    - echo "Running ${node.data?.label || node.id}"`);
    yamlLines.push('');
  });
  return yamlLines.join('\n');
};

function WorkflowEditorInner({ onYamlExport, importedWorkflow, onImportedWorkflowApplied, onRegisterAddNode, cicdPlatform }) {
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
  }, [nodes]);

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
        data: { label, config: {} },
      };

      applyTrackedWorkflowChange((current) => ({
        ...current,
        nodes: current.nodes.concat(newNode),
      }));
      setSelectedNodeId(newNode.id);
    },
    [applyTrackedWorkflowChange, reactFlowInstance]
  );

  const addNodeFromKeyboard = useCallback(
    (type, label) => {
      const offset = nodes.length * 30;
      const newNode = {
        id: getNextId(),
        type,
        position: { x: 250 + offset, y: 100 + offset },
        data: { label, config: {} },
      };

      applyTrackedWorkflowChange((current) => ({
        ...current,
        nodes: current.nodes.concat(newNode),
      }));
      setSelectedNodeId(newNode.id);
    },
    [applyTrackedWorkflowChange, nodes.length]
  );

  useEffect(() => {
    onRegisterAddNode?.(addNodeFromKeyboard);
  }, [addNodeFromKeyboard, onRegisterAddNode]);

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNodeId(node.id);
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

  const handleNodeConfigSave = (nodeId, config) => {
    applyTrackedWorkflowChange((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, config } } : node
      ),
    }));
    setConfigNodeId(null);
  };

  const exportWorkflow = useCallback(
    async ({ signal } = {}) => {
      const { data } = await axios.post(
        '/api/pipelines/export',
        { nodes, edges, cicdPlatform },
        signal ? { signal } : undefined
      );
      return data.yaml;
    },
    [nodes, edges, cicdPlatform]
  );

  const handleExport = useCallback(async () => {
    setSyncState('syncing');
    try {
      const yaml = await exportWorkflow();
      onYamlExport(yaml);
      setSyncState('synced');
    } catch {
      onYamlExport(buildLocalYaml(nodes));
      setSyncState('error');
    }
  }, [exportWorkflow, nodes, onYamlExport]);

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
        onYamlExport(buildLocalYaml(currentNodes));
        setSyncState('error');
      }
    }, 700);

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
        nodes={nodes}
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

      {/* Node count + live sync indicator (top-right, unobtrusive) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <div className="px-2.5 py-1 bg-[var(--ff-node-counter-bg)] backdrop-blur-sm border border-[var(--ff-card-border-strong)] rounded-lg text-xs text-[var(--ff-text-secondary)] ff-code whitespace-nowrap">
          {nodes.length} nodes | {edges.length} connections
        </div>
        {autoSync && nodes.length > 0 && (
          <div
            className="px-2.5 py-1 bg-[var(--ff-node-counter-bg)] backdrop-blur-sm border border-[var(--ff-card-border-strong)] rounded-lg text-xs flex items-center gap-1.5 whitespace-nowrap"
            title="Live YAML sync status"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                syncState === 'syncing'
                  ? 'bg-amber-400 animate-pulse'
                  : syncState === 'error'
                    ? 'bg-red-400'
                    : 'bg-emerald-400'
              }`}
            />
            <span className="text-[var(--ff-muted)]">
              {syncState === 'syncing' ? 'Syncing' : syncState === 'error' ? 'Offline (local)' : 'Synced'}
            </span>
          </div>
        )}
      </div>

      {/* Action toolbar — compact, contained pill anchored bottom-left so it
          reads as chrome and stays clear of the minimap and canvas nodes. */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-node-counter-bg)] backdrop-blur-sm p-1 max-w-[calc(100%-14rem)]">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="w-8 h-8 flex items-center justify-center rounded-lg ff-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
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
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 4.5 13.5 8 10 11.5" /><path d="M13.5 8H6.5a4 4 0 0 0 0 8H9" />
          </svg>
        </button>
        <button
          onClick={handleDeleteSelectedNode}
          disabled={!(selectedNodeId || configNodeId || nodes.some((node) => node.selected))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Delete selected node"
          aria-label="Delete selected node"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
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
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="5.5" /><path d="M4.5 4.5l7 7" />
          </svg>
        </button>
        <button
          onClick={() => { if (nodes.length > 0) setShowSaveTemplate(true); }}
          disabled={nodes.length === 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg ff-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Save current workflow as a reusable template"
          aria-label="Save as template"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2.5h8v11l-4-2.8-4 2.8z" />
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
        >
          Auto-sync {autoSync ? 'On' : 'Off'}
        </button>
        <button
          onClick={handleExport}
          className="px-3 h-8 rounded-lg text-xs font-semibold transition-opacity ff-btn-primary whitespace-nowrap"
          title={autoSync ? 'YAML syncs automatically — click to regenerate now' : 'Generate YAML from the canvas'}
        >
          {autoSync ? 'Sync Now' : 'Export YAML'}
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

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none">
          <div className="text-center max-w-xs pointer-events-auto">
            <div className="w-10 h-10 rounded-lg bg-[var(--ff-accent-soft)] flex items-center justify-center mx-auto mb-3">
              <span className="text-[var(--ff-accent)] text-sm font-bold">FF</span>
            </div>
            <p className="text-sm font-semibold text-[var(--ff-text-secondary)]">No nodes yet</p>
            <p className="text-xs text-[var(--ff-muted)] mt-1.5 leading-relaxed">
              Drag nodes from the sidebar or press Enter on a node to add it. Use Generate or Migrate to auto-build a pipeline.
            </p>
          </div>
        </div>
      )}

      {/* Node config panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
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
      />
    </ReactFlowProvider>
  );
}
