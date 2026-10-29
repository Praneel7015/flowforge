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
const { logSafe } = require('./logSafe');
const { Agent: UndiciAgent, fetch: undiciFetch } = require('undici');

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
    inRange('100.64.0.0', 10) || // carrier-grade NAT
    inRange('192.0.0.0', 24) || // IETF protocol assignments
    inRange('192.0.2.0', 24) || // TEST-NET-1
    inRange('198.18.0.0', 15) || // benchmarking (used inside some cloud networks)
    inRange('198.51.100.0', 24) || // TEST-NET-2
    inRange('203.0.113.0', 24) || // TEST-NET-3
    inRange('224.0.0.0', 3) // multicast, reserved and broadcast (224.0.0.0-255.255.255.255)
  );
}

// "7f00", "1" -> "127.0.0.1"
function hexPairToIPv4(highHex, lowHex) {
  const high = parseInt(highHex, 16);
  const low = parseInt(lowHex, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function normalizeIpv6(host) {
  // Strip brackets and zone id: [::1%eth0] -> ::1
  return host.replace(/^\[/, '').replace(/\]$/, '').split('%')[0].toLowerCase();
}

function isPrivateIPv6(host) {
  const addr = normalizeIpv6(host);
  if (addr === '::1' || addr === '::') return true;
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true; // link-local fe80::/10 (fe80–febf)
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('ff')) return true; // multicast ff00::/8
  // NAT64 (64:ff9b::/96) and 6to4 (2002::/16) embed an IPv4 address.
  const nat64 = addr.match(/^64:ff9b::(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (nat64) return isPrivateIPv4(nat64[1] || hexPairToIPv4(nat64[2], nat64[3]));
  const sixToFour = addr.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/);
  if (sixToFour) return isPrivateIPv4(hexPairToIPv4(sixToFour[1], sixToFour[2]));
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // The WHATWG URL parser rewrites [::ffff:127.0.0.1] to [::ffff:7f00:1], so
  // the hex form must be decoded too. Deprecated IPv4-compatible addresses
  // (::7f00:1) are treated the same way.
  const hexMapped = addr.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) return isPrivateIPv4(hexPairToIPv4(hexMapped[1], hexMapped[2]));
  return false;
}

/**
 * @param {string} rawUrl
 * @param {{ requireHttps?: boolean }} [options] Require TLS for URLs carrying credentials.
 * @returns {{ safe: boolean, reason?: string }}
 */
function inspectUrl(rawUrl, { requireHttps = false } = {}) {
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
  if (requireHttps && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'custom endpoints must use https://' };
  }

  // "localhost." names the same host as "localhost": strip trailing dots first.
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');

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
        // Callers can see this message, so it must not reveal internal DNS
        // answers; the resolved address is only logged server-side.
        console.warn(`[ssrf] blocked ${logSafe(hostname)} -> ${blocked ? blocked.address : 'no addresses'}`);
        const error = new Error(`Blocked: ${hostname} does not resolve to a public address`);
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
// proxy: false makes axios ignore HTTP(S)_PROXY env vars; through a proxy the
// lookup would validate the proxy's address, not the real destination.
const safeAgents = {
  httpAgent: new http.Agent({ lookup: safeLookup }),
  httpsAgent: new https.Agent({ lookup: safeLookup }),
  proxy: false,
};

/**
 * fetch for SDK clients (OpenAI, Groq) calling user-supplied base URLs: the
 * same connect-time address check as safeAgents, and no redirects. Uses
 * undici's own fetch so the dispatcher always matches its version.
 */
const safeDispatcher = new UndiciAgent({ connect: { lookup: safeLookup } });

function safeFetch(url, init = {}) {
  return undiciFetch(url, { ...init, redirect: 'error', dispatcher: safeDispatcher });
}

module.exports = {
  inspectUrl,
  isSafePublicUrl,
  isPrivateIPv4,
  isPrivateIPv6,
  createSafeLookup,
  safeLookup,
  safeAgents,
  safeFetch,
};
