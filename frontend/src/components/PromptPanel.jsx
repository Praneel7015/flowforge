import React, { useState } from 'react';
import axios from 'axios';

export default function PromptPanel({ onGenerated, aiProvider, cicdPlatform, aiOptions }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const platformNames = {
    gitlab: 'GitLab CI',
    github: 'GitHub Actions',
    jenkins: 'Jenkins',
    circleci: 'CircleCI',
  };

  const examplePrompts = [
    'Create a pipeline for a Node.js project that installs dependencies, runs unit tests, performs a security scan, and deploys to Docker.',
    'Build a Python Django pipeline with linting, testing, Docker build, and deploy to Kubernetes.',
    'Create a pipeline for a React app with build, test, Lighthouse audit, and deploy to AWS S3.',
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');

    try {
      const { data } = await axios.post('/api/pipelines/generate', {
        prompt,
        aiProvider,
        cicdPlatform,
        aiOptions,
      });
      onGenerated(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate pipeline. Check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5 ff-enter">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Generator</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
            Build a pipeline from plain language
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Describe your project goals and constraints. FlowForge will generate a
            {' '}
            <span className="font-semibold text-slate-800">{platformNames[cicdPlatform] || 'CI/CD'}</span>
            {' '}
            config and visual workflow.
          </p>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: Build and test a Node.js app, run security scan, then deploy to production only from main branch."
          rows={7}
          className="ff-input p-4 text-sm resize-none leading-relaxed"
        />

        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-opacity ff-btn-primary"
        >
          {loading ? 'Generating...' : `Generate ${platformNames[cicdPlatform] || 'Pipeline'}`}
        </button>

        {error && <p className="text-rose-700 text-sm">{error}</p>}

        <div className="pt-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.14em] mb-3">
            Example prompts
          </h3>
          <div className="space-y-2">
            {examplePrompts.map((example, i) => (
              <button
                key={i}
                onClick={() => setPrompt(example)}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-300 bg-white
                  text-sm text-slate-700 hover:border-slate-400 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
