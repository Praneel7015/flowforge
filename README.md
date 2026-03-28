# FlowForge

**AI-powered low-code/no-code CI/CD automation platform**

Build CI/CD pipelines visually with drag-and-drop, powered by AI. Platform-independent and supports multiple AI providers.

## What is FlowForge?

FlowForge lets developers visually design CI/CD workflows using drag-and-drop nodes instead of manually writing configuration files. It uses AI to generate pipelines, analyze failures, auto-remediate broken pipelines, and answer questions about your CI/CD config in real-time chat.

## Features

- **Visual CI/CD Workflow Builder** - Drag-and-drop pipeline design with React Flow
- **AI Pipeline Generator** - Describe a pipeline in natural language; AI writes the config and builds the visual graph
- **Multi-Platform Output** - Generate configs for GitLab CI, GitHub Actions, Jenkins, or CircleCI
- **Multi-AI Provider Support** - Use Featherless, Claude, Gemini, GPT-4, or local Ollama models
- **BYOM (Bring Your Own Model)** - Users can provide their own API key/model/base URL from the UI
- **Pipeline Health Advisor** - AI grades your pipeline (A-F) across speed, security, reliability, and best practices
- **Pipeline Chat (n8n)** - Conversational assistant routed through an n8n webhook
- **Pipeline Migration** - Upload a Jenkinsfile and convert it to any target platform
- **Platform-Independent** - Not tied to any single CI/CD platform

## Supported Providers

### AI Providers
| Provider | Models |
|----------|--------|
| **Claude** (Anthropic) | claude-opus-4-5, claude-sonnet-4-5 |
| **Gemini** (Google) | gemini-1.5-pro, gemini-1.5-flash |
| **GPT-4** (OpenAI) | gpt-4-turbo, gpt-4o |
| **Featherless AI** | 30,000+ open models via OpenAI-compatible API |
| **Ollama** (Local) | llama3, mistral, codellama |

### CI/CD Platforms
| Platform | Output File |
|----------|-------------|
| GitLab CI | `.gitlab-ci.yml` |
| GitHub Actions | `.github/workflows/ci.yml` |
| Jenkins | `Jenkinsfile` |
| CircleCI | `.circleci/config.yml` |

## Architecture

```
Frontend (React + Vite + React Flow + TailwindCSS)
    │
    │ REST API
    ▼
Backend (Node.js + Express)
    │
    ├── AI Providers (Featherless, Claude, Gemini, OpenAI, Ollama)
    ├── CI/CD Generators (GitLab, GitHub, Jenkins, CircleCI)
    ├── Config API (/api/config/providers)
    └── Optional n8n chat webhook bridge (/api/advisor/chat)
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- At least one AI provider API key (or local Ollama)

### 1. Clone and install

```bash
git clone <repo-url> flowforge
cd flowforge

# Install backend
cd backend
cp .env.example .env
# Edit .env with your API keys
npm install

# Install frontend
cd ../frontend
npm install
```

### 2. Configure environment

Edit `backend/.env`:

```env
# Choose your default providers
DEFAULT_AI_PROVIDER=featherless
DEFAULT_CICD_PLATFORM=github

# Add at least one AI provider key
ANTHROPIC_API_KEY=your_key_here
# Or use Gemini
GEMINI_API_KEY=your_key_here
# Or use OpenAI
OPENAI_API_KEY=your_key_here
# Or use Featherless (OpenAI-compatible)
FEATHERLESS_API_KEY=your_key_here
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
FEATHERLESS_MODEL=Qwen/Qwen2.5-Coder-1.5B-Instruct
# Or use local Ollama (no key needed)
OLLAMA_BASE_URL=http://localhost:11434

PORT=3001
```

### n8n webhook chat integration (sponsor-ready)

FlowForge pipeline chat can be routed through n8n by setting these backend env vars:

```env
N8N_CHAT_WEBHOOK_URL=https://your-n8n-domain/webhook-test/flowforge
N8N_WEBHOOK_AUTH_HEADER=X-FlowForge-Token
N8N_WEBHOOK_AUTH_TOKEN=your_secret_token
N8N_CHAT_TIMEOUT_MS=30000
```

FlowForge sends a JSON POST payload to this webhook with these key fields:

- `text` / `input`: latest user message text
- `userId`, `username`, `chatId`, `conversationId`: user-scoped session identifiers
- `currentYaml` and `yamlContext`: full pipeline YAML context
- `messages`: full chat message history for context
- `cicdPlatform`, `platformDisplayName`, `aiProvider`, `source`, `timestamp`

For n8n workflows using the Webhook node output, map fields from `body`:

- `{{$json.body.text}}`
- `{{$json.body.userId}}`
- `{{$json.body.username}}`
- `{{$json.body.chatId}}`
- `{{$json.body.currentYaml}}`

To keep chat memory personal per user, set your n8n memory session key to either
`{{$json.body.userId}}` (all chats for a user) or `{{$json.body.chatId}}`
(separate memory per conversation).

Expected n8n response can be either a plain string or JSON with one of these fields:
`reply`, `response`, `message`, `output`, or `text`.

When `N8N_CHAT_WEBHOOK_URL` is not set, FlowForge falls back to its configured local AI provider.

### 3. Run

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Open http://127.0.0.1:5174

### Docker

```bash
docker-compose up
```

## Usage

### Visual Workflow Builder

1. Drag pipeline nodes from the left sidebar onto the canvas
2. Connect nodes by dragging from source handles to target handles
3. Click a node to configure its settings (image, script, stage, etc.)
4. Select your target CI/CD platform from the header dropdown
5. Click **Export** to generate the configuration file

### AI Pipeline Generator

1. Click the **AI Generator** tab
2. Select your AI provider and target CI/CD platform
3. Describe your pipeline in natural language
4. Click **Generate Pipeline** - the AI creates config and visual nodes
5. The workflow loads automatically into the visual builder

### Pipeline Migration

1. Click the **Migration** tab
2. Paste a Jenkinsfile or upload one
3. Select your target platform (GitHub Actions, GitLab CI, etc.)
4. Click **Convert** to migrate

### Health Advisor

1. Build any pipeline (drag nodes, use AI Generator, or import)
2. Click **Export** on the canvas to capture the config
3. Click the **Health Advisor** tab
4. Click **Analyse My Pipeline** - AI scores it across 4 dimensions

### Pipeline Chat

1. Export a config first (so AI has context)
2. Click the **Pipeline Chat** tab
3. Ask anything: "Why might this be slow?", "Add caching", "Is this secure?"

### Bring Your Own Model (BYOM)

1. In the top bar, choose any AI provider (including Featherless)
2. Enable **Bring Your Own Model Key**
3. Paste your API key, and optionally override model/base URL
4. Generate, migrate, score, and chat requests will use your credentials per request

Notes:
- BYOM keys are not persisted in the backend
- If BYOM is off, server-side env keys are used

## Project Structure

```
flowforge/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx            # Nav with provider selectors
│   │   │   ├── Sidebar.jsx           # Draggable node palette
│   │   │   ├── ProviderSelector.jsx  # AI/CI-CD provider dropdown
│   │   │   ├── BringYourOwnModelPanel.jsx # BYOM key/model/base URL
│   │   │   ├── PromptPanel.jsx       # Natural language generator
│   │   │   ├── JenkinsConverter.jsx  # Pipeline migration
│   │   │   ├── YamlPreview.jsx       # Config preview + download
│   │   │   ├── HealthAdvisor.jsx     # Pipeline health scoring
│   │   │   └── PipelineChat.jsx      # Conversational AI
│   │   ├── workflow/
│   │   │   ├── WorkflowEditor.jsx    # React Flow canvas
│   │   │   ├── NodeConfigPanel.jsx   # Node settings panel
│   │   │   └── nodes/
│   │   ├── App.jsx
│   │   └── main.jsx
├── backend/
│   ├── config/
│   │   └── index.js                  # Central config loader
│   ├── providers/
│   │   ├── ai/                       # AI provider implementations
│   │   │   ├── AIProvider.js
│   │   │   ├── FeatherlessProvider.js
│   │   │   ├── AnthropicProvider.js
│   │   │   ├── GeminiProvider.js
│   │   │   ├── OpenAIProvider.js
│   │   │   ├── OllamaProvider.js
│   │   │   └── index.js
│   │   └── cicd/                     # CI/CD generators
│   │       ├── CICDGenerator.js
│   │       ├── GitLabCIGenerator.js
│   │       ├── GitHubActionsGenerator.js
│   │       ├── JenkinsGenerator.js
│   │       ├── CircleCIGenerator.js
│   │       └── index.js
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   │   ├── aiService.js              # AI operations + optional n8n chat bridge
│   │   ├── workflowService.js        # Nodes → CI/CD config
│   │   └── gitlabService.js          # GitLab API client
│   ├── utils/
│   │   └── aiOptions.js              # BYOM request option sanitizer
│   └── server.js
├── docker-compose.yml
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/providers` | List available AI/CI-CD providers |
| GET | `/api/config/providers/:type/:name/status` | Check provider status |
| POST | `/api/pipelines/generate` | AI pipeline generation from prompt (`aiOptions` supported) |
| POST | `/api/pipelines/export` | Export workflow nodes to config |
| POST | `/api/migration/jenkinsfile` | Convert Jenkinsfile to target platform (`aiOptions` supported) |
| POST | `/api/advisor/health` | Pipeline health score (`aiOptions` supported) |
| POST | `/api/advisor/remediate` | Auto-remediate broken config (`aiOptions` supported) |
| POST | `/api/advisor/chat` | Pipeline chat assistant (`aiOptions` supported, can route to n8n webhook) |
| GET | `/api/health` | Health check |

## Tech Stack

- **Frontend:** React 18, Vite, React Flow, TailwindCSS, Axios
- **Backend:** Node.js, Express, js-yaml
- **AI:** Featherless AI, Anthropic Claude, Google Gemini, OpenAI GPT-4, Ollama
- **CI/CD:** GitLab CI, GitHub Actions, Jenkins, CircleCI
- **Orchestration:** n8n webhook integration for pipeline chat

## License

MIT
