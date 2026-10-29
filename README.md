# FlowForge

**Visual CI/CD pipeline builder with an AI layer on top.**

Draw a pipeline as a graph (trigger → build → test → security scan → approval → canary deploy → rollback) and export it deterministically to GitHub Actions, GitLab CI, Jenkins, CircleCI or Bitbucket Pipelines. Or describe it in plain English, migrate an existing config, grade its health, chat about it, and push it to your repo as a pull request.

Live at **[flowforge.highcortisol.xyz](https://flowforge.highcortisol.xyz)**: frontend on Vercel, API on Render.

## Features

- **Visual builder** – React Flow canvas with 20 node types, a docked inspector, templates, and live two-way YAML ↔ canvas sync.
- **Deterministic export** – canvas → config is pure code (no LLM), so the same graph always produces the same YAML.
- **AI pipeline generator** – prompt or connected repo → nodes, edges and config. If the model fails, a deterministic template is returned with a warning instead of an error.
- **Migration** – convert between any of the 5 platforms (e.g. Jenkinsfile → GitHub Actions), with a structural parser as an offline fallback.
- **Import** – paste an existing YAML/Jenkinsfile and get an editable graph (platform detected from the file's shape).
- **Health advisor** – A–F grade across speed, security, reliability and best practices, plus one-click auto-remediation.
- **Pipeline Assistant** – pipeline-aware chat using the selected AI provider (server Groq key by default, or your own key). n8n routing is optional and falls back to the AI provider if the webhook fails.
- **Repo integration** – browse GitHub/GitLab/Bitbucket repos, generate from repo files, and push the pipeline as a PR (blocked if the secret scanner finds credentials).
- **Live runs** – list, trigger and diagnose CI runs, with status overlays on the canvas.
- **Shareable blueprints** – the canvas state can be shared via URL.
- **Works out of the box** – first-time users use the server's Groq key; anyone can switch to their own key/model in Settings (BYOM).

## Supported providers

### CI/CD platforms

| Platform | Output file | Approval gate maps to |
|---|---|---|
| GitHub Actions | `.github/workflows/ci.yml` | protected `environment` |
| GitLab CI | `.gitlab-ci.yml` | `when: manual` |
| Jenkins | `Jenkinsfile` | `input` step |
| CircleCI | `.circleci/config.yml` | `type: approval` job |
| Bitbucket Pipelines | `bitbucket-pipelines.yml` | `trigger: manual` step |

### AI providers

| Provider | Default model | Notes |
|---|---|---|
| **Groq** (default) | `openai/gpt-oss-120b` | Fast, free tier. Server key is shared with all users. Retired Groq models (e.g. `llama-3.3-70b-versatile`, shut down 2026-08-16) are mapped to the default automatically. |
| Anthropic (Claude) | `claude-sonnet-5-5` | |
| Google Gemini | `gemini-3.8-flash` | |
| OpenAI | `gpt-6-luna` | |
| Ollama (local) | `llama3` | No key needed. |

If the requested provider has no server key and the user hasn't supplied one, the backend falls back to the first configured provider (Groq → Gemini → OpenAI → Anthropic → Ollama).

## Architecture

```
Browser ──► Vercel (React + Vite SPA)
              │  /api/*  rewritten to
              ▼
           Render (Node + Express API)
              ├─ securityHeaders → CORS → JSON (raw body kept) → rate limiters
              ├─ /api/pipelines   generate | export | import | status | explain | trigger
              ├─ /api/migration   convert | jenkinsfile
              ├─ /api/advisor     health | remediate | chat | scan-secrets
              ├─ /api/repo        list-repos | list-branches | tree | file-contents | push-pipeline
              ├─ /api/runs        list | status | trigger | diagnose-and-fix
              ├─ /api/platforms   validate
              ├─ /api/n8n         forward | chat
              ├─ /api/webhooks    GitHub / GitLab events (signature-verified)
              ├─ /api/config      providers, status, self-test
              │
              ├─ CI/CD generator factory  (GitHub | GitLab | Jenkins | CircleCI | Bitbucket)
              │     shared base: dependency map, collision-free job names,
              │     traversal through conditional nodes, cycle-safe topo sort
              └─ AI provider factory      (Groq | Anthropic | Gemini | OpenAI | Ollama)
                    one complete(system, user) interface, per-request BYOM config
```

Both the CI/CD generators and the AI providers use a **strategy + factory** pattern: adding a platform or provider means writing one class and registering it in `providers/cicd/index.js` or `providers/ai/index.js`.

## Security

| Control | Where |
|---|---|
| CORS allowlist (`FRONTEND_URL` + `*.highcortisol.xyz`); rejected origins get **403**, not 500 | `backend/server.js` |
| Security headers, fixed-window rate limiting (general + tighter AI limit) | `backend/middleware/security.js` |
| Central error handler, no internal error strings leaked in production | `backend/middleware/errorHandler.js` |
| **SSRF guard** on every user-supplied URL: BYOM base URL, n8n webhooks, GitLab verify, and self-hosted GitLab `instanceUrl` on `/api/repo/*` (public HTTPS only). Blocks localhost, cloud metadata, private/loopback/link-local/CGNAT ranges incl. IPv4-mapped IPv6 | `backend/utils/ssrf.js`, `backend/controllers/repoController.js` |
| n8n webhook calls use `maxRedirects: 0`, so a public URL can't redirect the server to an internal host | `backend/routes/n8nRoutes.js`, `backend/services/aiService.js` |
| **GitHub webhooks**: HMAC-SHA256 over the **raw request bytes**, constant-time compare | `backend/routes/webhookRoutes.js` |
| **GitLab webhooks**: token compared in constant time | `backend/routes/webhookRoutes.js` |
| Webhooks **fail closed in production**: if `GITHUB_WEBHOOK_SECRET` / `GITLAB_WEBHOOK_SECRET` is unset, requests get 503 | `backend/routes/webhookRoutes.js` |
| Secret scanner blocks pushing pipelines that contain credentials (`422 SECRETS_DETECTED`, override with `allowSecrets: true`) | `backend/utils/secretScanner.js` |
| BYOM keys are per request, trimmed/capped, never stored or cached; invalid BYOM input returns 400 | `backend/utils/aiOptions.js` |

Known limits: the SSRF guard checks literal hosts, so it doesn't stop DNS rebinding (the fix would be a pinned-lookup HTTP agent). The rate limiter is in memory, so it resets on restart and isn't shared across instances.

## Quick start

Prerequisites: Node.js 18+ and npm. For AI features you need a Groq key ([console.groq.com/keys](https://console.groq.com/keys), free) or another provider's key; everything else works without one.

```bash
git clone https://github.com/praneel7015/flowforge.git
cd flowforge

cd backend
cp .env.example .env      # add GROQ_API_KEY at minimum
npm install
npm run dev               # http://localhost:3001

cd ../frontend
npm install
npm run dev               # http://127.0.0.1:5174 (proxies /api → :3001)
```

Or with Docker: `docker-compose up`.

## Environment variables (backend)

| Variable | Default | Purpose |
|---|---|---|
| `DEFAULT_AI_PROVIDER` | `groq` | `groq`, `anthropic`, `gemini`, `openai`, `ollama` |
| `DEFAULT_CICD_PLATFORM` | `gitlab` | `github`, `gitlab`, `jenkins`, `circleci`, `bitbucket` |
| `GROQ_API_KEY` | – | Shared server key used by everyone without BYOM |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Also: `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | – / `claude-sonnet-5-5` | |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | – / `gemini-3.8-flash` | |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | – / `gpt-6-luna` | |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | – / `llama3` | Local models |
| `FRONTEND_URL` | – | Comma-separated CORS origins (`*.highcortisol.xyz` is always allowed) |
| `NODE_ENV` | `development` | `production` hides internal errors and makes webhooks fail closed |
| `TRUST_PROXY` | – | `true` behind Render/Vercel so rate limits key on the real client IP |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | `60000`, `120` | General limit |
| `AI_RATE_LIMIT_WINDOW_MS`, `AI_RATE_LIMIT_MAX` | `60000`, `20` | AI routes |
| `GITHUB_WEBHOOK_SECRET` | – | **Required in production** for `/api/webhooks`; must match the secret set on the GitHub webhook |
| `GITLAB_WEBHOOK_SECRET` | – | **Required in production** for `/api/webhooks`; must match the GitLab webhook "Secret token" |
| `GITLAB_URL`, `GITLAB_TOKEN` | `https://gitlab.com` | Server-side GitLab access for pipeline status/trigger |
| `N8N_CHAT_WEBHOOK_URL` | – | Server-side n8n webhook, used only when a chat request opts in (`useN8n`); falls back to the AI provider on failure |
| `N8N_WEBHOOK_AUTH_HEADER`, `N8N_WEBHOOK_AUTH_TOKEN` | `X-FlowForge-Token` | Optional n8n auth |
| `N8N_CHAT_TIMEOUT_MS` | `30000` | |
| `*_TIMEOUT_MS` | – | Per-platform API timeouts (GitHub, GitLab, Bitbucket, CircleCI) |

Frontend: `VITE_API_BASE_URL` (optional). In production Vercel rewrites `/api/*` to Render, so it's not needed.

## Deployment

- **Frontend (Vercel)** – `frontend/vercel.json` serves the SPA and rewrites `/api/*` to the Render service.
- **Backend (Render)** – `render.yaml` defines a Node web service (`rootDir: backend`, health check `/api/health`, auto-deploy on push). Env values changed in the Render dashboard override `render.yaml`.

## n8n chat integration

With `N8N_CHAT_WEBHOOK_URL` set, chat requests are POSTed as JSON with `text`/`input`, `userId`, `username`, `chatId`, `conversationId`, `currentYaml`/`yamlContext`, `messages`, `cicdPlatform`, `aiProvider`, `source` and `timestamp`. In n8n, read them from `{{$json.body.<field>}}`; use `userId` or `chatId` as the memory session key. The response can be a plain string or JSON with `reply`, `response`, `message`, `output` or `text`. A `/webhook-test/` URL that returns 404 is retried once on the production `/webhook/` URL. Without the env var, chat uses the configured AI provider.

## Testing

```bash
cd backend && node --test test/*.test.js     # unit: SSRF guard, secret scanner, import, run controller
cd frontend && npm run test:e2e              # Playwright: generate, export, import/edit, migrate, node library, settings, theme
```

## Project structure

```
flowforge/
├── frontend/                 React 18 + Vite + React Flow + Tailwind
│   ├── src/
│   │   ├── AppShell.jsx      landing page ↔ app
│   │   ├── App.jsx           Builder, AI Generator, Migrate, Health, Assistant, Settings
│   │   ├── pages/            LandingPage, SmartGeneratePage, SettingsPage
│   │   ├── components/       PromptPanel, JenkinsConverter, HealthAdvisor, PipelineChat,
│   │   │                     YamlPreview, RepoBrowser, PushToRepoModal, ImportPipelineModal,
│   │   │                     LiveRunsPanel, BringYourOwnModelPanel, Sidebar, NodeTemplates, …
│   │   └── workflow/         WorkflowEditor (canvas), NodeConfigPanel, nodes/
│   ├── e2e/                  Playwright specs
│   └── vercel.json
├── backend/                  Node + Express
│   ├── server.js             middleware chain, CORS, routes
│   ├── config/               provider + platform config from env
│   ├── middleware/           security headers, rate limiting, error handler
│   ├── routes/ controllers/  pipelines, migration, advisor, repo, runs, platforms, n8n, webhooks, config
│   ├── services/             aiService (prompts, parsing, fallbacks), workflowService,
│   │                         importService, github/gitlab/bitbucketService
│   ├── providers/ai/         Groq, Anthropic, Gemini, OpenAI, Ollama
│   ├── providers/cicd/       GitHub, GitLab, Jenkins, CircleCI, Bitbucket generators
│   ├── utils/                ssrf, secretScanner, aiOptions (BYOM sanitiser)
│   └── test/
├── examples/
├── render.yaml
└── docker-compose.yml
```

## License

MIT
