import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const PLATFORM_LABELS = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

const CREDS_KEY = 'flowforge.platformCredentials.v1';

function readStoredCredentials() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function hasCredentials(creds, platform) {
  if (!creds[platform]) return false;
  if (platform === 'bitbucket') return !!(creds[platform].username && creds[platform].appPassword);
  return !!(creds[platform].token);
}

export default function RepoBrowser({ platform, onRepoSelect, onBranchSelect, selectedRepo, selectedBranch }) {
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState('');
  const [repoSearch, setRepoSearch] = useState('');

  const allCreds = readStoredCredentials();
  const creds = allCreds[platform] || {};
  const isConnected = hasCredentials(allCreds, platform);

  const fetchRepos = useCallback(async () => {
    if (!isConnected) return;
    setLoadingRepos(true);
    setError('');
    try {
      const { data } = await axios.post('/api/repo/list-repos', {
        platform,
        credentials: creds,
      });
      setRepos(data.repos || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load repositories');
    } finally {
      setLoadingRepos(false);
    }
  }, [platform, isConnected]);

  const fetchBranches = useCallback(async (repoName) => {
    if (!isConnected || !repoName) return;
    setLoadingBranches(true);
    setBranches([]);
    try {
      const repo = repos.find((r) => r.name === repoName || r.fullName === repoName);
      const owner = repo?.owner || creds.username || '';
      const { data } = await axios.post('/api/repo/list-branches', {
        platform,
        credentials: creds,
        owner,
        repo: platform === 'gitlab' ? (repo?.id || repoName) : repoName,
      });
      setBranches(data.branches || []);

      // Auto-select default branch
      const defaultBranch = repo?.defaultBranch || 'main';
      const found = (data.branches || []).find((b) => b.name === defaultBranch);
      onBranchSelect(found?.name || data.branches?.[0]?.name || defaultBranch);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load branches');
    } finally {
      setLoadingBranches(false);
    }
  }, [platform, repos, creds, isConnected, onBranchSelect]);

  useEffect(() => {
    if (isConnected) fetchRepos();
  }, [fetchRepos, isConnected]);

  useEffect(() => {
    if (selectedRepo) fetchBranches(selectedRepo);
  }, [selectedRepo]);

  const handleRepoChange = (e) => {
    const value = e.target.value;
    onRepoSelect(value);
    onBranchSelect('');
  };

  const filteredRepos = repoSearch
    ? repos.filter((r) => r.fullName.toLowerCase().includes(repoSearch.toLowerCase()))
    : repos;

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm">
        <p className="text-amber-400 font-medium">
          {PLATFORM_LABELS[platform]} not connected
        </p>
        <p className="text-[var(--ff-text-secondary)] mt-1 text-xs">
          Go to Settings → Platform Integrations, enter your {PLATFORM_LABELS[platform]} credentials and click Test Connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Repo selector */}
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] mb-1.5">Repository</p>
        {repos.length > 8 && (
          <input
            type="text"
            value={repoSearch}
            onChange={(e) => setRepoSearch(e.target.value)}
            placeholder="Search repositories..."
            className="ff-input px-3 py-1.5 text-xs mb-2"
          />
        )}
        <select
          value={selectedRepo || ''}
          onChange={handleRepoChange}
          disabled={loadingRepos}
          className="ff-input px-3 py-2 text-sm"
        >
          <option value="">{loadingRepos ? 'Loading...' : 'Select a repository'}</option>
          {filteredRepos.map((r) => (
            <option key={r.id} value={r.name}>
              {r.fullName}{r.private ? ' 🔒' : ''}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-[var(--ff-danger)] mt-1">{error}</p>}
      </div>

      {/* Branch selector */}
      {selectedRepo && (
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] mb-1.5">Branch</p>
          <select
            value={selectedBranch || ''}
            onChange={(e) => onBranchSelect(e.target.value)}
            disabled={loadingBranches}
            className="ff-input px-3 py-2 text-sm"
          >
            <option value="">{loadingBranches ? 'Loading...' : 'Select a branch'}</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
