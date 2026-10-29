const crypto = require('crypto');

/**
 * Anonymous, server-signed chat sessions.
 *
 * FlowForge has no accounts, but n8n uses userId/chatId as memory keys, so
 * those keys must not be chosen by the caller. The server hands out an opaque
 * token `<sessionId>.<hmac>`; only tokens it signed are accepted, and the n8n
 * keys are derived from the session id with the same secret, so nobody can
 * pick (or guess) another visitor's keys.
 */

const MIN_SECRET_LENGTH = 32;
let cachedSecret = null;

function getSessionSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.SESSION_SECRET;
  if (typeof fromEnv === 'string' && fromEnv.length >= MIN_SECRET_LENGTH) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[security] SESSION_SECRET is unset or shorter than ${MIN_SECRET_LENGTH} characters; ` +
        'using a random per-process secret. n8n chat sessions will reset on every restart ' +
        'and will not be shared across instances.'
    );
  }
  cachedSecret = crypto.randomBytes(32).toString('hex');
  return cachedSecret;
}

function hmac(value) {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function issueSessionToken() {
  const sessionId = crypto.randomUUID();
  return `${sessionId}.${hmac(`session:${sessionId}`)}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Returns the session id for a token this server signed, otherwise null. */
function verifySessionToken(token) {
  if (typeof token !== 'string' || token.length > 200) return null;

  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const sessionId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!UUID_PATTERN.test(sessionId)) return null;

  const expected = Buffer.from(hmac(`session:${sessionId}`));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }
  return sessionId;
}

const CONVERSATION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Derive the n8n memory keys. The client may pick a conversation label (so
 * "Clear chat" starts fresh memory), but it is always scoped under its own
 * signed session, so it cannot reach another session's conversations.
 */
function deriveChatKeys(sessionId, conversationLabel) {
  const userId = `anon-${hmac(`user:${sessionId}`).slice(0, 24)}`;
  const label =
    typeof conversationLabel === 'string' && CONVERSATION_PATTERN.test(conversationLabel)
      ? conversationLabel
      : 'default';
  const chatId = `chat-${hmac(`chat:${sessionId}:${label}`).slice(0, 24)}`;

  return {
    userId,
    username: `flowforge-${userId.slice(-6)}`,
    chatId,
    conversationId: chatId,
  };
}

/**
 * Resolve the caller's session: verify the presented token, or issue a fresh
 * one when it is missing or forged.
 */
function resolveChatSession(token) {
  const sessionId = verifySessionToken(token);
  if (sessionId) return { sessionId, token, reissued: false };

  const fresh = issueSessionToken();
  return { sessionId: verifySessionToken(fresh), token: fresh, reissued: true };
}

function resetSessionSecretForTests() {
  cachedSecret = null;
}

module.exports = {
  getSessionSecret,
  issueSessionToken,
  verifySessionToken,
  deriveChatKeys,
  resolveChatSession,
  resetSessionSecretForTests,
};
