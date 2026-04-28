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

const app = express();
const PORT = process.env.PORT || 3001;

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
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api/pipelines', pipelineRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/advisor', advisorRoutes);
app.use('/api/config', configRoutes);
app.use('/api/n8n', n8nRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/repo', repoRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'flowforge-backend' });
});

app.listen(PORT, () => {
  console.log(`FlowForge backend running on port ${PORT}`);
});
