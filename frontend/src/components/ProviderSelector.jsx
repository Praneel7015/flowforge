import React from 'react';

const icons = {
  // AI Providers
  anthropic: '🤖',
  gemini: '💎',
  openai: '🧠',
  featherless: '🪶',
  ollama: '🦙',
  // CI/CD Platforms
  gitlab: '🦊',
  github: '🐙',
  jenkins: '🔧',
  circleci: '⚡',
};

export default function ProviderSelector({
  type,
  providers,
  selected,
  onChange,
  compact = false,
  allowDisabled = false,
}) {
  const typeLabels = {
    ai: 'AI Model',
    cicd: 'CI/CD Platform',
  };

  const visibleProviders = allowDisabled ? providers : providers.filter((p) => p.enabled);

  if (visibleProviders.length === 0) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-xs">
        <span>{typeLabels[type]}:</span>
        <span className="italic">None configured</span>
      </div>
    );
  }

  if (compact) {
    return (
      <select
        value={selected || ''}
        onChange={(e) => onChange(e.target.value)}
        className="ff-select text-xs cursor-pointer"
        title={typeLabels[type]}
      >
        {visibleProviders.map((p) => (
          <option key={p.name} value={p.name}>
            {icons[p.name] || '📦'} {p.displayName}{p.enabled ? '' : ' (BYOM)'}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 whitespace-nowrap">{typeLabels[type]}:</span>
      <select
        value={selected || ''}
        onChange={(e) => onChange(e.target.value)}
        className="ff-select text-xs cursor-pointer min-w-[150px]"
      >
        {visibleProviders.map((p) => (
          <option key={p.name} value={p.name}>
            {icons[p.name] || '📦'} {p.displayName}{p.enabled ? '' : ' (BYOM)'}
          </option>
        ))}
      </select>
    </div>
  );
}
