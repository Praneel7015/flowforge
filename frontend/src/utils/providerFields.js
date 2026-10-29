/**
 * Provider-specific BYOM fields (beyond model / base URL / API key).
 *
 * Only the selected provider's fields are sent with a request, so credentials
 * saved for one provider never ride along with calls to another (the backend
 * drops its own server key whenever a request carries user credentials).
 */

export const PROVIDER_FIELDS = {
  vertex: [
    { name: 'projectId', label: 'GCP project ID', placeholder: 'my-project-123 (or taken from the JSON key)' },
    { name: 'location', label: 'Location', placeholder: 'global or us-central1' },
    {
      name: 'serviceAccountJson',
      label: 'Service account JSON key (optional if using an API key)',
      placeholder: '{ "type": "service_account", "client_email": "...", "private_key": "..." }',
      secret: true,
      multiline: true,
      span: 2,
    },
  ],
  bedrock: [
    { name: 'region', label: 'AWS region', placeholder: 'us-east-1' },
    { name: 'accessKeyId', label: 'Access key ID (optional)', placeholder: 'AKIA...', secret: true },
    { name: 'secretAccessKey', label: 'Secret access key (optional)', placeholder: 'Only with an access key ID', secret: true, password: true },
    { name: 'sessionToken', label: 'Session token (optional)', placeholder: 'For temporary credentials', secret: true, password: true },
  ],
};

export const API_KEY_LABELS = {
  vertex: 'Vertex API key (express mode)',
  bedrock: 'Bedrock API key',
  openai_compatible: 'API key (optional)',
};

// Providers whose endpoint is fixed by the cloud (region/location), not a base URL.
export const NO_BASE_URL = new Set(['vertex', 'bedrock']);

export const EXTRA_FIELD_NAMES = Object.values(PROVIDER_FIELDS).flat().map((f) => f.name);
export const SECRET_FIELD_NAMES = Object.values(PROVIDER_FIELDS)
  .flat()
  .filter((f) => f.secret)
  .map((f) => f.name);

/** Builds the aiOptions payload for the selected provider, or undefined. */
export function buildAiOptions(provider, byom) {
  const fields = PROVIDER_FIELDS[provider] || [];
  const options = {
    model: byom.model?.trim() || undefined,
    baseUrl: NO_BASE_URL.has(provider) ? undefined : byom.baseUrl?.trim() || undefined,
    apiKey: byom.enabled ? byom.apiKey?.trim() || undefined : undefined,
  };
  for (const field of fields) {
    const value = byom[field.name]?.trim();
    // Secrets only go out when "Use custom credentials" is on.
    if (value && (!field.secret || byom.enabled)) options[field.name] = value;
  }

  const cleaned = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}
