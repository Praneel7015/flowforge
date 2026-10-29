import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { readPlatformCredentials as readStoredCredentials } from '../utils/platformCredentials';

const PLATFORM_LABELS = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};


function hasCredentials(creds, platform) {
  if (!creds[platform]) return false;
  if (platform === 'bitbucket') return !!(creds[platform].username && creds[platform].appPassword);
  return !!(creds[platform].token);
}

export default function RepoBrowser({ platform, onRepoSelect, onBranchSelect, selectedRepo, selectedOwner, selectedBranch }) {
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  // Two repos can share a name (alice/api, acme/api), so the choice is kept
  // by full name; parents still get the plain name.
  const [selectedFullName, setSelectedFullName] = useState('');

  // The repo the parent has selected. After a remount the local full name is
  // gone, so the parent's owner disambiguates; the bare name is a last resort.
  const findRepo = useCallback(
    (name) =>
      repos.find((r) => r.fullName === selectedFullName && r.name === name) ||
      (selectedOwner && repos.find((r) => r.name === name && r.owner === selectedOwner)) ||
      repos.find((r) => r.name === name || r.fullName === name),
    [repos, selectedFullName, selectedOwner]
  );

  const allCreds = readStoredCredentials();
  const isConnected = hasCredentials(allCreds, platform);

  const fetchRepos = useCallback(async () => {
    if (!isConnected) return;
    setLoadingRepos(true);
    setError('');
    try {
      const { data } = await axios.post('/api/repo/list-repos', {
        platform,
        credentials: readStoredCredentials()[platform] || {},
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
      const creds = readStoredCredentials()[platform] || {};
      const repo = findRepo(repoName);
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
  }, [platform, isConnected, onBranchSelect, findRepo]);

  useEffect(() => {
    if (isConnected) fetchRepos();
  }, [fetchRepos, isConnected]);

  // Branches are fetched only when the selected repo changes. fetchBranches
  // itself changes whenever repos or the parent's onBranchSelect do (some
  // parents pass an inline callback), so call the latest one through a ref
  // instead of re-fetching on every such change.
  const fetchBranchesRef = useRef(fetchBranches);
  useEffect(() => {
    fetchBranchesRef.current = fetchBranches;
  });

  useEffect(() => {
    if (selectedRepo) fetchBranchesRef.current(selectedRepo);
  }, [selectedRepo, selectedFullName]);

  const handleRepoChange = (e) => {
    const value = e.target.value;
    const selectedRepoObj = repos.find((r) => r.fullName === value) || null;
    setSelectedFullName(value);
    onRepoSelect(selectedRepoObj?.name || '', selectedRepoObj?.owner, selectedRepoObj);
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
          value={(selectedRepo && findRepo(selectedRepo)?.fullName) || ''}
          onChange={handleRepoChange}
          disabled={loadingRepos}
          className="ff-input px-3 py-2 text-sm"
        >
          <option value="">{loadingRepos ? 'Loading...' : 'Select a repository'}</option>
          {filteredRepos.map((r) => (
            <option key={r.id} value={r.fullName}>
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
