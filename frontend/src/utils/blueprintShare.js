/**
 * Zero-Database Shareable Pipeline Blueprint URLs (#blueprint=<base64url>)
 * Uses UTF-8 safe TextEncoder / TextDecoder + URL-safe Base64 encoding.
 */

const BLUEPRINT_HASH_PREFIX = '#blueprint=';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(base64Url) {
  const padded = String(base64Url || '')
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function sanitizeNodesForShare(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => {
    const { onInlineUpdate, runStatus, runDuration, ...cleanData } = node?.data || {};
    return {
      id: String(node.id || ''),
      type: String(node.type || 'build'),
      position: {
        x: Math.round(Number(node?.position?.x) || 0),
        y: Math.round(Number(node?.position?.y) || 0),
      },
      data: cleanData,
    };
  });
}

function sanitizeEdgesForShare(edges) {
  if (!Array.isArray(edges)) return [];
  return edges.map((edge) => ({
    id: String(edge.id || `${edge.source}-${edge.target}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    animated: edge.animated !== false,
  }));
}

export function encodeBlueprint({ nodes = [], edges = [], cicdPlatform = 'gitlab' } = {}) {
  const payload = {
    v: 1,
    cicdPlatform: cicdPlatform || 'gitlab',
    nodes: sanitizeNodesForShare(nodes),
    edges: sanitizeEdgesForShare(edges),
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

export function decodeBlueprint(input) {
  if (typeof input !== 'string' || !input.trim()) return null;

  let encoded = input.trim();
  if (encoded.startsWith(BLUEPRINT_HASH_PREFIX)) {
    encoded = encoded.slice(BLUEPRINT_HASH_PREFIX.length);
  } else if (encoded.startsWith('blueprint=')) {
    encoded = encoded.slice('blueprint='.length);
  }

  if (!encoded) return null;

  try {
    const bytes = base64UrlToBytes(encoded);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) {
      return null;
    }

    return {
      nodes: parsed.nodes,
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      cicdPlatform: typeof parsed.cicdPlatform === 'string' ? parsed.cicdPlatform : undefined,
    };
  } catch {
    return null;
  }
}

export function buildBlueprintShareUrl({ nodes = [], edges = [], cicdPlatform = 'gitlab' } = {}) {
  const encoded = encodeBlueprint({ nodes, edges, cicdPlatform });
  if (typeof window === 'undefined') {
    return `${BLUEPRINT_HASH_PREFIX}${encoded}`;
  }
  return `${window.location.origin}${window.location.pathname}${BLUEPRINT_HASH_PREFIX}${encoded}`;
}

export function readBlueprintFromLocationHash() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith(BLUEPRINT_HASH_PREFIX)) return null;
  return decodeBlueprint(hash);
}
