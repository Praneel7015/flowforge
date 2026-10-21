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

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, health checks)
    if (!origin) return callback(null, true);
    // In dev (no FRONTEND_URL set), allow localhost
    if (allowedOrigins.length === 0) {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      return callback(new Error('CORS: Set FRONTEND_URL env var for production'));
    }
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
      return callback(null, true);
    }
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

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

const server = app.listen(PORT, () => {
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
