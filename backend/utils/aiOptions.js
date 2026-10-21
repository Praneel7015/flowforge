/**
 * Build per-request AI options for BYOM (Bring Your Own Model).
 * Secrets are accepted per request and not persisted.
 */
const { inspectUrl } = require('./ssrf');

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
  const inspection = inspectUrl(url);
  if (!inspection.safe) {
    const error = new Error(`Rejected baseUrl: ${inspection.reason}`);
    error.status = 400;
    throw error;
  }
  return url;
}

function buildAIOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const apiKey = sanitizeText(raw.apiKey, 500);
  const model = sanitizeText(raw.model, 200);
  const baseUrl = sanitizeBaseUrl(raw.baseUrl);

  const options = {};

  if (apiKey) options.apiKey = apiKey;
  if (model) options.model = model;
  if (baseUrl) options.baseUrl = baseUrl;

  return options;
}

module.exports = { buildAIOptions };
