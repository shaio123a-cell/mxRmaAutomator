# Matrix RestMon SuperSonic - Scripting Automator

A solution that transforms PATROL KM configuration management into a seamless visual experience. Instead of manually editing text files, administrators can visually manage complex hierarchies of devices and scripts—including generic and Restmon payloads. With built-in safeguards like script dry-runs, automatic character encoding, and a centralized administration center for managing backups and defaults, it dramatically reduces configuration errors and deployment time.

---

## Overview

Matrix RestMon SuperSonic is a comprehensive automation tool designed to simplify and enhance the management of BMC PATROL for Scripting Knowledge Modules (KMs). The application provides both web and desktop interfaces to help infrastructure teams efficiently create, test, and deploy monitoring scripts.

**Version:** 2.6.0  
**Platforms:** Web (React) + Desktop (Electron)  
**Target:** BMC PATROL KM administrators, infrastructure automation teams

---

## Key Features

### 🤖 Agentic Scripting (AI-Powered Script Generation)

**Interactive AI Chat Panel** — A full-featured conversational interface for generating monitoring scripts:

- **Chat History & Persistence** — Multiple chat sessions with search, rename, delete, and date-grouped sidebar (Today, Yesterday, Previous 7 days, Older)
- **Context-Aware Generation** — Maintains conversation history (last 8 turns) for iterative script refinement
- **Smart Suggestions** — AI-generated follow-up prompts (3 per response) with "Add More" and "Refresh" options
- **Test Run Integration** — Execute generated scripts directly in Electron mode (PowerShell/Bash) with output capture
- **Save & Configure** — Save scripts to disk, then instantly add to device configuration with auto-generated instance names
- **Syntax-Highlighted Editor** — Monaco-style code editor with Prism.js highlighting for Bash, PowerShell, and more
- **Script Metadata** — Auto-generated title, filename, language detection, summary, and required setup actions

### 🔗 AI Model Fallback Chain

**Resilient Multi-Provider AI Integration** with automatic failover:

- **Drag-to-Reorder Priority** — Visual drag-and-drop to set model fallback order
- **Multiple Providers Supported:**
  - OpenAI-compatible (OpenAI, Azure, local proxies)
  - Anthropic (Claude)
  - Google Gemini
  - Azure OpenAI (with deployment name support)
  - Ollama (local models)
  - Mock (offline testing)
- **Model Discovery** — Fetch available models/deployments from provider APIs
- **Connection Testing** — One-click health checks with status indicators (healthy/degraded/offline)
- **Per-Model Configuration** — Name, model ID, base URL, API key, timeout, API version (Azure), enabled toggle
- **Automatic Fallback** — On timeout, rate limit, network failure, or invalid response, seamlessly tries next enabled model

### 📝 System Prompts Management

**Customizable AI Behavior** for script generation:

- **Multiple System Prompts** — Create, edit, delete, and activate different prompt templates
- **Default Prompts** — Bundled production-ready prompts for PATROL KM script generation
- **Restore Defaults** — One-click restore of bundled prompts while preserving custom ones
- **Active Prompt Selection** — Radio-button selection of which prompt drives generation
- **Prompt Versioning** — Each prompt has unique ID, name, and content

### 🎨 Visual Configuration Management

**Intuitive UI for PATROL KM File Mapping:**

- **Device → Scripts Hierarchy** — Visual tree of devices with their associated scripts
- **Drag & Drop Reordering** — Reorder devices and scripts with @dnd-kit
- **Copy/Paste Operations** — Duplicate script definitions or entire device configurations
- **Quick-Edit Device Drawer** — Slide-out form with best-practice defaults (Port=5985, Timeout=2000ms, Poll=60s)
- **Disabled Device Support** — Comment/uncomment devices in config file (preserves position)

### 📜 Script Management & Editing

**Comprehensive CRUD for Generic and Restmon Scripts:**

#### Accordion-Based Editor Sections:
- **Identity** — Instance name, script path (with file browser)
- **Request/Arguments** — URL, method, output format, payload, headers, match regex, search key/string, args
- **Authentication** (Restmon only) — Username, password, decryptPass toggle
- **Monitoring** — Poll interval, timeout, regex field, independent monitor view
- **Scheduling** — Enable scheduling, schedule date regex, day checkboxes (Mon-Sun), start/end time pickers
- **Output Preview** — Real-time encoded command preview

#### Validation & Safety:
- **Script Name Validation** — Blocks forbidden characters (!@#$%^&*|)
- **JSON/XML Payload Validation** — Real-time syntax checking
- **Headers Format Validation** — PowerShell hashtable format (@{"key"="value"})
- **Scheduling Validation** — Ensures explicit 0/1 for inactive weekdays
- **Password Encryption** — AES-CBC encryption with SecureString-compatible output (header: `76492d1116743f0423413b16050a5345`)

### 🧪 Dry-Run Validation

**Safe Script Testing Before Deployment:**

- **Original & Executed Commands** — Shows both the raw command and the Electron-executed version
- **Cross-Platform Execution** — PowerShell (`powershell.exe -ExecutionPolicy Bypass`) or direct shell
- **Copy-to-Clipboard** — One-click copy for original command, executed command, and results
- **Color-Coded Output** — Error/warning/info line highlighting in results
- **Electron-Only** — Dry runs require desktop app (web shows guidance message)

### ⚙️ Administration & Settings

**Centralized Configuration Center:**

#### Appearance
- **Theme Selection** — Light, Dark, System (follows OS)

#### Device Defaults
- Port, connection timeout, connection poll interval
- Username, password
- SSH key paths (public/private) and passphrase

#### Script Defaults
- MatrixKB RestMon script path
- Generic script path
- Default to RestMon scripts toggle
- **Backup Rotation** — Max backups to keep (0 = disabled, default 10)

#### AI Models & Fallback Chain
- Full model management (add/edit/delete/test/reorder)
- Provider-specific helpers (Azure deployment names, Ollama endpoints, Gemini API root)

#### System Prompts
- Full CRUD with active selection
- Restore bundled defaults

#### Backup Settings
- Generations per file configuration

### 🔧 Configuration-Driven Architecture

**Zero-Code Customization via `config.json`:**

- **Script Structure** — Delimiter, field order, terminator
- **UI Field Definitions** — 28 field types (text, textarea, number, password, select, checkbox, time)
- **Field Ordering** — Separate Restmon and Generic script field sequences
- **AI Configuration** — Models, system prompts, active prompt
- **Theme Default** — System/light/dark

### 📁 File & Configuration Management

- **Load/Save/Export** — Load script files, save with backup rotation, "Save As" and "Export As"
- **Playground Mode** — Experiment without loading a file
- **Configuration Preview** — Real-time view of generated config
- **Comment Preservation** — Maintains comments and blank lines from original files
- **Original Line Tracking** — Preserves device positions in config file

---

## User Interfaces

### Web Interface (React)
- Full-featured SPA for script management
- Real-time configuration preview and editing
- AI assistant integration for script generation
- Responsive Material-UI design

### Desktop Interface (Electron)
- Native desktop application with enhanced performance
- **Built-in Dry-Run Execution** — Run scripts locally for testing
- **Direct File System Access** — Save/load configurations to original locations
- **File Dialog Integration** — Browse for script paths
- **Backup Rotation** — Automatic versioning on save
- **Windows Packaging** — NSIS installer + portable executable

---

## Configuration

The application is entirely configured via `config.json` — no code changes needed for:

### Script Structure
```json
{
  "scriptStructure": {
    "delimiter": "*",
    "fields": ["instanceName", "scriptPath", "args", "timeout", "poll", "regex", ...],
    "terminator": "|"
  }
}
```

### UI Fields (28 configurable fields)
Each field defines: `name`, `type` (text|textarea|number|password|select|checkbox|time), `label`, `options[]`

### Field Ordering
- `restmonOrder` — Field sequence for Restmon scripts
- `genericOrder` — Field sequence for Generic scripts

### AI Models
```json
{
  "ai": {
    "models": [
      { "id": "model-primary", "provider": "openai-compatible", "model": "gpt-4o-mini", "baseUrl": "...", "apiKey": "", "enabled": true, "timeoutMs": 30000 }
    ],
    "systemPrompts": [
      { "id": "system-default", "name": "Default Automation Prompt", "content": "..." }
    ],
    "activeSystemPromptId": "system-default"
  }
}
```

---

## Use Cases

### 1. Visual PATROL KM Management
**Problem:** Administrators manually edit complex text files to configure PATROL KM scripts, leading to errors and deployment delays.  
**Solution:** Use the Visual Config Manager to map devices and scripts hierarchically with drag-drop, copy-paste, and real-time preview.

### 2. AI-Accelerated Script Creation
**Problem:** Writing monitoring scripts requires deep knowledge of PATROL KM output format and conventions.  
**Solution:** Describe requirements in natural language; AI generates production-ready Bash/PowerShell/Python scripts with proper PATROL KM output format, metadata tags, and setup instructions.

### 3. Safe Script Testing
**Problem:** Testing scripts in production environments risks breaking monitoring configurations.  
**Solution:** Dry-run validation shows exact command that will execute, runs it safely in Electron, and displays color-coded output — all before deployment.

### 4. Centralized Administration
**Problem:** Distributed script configurations across multiple environments create inconsistency.  
**Solution:** Admin Control Center manages global defaults (ports, timeouts, paths), AI model fallback chains, system prompts, and backup policies from one place.

### 5. Team Collaboration & Knowledge Retention
**Problem:** Script configuration changes are difficult to track and share among team members.  
**Solution:** Chat history preserves generation context; copy/paste and drag/drop enable easy replication; backup rotation provides audit trail.

### 6. Multi-Provider AI Resilience
**Problem:** Single AI provider outages halt script generation workflows.  
**Solution:** Configure fallback chain (e.g., GPT-4o → Claude → local Ollama); automatic failover on timeout, rate limits, or errors.

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Development
```bash
npm install
npm run dev          # Web dev server (Vite)
npm run electron-dev # Electron + Vite concurrently
```

### Production Build
```bash
npm run build        # Vite production build
npm run package:win  # Electron Builder (NSIS + portable)
```

### Configuration
1. Copy `config.json` and customize:
   - AI model API keys and endpoints
   - Default script/device paths
   - Field definitions and ordering
   - System prompts
2. Restart application

---

## Architecture Highlights

### FBCSKM Format Support
- Parses/serializes BMC PATROL KM configuration lines
- Handles device segments (10 fields) + script segments (dynamic fields)
- Encodes/decodes reserved characters: `|` → `<BMC_SEP>`, `*` → `<BMC_STAR>`
- Preserves comments, blank lines, and original line positions

### Restmon Argument Parsing
- CLI-style flag parsing (`-url`, `-method`, `-payload`, etc.)
- Smart quote normalization (curly → straight)
- Structured `RestMonArgs` object with validation

### Scheduling Engine
- 7-day checkboxes with explicit 0/1 normalization
- Time pickers for operating windows
- Schedule date regex with BMC placeholder encoding

### Security
- Password encryption via Web Crypto API (AES-CBC, 256-bit key, random IV)
- SecureString-compatible output format
- No secrets in logs, output, or serialized config
- API keys stored in Redux state (not persisted to config file)

---

## Project Structure

```
mxRmaAutomator/
├── config.json              # Complete app configuration
├── package.json             # Dependencies & scripts
├── electron/
│   ├── main.js              # Electron main process
│   └── preload.js           # Secure IPC bridge
├── src/
│   ├── components/          # React components
│   │   ├── AgenticScriptPanel.tsx   # AI chat panel
│   │   ├── DeviceForm.tsx           # Device drawer
│   │   ├── ScriptForm.tsx           # Script editor (accordions)
│   │   ├── DryRunResultsDialog.tsx  # Test output dialog
│   │   ├── SettingsDialog.tsx       # Admin center
│   │   └── ...
│   ├── pages/               # Top-level views
│   ├── services/            # AI, chat storage, serialization
│   ├── store/               # Redux slice (fbcskmSlice.ts)
│   ├── utils/               # File API, script args helpers
│   ├── config.ts            # Typed config interface
│   └── theme.tsx            # MUI theme provider
└── release/                 # Build outputs
```

---

## License

Proprietary — Matrix KB for BMC Helix

---

## Support

For issues, feature requests, or contributions, visit the [GitHub repository](https://github.com/shaio123a-cell/mxRmaAutomator).