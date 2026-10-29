/**
 * SSRF guard for user-supplied URLs (BYOM base URLs, future webhook targets).
 *
 * FlowForge accepts a per-request `baseUrl` for Bring-Your-Own-Model. Without a
 * guard, a caller could point the backend at internal-only hosts (cloud metadata
 * endpoints, localhost admin panels, private ranges) and use the server as a
 * proxy. This performs a literal-address check that blocks the common payloads.
 *
 * inspectUrl() validates the literal host in the URL. On its own that does not
 * stop a public hostname that resolves to a private IP (DNS rebinding), so
 * outbound clients for user-supplied URLs also use safeLookup / safeAgents,
 * which validate the addresses at connect time.
 */
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
]);

function ipv4ToInt(host) {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function isPrivateIPv4(host) {
  const int = ipv4ToInt(host);
  if (int === null) return false;

  const inRange = (cidrBase, bits) => {
    const base = ipv4ToInt(cidrBase);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (int & mask) === (base & mask);
  };

  return (
    inRange('10.0.0.0', 8) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.168.0.0', 16) ||
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local (cloud metadata: 169.254.169.254)
    inRange('0.0.0.0', 8) ||
    inRange('100.64.0.0', 10) // carrier-grade NAT
  );
}

function normalizeIpv6(host) {
  // Strip brackets and zone id: [::1%eth0] -> ::1
  return host.replace(/^\[/, '').replace(/\]$/, '').split('%')[0].toLowerCase();
}

function isPrivateIPv6(host) {
  const addr = normalizeIpv6(host);
  if (addr === '::1' || addr === '::') return true;
  if (addr.startsWith('fe80')) return true; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * @param {string} rawUrl
 * @returns {{ safe: boolean, reason?: string }}
 */
function inspectUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { safe: false, reason: 'URL is empty' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'URL is malformed' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Protocol ${parsed.protocol} is not allowed` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `Host ${hostname} is not allowed` };
  }

  if (hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    return { safe: false, reason: `Host ${hostname} is not allowed` };
  }

  if (parsed.hostname.includes(':') || parsed.hostname.startsWith('[')) {
    if (isPrivateIPv6(parsed.hostname)) {
      return { safe: false, reason: 'URL targets a private IPv6 address' };
    }
  } else if (isPrivateIPv4(hostname)) {
    return { safe: false, reason: 'URL targets a private/loopback IPv4 address' };
  }

  return { safe: true };
}

function isSafePublicUrl(rawUrl) {
  return inspectUrl(rawUrl).safe;
}

function isPrivateAddress(address, family) {
  return family === 6 || net.isIPv6(address) ? isPrivateIPv6(address) : isPrivateIPv4(address);
}

/**
 * DNS lookup for sockets that rejects private, loopback and link-local
 * addresses. Every resolved address is checked and the socket connects only
 * to those, so there is no second resolution an attacker can rebind. The URL
 * hostname is unchanged, so TLS SNI and certificate checks still use it.
 */
function createSafeLookup(baseLookup = dns.lookup) {
  return function safeLookup(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    baseLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = Array.isArray(addresses) ? addresses : [];
      const blocked = list.find((a) => isPrivateAddress(a.address, a.family));
      if (list.length === 0 || blocked) {
        const error = new Error(
          `Blocked: ${hostname} resolves to a non-public address${blocked ? ` (${blocked.address})` : ''}`
        );
        error.code = 'ESSRFBLOCKED';
        return callback(error);
      }
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

const safeLookup = createSafeLookup();

/** http/https agents for axios clients that call user-supplied URLs. */
const safeAgents = {
  httpAgent: new http.Agent({ lookup: safeLookup }),
  httpsAgent: new https.Agent({ lookup: safeLookup }),
};

module.exports = {
  inspectUrl,
  isSafePublicUrl,
  isPrivateIPv4,
  isPrivateIPv6,
  createSafeLookup,
  safeLookup,
  safeAgents,
};
