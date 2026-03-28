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

function buildAIOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  return {
    apiKey: sanitizeText(raw.apiKey, 500),
    model: sanitizeText(raw.model, 200),
    baseUrl: sanitizeText(raw.baseUrl, 500),
  };
}

module.exports = { buildAIOptions };
