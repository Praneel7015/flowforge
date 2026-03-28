import React from 'react';
import ProviderSelector from './ProviderSelector';

const TABS = [
  { id: 'builder', label: 'Workflow Builder', icon: '⬡' },
  { id: 'prompt', label: 'AI Generator', icon: '✦', aiPowered: true },
  { id: 'jenkins', label: 'Migration', icon: '⇄', aiPowered: true },
  { id: 'health', label: 'Health Advisor', icon: '◎', aiPowered: true },
  { id: 'chat', label: 'Pipeline Chat', icon: '◈', aiPowered: true },
];

export default function Header({
  activePanel,
  setActivePanel,
  providers,
  selectedProviders,
  onProviderChange,
  byomEnabled,
}) {
  const selectedAI = providers.ai?.find((p) => p.name === selectedProviders.ai);

  return (
    <header className="px-3 pt-3 pb-0">
      <div className="ff-surface px-4 py-3 flex items-center justify-between gap-4">
      {/* Logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-700 shadow-lg shadow-teal-900/40" />
          <div>
            <h1 className="text-base font-bold tracking-tight whitespace-nowrap text-slate-100">
              FlowForge
            </h1>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">CI/CD Studio</p>
          </div>
        </div>

      {/* Nav */}
        <nav className="flex gap-1 overflow-x-auto px-2 py-1 rounded-xl bg-slate-900/40 border border-slate-700/40">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                transition-colors whitespace-nowrap
                ${
                  activePanel === tab.id
                    ? 'bg-teal-600/25 text-teal-100 border border-teal-500/50'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                }`}
            >
              <span className="opacity-90">{tab.icon}</span>
              {tab.label}
              {tab.aiPowered && (
                <span className="ml-0.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 leading-none">
                  AI
                </span>
              )}
            </button>
          ))}
        </nav>

      {/* Provider Selectors */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <ProviderSelector
            type="ai"
            providers={providers.ai || []}
            selected={selectedProviders.ai}
            onChange={(value) => onProviderChange('ai', value)}
            compact
            allowDisabled
          />
          <ProviderSelector
            type="cicd"
            providers={providers.cicd || []}
            selected={selectedProviders.cicd}
            onChange={(value) => onProviderChange('cicd', value)}
            compact
          />
          {/* Status indicator */}
          <div className="hidden lg:flex items-center gap-1.5 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-xs text-emerald-200 whitespace-nowrap">
              {selectedAI?.displayName || 'Ready'}{byomEnabled ? ' + Custom Key' : ''}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
