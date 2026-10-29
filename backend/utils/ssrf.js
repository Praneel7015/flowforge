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

// Two 16-bit groups -> dotted IPv4 (0x7f00, 0x0001 -> "127.0.0.1").
function groupsToIPv4(high, low) {
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function normalizeIpv6(host) {
  // Strip brackets and zone id: [::1%eth0] -> ::1
  return host.replace(/^\[/, '').replace(/\]$/, '').split('%')[0].toLowerCase();
}

/**
 * Expands an IPv6 address (any textual form: "::" compression, embedded
 * dotted IPv4) into its eight 16-bit groups, or null if it isn't one.
 * Range checks then work on numbers, so "2002:a01::1" and "2002:0a01:0::1"
 * are the same address.
 */
function expandIPv6(addr) {
  let text = addr;
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const parts = dotted[2].split('.').map(Number);
    if (parts.some((p) => p > 255)) return null;
    text = `${dotted[1]}${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part) => (part ? part.split(':') : []);
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function isPrivateIPv6(host) {
  const g = expandIPv6(normalizeIpv6(host));
  // Not parseable as IPv6: refuse rather than guess.
  if (!g) return true;
  const zeroUpTo = (n) => g.slice(0, n).every((x) => x === 0);

  if (zeroUpTo(7) && g[7] <= 1) return true; // :: and ::1
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  // Forms that embed an IPv4 address, which must pass the IPv4 checks:
  if (zeroUpTo(5) && g[5] === 0xffff) return isPrivateIPv4(groupsToIPv4(g[6], g[7])); // ::ffff:a.b.c.d (mapped)
  if (zeroUpTo(6)) return isPrivateIPv4(groupsToIPv4(g[6], g[7])); // ::a.b.c.d (deprecated compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateIPv4(groupsToIPv4(g[6], g[7])); // NAT64 64:ff9b::/96
  }
  if (g[0] === 0x2002) return isPrivateIPv4(groupsToIPv4(g[1], g[2])); // 6to4 2002::/16
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
