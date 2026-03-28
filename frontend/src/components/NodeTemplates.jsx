import React, { useState, useEffect, useCallback } from 'react';

const TEMPLATES_KEY = 'flowforge.templates.v1';
const TEMPLATES_CHANGED_EVENT = 'flowforge:templates-changed';

const BUILT_IN_TEMPLATES = [
  {
    id: 'standard-test-suite',
    name: 'Standard Test Suite',
    description: 'Lint, unit tests, integration tests, and security scan',
    builtIn: true,
    nodes: [
      { id: 'tpl_1', type: 'lint', position: { x: 0, y: 0 }, data: { label: 'Lint / Static Analysis', config: {} } },
      { id: 'tpl_2', type: 'test', position: { x: 0, y: 100 }, data: { label: 'Unit Tests', config: {} } },
      { id: 'tpl_3', type: 'integration_test', position: { x: 0, y: 200 }, data: { label: 'Integration Tests', config: {} } },
      { id: 'tpl_4', type: 'security_scan', position: { x: 0, y: 300 }, data: { label: 'Security Scan', config: {} } },
    ],
    edges: [
      { id: 'tpl_e1', source: 'tpl_1', target: 'tpl_2', animated: true },
      { id: 'tpl_e2', source: 'tpl_2', target: 'tpl_3', animated: true },
      { id: 'tpl_e3', source: 'tpl_3', target: 'tpl_4', animated: true },
    ],
  },
  {
    id: 'deploy-pipeline',
    name: 'Deploy Pipeline',
    description: 'Approval, canary, blue/green, rollback, and notify',
    builtIn: true,
    nodes: [
      { id: 'tpl_1', type: 'approval_gate', position: { x: 0, y: 0 }, data: { label: 'Approval Gate', config: {} } },
      { id: 'tpl_2', type: 'canary_deploy', position: { x: 0, y: 100 }, data: { label: 'Canary Deploy', config: { trafficPercent: 10 } } },
      { id: 'tpl_3', type: 'blue_green_deploy', position: { x: 0, y: 200 }, data: { label: 'Blue/Green Deploy', config: { activeColor: 'green' } } },
      { id: 'tpl_4', type: 'rollback', position: { x: 0, y: 300 }, data: { label: 'Rollback', config: {} } },
      { id: 'tpl_5', type: 'notify', position: { x: 0, y: 400 }, data: { label: 'Notification', config: {} } },
    ],
    edges: [
      { id: 'tpl_e1', source: 'tpl_1', target: 'tpl_2', animated: true },
      { id: 'tpl_e2', source: 'tpl_2', target: 'tpl_3', animated: true },
      { id: 'tpl_e3', source: 'tpl_3', target: 'tpl_4', animated: true },
      { id: 'tpl_e4', source: 'tpl_3', target: 'tpl_5', animated: true },
    ],
  },
  {
    id: 'basic-ci',
    name: 'Basic CI',
    description: 'Push trigger, build, test, deploy',
    builtIn: true,
    nodes: [
      { id: 'tpl_1', type: 'trigger_push', position: { x: 0, y: 0 }, data: { label: 'Git Push Trigger', config: {} } },
      { id: 'tpl_2', type: 'build', position: { x: 0, y: 100 }, data: { label: 'Build Stage', config: {} } },
      { id: 'tpl_3', type: 'test', position: { x: 0, y: 200 }, data: { label: 'Unit Tests', config: {} } },
      { id: 'tpl_4', type: 'deploy', position: { x: 0, y: 300 }, data: { label: 'Deploy', config: {} } },
    ],
    edges: [
      { id: 'tpl_e1', source: 'tpl_1', target: 'tpl_2', animated: true },
      { id: 'tpl_e2', source: 'tpl_2', target: 'tpl_3', animated: true },
      { id: 'tpl_e3', source: 'tpl_3', target: 'tpl_4', animated: true },
    ],
  },
];

function readSavedTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeSavedTemplates(templates) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  } catch { /* ignore */ }
}

function notifyTemplatesChanged() {
  window.dispatchEvent(new CustomEvent(TEMPLATES_CHANGED_EVENT));
}

export default function NodeTemplates({ onLoadTemplate }) {
  const [savedTemplates, setSavedTemplates] = useState(readSavedTemplates);

  // Re-read when a template is saved from anywhere
  useEffect(() => {
    const handler = () => setSavedTemplates(readSavedTemplates());
    window.addEventListener(TEMPLATES_CHANGED_EVENT, handler);
    return () => window.removeEventListener(TEMPLATES_CHANGED_EVENT, handler);
  }, []);

  const allTemplates = [...BUILT_IN_TEMPLATES, ...savedTemplates];

  const handleDelete = useCallback((id) => {
    const updated = savedTemplates.filter((t) => t.id !== id);
    setSavedTemplates(updated);
    writeSavedTemplates(updated);
  }, [savedTemplates]);

  return (
    <div className="space-y-1.5">
      {allTemplates.map((template) => (
        <div
          key={template.id}
          className="px-3 py-2 rounded-lg border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] hover:bg-[var(--ff-card-bg-hover)] hover:border-[var(--ff-card-border-hover)] transition-all"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => onLoadTemplate(template)}
              className="flex-1 text-left"
            >
              <p className="text-[13px] font-medium text-[var(--ff-text)]">{template.name}</p>
              <p className="text-[11px] text-[var(--ff-muted)] mt-0.5">{template.description}</p>
            </button>
            {!template.builtIn && (
              <button
                onClick={() => handleDelete(template.id)}
                className="text-[11px] text-[var(--ff-muted)] hover:text-[var(--ff-danger)] transition-colors flex-shrink-0"
                title="Delete template"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
      {allTemplates.length === 0 && (
        <p className="text-xs text-[var(--ff-muted)]">No templates available.</p>
      )}
    </div>
  );
}

export function saveCurrentAsTemplate(name, description, nodes, edges) {
  const saved = readSavedTemplates();
  const template = {
    id: `custom_${Date.now()}`,
    name,
    description,
    builtIn: false,
    nodes: nodes.map((n, i) => ({
      ...n,
      id: `tpl_${i + 1}`,
      position: { x: n.position.x - (nodes[0]?.position?.x || 0), y: n.position.y - (nodes[0]?.position?.y || 0) },
    })),
    edges: edges.map((e, i) => {
      const sourceIdx = nodes.findIndex((n) => n.id === e.source);
      const targetIdx = nodes.findIndex((n) => n.id === e.target);
      return {
        id: `tpl_e${i + 1}`,
        source: sourceIdx >= 0 ? `tpl_${sourceIdx + 1}` : e.source,
        target: targetIdx >= 0 ? `tpl_${targetIdx + 1}` : e.target,
        animated: true,
      };
    }),
  };
  saved.push(template);
  writeSavedTemplates(saved);
  notifyTemplatesChanged();
  return template;
}
