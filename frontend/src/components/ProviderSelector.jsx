import React from 'react';

const prefixes = {
  anthropic: 'AN',
  gemini: 'GM',
  openai: 'OA',
  featherless: 'FL',
  ollama: 'OL',
  gitlab: 'GL',
  github: 'GH',
  jenkins: 'JK',
  circleci: 'CC',
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
            [{prefixes[p.name] || 'PR'}] {p.displayName}
            {p.enabled ? '' : ' (Custom Key)'}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs uppercase tracking-[0.14em] text-slate-500 whitespace-nowrap">
        {typeLabels[type]}
      </span>
      <select
        value={selected || ''}
        onChange={(e) => onChange(e.target.value)}
        className="ff-select text-sm cursor-pointer min-w-[220px]"
      >
        {visibleProviders.map((p) => (
          <option key={p.name} value={p.name}>
            [{prefixes[p.name] || 'PR'}] {p.displayName}
            {p.enabled ? '' : ' (Custom Key)'}
          </option>
        ))}
      </select>
    </div>
  );
}
