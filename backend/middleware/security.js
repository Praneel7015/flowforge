/**
 * Zero-dependency security middleware: response hardening headers and a simple
 * in-memory rate limiter. Kept dependency-free so it works in air-gapped/offline
 * deploys without pulling helmet/express-rate-limit.
 */

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // API responses are JSON; a strict CSP is safe and blocks reflected-content abuse.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.removeHeader('X-Powered-By');
  next();
}

function clientKey(req) {
  // Trust the socket address by default. If deployed behind a proxy, set
  // app.set('trust proxy', ...) so req.ip reflects the real client.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed-window in-memory rate limiter.
 * @param {{ windowMs?: number, max?: number, message?: string }} options
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60_000;
  const max = options.max || 60;
  const message = options.message || 'Too many requests, please slow down.';
  const buckets = new Map();

  // Periodic sweep so the map does not grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  return function rateLimiter(req, res, next) {
    const key = clientKey(req);
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

module.exports = { securityHeaders, createRateLimiter };
