const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const axios = require('axios');
const chatSession = require('../utils/chatSession');
const n8nRoutes = require('../routes/n8nRoutes');
const advisorRoutes = require('../routes/advisorRoutes');

const WEBHOOK = 'https://n8n.example.com/webhook/flowforge';
const SERVER_WEBHOOK = 'https://n8n.example.com/webhook/server-side';
const SESSION_HEADER = 'X-FlowForge-Chat-Session';

let server;
let baseUrl;
let sentPayloads;
const originalPost = axios.post;

const savedServerWebhook = process.env.N8N_CHAT_WEBHOOK_URL;

beforeEach(async () => {
  sentPayloads = [];
  process.env.N8N_CHAT_WEBHOOK_URL = SERVER_WEBHOOK;
  // Capture what would be sent to n8n instead of making a network call.
  axios.post = async (url, payload) => {
    if (url === WEBHOOK || url === SERVER_WEBHOOK) {
      sentPayloads.push(payload);
      return { data: { reply: 'ok' } };
    }
    return originalPost(url, payload);
  };

  const app = express();
  app.use(express.json());
  app.use('/api/n8n', n8nRoutes);
  app.use('/api/advisor', advisorRoutes);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  axios.post = originalPost;
  if (savedServerWebhook === undefined) delete process.env.N8N_CHAT_WEBHOOK_URL;
  else process.env.N8N_CHAT_WEBHOOK_URL = savedServerWebhook;
  await new Promise((resolve) => server.close(resolve));
});

async function chat(body, token, path = '/api/n8n/chat') {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== undefined) headers[SESSION_HEADER] = token;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      chatWebhookUrl: WEBHOOK,
      messages: [{ role: 'user', content: 'hi' }],
      ...body,
    }),
  });
  return { status: res.status, body: await res.json() };
}

test('issued tokens verify; tampered or malformed ones do not', () => {
  const token = chatSession.issueSessionToken();
  const sessionId = chatSession.verifySessionToken(token);
  assert.match(sessionId, /^[0-9a-f-]{36}$/);

  const [id, sig] = token.split('.');
  const flipped = sig[0] === 'A' ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  assert.strictEqual(chatSession.verifySessionToken(`${id}.${flipped}`), null);
  assert.strictEqual(chatSession.verifySessionToken(`${crypto.randomUUID()}.${sig}`), null);
  assert.strictEqual(chatSession.verifySessionToken(id), null);
  assert.strictEqual(chatSession.verifySessionToken(''), null);
  assert.strictEqual(chatSession.verifySessionToken(undefined), null);
  assert.strictEqual(chatSession.verifySessionToken(`user-victim.${sig}`), null);
});

test('a token signed with another secret is rejected', () => {
  const saved = process.env.SESSION_SECRET;
  try {
    process.env.SESSION_SECRET = 'a'.repeat(40);
    chatSession.resetSessionSecretForTests();
    const foreign = chatSession.issueSessionToken();

    process.env.SESSION_SECRET = 'b'.repeat(40);
    chatSession.resetSessionSecretForTests();
    assert.strictEqual(chatSession.verifySessionToken(foreign), null);
  } finally {
    if (saved === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = saved;
    chatSession.resetSessionSecretForTests();
  }
});

test('/chat without a token issues a session and derives keys server-side', async () => {
  const { status, body } = await chat({});
  assert.strictEqual(status, 200);
  assert.strictEqual(body.reply, 'ok');
  assert.ok(chatSession.verifySessionToken(body.sessionToken));

  const [payload] = sentPayloads;
  const expected = chatSession.deriveChatKeys(chatSession.verifySessionToken(body.sessionToken));
  assert.strictEqual(payload.userId, expected.userId);
  assert.strictEqual(payload.chatId, expected.chatId);
  assert.strictEqual(payload.conversationId, expected.chatId);
});

test('/chat ignores userId/chatId/username chosen in the body', async () => {
  const { body } = await chat({
    userId: 'user-victim',
    chatId: 'victim-chat',
    userContext: {
      userId: 'user-victim',
      username: 'victim',
      chatId: 'victim-chat',
      conversationId: 'victim-conversation',
    },
  });

  const [payload] = sentPayloads;
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('victim'), `payload leaked caller ids: ${serialized}`);
  assert.match(payload.userId, /^anon-/);
  assert.match(payload.chatId, /^chat-/);
  assert.deepStrictEqual(payload.userContext, {
    userId: payload.userId,
    username: payload.username,
    chatId: payload.chatId,
    conversationId: payload.conversationId,
  });
  assert.ok(body.sessionToken);
});

test('a valid token keeps the same memory keys across requests', async () => {
  const first = await chat({ userContext: { conversationId: 'conv-1' } });
  const second = await chat({ userContext: { conversationId: 'conv-1' } }, first.body.sessionToken);

  assert.strictEqual(second.body.sessionToken, first.body.sessionToken);
  assert.strictEqual(sentPayloads[1].userId, sentPayloads[0].userId);
  assert.strictEqual(sentPayloads[1].chatId, sentPayloads[0].chatId);
});

test('a new conversation label gets new memory but stays in the same session', async () => {
  const first = await chat({ userContext: { conversationId: 'conv-1' } });
  await chat({ userContext: { conversationId: 'conv-2' } }, first.body.sessionToken);

  assert.strictEqual(sentPayloads[1].userId, sentPayloads[0].userId);
  assert.notStrictEqual(sentPayloads[1].chatId, sentPayloads[0].chatId);
});

test('the same conversation label in another session maps to different keys', async () => {
  const a = await chat({ userContext: { conversationId: 'shared-label' } });
  const b = await chat({ userContext: { conversationId: 'shared-label' } });

  assert.notStrictEqual(a.body.sessionToken, b.body.sessionToken);
  assert.notStrictEqual(sentPayloads[0].userId, sentPayloads[1].userId);
  assert.notStrictEqual(sentPayloads[0].chatId, sentPayloads[1].chatId);
});

test('a forged token is not honoured: a fresh session is issued instead', async () => {
  const victim = await chat({ userContext: { conversationId: 'conv-1' } });
  const [victimId, sig] = victim.body.sessionToken.split('.');
  const forged = `${crypto.randomUUID()}.${sig}`;

  const attacker = await chat({ userContext: { conversationId: 'conv-1' } }, forged);
  assert.strictEqual(attacker.status, 200);
  assert.notStrictEqual(attacker.body.sessionToken, forged);
  assert.notStrictEqual(chatSession.verifySessionToken(attacker.body.sessionToken), victimId);
  assert.notStrictEqual(sentPayloads[1].userId, sentPayloads[0].userId);
  assert.notStrictEqual(sentPayloads[1].chatId, sentPayloads[0].chatId);
});

test('webhook failures still return the session token', async () => {
  axios.post = async () => {
    const err = new Error('boom');
    err.response = { status: 500, data: 'down' };
    throw err;
  };
  const { status, body } = await chat({});
  assert.strictEqual(status, 502);
  assert.ok(chatSession.verifySessionToken(body.sessionToken));
});

// /api/advisor/chat with useN8n posts to the server's N8N_CHAT_WEBHOOK_URL and
// must derive its memory keys the same way.
function advisorChat(body, token) {
  return chat({ chatWebhookUrl: undefined, useN8n: true, ...body }, token, '/api/advisor/chat');
}

const VICTIM_IDS = {
  userId: 'user-victim',
  username: 'victim',
  chatId: 'victim-chat',
  conversationId: 'victim-conversation',
};

test('advisor useN8n ignores ids from the body and headers', async () => {
  const res = await fetch(`${baseUrl}/api/advisor/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FlowForge-User-Id': 'user-victim',
      'X-User-Id': 'user-victim',
      'X-FlowForge-Chat-Id': 'victim-chat',
      'X-FlowForge-Username': 'victim',
    },
    body: JSON.stringify({
      useN8n: true,
      messages: [{ role: 'user', content: 'hi' }],
      ...VICTIM_IDS,
      userContext: VICTIM_IDS,
    }),
  });
  const body = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.reply, 'ok');
  const sessionId = chatSession.verifySessionToken(body.sessionToken);
  assert.ok(sessionId);

  const [payload] = sentPayloads;
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('victim'), `payload leaked caller ids: ${serialized}`);
  assert.strictEqual(payload.userId, chatSession.deriveChatKeys(sessionId).userId);
});

test('advisor useN8n keeps keys for a valid token and reissues for a forged one', async () => {
  const first = await advisorChat({ userContext: { conversationId: 'conv-1' } });
  const again = await advisorChat({ userContext: { conversationId: 'conv-1' } }, first.body.sessionToken);
  assert.strictEqual(again.body.sessionToken, first.body.sessionToken);
  assert.strictEqual(sentPayloads[1].userId, sentPayloads[0].userId);
  assert.strictEqual(sentPayloads[1].chatId, sentPayloads[0].chatId);

  const sig = first.body.sessionToken.split('.')[1];
  const forged = await advisorChat({ userContext: { conversationId: 'conv-1' } }, `${crypto.randomUUID()}.${sig}`);
  assert.notStrictEqual(forged.body.sessionToken, first.body.sessionToken);
  assert.notStrictEqual(sentPayloads[2].userId, sentPayloads[0].userId);
  assert.notStrictEqual(sentPayloads[2].chatId, sentPayloads[0].chatId);
});

test('both chat routes map the same session and label to the same n8n keys', async () => {
  const viaProxy = await chat({ userContext: { conversationId: 'conv-1' } });
  await advisorChat({ userContext: { conversationId: 'conv-1' } }, viaProxy.body.sessionToken);
  assert.strictEqual(sentPayloads[1].userId, sentPayloads[0].userId);
  assert.strictEqual(sentPayloads[1].chatId, sentPayloads[0].chatId);
});

test('advisor chat without useN8n never calls n8n or issues a session', async () => {
  axios.post = async (url, payload) => {
    if (url === SERVER_WEBHOOK) sentPayloads.push(payload);
    return originalPost(url, payload);
  };
  const { body } = await chat(
    { chatWebhookUrl: undefined, aiProvider: 'not-a-provider', userContext: VICTIM_IDS },
    undefined,
    '/api/advisor/chat'
  );
  assert.strictEqual(sentPayloads.length, 0);
  assert.strictEqual(body.sessionToken, undefined);
});
