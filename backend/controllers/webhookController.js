const aiService = require('../services/aiService');
const gitlabService = require('../services/gitlabService');

/**
 * Handle webhook events from Git platforms.
 * Currently supports: GitLab pipeline events, push events, merge request events.
 * TODO: Add support for GitHub Actions and other platforms.
 */
async function handleWebhook(req, res) {
  // Detect platform from headers
  const gitlabEvent = req.headers['x-gitlab-event'];
  const githubEvent = req.headers['x-github-event'];

  const payload = req.body;

  try {
    if (gitlabEvent) {
      await handleGitLabWebhook(gitlabEvent, payload);
    } else if (githubEvent) {
      // TODO: Implement GitHub webhook handling
      console.log(`GitHub event: ${githubEvent}`);
    } else {
      console.log('Unknown webhook source');
    }

    res.json({ status: 'received' });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Handle GitLab-specific webhook events.
 */
async function handleGitLabWebhook(event, payload) {
  console.log(`Received GitLab webhook: ${event}`);

  switch (event) {
    case 'Pipeline Hook': {
      if (payload.object_attributes?.status === 'failed') {
        await handlePipelineFailure(payload);
      }
      break;
    }
    case 'Push Hook': {
      console.log(`Push to ${payload.ref} by ${payload.user_name}`);
      break;
    }
    case 'Merge Request Hook': {
      console.log(`MR #${payload.object_attributes?.iid}: ${payload.object_attributes?.action}`);
      break;
    }
    default:
      console.log(`Unhandled GitLab event type: ${event}`);
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

  console.log(`Pipeline #${pipelineId} failed — running failure analysis...`);

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
    console.log(`Posted analysis to MR #${mergeRequestIid}`);
  } else if (commitSha) {
    await gitlabService.commentOnCommit(projectId, commitSha, comment);
    console.log(`Posted analysis to commit ${commitSha}`);
  }
}

module.exports = { handleWebhook };
