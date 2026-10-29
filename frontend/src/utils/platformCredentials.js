// Platform credentials (GitHub / GitLab / Bitbucket / CircleCI) for the whole
// app. Tokens and app passwords stay in memory only, like BYOM keys: anything
// in localStorage is readable by any script or extension on the origin and
// outlives the session. Only non-secret settings (instance URL, username,
// default repository, workspace...) are remembered across reloads.

const SETTINGS_KEY = 'flowforge.platformSettings.v1';
// Older builds stored everything, tokens included, under this key.
const LEGACY_KEY = 'flowforge.platformCredentials.v1';
const SECRET_FIELDS = new Set(['token', 'appPassword']);

// A URL can carry a credential: https://user:pass@host, or a token in the
// query or fragment (?private_token=...). Such a URL is kept in memory with
// the tokens rather than saved as a setting; a plain instance URL is saved.
function mayCarryCredential(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return Boolean(url.username || url.password || url.search || url.hash);
  } catch {
    return /[@?#]/.test(value);
  }
}

const isSecret = (name, value) => SECRET_FIELDS.has(name) || mayCarryCredential(value);

let secrets = {};
let settings = {};
const listeners = new Set();

function splitByPlatform(all) {
  const nextSecrets = {};
  const nextSettings = {};
  for (const [platform, fields] of Object.entries(all || {})) {
    if (!fields || typeof fields !== 'object') continue;
    for (const [name, value] of Object.entries(fields)) {
      const target = isSecret(name, value) ? nextSecrets : nextSettings;
      (target[platform] ||= {})[name] = value;
    }
  }
  return { nextSecrets, nextSettings };
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings stay in memory */
  }
}

function load() {
  try {
    settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch {
    settings = {};
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      // Keep this session working, then drop the stored tokens for good.
      const { nextSecrets, nextSettings } = splitByPlatform(JSON.parse(legacy));
      secrets = nextSecrets;
      for (const [platform, fields] of Object.entries(nextSettings)) {
        settings[platform] = { ...fields, ...settings[platform] };
      }
      persistSettings();
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  }
}

load();

/** All platforms: { [platform]: { ...settings, ...secrets } } (a fresh object). */
export function readPlatformCredentials() {
  const merged = {};
  for (const platform of new Set([...Object.keys(settings), ...Object.keys(secrets)])) {
    merged[platform] = { ...settings[platform], ...secrets[platform] };
  }
  return merged;
}

/** One platform's credentials, e.g. readCredentialsFor('github').token */
export function readCredentialsFor(platform) {
  return readPlatformCredentials()[platform] || {};
}

/** Replaces all credentials; secrets go to memory, the rest to localStorage. */
export function writePlatformCredentials(all) {
  const { nextSecrets, nextSettings } = splitByPlatform(all);
  secrets = nextSecrets;
  settings = nextSettings;
  persistSettings();
  listeners.forEach((fn) => fn());
}

/** Notified after every write; returns an unsubscribe function. */
export function subscribePlatformCredentials(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const PLATFORM_SECRET_FIELDS = SECRET_FIELDS;
