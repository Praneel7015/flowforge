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

/**
 * Keeps the error's own status. A 4xx message is shown (it describes the
 * caller's request); a 5xx message is shown only outside production, since it
 * can carry network errors or raw upstream text.
 */
function sendStatusError(res, err, fallback) {
  const status = Number(err && (err.status || err.statusCode)) || 500;
  const show = err && err.message && (status < 500 || !IS_PROD);
  return res.status(status).json({ error: show ? err.message : fallback });
}

module.exports = { sendError, sendStatusError };
