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

function WorkflowEditorInner({ onYamlExport, importedWorkflow, onImportedWorkflowApplied }) {
  const reactFlowWrapper = useRef(null);
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [configNodeId, setConfigNodeId] = useState(null);
  const [rightDragSelection, setRightDragSelection] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const { nodes, edges } = editorState.present;
  const canUndo = editorState.past.length > 0;
  const canRedo = editorState.future.length > 0;
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

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNodeId(node.id);
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

  const handleExport = async () => {
    try {
      const { data } = await axios.post('/api/pipelines/export', { nodes, edges });
      onYamlExport(data.yaml);
    } catch {
      // Fallback: basic local export
      const yamlLines = ['stages:', '  - build', '  - test', '  - deploy', ''];
      nodes.forEach((node) => {
        if (node.type.startsWith('trigger_') || node.type === 'conditional') return;
        const name = node.data.label?.toLowerCase().replace(/\s+/g, '_') || node.id;
        yamlLines.push(`${name}:`);
        yamlLines.push(`  stage: ${node.data.config?.stage || node.type}`);
        yamlLines.push(`  script:`);
        yamlLines.push(`    - echo "Running ${node.data.label}"`);
        yamlLines.push('');
      });
      onYamlExport(yamlLines.join('\n'));
    }
  };

  const handleClearCanvas = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) {
      return;
    }

    const confirmed = window.confirm('Clear the entire canvas and start from scratch?');
    if (!confirmed) {
      return;
    }

    applyTrackedWorkflowChange({ nodes: [], edges: [] });
    setSelectedNodeId(null);
    setConfigNodeId(null);
    setRightDragSelection(null);
  }, [applyTrackedWorkflowChange, edges.length, nodes.length]);

  return (
    <div
      className="h-full w-full relative"
      ref={reactFlowWrapper}
      onMouseDown={onWrapperMouseDown}
      onContextMenu={onWrapperContextMenu}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
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
        <Background variant="dots" gap={20} size={1} color="#c4d2df" />
        <Controls />
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
          className="!bg-white !border !border-slate-300"
        />
      </ReactFlow>

      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="px-3 py-2 rounded-lg text-xs ff-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className="px-3 py-2 rounded-lg text-xs ff-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Y)"
        >
          Redo
        </button>
        <button
          onClick={handleDeleteSelectedNode}
          disabled={!(selectedNodeId || configNodeId || nodes.some((node) => node.selected))}
          className="px-3 py-2 rounded-lg text-xs bg-rose-50 border border-rose-200 text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Delete selected node"
        >
          Delete
        </button>
        <button
          onClick={handleClearCanvas}
          disabled={nodes.length === 0 && edges.length === 0}
          className="px-3 py-2 rounded-lg text-xs ff-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          title="Clear all nodes and connections"
        >
          Clear
        </button>
        <button
          onClick={handleExport}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity ff-btn-primary"
        >
          Export YAML
        </button>
      </div>

      {/* Node count indicator */}
      <div className="absolute top-4 left-20 px-3 py-1 bg-white/90 border border-slate-300 rounded-lg text-xs text-slate-600 z-10 ff-code">
        {nodes.length} nodes | {edges.length} connections
      </div>

      {selectionOverlay && (
        <div
          className="absolute z-20 pointer-events-none rounded-sm border border-slate-700/70 border-dashed bg-slate-900/5"
          style={{
            left: selectionOverlay.left,
            top: selectionOverlay.top,
            width: selectionOverlay.width,
            height: selectionOverlay.height,
          }}
        />
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
    </div>
  );
}

export default function WorkflowEditor(props) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
