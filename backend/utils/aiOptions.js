/**
 * Build per-request AI options for BYOM (Bring Your Own Model).
 * Secrets are accepted per request and not persisted.
 */
function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function sanitizeBaseUrl(value) {
  const url = sanitizeText(value, 500);
  if (!url) return undefined;
  if (!/^https?:\/\//i.test(url)) return undefined;
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
