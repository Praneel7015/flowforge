/**
 * Central 404 + error handling. Keeps raw internal error strings (which can
 * contain upstream URLs or tokens) out of client responses in production while
 * still logging the full detail server-side.
 */

const { logSafe } = require('../utils/logSafe');

const IS_PROD = process.env.NODE_ENV === 'production';

function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Express error middleware MUST keep the 4-arg signature.
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  // body-parser's message quotes part of the raw body, which may hold credentials.
  const message = err.type === 'entity.parse.failed' ? 'Invalid JSON body' : err.message;

  console.error('[error] %s %s -> %d: %s', logSafe(req.method, 10), logSafe(String(req.originalUrl || '').split('?')[0]), Number(status) || 500, logSafe(message));

  if (res.headersSent) return next(err);

  const clientMessage =
    status < 500 || !IS_PROD ? message || 'Request failed' : 'Internal server error';

  res.status(status).json({ error: clientMessage });
}

module.exports = { notFound, errorHandler };
