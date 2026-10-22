import React from 'react'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import DashboardIcon from '@mui/icons-material/Dashboard'
import DescriptionIcon from '@mui/icons-material/Description'
import DataObjectIcon from '@mui/icons-material/DataObject'
import CodeIcon from '@mui/icons-material/Code'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import DnsIcon from '@mui/icons-material/Dns'
import SettingsIcon from '@mui/icons-material/Settings'
import BugReportIcon from '@mui/icons-material/BugReport'
import InfoIcon from '@mui/icons-material/Info'

export type HelpNavTarget = 'editor' | 'raw' | 'agentic' | 'hosts' | 'settings'

export interface HelpLink {
  label: string
  target: HelpNavTarget
}

export interface HelpTable {
  columns: string[]
  rows: string[][]
}

export interface HelpTopic {
  id: string
  title: string
  keywords?: string[]
  body?: string
  steps?: string[]
  bullets?: string[]
  table?: HelpTable
  tip?: string
  warning?: string
  code?: string
  links?: HelpLink[]
}

export interface HelpSection {
  id: string
  title: string
  icon: React.ReactNode
  summary: string
  topics: HelpTopic[]
}

export const helpSections: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: <RocketLaunchIcon fontSize='small' />,
    summary: 'Load a configuration, make changes, save safely, and find your way around the app.',
    topics: [
      {
        id: 'open-config',
        title: 'Open an existing configuration',
        keywords: ['load', 'open', 'file', 'cfg', 'txt', 'import'],
        body: 'Start by loading the configuration file used by the PATROL Scripting KM.',
        steps: [
          'Select the folder icon at the top of the Configuration Editor.',
          'Choose your configuration file (.cfg, .txt, or similar).',
          'If there are unsaved changes, choose whether to save, discard, or cancel before loading.',
        ],
        tip: 'The loaded file path appears beside the toolbar icons.',
        links: [{ label: 'Open Configuration Editor', target: 'editor' }],
      },
      {
        id: 'save-config',
        title: 'Save your changes',
        keywords: ['save', 'write', 'backup', 'export', 'save as'],
        body: 'The file on disk changes only when you save. Editing devices, scripts, or raw text marks the configuration as dirty.',
        bullets: [
          'Save writes back to the currently loaded file and rotates backups.',
          'Save As exports a copy to a new location.',
          'A green toast confirms success; an orange toast reports a failure.',
        ],
        warning: 'Direct Save requires the Electron client. In browser mode use Save As.',
        links: [{ label: 'Open Backup Settings', target: 'settings' }],
      },
      {
        id: 'unsaved-changes',
        title: 'Unsaved changes and dirty indicators',
        keywords: ['dirty', 'unsaved', 'pencil', 'prompt', 'discard'],
        bullets: [
          'An Unsaved Changes chip appears in the Configuration Editor toolbar.',
          'Edited devices and scripts show a pencil icon in their lists.',
          'Switching selection or closing a shelf with unsaved edits prompts Save, Discard, or Cancel.',
        ],
      },
      {
        id: 'navigation',
        title: 'Navigate the application',
        keywords: ['views', 'sidebar', 'theme', 'dark', 'light', 'system'],
        bullets: [
          'Configuration Editor manages devices, script instances, and raw configuration.',
          'Agentic Scripting generates and tests scripts with AI models.',
          'Execution Hosts stores remote servers and credential profiles for test runs.',
          'The theme button cycles Light, Dark, and System.',
          'Settings holds defaults, AI models, system prompts, and backups.',
        ],
        links: [
          { label: 'Agentic Scripting', target: 'agentic' },
          { label: 'Execution Hosts', target: 'hosts' },
          { label: 'Settings', target: 'settings' },
        ],
      },
    ],
  },
  {
    id: 'configuration-editor',
    title: 'Configuration Editor',
    icon: <DashboardIcon fontSize='small' />,
    summary: 'Manage devices and script instances, search the configuration, and keep ordering correct.',
    topics: [
      {
        id: 'workspace',
        title: 'Devices and Scripts workspace',
        keywords: ['split', 'resize', 'search', 'counts', 'divider', 'scripts'],
        body: 'The workspace has a Devices pane and a Scripts pane separated by a draggable divider.',
        bullets: [
          'Drag the divider to widen or narrow either pane; the width is remembered.',
          'Search devices by name or address. Enable Include scripts to search inside script values too.',
          'Counts below the search box show matching devices and scripts.',
          'Select a device to display its script instances on the right.',
        ],
      },
      {
        id: 'device-actions',
        title: 'Device actions',
        keywords: ['add device', 'edit', 'duplicate', 'delete', 'enable', 'disable', 'reorder', 'drag'],
        bullets: [
          'Enter a device name and optional forced IP, then use the add button.',
          'Drag rows to change device order in the saved configuration.',
          'Use the row menu to edit, duplicate, paste a script, enable or disable, or delete.',
          'The Devices menu controls whether disabled devices and remarks are shown.',
        ],
      },
      {
        id: 'script-actions',
        title: 'Script instance actions',
        keywords: ['add script', 'edit', 'duplicate', 'dry run', 'copy', 'cut', 'delete', 'reorder'],
        bullets: [
          'Choose a RestMon or generic script type, instance name, and script path, then add it.',
          'Drag script rows to change execution priority for the selected device.',
          'Use the row menu to edit, duplicate, dry run, copy, cut, or delete.',
          'Click a script row to open the Script Instance shelf.',
        ],
      },
      {
        id: 'clipboard',
        title: 'Copy, cut, and paste scripts',
        keywords: ['clipboard', 'copy', 'cut', 'paste', 'duplicate'],
        bullets: [
          'Copy keeps the original script and places it on the clipboard.',
          'Cut places the script on the clipboard and removes it when pasted.',
          'Paste a script into any device from that device row menu.',
        ],
      },
      {
        id: 'device-fields',
        title: 'Device fields',
        keywords: ['port', 'timeout', 'poll', 'username', 'password', 'key', 'passphrase', 'forced ip'],
        table: {
          columns: ['Field', 'Purpose'],
          rows: [
            ['Device Name/IP', 'Identity of the device in the configuration.'],
            ['Forced IP Address', 'Optional address override used instead of the device name.'],
            ['Port', 'Connection port for the device.'],
            ['Connection timeout (ms)', 'How long to wait while connecting.'],
            ['Connection poll interval (sec)', 'How often the connection is checked.'],
            ['Username', 'Account used for the connection.'],
            ['Password', 'Password for the connection.'],
            ['Public Key Path', 'Public key file used for key-based authentication.'],
            ['Private Key Path', 'Private key file used for key-based authentication.'],
            ['Passphrase', 'Passphrase protecting the private key.'],
          ],
        },
      },
    ],
  },
  {
    id: 'script-instance',
    title: 'Script Instance Editor',
    icon: <DescriptionIcon fontSize='small' />,
    summary: 'Edit every request, authentication, monitoring, and scheduling setting for a script instance.',
    topics: [
      {
        id: 'open-editor',
        title: 'Open and close the script shelf',
        keywords: ['drawer', 'shelf', 'close', 'cancel', 'save script'],
        bullets: [
          'Click a script row to open the editor shelf.',
          'Use the X or Cancel to close. Unsaved edits prompt before closing.',
          'Save Script validates, stores the instance in memory, and shows a toast.',
        ],
      },
      {
        id: 'accordions',
        title: 'Sections and remembered layout',
        keywords: ['accordion', 'identity', 'request', 'auth', 'monitoring', 'scheduling', 'output'],
        bullets: [
          'Identity contains the instance name and script path.',
          'Request contains URL, method, output format, payload, headers, and regex fields for RestMon scripts.',
          'Arguments replaces Request for generic scripts.',
          'Authentication contains credentials and password encryption.',
          'Monitoring contains poll, timeout, and output checks.',
          'Scheduling controls active days and time windows.',
          'Output Preview shows the encoded command that will be written.',
          'Expanded and collapsed sections are remembered per browser.',
        ],
      },
      {
        id: 'request-auth',
        title: 'Requests and authentication',
        keywords: ['url', 'method', 'post', 'payload', 'headers', 'regex', 'encrypt', 'securestring', 'decrypt'],
        bullets: [
          'Choose GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS.',
          'Output Format drives payload validation and highlighting: JSON, XML, or text.',
          'Headers must be a PowerShell hashtable such as @{"Content-Type"="application/json"}.',
          'The lock button encrypts the password and sets Decrypt Pass to TRUE.',
        ],
        warning: 'Payload and headers are validated. Fix red validation messages before saving.',
      },
      {
        id: 'monitoring-scheduling',
        title: 'Monitoring and scheduling',
        keywords: ['poll', 'timeout', 'regex', 'schedule', 'days', 'start time', 'end time', 'independent monitor'],
        bullets: [
          'Poll controls how often the script runs; Timeout caps a single run.',
          'Trailing regex field checks whether the script output matches an expected value.',
          'Independent Monitor View keeps monitoring separate for this instance.',
          'Enable Scheduling activates selected days and the start/end time window.',
        ],
      },
      {
        id: 'dry-run-save',
        title: 'Dry Run, validation, and saving',
        keywords: ['dry run', 'test', 'command', 'validation', 'save', 'toast'],
        bullets: [
          'Dry Run shows the exact command that would be executed.',
          'Dry Run execution is available in the Electron client only.',
          'Invalid instance names, headers, or payloads block saving and show an orange toast.',
          'A successful save shows a green toast and writes the payload as a single line.',
        ],
      },
      {
        id: 'ai-assist',
        title: 'AI Assist for script instances',
        keywords: ['ai', 'assist', 'review', 'fix', 'configure', 'sidecar', 'validation chip', 'apply', 'undo'],
        bullets: [
          'Open AI Assist from the editor header, or click the validation chip to review errors and warnings.',
          'Review with AI checks the open draft; Fix with AI proposes the smallest safe corrections.',
          'Configure with AI turns a plain-language request into field updates you can preview before applying.',
          'Apply changes only updates the open draft. Save Script is still required to persist them.',
          'If the form changes after a response arrives, generate again before applying; stale results are disabled.',
          'The password is never sent. Secret header and argument values are masked, and AI cannot change isRestmon.',
          'The built-in assistant prompt is read-only in Configuration so the UI and AI request stay aligned.',
        ],
        warning: 'AI suggestions are not applied automatically. Review every diff before applying, then verify by saving and dry running.',
      },
      {
        id: 'script-fields',
        title: 'Script instance fields',
        keywords: ['fields', 'reference', 'payload', 'headers', 'poll', 'timeout'],
        table: {
          columns: ['Field', 'Purpose'],
          rows: [
            ['Instance Name', 'Unique name for the script instance. Avoid !@#$%^&*|.'],
            ['Script Path', 'Path to the PowerShell script on the monitored system.'],
            ['Arguments', 'Arguments for generic scripts.'],
            ['Method', 'HTTP method for RestMon scripts.'],
            ['Output Format', 'json, xml, or text; controls payload validation and highlighting.'],
            ['URL', 'Endpoint called by the RestMon script.'],
            ['Payload', 'Request body. JSON/XML highlighting and beautify are available.'],
            ['Headers', 'PowerShell hashtable of request headers.'],
            ['Regex Match', 'Pattern used by RestMon to match the response.'],
            ['Username', 'Account used by the request.'],
            ['Password', 'Password for the request; use the lock to encrypt it.'],
            ['Decrypt Pass', 'TRUE when the stored password is encrypted.'],
            ['Poll (sec)', 'How often the instance runs.'],
            ['Timeout (sec)', 'Maximum runtime for one execution.'],
            ['Trailing regex field', 'Checks the output against an expected pattern.'],
            ['Independent Monitor View', 'Keeps this instance in its own monitor view.'],
            ['Scheduling fields', 'Enable scheduling, pick days, and set start/end times.'],
          ],
        },
      },
    ],
  },
  {
    id: 'payload-editor',
    title: 'Payload Editor',
    icon: <DataObjectIcon fontSize='small' />,
    summary: 'Read and edit JSON or XML payloads with structure-aware colors and a visual beautify toggle.',
    topics: [
      {
        id: 'highlighting',
        title: 'Semantic highlighting',
        keywords: ['json', 'xml', 'colors', 'syntax', 'brackets', 'scope', 'keys', 'strings'],
        body: 'The payload editor colors content according to its structure.',
        bullets: [
          'JSON: keys, strings, numbers, booleans/null, punctuation, and rainbow bracket depth colors.',
          'XML: tags by nesting depth, attribute names and values, comments, CDATA, declarations, and entities.',
          'Colors adapt to light and dark themes.',
        ],
      },
      {
        id: 'beautify',
        title: 'Beautify is view-only',
        keywords: ['beautify', 'format', 'pretty', 'view', 'one line', 'compact', 'save'],
        body: 'The wand button formats the display for readability without changing the stored value.',
        steps: [
          'Select the wand icon to switch between the raw and beautified view.',
          'Select it again to return to the raw payload.',
          'Editing while beautified is allowed; the saved file still stores a one-line payload.',
        ],
        warning: 'When a script instance is saved, JSON/XML payloads are always compacted to a single line.',
      },
      {
        id: 'payload-limits',
        title: 'Size and validation',
        keywords: ['rows', 'scroll', '20', 'invalid', 'validate'],
        bullets: [
          'The editor grows up to 20 rows, then scrolls.',
          'Long lines wrap so the payload stays readable.',
          'Invalid JSON or XML shows a red border and helper message and blocks saving.',
        ],
        code: '{\n  "device": "server-01",\n  "metrics": ["cpu", "memory"]\n}',
      },
    ],
  },
  {
    id: 'raw-configuration',
    title: 'Raw Configuration',
    icon: <CodeIcon fontSize='small' />,
    summary: 'Work directly with the configuration text and inspect the serialized result.',
    topics: [
      {
        id: 'raw-tabs',
        title: 'Configuration Playground and Preview',
        keywords: ['raw', 'playground', 'preview', 'paste', 'serialize'],
        bullets: [
          'Configuration Playground lets you paste or edit the raw configuration text.',
          'Preview Configuration renders the current in-memory devices and scripts as they will be serialized.',
          'Editing raw text marks the configuration dirty.',
          'Use the wrap icon to toggle long-line wrapping; copy the preview from the Preview tab.',
        ],
        links: [{ label: 'Open Raw Configuration', target: 'raw' }],
      },
    ],
  },
  {
    id: 'agentic-scripting',
    title: 'Agentic Scripting',
    icon: <AutoAwesomeIcon fontSize='small' />,
    summary: 'Generate, refine, test, and add AI-generated scripts to your configuration.',
    topics: [
      {
        id: 'chats',
        title: 'Chats and history',
        keywords: ['chat', 'history', 'rename', 'delete', 'search', 'new chat'],
        bullets: [
          'Use the add button to start a new chat.',
          'Search chats, and use the row menu to rename or delete them.',
          'Chat history is saved locally and grouped by recency.',
          'Drag the divider between the chat list and the workspace to resize it.',
        ],
      },
      {
        id: 'generate',
        title: 'Describe and generate',
        keywords: ['prompt', 'generate', 'enter', 'shift enter', 'model', 'fallback'],
        bullets: [
          'Describe the script or the next change and press Enter to send; Shift+Enter adds a new line.',
          'Enabled AI models are tried in fallback order until one responds.',
          'The header shows how many models are in the fallback chain.',
          'Model status, timeouts, and errors appear beneath the action buttons.',
        ],
        warning: 'If no models are enabled, add one in Settings before generating scripts.',
        links: [{ label: 'Configure AI Models', target: 'settings' }],
      },
      {
        id: 'suggestions',
        title: 'Suggestions',
        keywords: ['suggestions', 'refresh', 'more', 'prompts'],
        bullets: [
          'Suggested next prompts appear after a script is generated.',
          'Select a suggestion to place it in the prompt box.',
          'Use the add icon for more suggestions or the refresh icon to replace them.',
        ],
      },
      {
        id: 'results',
        title: 'Script results and versions',
        keywords: ['version', 'results', 'hash', 'script name', 'summary', 'actions required'],
        bullets: [
          'Generated scripts in the chat are listed in the Script results selector.',
          'Each result shows its model and a short content hash.',
          'Review the summary and any actions required before using the script.',
          'Edit the script name before saving if needed.',
        ],
      },
      {
        id: 'save-test-add',
        title: 'Copy, save, test, and add to a device',
        keywords: ['copy', 'save', 'save as new', 'test run', 'target device', 'add to configuration'],
        bullets: [
          'Copy places the generated script on the clipboard.',
          'Save overwrites the current file; Save as new creates another file.',
          'Test run executes the script in the Electron client and shows the output.',
          'Choose a Target device, then use the add-to-configuration button to create a script instance for it.',
        ],
        links: [
          { label: 'Agentic Scripting', target: 'agentic' },
          { label: 'Configuration Editor', target: 'editor' },
        ],
      },
    ],
  },
  {
    id: 'execution-hosts',
    title: 'Execution Hosts',
    icon: <DnsIcon fontSize='small' />,
    summary: 'Store remote servers and reusable credentials used for test runs.',
    topics: [
      {
        id: 'hosts-overview',
        title: 'Hosts and credential profiles',
        keywords: ['host', 'credential', 'profile', 'server', 'remote', 'environment'],
        bullets: [
          'A host is a server that scripts can run on.',
          'A credential profile is a saved sign-in that can be reused by many hosts.',
          'Environment is a label such as lab or prod; use prod to make production hosts stand out.',
          'Optionally link a host to a device from the configuration.',
          'Secrets are stored in the operating-system vault, not in scripts or logs.',
        ],
        links: [{ label: 'Open Execution Hosts', target: 'hosts' }],
      },
      {
        id: 'host-fields',
        title: 'Host fields',
        keywords: ['name', 'address', 'fqdn', 'os', 'transport', 'working directory', 'insecure http'],
        table: {
          columns: ['Field', 'Purpose'],
          rows: [
            ['Name', 'Friendly name for the host.'],
            ['Host or FQDN', 'Network address of the server.'],
            ['OS', 'Windows or Linux.'],
            ['Transport', 'SSH, WinRM, PowerShell Remoting, or Local.'],
            ['Credential profile', 'Saved sign-in used to connect.'],
            ['Environment', 'Label such as lab or prod.'],
            ['Linked device (optional)', 'Associates the host with a configuration device.'],
            ['Remote working directory', 'Directory where remote commands run.'],
            ['Allow insecure HTTP', 'Permits WinRM over port 5985 without HTTPS.'],
            ['SSH host key', 'Fingerprint remembered after a successful connection.'],
          ],
        },
      },
      {
        id: 'transports',
        title: 'Transports and authentication',
        keywords: ['ssh', 'winrm', 'powershell remoting', 'password', 'private key', 'ssh agent', 'windows integrated'],
        table: {
          columns: ['Transport', 'Use when'],
          rows: [
            ['SSH', 'Linux servers, or Windows servers running OpenSSH Server.'],
            ['WinRM', 'Windows servers with WinRM enabled.'],
            ['PowerShell Remoting', 'Windows PowerShell remoting is required.'],
            ['Local', 'The script runs on this PC.'],
          ],
        },
        bullets: [
          'Password authentication stores an encrypted password in the OS vault.',
          'Private key authentication uses a key file on this PC and an optional passphrase.',
          'SSH agent uses keys already loaded in your SSH agent and stores nothing.',
          'Windows integrated authentication uses your current Windows sign-in and stores no password.',
        ],
      },
      {
        id: 'host-testing',
        title: 'Test and troubleshoot hosts',
        keywords: ['test', 'connection', 'linux', 'windows', 'openssh', 'enable-psremoting', 'fingerprint'],
        steps: [
          'Save the credential profile, then save the host.',
          'Use Test on the host row to verify the connection.',
          'For Linux, use SSH; WinRM and PowerShell Remoting do not work against Linux.',
          'For Windows over SSH, install and start OpenSSH Server on the target.',
          'For Windows over WinRM, run Enable-PSRemoting -Force in an administrator PowerShell.',
        ],
        code: 'Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0\nStart-Service sshd\nSet-Service -Name sshd -StartupType Automatic',
        tip: 'If the SSH host key changes, use Forget host key before reconnecting.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: <SettingsIcon fontSize='small' />,
    summary: 'Configure the theme, defaults, AI model fallback chain, system prompts, and backups.',
    topics: [
      {
        id: 'appearance',
        title: 'Appearance',
        keywords: ['theme', 'light', 'dark', 'system'],
        body: 'Choose Light, Dark, or System. System follows the operating-system theme.',
      },
      {
        id: 'defaults',
        title: 'Device and script defaults',
        keywords: ['defaults', 'new device', 'port', 'timeout', 'poll', 'matrix path', 'generic path', 'restmon'],
        bullets: [
          'Device Defaults apply only to newly created devices: port, timeouts, username, password, and key paths.',
          'Script Defaults set the MatrixKB RestMon path, generic script path, and whether new scripts are RestMon by default.',
        ],
      },
      {
        id: 'ai-models',
        title: 'AI models and fallback chain',
        keywords: ['ai', 'model', 'provider', 'api key', 'base url', 'fallback', 'timeout', 'test'],
        bullets: [
          'Enabled models are tried in the order shown.',
          'Timeouts, rate limits, network failures, and invalid responses move generation to the next model.',
          'Drag models to set fallback priority.',
          'Use the test button to check a provider connection before relying on it.',
        ],
      },
      {
        id: 'prompts',
        title: 'System prompts',
        keywords: ['prompt', 'system prompt', 'active', 'restore defaults'],
        bullets: [
          'The active system prompt is sent with every AI request.',
          'Create or edit prompts, then select Use to make one active.',
          'Restore system defaults replaces bundled prompts while keeping your own extra prompts.',
        ],
      },
      {
        id: 'built-in-skills',
        title: 'Built-in AI skills',
        keywords: ['built-in', 'skill', 'read-only', 'prompt', 'script instance assistant'],
        bullets: [
          'Built-in AI skills are shipped prompts used by features such as AI Assist for script instances.',
          'They are read-only in the Configuration dialog so the visible behavior and the AI request stay aligned.',
          'Developer prompt updates are made in config.json and take effect after a rebuild or repackage.',
        ],
      },
      {
        id: 'backups',
        title: 'Backup settings',
        keywords: ['backup', 'versions', 'max backups', 'rotation'],
        body: 'Each save can rotate configuration backups. Set the maximum number of generations to keep, or 0 to disable backups.',
        links: [{ label: 'Open Settings', target: 'settings' }],
      },
      {
        id: 'save-settings',
        title: 'Save changes',
        keywords: ['save changes', 'cancel', 'toast'],
        body: 'Use Save Changes to apply settings. A green toast confirms success; an orange toast reports a failure. Cancel discards edits made in the dialog.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Tips & Troubleshooting',
    icon: <BugReportIcon fontSize='small' />,
    summary: 'Common validation, AI, host, and saving problems and how to resolve them.',
    topics: [
      {
        id: 'invalid-payload',
        title: 'Payload is invalid JSON or XML',
        keywords: ['invalid', 'json', 'xml', 'payload', 'validation'],
        bullets: [
          'Check the red helper message under the payload editor.',
          'Use the wand button to beautify and inspect the structure.',
          'Fix missing commas, quotes, or closing tags, then save again.',
        ],
      },
      {
        id: 'script-wont-save',
        title: 'Script instance will not save',
        keywords: ['save', 'validation', 'instance name', 'headers', 'characters'],
        bullets: [
          'Instance names cannot contain ! @ # $ % ^ & * |.',
          'Headers must be a PowerShell hashtable like @{"key"="value"}.',
          'Fix all red fields; saving is blocked until validation passes.',
        ],
      },
      {
        id: 'no-models',
        title: 'Agentic scripting says no enabled models',
        keywords: ['no models', 'ai', 'enabled', 'fallback', 'api key'],
        steps: [
          'Open Settings and expand AI Models and Fallback Chain.',
          'Add a provider with a model ID, base URL, and API key where required.',
          'Enable the model and test the connection.',
          'Save Changes, then return to Agentic Scripting.',
        ],
        links: [{ label: 'Open AI Settings', target: 'settings' }],
      },
      {
        id: 'dry-run-missing',
        title: 'Dry Run or Test Run is unavailable',
        keywords: ['dry run', 'test run', 'electron', 'browser'],
        body: 'Command execution requires the Electron client. In browser mode the command preview is available, but execution is disabled.',
      },
      {
        id: 'save-browser',
        title: 'Save is disabled in the browser',
        keywords: ['save', 'browser', 'save as', 'electron'],
        body: 'Browsers cannot write arbitrary files. Use Save As to export a copy, or open the app in the Electron client for direct saves and backups.',
      },
      {
        id: 'host-test-fails',
        title: 'Execution host test fails',
        keywords: ['host', 'test', 'ssh', 'winrm', 'connection', 'linux', 'windows'],
        bullets: [
          'Confirm the OS and transport match: Linux uses SSH; Windows uses WinRM, PowerShell Remoting, or OpenSSH.',
          'Verify the credential profile is selected and its secret is stored.',
          'For WinRM, enable PowerShell Remoting on the target.',
          'For SSH, ensure the SSH service is running and the key is authorized.',
        ],
        links: [{ label: 'Open Execution Hosts', target: 'hosts' }],
      },
      {
        id: 'payload-one-line',
        title: 'My payload became one line after saving',
        keywords: ['one line', 'payload', 'saved', 'beautify'],
        body: 'This is expected. Payloads are stored as a single line in the configuration file; Beautify only changes the editor display.',
      },
      {
        id: 'backups',
        title: 'Where are my backups?',
        keywords: ['backup', 'versions', 'restore'],
        body: 'Backups are created in a backups folder beside the saved configuration according to Backup Settings. Set the maximum generations in Settings, or 0 to disable rotation.',
        links: [{ label: 'Open Backup Settings', target: 'settings' }],
      },
    ],
  },
  {
    id: 'about',
    title: 'About',
    icon: <InfoIcon fontSize='small' />,
    summary: 'Version and product information.',
    topics: [],
  },
]

export function topicMatches(topic: HelpTopic, query: string): boolean {
  if (!query) return true
  const haystack = [
    topic.title,
    topic.body || '',
    ...(topic.keywords || []),
    ...(topic.steps || []),
    ...(topic.bullets || []),
    topic.tip || '',
    topic.warning || '',
    topic.code || '',
    ...(topic.table ? topic.table.columns.concat(...topic.table.rows) : []),
  ].join(' ').toLowerCase()
  return haystack.includes(query)
}
