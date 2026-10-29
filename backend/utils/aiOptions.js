/**
 * Build per-request AI options for BYOM (Bring Your Own Model).
 * Secrets are accepted per request and not persisted.
 */
const { inspectUrl } = require('./ssrf');

// Region/location/project values are interpolated into cloud hostnames and
// paths, so they must match the provider's naming exactly (no host injection).
const AWS_REGION_PATTERN = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
const VERTEX_LOCATION_PATTERN = /^(global|[a-z]+-[a-z]+\d+)$/;
const GCP_PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const AWS_ACCESS_KEY_PATTERN = /^[A-Z0-9]{16,128}$/;
const MAX_SERVICE_ACCOUNT_JSON = 10_000;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function sanitizeBaseUrl(value) {
  const url = sanitizeText(value, 500);
  if (!url) return undefined;
  // SSRF guard: reject internal/loopback/metadata targets so a caller cannot
  // use the backend to reach hosts it should not.
  // API keys are sent to this URL: never over plain HTTP.
  const inspection = inspectUrl(url, { requireHttps: true });
  if (!inspection.safe) {
    throw badRequest(`Rejected baseUrl: ${inspection.reason}`);
  }
  if (!/^https:\/\//i.test(url)) {
    throw badRequest('Rejected baseUrl: custom endpoints must use https://');
  }
  return url;
}

function sanitizePattern(value, pattern, label) {
  const text = sanitizeText(value, 100);
  if (!text) return undefined;
  if (!pattern.test(text)) throw badRequest(`Invalid ${label}: ${text}`);
  return text;
}

function sanitizeServiceAccountJson(value) {
  const raw = typeof value === 'object' && value !== null ? JSON.stringify(value) : sanitizeText(value, MAX_SERVICE_ACCOUNT_JSON + 1);
  if (!raw) return undefined;
  if (raw.length > MAX_SERVICE_ACCOUNT_JSON) throw badRequest('Service account JSON is too large');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw badRequest('Service account JSON is not valid JSON');
  }
  if (typeof parsed?.client_email !== 'string' || typeof parsed?.private_key !== 'string') {
    throw badRequest('Service account JSON must include client_email and private_key');
  }
  return raw;
}

function buildAIOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const candidates = {
    apiKey: sanitizeText(raw.apiKey, 500),
    model: sanitizeText(raw.model, 200),
    baseUrl: sanitizeBaseUrl(raw.baseUrl),
    // AWS Bedrock
    region: sanitizePattern(raw.region, AWS_REGION_PATTERN, 'AWS region'),
    accessKeyId: sanitizePattern(raw.accessKeyId, AWS_ACCESS_KEY_PATTERN, 'AWS access key ID'),
    secretAccessKey: sanitizeText(raw.secretAccessKey, 200),
    sessionToken: sanitizeText(raw.sessionToken, 4000),
    // Google Vertex AI
    projectId: sanitizePattern(raw.projectId, GCP_PROJECT_PATTERN, 'GCP project ID'),
    location: sanitizePattern(raw.location, VERTEX_LOCATION_PATTERN, 'Vertex location'),
    serviceAccountJson: sanitizeServiceAccountJson(raw.serviceAccountJson),
  };

  return Object.fromEntries(Object.entries(candidates).filter(([, value]) => value !== undefined));
}

module.exports = {
  buildAIOptions,
  AWS_REGION_PATTERN,
  VERTEX_LOCATION_PATTERN,
  GCP_PROJECT_PATTERN,
};
