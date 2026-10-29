require('dotenv').config();
const express = require('express');
const cors = require('cors');

const pipelineRoutes = require('./routes/pipelineRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const migrationRoutes = require('./routes/migrationRoutes');
const advisorRoutes = require('./routes/advisorRoutes');
const configRoutes = require('./routes/configRoutes');
const n8nRoutes = require('./routes/n8nRoutes');
const platformRoutes = require('./routes/platformRoutes');
const repoRoutes = require('./routes/repoRoutes');
const runRoutes = require('./routes/runRoutes');
const { securityHeaders, createRateLimiter } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Behind a proxy/load balancer, honor X-Forwarded-* so rate limiting keys on the
// real client IP. Enable only when TRUST_PROXY is set to avoid IP spoofing.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
}

app.disable('x-powered-by');
app.use(securityHeaders);

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((u) => u.trim())
  : [];

// First-party hosts are always allowed, so a subdomain missing from
// FRONTEND_URL on the host can't take the production site down.
const FIRST_PARTY_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*highcortisol\.xyz$/i;

function isAllowedOrigin(origin) {
  if (FIRST_PARTY_ORIGIN.test(origin)) return true;
  // In dev (no FRONTEND_URL set), allow localhost
  if (allowedOrigins.length === 0) {
    return origin.includes('localhost') || origin.includes('127.0.0.1');
  }
  return (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.vercel.app') ||
    origin.endsWith('.onrender.com')
  );
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, health checks)
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    // 403 rather than a generic 500 so a misconfigured origin is diagnosable.
    const err = new Error(`CORS: Origin ${origin} not allowed`);
    err.status = 403;
    callback(err);
  },
  credentials: true,
}));
app.use(express.json({
  limit: '2mb',
  // Keep the exact request bytes so webhook HMACs are checked against what the
  // sender signed, not a re-serialisation of the parsed body.
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

// General API rate limit, plus a tighter limit on AI/compute-heavy routes that
// consume the server's own provider credits.
const generalLimiter = createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 120),
});
const aiLimiter = createRateLimiter({
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.AI_RATE_LIMIT_MAX || 20),
  message: 'AI request rate limit reached. Please wait before retrying.',
});

app.use('/api/', generalLimiter);

app.use('/api/pipelines', aiLimiter, pipelineRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/migration', aiLimiter, migrationRoutes);
app.use('/api/advisor', aiLimiter, advisorRoutes);
app.use('/api/config', configRoutes);
app.use('/api/n8n', n8nRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/repo', repoRoutes);
app.use('/api/runs', runRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'flowforge-backend',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', notFound);
app.use(errorHandler);

// Express 5 hands bind errors (port in use, no permission) to this callback.
const server = app.listen(PORT, (err) => {
  if (err) {
    console.error('Failed to start on port %s: %s', PORT, err.message);
    process.exit(1);
  }
  console.log(`FlowForge backend running on port ${PORT}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received: closing HTTP server gracefully...`);
  server.close(() => {
    process.exit(0);
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
