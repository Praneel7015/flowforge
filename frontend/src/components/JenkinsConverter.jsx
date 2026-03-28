import React, { useState } from 'react';
import axios from 'axios';

export default function JenkinsConverter({ onConverted, aiProvider, cicdPlatform, aiOptions }) {
  const [jenkinsfile, setJenkinsfile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const platformNames = {
    gitlab: 'GitLab CI',
    github: 'GitHub Actions',
    jenkins: 'Jenkins',
    circleci: 'CircleCI',
  };

  const exampleJenkinsfile = `pipeline {
    agent any
    stages {
        stage('Install') {
            steps {
                sh 'npm install'
            }
        }
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
        stage('Deploy') {
            steps {
                sh 'docker build -t myapp .'
                sh 'docker push myapp'
            }
        }
    }
    post {
        failure {
            mail to: 'team@example.com', subject: 'Build failed'
        }
    }
}`;

  const handleConvert = async () => {
    if (!jenkinsfile.trim()) return;
    setLoading(true);
    setError('');

    try {
      const { data } = await axios.post('/api/migration/jenkinsfile', {
        jenkinsfile,
        aiProvider,
        cicdPlatform,
        aiOptions,
      });
      onConverted(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Conversion failed. Check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setJenkinsfile(ev.target.result);
    reader.readAsText(file);
  };

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-2xl w-full space-y-6 ff-enter">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-teal-300">Migration</p>
          <h2 className="text-3xl font-bold">Pipeline Migration</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Paste a Jenkinsfile or upload one. The AI will convert it to{' '}
            <span className="text-amber-300 font-medium">{platformNames[cicdPlatform] || 'CI/CD'}</span>{' '}
            and generate a visual workflow.
          </p>
        </div>

        <div className="flex gap-3">
          <label className="px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors ff-btn-secondary hover:border-slate-500">
            Upload Jenkinsfile
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".groovy,.jenkinsfile,Jenkinsfile" />
          </label>
          <button
            onClick={() => setJenkinsfile(exampleJenkinsfile)}
            className="px-4 py-2 rounded-lg text-sm transition-colors ff-btn-secondary hover:border-slate-500"
          >
            Load Example
          </button>
        </div>

        <textarea
          value={jenkinsfile}
          onChange={(e) => setJenkinsfile(e.target.value)}
          placeholder="Paste your Jenkinsfile here..."
          rows={14}
          className="ff-input p-4 text-sm ff-code resize-none"
        />

        <button
          onClick={handleConvert}
          disabled={loading || !jenkinsfile.trim()}
          className="w-full py-3 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity ff-btn-primary"
        >
          {loading ? 'Converting...' : `Convert to ${platformNames[cicdPlatform] || 'CI/CD'}`}
        </button>

        {error && <p className="text-rose-300 text-sm">{error}</p>}
      </div>
    </div>
  );
}
