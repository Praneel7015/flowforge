function parseBooleanFlag(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return defaultValue;
}

export function getClientFeatureFlags() {
  return {
    advancedNodes: parseBooleanFlag(import.meta.env.VITE_FF_ADVANCED_NODES, true),
    providerSelfTest: parseBooleanFlag(import.meta.env.VITE_FF_PROVIDER_SELF_TEST, true),
  };
}

export function mergeFeatureFlags(clientFlags, serverFlags = {}) {
  return {
    advancedNodes: clientFlags.advancedNodes && serverFlags.advancedNodes !== false,
    providerSelfTest: clientFlags.providerSelfTest && serverFlags.providerSelfTest !== false,
  };
}
