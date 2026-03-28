import React, { useState } from 'react';
import axios from 'axios';

const GRADE_COLORS = { A: 'text-green-400', B: 'text-lime-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' };

function ScoreBar({ score }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : score >= 40 ? 'bg-orange-500' : 'bg-rose-500';
  return (
    <div className="h-2 w-full bg-slate-800/90 rounded-full overflow-hidden border border-slate-700/70">
      <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

export default function HealthAdvisor({ currentYaml, aiProvider, cicdPlatform, aiOptions }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!currentYaml?.trim()) {
      setError('Export your pipeline YAML first using "Export YAML" on the canvas.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post('/api/advisor/health', {
        yaml: currentYaml,
        aiProvider,
        cicdPlatform,
        aiOptions,
      });
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const dimensions = ['speed', 'security', 'reliability', 'best_practice'];

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto space-y-6 ff-enter">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-teal-300">Insights</p>
          <h2 className="text-3xl font-bold mb-1">Pipeline Health Advisor</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            AI analyses your pipeline configuration for speed, security, reliability, and best practices.
          </p>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity ff-btn-primary"
        >
          {loading ? 'Analysing...' : 'Analyse My Pipeline'}
        </button>

        {error && <p className="text-rose-300 text-sm">{error}</p>}

        {report && (
          <div className="space-y-5">
            {/* Overall score */}
            <div className="ff-surface-soft p-5 flex items-center gap-6">
              <div className="text-center">
                <div className={`text-6xl font-black ${GRADE_COLORS[report.grade] || 'text-white'}`}>
                  {report.grade}
                </div>
                <div className="text-xs text-slate-500 mt-1">Grade</div>
              </div>
              <div className="flex-1">
                <div className="text-3xl font-bold text-white">{report.overallScore}<span className="text-lg text-slate-400">/100</span></div>
                <div className="text-xs text-slate-500 mb-2">Overall Score</div>
                <ScoreBar score={report.overallScore} />
              </div>
            </div>

            {/* Dimension breakdown */}
            {dimensions.map((dim) => {
              const d = report.breakdown?.[dim];
              if (!d) return null;
              return (
                <div key={dim} className="ff-surface-soft p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize">{dim.replace('_', ' ')}</h3>
                    <span className="text-sm font-bold">{d.score}/100</span>
                  </div>
                  <ScoreBar score={d.score} />
                  {d.issues?.length > 0 && (
                    <div>
                      <div className="text-xs text-rose-300 font-semibold mb-1">Issues</div>
                      <ul className="space-y-1">
                        {d.issues.map((issue, i) => (
                          <li key={i} className="text-xs text-slate-300 flex gap-2">
                            <span className="text-rose-400">✗</span>{issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {d.tips?.length > 0 && (
                    <div>
                      <div className="text-xs text-emerald-300 font-semibold mb-1">Tips</div>
                      <ul className="space-y-1">
                        {d.tips.map((tip, i) => (
                          <li key={i} className="text-xs text-slate-200 flex gap-2">
                            <span className="text-emerald-400">→</span>{tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Top recommendations */}
            {report.topRecommendations?.length > 0 && (
              <div className="bg-cyan-900/20 border border-cyan-600/40 rounded-xl p-4">
                <div className="text-sm font-semibold text-cyan-200 mb-3">Top Recommendations</div>
                <ol className="space-y-2">
                  {report.topRecommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-slate-200 flex gap-3">
                      <span className="text-cyan-300 font-bold">{i + 1}.</span>{rec}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
