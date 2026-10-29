/**
 * Sends a controller error. 400s keep their message (it describes the
 * caller's request); 500s only include upstream details outside production,
 * since provider and platform errors can contain internal information.
 */
const IS_PROD = process.env.NODE_ENV === 'production';

function sendError(res, err, summary) {
  const status = err && err.status === 400 ? 400 : 500;
  const detail = err && err.message;
  const message = detail && (status < 500 || !IS_PROD) ? `${summary}: ${detail}` : summary;
  return res.status(status).json({ error: message });
}

module.exports = { sendError };
