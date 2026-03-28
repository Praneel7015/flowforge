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
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-2xl w-full space-y-6 ff-enter">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-teal-300">Assistant</p>
          <h2 className="text-3xl font-bold">AI Pipeline Generator</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Describe your project and desired CI/CD pipeline in natural language.
            The AI will generate a <span className="text-amber-300 font-medium">{platformNames[cicdPlatform] || 'CI/CD'}</span> configuration and visual workflow.
          </p>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your pipeline..."
          rows={5}
          className="ff-input p-4 text-sm resize-none leading-relaxed"
        />

        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full py-3 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity ff-btn-primary"
        >
          {loading ? 'Generating...' : `Generate ${platformNames[cicdPlatform] || 'Pipeline'}`}
        </button>

        {error && <p className="text-rose-300 text-sm">{error}</p>}

        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Example prompts
          </h3>
          <div className="space-y-2">
            {examplePrompts.map((example, i) => (
              <button
                key={i}
                onClick={() => setPrompt(example)}
                className="w-full text-left px-4 py-2.5 ff-surface-soft
                  text-sm text-slate-200 hover:border-slate-500/80 transition-colors"
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
