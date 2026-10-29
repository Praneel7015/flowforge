# FlowForge

[![CI](https://github.com/Praneel7015/flowforge/actions/workflows/ci.yml/badge.svg)](https://github.com/Praneel7015/flowforge/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Praneel7015/flowforge/actions/workflows/codeql.yml/badge.svg)](https://github.com/Praneel7015/flowforge/actions/workflows/codeql.yml)

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
- **Live runs** – list, trigger and diagnose real CI runs, with status overlays on the canvas. A **run simulator** checks the actual canvas (e.g. a job that runs `npm test` without installing dependencies fails, and downstream jobs are skipped), so a correct AI fix really turns the re-run green.
- **AI fix review** – diagnose a failed run, then review the proposed YAML as a diff before applying it. Version downgrades and removed commands are flagged and need explicit confirmation; nothing is marked green without being re-run.
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
| **Google Vertex AI** | `gemini-3.8-flash` | Vertex API key (express mode), or a service account JSON key + project ID + location (`global`, `us-central1`, …). |
| **AWS Bedrock** | `us.anthropic.claude-sonnet-4-6` | Bedrock API key (bearer), or IAM access key ID + secret (+ session token), signed with SigV4. Any Converse-capable model ID / inference profile works. |
| **OpenAI-compatible** | – (you set it) | Any Chat Completions endpoint: OpenRouter, Together, Fireworks, DeepSeek, Mistral, a public vLLM/LM Studio server… Base URL + model required, key optional. |
| Ollama (local) | `llama3` | No key needed. |

Users pick a provider and enter their own credentials in **Settings → Model and Overrides**; only the selected provider's fields are sent with a request, and switching provider clears the previous key, model and base URL. If no provider is specified, the backend uses the first configured one (Groq → Gemini → OpenAI → Anthropic → Ollama). A provider the user explicitly picked never silently falls back to another: without credentials it returns a clear **400**. Custom endpoints must use `https://`.

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
              └─ AI provider factory      (Groq | Anthropic | Gemini | OpenAI | Vertex | Bedrock | OpenAI-compatible | Ollama)
                    one complete(system, user) interface, per-request BYOM config
```

Both the CI/CD generators and the AI providers use a **strategy + factory** pattern: adding a platform or provider means writing one class and registering it in `providers/cicd/index.js` or `providers/ai/index.js`.

## Security

| Control | Where |
|---|---|
| CORS allowlist (`FRONTEND_URL` + `*.highcortisol.xyz`); rejected origins get **403**, not 500 | `backend/server.js` |
| Security headers, fixed-window rate limiting (general + tighter AI limit) | `backend/middleware/security.js` |
| Central error handler, no internal error strings leaked in production | `backend/middleware/errorHandler.js` |
| **SSRF guard** on every user-supplied URL: BYOM base URL, n8n webhooks, GitLab verify, self-hosted GitLab and custom CircleCI hosts. Blocks localhost, cloud metadata, private/loopback/link-local (full `fe80::/10`)/CGNAT ranges, including IPv4-mapped IPv6 in both dotted and hex form (`[::ffff:7f00:1]`) | `backend/utils/ssrf.js` |
| **DNS rebinding blocked at connect time**: outbound clients for user-supplied hosts (Ollama, OpenAI-compatible, Groq overrides, n8n, GitLab, CircleCI) resolve the name once, refuse it if *any* address is private, and connect only to the checked addresses (`safeLookup` / `safeAgents` / `safeFetch` via `undici`). They also ignore `HTTP(S)_PROXY` and never follow redirects | `backend/utils/ssrf.js` |
| **Path traversal**: user-supplied owner/repo/branch/path/id values in GitHub, GitLab, Bitbucket and CircleCI API URLs are encoded per segment, and `.` / `..` are rejected before any request is sent | `backend/utils/url.js` |
| **Server CI tokens stay with the server's host**: a request that picks its own GitLab/CircleCI URL must bring its own token; custom hosts must be HTTPS | `backend/controllers/runController.js` |
| **Generated configs can't run user text**: Jenkinsfile strings escape backslashes, quotes and line breaks in one pass; default step commands single-quote the label for the shell, so `$(...)` in a node label is printed, not executed | `backend/providers/cicd/` |
| **GitHub webhooks**: HMAC-SHA256 over the **raw request bytes**, constant-time compare | `backend/routes/webhookRoutes.js` |
| **GitLab webhooks**: token compared in constant time | `backend/routes/webhookRoutes.js` |
| Webhooks **fail closed in production**: if `GITHUB_WEBHOOK_SECRET` / `GITLAB_WEBHOOK_SECRET` is unset, requests get 503 | `backend/routes/webhookRoutes.js` |
| Secret scanner blocks pushing pipelines that contain credentials (`422 SECRETS_DETECTED`, override with `allowSecrets: true`) | `backend/utils/secretScanner.js` |
| BYOM keys are per request, trimmed/capped, never stored or cached on the server; in the browser they live in memory only (never localStorage). Invalid BYOM input returns 400 | `backend/utils/aiOptions.js`, `BringYourOwnModelPanel.jsx` |
| **Server keys never leave for user-chosen hosts**: if a request brings its own credentials or a custom base URL, all server-side secrets are dropped before the call | `backend/providers/ai/index.js` |
| AWS region, Vertex location and GCP project are pattern-validated before being placed in hostnames (validation errors never echo the typed value); the service-account `token_uri` is ignored (token always from `oauth2.googleapis.com`) | `backend/utils/aiOptions.js`, `backend/providers/ai/VertexProvider.js` |
| n8n payloads use an **allowlist** of non-secret fields (model, region, location, project), so new credential fields can't leak to the webhook | `backend/services/aiService.js` |
| **Error responses**: in production only errors we raise ourselves (validation) show their detail; provider/platform errors get a generic message. Logs use constant format strings and `logSafe()` (strips line breaks, ANSI and control characters) and record the path without the query string | `backend/utils/sendError.js`, `backend/utils/logSafe.js`, `backend/middleware/errorHandler.js` |
| Registry lookups (providers, generators) use `Map`s with allowlist checks, so names like `__proto__` are rejected; chat/session ids come from `crypto`, not `Math.random` | `backend/providers/*/index.js`, `frontend/src/components/PipelineChat.jsx` |

Known limits: the rate limiter is in memory, so it resets on restart and isn't shared across instances (Redis for horizontal scale). The routes have no user accounts or authentication; every visitor shares the server's default AI key, protected by rate limits.

## Quick start

Prerequisites: Node.js 20.18+ (22 recommended) and npm. For AI features you need a Groq key ([console.groq.com/keys](https://console.groq.com/keys), free) or another provider's key; everything else works without one.

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
| `VERTEX_API_KEY` or `VERTEX_SERVICE_ACCOUNT_JSON` | – | Server-side Vertex AI credentials (optional) |
| `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `VERTEX_MODEL` | – / `global` / `gemini-3.8-flash` | |
| `AWS_BEARER_TOKEN_BEDROCK` or `BEDROCK_ACCESS_KEY_ID` + `BEDROCK_SECRET_ACCESS_KEY` (+ `BEDROCK_SESSION_TOKEN`) | – | Server-side Bedrock credentials (optional) |
| `BEDROCK_REGION`, `BEDROCK_MODEL` | `us-east-1` / `us.anthropic.claude-sonnet-4-6` | |
| `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_MODEL`, `OPENAI_COMPATIBLE_API_KEY` | – | Server-side OpenAI-compatible endpoint (optional) |
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
cd backend && npm run lint && npm test       # ESLint + node:test (63 tests: SSRF/DNS rebinding, path traversal, provider factory, SigV4 vectors, Jenkins escaping, log safety, runs)
cd frontend && npm run lint && npm run build # ESLint (incl. React hooks rules) + production build
cd frontend && npm run test:e2e              # Playwright (30 tests); starts the API and Vite dev server itself
```

E2E runs with no AI keys (as in CI), so it exercises the deterministic fallbacks.

## Development workflow

Every pull request to `main` goes through:

| Check | What it does | Config |
|---|---|---|
| **CI** (GitHub Actions) | Backend lint + unit tests, frontend lint + build, then Playwright E2E against a real API + Vite server | `.github/workflows/ci.yml` |
| **CodeQL** | GitHub code scanning with the `security-extended` query suite, on PRs, pushes and weekly. A PR fails if it introduces a new alert; alerts that are by design (e.g. the user-chosen GitLab/CircleCI host) are dismissed in the Security tab with the mitigation recorded | `.github/workflows/codeql.yml` |
| **CodeRabbit** | AI code review on each PR, with repo-specific instructions (SSRF, key handling, deterministic generators) plus ESLint, gitleaks, actionlint, yamllint and markdownlint | `.coderabbit.yaml` |
| **Dependabot** | Weekly grouped npm minor/patch updates for backend and frontend, monthly GitHub Actions updates. Major versions arrive as separate PRs and need review before merging | `.github/dependabot.yml` |
| **Vercel** | Preview deployment of the frontend for each PR | Vercel GitHub app |

PRs use the template in `.github/pull_request_template.md`; `CODEOWNERS` requests a review from the maintainer.

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
│   ├── providers/ai/         Groq, Anthropic, Gemini, OpenAI, Vertex, Bedrock, OpenAI-compatible, Ollama
│   ├── providers/cicd/       GitHub, GitLab, Jenkins, CircleCI, Bitbucket generators
│   ├── utils/                ssrf (guard + connect-time DNS checks), url (path encoding),
│   │                         aiOptions (BYOM sanitiser), logSafe, sendError, secretScanner
│   └── test/
├── examples/
├── render.yaml
└── docker-compose.yml
```

## License

MIT
