/**
 * Sends a controller error. In production the detail is shown only for
 * errors we raised ourselves (marked `expose: true`, e.g. validation). A 400
 * forwarded from an AI provider or platform can carry upstream internals, so
 * it gets the generic summary; outside production every detail is shown.
 */
const IS_PROD = process.env.NODE_ENV === 'production';

function sendError(res, err, summary) {
  const status = err && err.status === 400 ? 400 : 500;
  const detail = err && err.message;
  const showDetail = detail && (!IS_PROD || err.expose === true);
  return res.status(status).json({ error: showDetail ? `${summary}: ${detail}` : summary });
}

module.exports = { sendError };
