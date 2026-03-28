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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/pipelines', pipelineRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/advisor', advisorRoutes);
app.use('/api/config', configRoutes);
app.use('/api/n8n', n8nRoutes);
app.use('/api/platforms', platformRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'flowforge-backend' });
});

app.listen(PORT, () => {
  console.log(`FlowForge backend running on port ${PORT}`);
});
