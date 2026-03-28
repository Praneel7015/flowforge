import React, { useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';

import TriggerNode from './nodes/TriggerNode';
import StageNode from './nodes/StageNode';
import ConditionalNode from './nodes/ConditionalNode';
import NodeConfigPanel from './NodeConfigPanel';
import { useState } from 'react';

const nodeTypes = {
  trigger_push: TriggerNode,
  trigger_mr: TriggerNode,
  build: StageNode,
  test: StageNode,
  security_scan: StageNode,
  deploy: StageNode,
  notify: StageNode,
  conditional: ConditionalNode,
};

const defaultNodes = [];
const defaultEdges = [];

let nodeId = 0;
const getNextId = () => `node_${++nodeId}`;

function WorkflowEditorInner({ onYamlExport, importedWorkflow }) {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selectedNode, setSelectedNode] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // Import workflow from AI generator or Jenkins converter
  useEffect(() => {
    if (importedWorkflow?.nodes?.length) {
      nodeId = importedWorkflow.nodes.length;
      setNodes(importedWorkflow.nodes);
      setEdges(importedWorkflow.edges || []);
    }
  }, [importedWorkflow, setNodes, setEdges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
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
      if (!type) return;

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

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleNodeConfigSave = (nodeId, config) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n))
    );
    setSelectedNode(null);
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

  return (
    <div className="h-full w-full relative" ref={reactFlowWrapper}>
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
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-transparent"
      >
        <Background variant="dots" gap={20} size={1} color="#31424f" />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const colors = {
              trigger_push: '#22c55e',
              trigger_mr: '#16a34a',
              build: '#38bdf8',
              test: '#f59e0b',
              security_scan: '#f43f5e',
              deploy: '#6366f1',
              notify: '#ec4899',
              conditional: '#64748b',
            };
            return colors[node.type] || '#6b7280';
          }}
          className="!bg-slate-900/90 !border !border-slate-700/70"
        />
      </ReactFlow>

      {/* Export button */}
      <button
        onClick={handleExport}
        className="absolute top-4 right-4 px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity z-10 ff-btn-primary"
      >
        Export YAML
      </button>

      {/* Node count indicator */}
      <div className="absolute bottom-4 left-4 px-3 py-1 bg-slate-900/80 border border-slate-700/70 rounded-lg text-xs text-slate-300 z-10 ff-code">
        {nodes.length} nodes | {edges.length} connections
      </div>

      {/* Node config panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onSave={handleNodeConfigSave}
          onClose={() => setSelectedNode(null)}
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
