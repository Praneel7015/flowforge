const aiService = require('../services/aiService');
const { logSafe } = require('../utils/logSafe');
const gitlabService = require('../services/gitlabService');

/**
 * Handle webhook events from Git platforms.
 * Currently supports: GitLab pipeline events, push events, merge request events.
 * TODO: Add support for GitHub Actions and other platforms.
 */
// Delivery ids already accepted. Senders retry a delivery they consider
// failed with the same id; without this a retry would post a second analysis.
const SEEN_DELIVERY_LIMIT = 1000;
const WEBHOOK_RETRY_DELAY_MS = Number(process.env.WEBHOOK_RETRY_DELAY_MS) || 15000;
const seenDeliveries = new Set();

function isDuplicateDelivery(id) {
  if (!id) return false;
  if (seenDeliveries.has(id)) return true;
  seenDeliveries.add(id);
  if (seenDeliveries.size > SEEN_DELIVERY_LIMIT) {
    seenDeliveries.delete(seenDeliveries.values().next().value);
  }
  return false;
}

async function handleWebhook(req, res) {
  // Detect platform from headers
  const gitlabEvent = req.headers['x-gitlab-event'];
  const githubEvent = req.headers['x-github-event'];
  // GitLab's Idempotency-Key names one delivery (recursive events can share
  // an X-Gitlab-Event-UUID); older GitLab versions only send the UUID.
  const deliveryId = String(
    req.headers['idempotency-key'] || req.headers['x-github-delivery'] || req.headers['x-gitlab-event-uuid'] || ''
  ).slice(0, 200);

  const payload = req.body;

  if (isDuplicateDelivery(deliveryId)) {
    return res.status(200).json({ status: 'duplicate' });
  }

  // Answer first: failure analysis fetches logs and calls the AI provider,
  // which can outlast the sender's webhook timeout (GitLab disables hooks
  // that keep timing out). The work continues in the background.
  res.status(202).json({ status: 'received' });

  const runHandler = () => {
    if (gitlabEvent) return handleGitLabWebhook(gitlabEvent, payload);
    if (githubEvent) return handleGitHubWebhook(githubEvent, payload);
    console.log('Unknown webhook source');
    return undefined;
  };

  // There is no job store, so the work lives in this process: one delayed
  // retry for transient failures, and if that fails too the delivery id is
  // released, so a redelivery from the sender is processed rather than skipped.
  try {
    await runHandler();
  } catch (err) {
    console.error('Webhook processing error (retrying once): %s', logSafe(err.message));
    await new Promise((resolve) => setTimeout(resolve, WEBHOOK_RETRY_DELAY_MS));
    try {
      await runHandler();
    } catch (retryErr) {
      console.error('Webhook processing failed: %s', logSafe(retryErr.message));
      if (deliveryId) seenDeliveries.delete(deliveryId);
    }
  }
}

/**
 * Handle GitLab-specific webhook events.
 */
async function handleGitLabWebhook(event, payload) {
  console.log('Received GitLab webhook: %s', logSafe(event));

  switch (event) {
    case 'Pipeline Hook': {
      if (payload.object_attributes?.status === 'failed') {
        await handlePipelineFailure(payload);
      }
      break;
    }
    case 'Push Hook': {
      console.log('Push to %s by %s', logSafe(payload.ref), logSafe(payload.user_name));
      break;
    }
    case 'Merge Request Hook': {
      console.log('MR #%s: %s', logSafe(payload.object_attributes?.iid), logSafe(payload.object_attributes?.action));
      break;
    }
    default:
      console.log('Unhandled GitLab event type: %s', logSafe(event));
  }
}

/**
 * Pipeline Failure Agent logic:
 * 1. Fetch logs from failed jobs
 * 2. Analyze with AI
 * 3. Post explanation as a comment
 */
async function handlePipelineFailure(payload) {
  const projectId = payload.project?.id;
  const pipelineId = payload.object_attributes?.id;
  const mergeRequestIid = payload.merge_request?.iid;
  const commitSha = payload.commit?.id || payload.object_attributes?.sha;

  if (!projectId || !pipelineId) {
    console.log('Missing project or pipeline ID in webhook payload');
    return;
  }

  console.log('Pipeline #%s failed — running failure analysis...', logSafe(pipelineId));

  // Step 1: Fetch logs
  const { failedLogs } = await gitlabService.getPipelineLogs(projectId, pipelineId);

  if (failedLogs.length === 0) {
    console.log('No failed job logs found');
    return;
  }

  // Step 2: Analyze with AI
  const explanation = await aiService.explainPipelineFailure(failedLogs);

  // Step 3: Format comment
  const comment = [
    `## 🔍 FlowForge Pipeline Failure Analysis`,
    '',
    `**Pipeline:** #${pipelineId}`,
    `**Summary:** ${explanation.summary}`,
    '',
    `### Explanation`,
    explanation.explanation,
    '',
    `### Root Cause`,
    explanation.rootCause,
    '',
    `### Suggested Fixes`,
    ...explanation.suggestedFixes.map((fix, i) => `${i + 1}. ${fix}`),
    '',
    '---',
    '*Automated analysis by FlowForge*',
  ].join('\n');

  // Step 4: Post comment
  if (mergeRequestIid) {
    await gitlabService.commentOnMergeRequest(projectId, mergeRequestIid, comment);
    console.log('Posted analysis to MR #%s', logSafe(mergeRequestIid));
  } else if (commitSha) {
    await gitlabService.commentOnCommit(projectId, commitSha, comment);
    console.log('Posted analysis to commit %s', logSafe(commitSha));
  }
}

/**
 * Handle GitHub-specific webhook events (passive — log only).
 * Full automation requires a server-side GitHub token; user-initiated
 * analysis is handled via /api/repo/* endpoints with browser-supplied tokens.
 */
async function handleGitHubWebhook(event, payload) {
  switch (event) {
    case 'workflow_run': {
      const run = payload.workflow_run || {};
      console.log('GitHub workflow_run: %s — %s/%s (id: %s)', logSafe(run.name), logSafe(run.status), logSafe(run.conclusion), logSafe(run.id));
      break;
    }
    case 'push': {
      const ref = payload.ref || '';
      const pusher = payload.pusher?.name || 'unknown';
      console.log('GitHub push to %s by %s', logSafe(ref), logSafe(pusher));
      break;
    }
    case 'pull_request': {
      const pr = payload.pull_request || {};
      console.log('GitHub PR #%s — %s: %s', logSafe(pr.number), logSafe(payload.action), logSafe(pr.title));
      break;
    }
    case 'ping': {
      console.log('GitHub webhook ping received — hook is active');
      break;
    }
    default:
      console.log('GitHub event received: %s', logSafe(event));
  }
}

module.exports = { handleWebhook, _seenDeliveries: seenDeliveries };
