import type { AIModelConfig as ConfigAIModelConfig, AISystemPrompt as ConfigAISystemPrompt } from '../config'
import config from '../config'
import { buildScriptInstanceAssistantPrompt } from '../content/scriptInstanceAssistantPrompt'
import type { ScriptInstance } from '../store/fbcskmSlice'
import { sanitizeInstanceForAi, type ScriptInstanceAiUpdate } from '../utils/scriptInstanceAiUpdates'
import type { ValidationIssue } from '../utils/scriptInstanceValidation'
import { hashScriptContent } from '../utils/contentHash'
import { preserveOriginalComments } from '../utils/preserveComments'

export type AiProvider = ConfigAIModelConfig['provider']
export type AiModelConfig = ConfigAIModelConfig
export type AiSystemPrompt = ConfigAISystemPrompt

export interface AiGeneratedScript {
  id: string
  title: string
  name: string
  content: string
  prompt: string
  modelName: string
  createdAt: string
  summary?: string
  actionsRequired?: string[]
  contentHash?: string
  lastVerified?: string
}

export interface AiConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AiDiagnosisInput {
  script: string
  name: string
  os: string
  transport?: string
  command?: string
  exitCode?: number
  stdout?: string
  stderr?: string
  validationOk?: boolean
  validationIssues?: string[]
  validationWarnings?: string[]
}

export interface AiDiagnosis {
  diagnosis: string
  rootCause: string
  fixedScript: string
  changes: string[]
  risks: string[]
  confidence: 'high' | 'medium' | 'low'
  needsUserInput: string[]
  rawResponse: string
  modelName: string
  usedFallback: boolean
  attemptedModels: string[]
  failedModels: string[]
}

export type ScriptInstanceAiMode = 'review' | 'fix' | 'configure'

export interface ScriptInstanceAiInput {
  mode: ScriptInstanceAiMode
  instance: ScriptInstance
  deviceName?: string
  validationIssues?: ValidationIssue[]
  request?: string
}

export interface ScriptInstanceAiIssue {
  field?: string
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestion?: string
}

export interface ScriptInstanceAiResult {
  summary: string
  assessment: 'valid' | 'needs_attention' | 'invalid'
  issues: ScriptInstanceAiIssue[]
  updates: ScriptInstanceAiUpdate[]
  needsUserInput: string[]
  confidence: 'high' | 'medium' | 'low'
  rawResponse: string
  modelName: string
  usedFallback: boolean
  attemptedModels: string[]
  failedModels: string[]
}

export class AiGenerationError extends Error {
  readonly attemptedModels: string[]

  constructor(message: string, attemptedModels: string[]) {
    super(message)
    this.name = 'AiGenerationError'
    this.attemptedModels = attemptedModels
  }
}

export function getActiveSystemPrompt(systemPrompts: AiSystemPrompt[] = [], activePromptId?: string | null): string {
  const selected = systemPrompts.find(prompt => prompt.id === activePromptId)
    ?? systemPrompts.find(prompt => prompt.id === config.ai?.activeSystemPromptId)
    ?? systemPrompts[0]
  return selected?.content || 'You are a senior infrastructure automation engineer. Produce readable, production-safe scripts with clear comments and input validation.'
}

export function getFallbackChain(models: AiModelConfig[] = []): AiModelConfig[] {
  return models.filter(model => model.enabled)
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'agent-script'
}

function extractScript(response: string): string {
  const fenced = response.match(/```(?:[\w+-]+)?\s*\n([\s\S]*?)```/)
  return (fenced?.[1] ?? response).trim()
}

function parseSuggestionList(response: string): string[] {
  const tagged = response.match(/(?:<FOLLOW_UPS>\s*|NEXT_PROMPTS:\s*)(\[[\s\S]*?\])(?:\s*<\/FOLLOW_UPS>)?/i)
  const jsonText = tagged?.[1] ?? response
  const match = jsonText.match(/\[[\s\S]*\]/)
  try {
    const parsed = JSON.parse(match?.[0] ?? jsonText)
    const suggestions = Array.isArray(parsed) ? parsed : parsed.suggestions
    if (Array.isArray(suggestions)) {
      return suggestions.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    }
  } catch {
    return []
  }
  return []
}

function parseSuggestions(response: string): string[] {
  return parseSuggestionList(response).slice(0, 3)
}

function parseActionItems(value: unknown): string[] {
  const clean = (raw: string) => raw
    .trim()
    .replace(/^[-*\u2022]+\s*|^\d+[.)]\s*/, '')
    .replace(/^\*+|\*+$/g, '')
    .trim()
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(clean)
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map(clean)
      .filter(Boolean)
  }
  return []
}

function parseActionItemsFromText(response: string): string[] {
  const label = /^[ \t]*\*{0,2}[ \t]*(?:ACTIONS_REQUIRED|SETUP_REQUIRED|SETUP_NOTES)[ \t]*\*{0,2}[ \t]*:[ \t]*([^\n]*)/im
  const match = label.exec(response)
  if (!match) return []
  const inline = match[1] ?? ''
  const afterLabel = response.slice(match.index + match[0].length)
  const stop = afterLabel.search(/\n[ \t]*\*{0,2}[ \t]*[A-Z][A-Z0-9_]*[ \t]*\*{0,2}[ \t]*:|```/)
  const block = stop === -1 ? afterLabel : afterLabel.slice(0, stop)
  const items = parseActionItems(`${inline}\n${block}`)
  return items.filter(item => !/^(?:none|n\/?a|no(?:ne)? required|not required|[-*\u2022.\s]+)$/i.test(item.trim()))
}

function parseResponse(response: string): { script: string; suggestions: string[]; title: string; fileName: string; language: string; summary: string; actionsRequired: string[] } {
  try {
    const parsed = JSON.parse(response)
    if (parsed && typeof parsed === 'object') {
      const script = typeof parsed.script === 'string' ? parsed.script : typeof parsed.content === 'string' ? parsed.content : ''
      if (script) {
        const suggestions = Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 3)
          : []
        const summaryValue = typeof parsed.summary === 'string' ? parsed.summary : typeof parsed.description === 'string' ? parsed.description : ''
        const actions = parseActionItems(parsed.actionsRequired ?? parsed.setupRequired ?? parsed.actions ?? parsed.setup)
        return {
          script: extractScript(script),
          suggestions,
          title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
          fileName: typeof parsed.fileName === 'string' ? parsed.fileName.trim() : typeof parsed.name === 'string' ? parsed.name.trim() : '',
          language: typeof parsed.language === 'string' ? parsed.language.trim() : '',
          summary: summaryValue.trim(),
          actionsRequired: actions,
        }
      }
    }
  } catch {
    // Providers may return a fenced script followed by the structured suggestion block.
  }
  const fenced = response.match(/```([\w.+-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/)
  const metadata = (key: string) => response.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))?.[1]?.trim() ?? ''
  return {
    script: extractScript(response),
    suggestions: parseSuggestions(response),
    title: metadata('SCRIPT_TITLE'),
    fileName: metadata('SCRIPT_NAME'),
    language: metadata('SCRIPT_LANGUAGE') || fenced?.[1] || '',
    summary: metadata('SCRIPT_SUMMARY') || metadata('SUMMARY'),
    actionsRequired: parseActionItemsFromText(response),
  }
}

function normalizeLanguage(value: string, script: string, prompt: string): { label: string; extension: string } {
  const detected = `${value} ${script.slice(0, 240)}`.toLowerCase()
  if (/powershell|pwsh|\.ps1/.test(detected)) return { label: 'PowerShell', extension: 'ps1' }
  if (/\b(bash|shell|sh|zsh)\b|#!\/bin\/(?:ba)?sh/.test(detected)) return { label: 'Bash', extension: 'sh' }
  if (/python|python\d|\.py\b/.test(detected)) return { label: 'Python', extension: 'py' }
  if (/\b(node|javascript|\bjs\b|\.js\b)/.test(detected)) return { label: 'JavaScript', extension: 'js' }
  if (/\btypescript|\bts\b|\.ts\b/.test(detected)) return { label: 'TypeScript', extension: 'ts' }
  if (/\b(ruby|\.rb\b)/.test(detected)) return { label: 'Ruby', extension: 'rb' }
  if (/\b(perl|\.pl\b)/.test(detected)) return { label: 'Perl', extension: 'pl' }
  if (/\b(php|\.php\b)/.test(detected)) return { label: 'PHP', extension: 'php' }
  if (/\b(go|golang|\.go\b)/.test(detected)) return { label: 'Go', extension: 'go' }
  if (/\b(rust|\.rs\b)/.test(detected)) return { label: 'Rust', extension: 'rs' }
  if (/\b(batch|\.bat\b|\.cmd\b)/.test(detected)) return { label: 'Windows Batch', extension: 'bat' }
  if (/\b(python|powershell|javascript|typescript|ruby|perl|php|go|rust)\b/i.test(prompt)) {
    return normalizeLanguage(prompt, '', '')
  }
  return { label: 'Bash', extension: 'sh' }
}

function humanizeFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()).trim()
}

function endpointFor(model: AiModelConfig): string {
  const base = model.baseUrl.trim().replace(/\/+$/, '')
  if (model.provider === 'google-gemini') {
    return `${base}/models/${encodeURIComponent(model.model)}:generateContent`
  }
  if (model.provider === 'azure-openai') {
    const apiVersion = encodeURIComponent(model.apiVersion || '2024-10-21')
    if (base.includes('/openai/deployments/')) {
      const separator = base.includes('?') ? '&' : '?'
      return `${base}${base.includes('api-version=') ? '' : `${separator}api-version=${apiVersion}`}`
    }
    return `${base}/openai/deployments/${encodeURIComponent(model.model)}/chat/completions?api-version=${apiVersion}`
  }
  if (model.provider === 'anthropic') {
    return base.endsWith('/messages') ? base : `${base}/messages`
  }
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

function modelsEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  return base.endsWith('/models') ? base : `${base}/models`
}

async function fetchCatalogPage(url: string, headers: Record<string, string>, timeoutMs: number): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs || 30000))
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400)
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    return await response.json()
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Timed out after ${timeoutMs || 30000} ms`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function getCatalogIds(items: any[], getId: (item: any) => string | undefined = item => item.id ?? item.name): string[] {
  return [...new Set(items.map(getId).filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map(id => id.trim()))]
}

export async function fetchProviderModels(model: AiModelConfig): Promise<string[]> {
  if (!model.baseUrl.trim()) throw new Error('Enter the provider base URL first.')
  if (model.provider !== 'openai-compatible' && model.provider !== 'ollama' && model.provider !== 'mock' && !model.apiKey.trim()) {
    throw new Error('Enter the provider API key first.')
  }
  if (model.provider === 'mock') return ['mock-script']

  const headers: Record<string, string> = {}
  if (model.provider === 'anthropic') {
    headers['x-api-key'] = model.apiKey
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else if (model.provider === 'google-gemini') {
    headers['x-goog-api-key'] = model.apiKey
  } else if (model.provider === 'azure-openai') {
    headers['api-key'] = model.apiKey
  } else if (model.apiKey.trim()) {
    headers.Authorization = `Bearer ${model.apiKey}`
  }

  if (model.provider === 'google-gemini') {
    const ids: string[] = []
    let pageToken = ''
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(modelsEndpoint(model.baseUrl))
      url.searchParams.set('pageSize', '1000')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const payload = await fetchCatalogPage(url.toString(), headers, model.timeoutMs)
      const supported = (payload.models ?? []).filter((item: any) => item.supportedGenerationMethods?.includes('generateContent'))
      ids.push(...getCatalogIds(supported, item => item.name?.replace(/^models\//, '')))
      pageToken = payload.nextPageToken ?? ''
      if (!pageToken) break
    }
    if (!ids.length) throw new Error('Google returned no models supporting generateContent.')
    return [...new Set(ids)].sort()
  }

  if (model.provider === 'azure-openai') {
    const resourceRoot = model.baseUrl.trim().replace(/\/openai(?:\/deployments(?:\/.*)?)?\/?$/, '').replace(/\/+$/, '')
    const url = new URL(`${resourceRoot}/openai/deployments`)
    url.searchParams.set('api-version', model.apiVersion || '2024-10-21')
    const payload = await fetchCatalogPage(url.toString(), headers, model.timeoutMs)
    const ids = getCatalogIds(payload.data ?? payload.value ?? payload.deployments ?? [], item => item.id ?? item.name)
    if (!ids.length) throw new Error('Azure returned no deployments. Check the resource URL and API permissions.')
    return ids.sort()
  }

  if (model.provider === 'ollama') {
    try {
      const payload = await fetchCatalogPage(modelsEndpoint(model.baseUrl), headers, model.timeoutMs)
      const ids = getCatalogIds(payload.data ?? payload.models ?? [])
      if (ids.length) return ids.sort()
    } catch {
      // Native Ollama installations expose tags at /api/tags instead of /v1/models.
    }
    const nativeRoot = model.baseUrl.trim().replace(/\/v1\/?$/, '').replace(/\/+$/, '')
    const payload = await fetchCatalogPage(`${nativeRoot}/api/tags`, headers, model.timeoutMs)
    const ids = getCatalogIds(payload.models ?? [], item => item.name ?? item.model)
    if (!ids.length) throw new Error('Ollama returned no installed models.')
    return ids.sort()
  }

  const ids: string[] = []
  let cursor = ''
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(modelsEndpoint(model.baseUrl))
    url.searchParams.set('limit', '1000')
    if (cursor) url.searchParams.set(model.provider === 'anthropic' ? 'after_id' : 'after', cursor)
    const payload = await fetchCatalogPage(url.toString(), headers, model.timeoutMs)
    ids.push(...getCatalogIds(payload.data ?? payload.models ?? []))
    if (!payload.has_more || !payload.last_id) break
    cursor = payload.last_id
  }
  if (!ids.length) throw new Error('The provider returned no models. Check the base URL, API key, and account permissions.')
  return [...new Set(ids)].sort()
}

async function requestModel(model: AiModelConfig, prompt: string, systemPrompt: string, history: AiConversationTurn[] = []): Promise<string> {
  if (model.provider === 'mock') {
    return JSON.stringify({
      title: `Automation for ${prompt.replace(/[\r\n]+/g, ' ').slice(0, 36)}`,
      fileName: slugify(prompt),
      language: 'bash',
      summary: `Mock script that echoes a placeholder for the request: ${prompt.replace(/[\r\n]+/g, ' ').slice(0, 80)}`,
      actionsRequired: [
        'Replace the placeholder body with the real commands for this request.',
        'Confirm the script runs on the target host (bash required).',
      ],
      script: `#!/usr/bin/env bash\nset -euo pipefail\n\n# Request: ${prompt.replace(/[\r\n]+/g, ' ')}\nprintf '%s\\n' "Implement the requested automation here."\n`,
      suggestions: [
        `Add input validation for the requirements in: ${prompt}`,
        `Add logging and a completion summary to the script for: ${prompt}`,
        `Add a dry-run mode to safely preview the script for: ${prompt}`,
      ],
    })
  }
  const apiKeyRequired = ['anthropic', 'google-gemini', 'azure-openai'].includes(model.provider)
  if (apiKeyRequired && !model.apiKey.trim()) throw new Error('API key is missing')
  if (!model.baseUrl.trim() || !model.model.trim()) throw new Error('Model URL or model ID is missing')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, model.timeoutMs || 30000))
  try {
    const anthropic = model.provider === 'anthropic'
    const gemini = model.provider === 'google-gemini'
    const azure = model.provider === 'azure-openai'
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    let body: Record<string, unknown>
    if (anthropic) {
      headers['x-api-key'] = model.apiKey
      headers['anthropic-version'] = '2023-06-01'
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
      body = {
        model: model.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [...history, { role: 'user', content: prompt }],
      }
    } else if (gemini) {
      headers['x-goog-api-key'] = model.apiKey
      body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          ...history.map(turn => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.content }] })),
          { role: 'user', parts: [{ text: prompt }] },
        ],
        generationConfig: { temperature: 0.2 },
      }
    } else {
      if (azure) headers['api-key'] = model.apiKey
      else if (model.apiKey.trim()) headers.Authorization = `Bearer ${model.apiKey}`
      body = {
        model: model.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: prompt },
        ],
      }
    }

    const response = await fetch(endpointFor(model), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }

    const payload = await response.json()
    const content = gemini
      ? payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('\n')
      : anthropic
        ? payload.content?.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n')
        : typeof payload.choices?.[0]?.message?.content === 'string'
          ? payload.choices[0].message.content
          : payload.choices?.[0]?.message?.content?.map((part: any) => part.text || '').join('\n')
    if (!content?.trim()) throw new Error('Provider returned an empty response')
    return content.trim()
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Timed out after ${model.timeoutMs || 30000} ms`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeAiSeverity(value: unknown): ScriptInstanceAiIssue['severity'] {
  const severity = asText(value).toLowerCase()
  return severity === 'error' || severity === 'warning' ? severity : 'info'
}

function normalizeAiConfidence(value: unknown): 'high' | 'medium' | 'low' {
  const confidence = asText(value).toLowerCase()
  return confidence === 'high' || confidence === 'low' ? confidence : 'medium'
}

function normalizeAiAssessment(value: unknown, issues: ScriptInstanceAiIssue[]): 'valid' | 'needs_attention' | 'invalid' {
  const assessment = asText(value).toLowerCase()
  if (assessment === 'valid' || assessment === 'needs_attention' || assessment === 'invalid') return assessment
  if (issues.some(issue => issue.severity === 'error')) return 'invalid'
  if (issues.some(issue => issue.severity === 'warning')) return 'needs_attention'
  return 'valid'
}

function parseScriptInstanceAiResponse(response: string): Omit<ScriptInstanceAiResult, 'modelName' | 'usedFallback' | 'attemptedModels' | 'failedModels'> {
  const jsonText = extractJsonObject(response)
  if (!jsonText) throw new Error('AI response did not contain a JSON object.')

  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('AI response contained invalid JSON.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('AI response was not a JSON object.')

  const issues: ScriptInstanceAiIssue[] = Array.isArray(parsed.issues)
    ? parsed.issues
      .filter((issue: unknown): issue is Record<string, unknown> => Boolean(issue && typeof issue === 'object'))
      .map((issue: Record<string, unknown>) => ({
        field: asText(issue.field) || undefined,
        severity: normalizeAiSeverity(issue.severity),
        message: asText(issue.message),
        suggestion: asText(issue.suggestion) || undefined,
      }))
      .filter(issue => Boolean(issue.message))
    : []

  const updates: ScriptInstanceAiUpdate[] = Array.isArray(parsed.updates)
    ? parsed.updates
      .filter((update: unknown): update is Record<string, unknown> => Boolean(update && typeof update === 'object' && typeof (update as Record<string, unknown>).field === 'string'))
      .map((update: Record<string, unknown>) => ({
        field: asText(update.field).trim(),
        value: update.value,
        reason: asText(update.reason) || undefined,
      }))
      .filter(update => Boolean(update.field))
    : []

  const needsUserInput = parseActionItems(parsed.needsUserInput ?? parsed.needs_user_input ?? parsed.needsInput)
  const summary = asText(parsed.summary ?? parsed.explanation)
  if (!summary && !issues.length && !updates.length && !needsUserInput.length) {
    throw new Error('AI response did not contain any Script Instance guidance.')
  }

  return {
    summary,
    assessment: normalizeAiAssessment(parsed.assessment, issues),
    issues,
    updates,
    needsUserInput,
    confidence: normalizeAiConfidence(parsed.confidence),
    rawResponse: response,
  }
}

function buildScriptInstanceAssistantUserPrompt(input: ScriptInstanceAiInput, sanitizedInstance: Record<string, unknown>): string {
  const validation = (input.validationIssues ?? [])
    .map(issue => `- [${issue.severity}] ${issue.field ? `${issue.field}: ` : ''}${issue.message}`)
    .join('\n')
  const request = input.request?.trim()

  return [
    `Mode: ${input.mode}`,
    `Device: ${input.deviceName || '(not provided)'}`,
    request ? `User request:\n${request}` : '',
    'CURRENT INSTANCE (secrets redacted):',
    '```json',
    JSON.stringify(sanitizedInstance, null, 2),
    '```',
    'LOCAL VALIDATION FINDINGS:',
    validation || '- none',
    'Return only the JSON object described in the system instructions.',
  ].filter(Boolean).join('\n')
}

function mockScriptInstanceAssistantResponse(input: ScriptInstanceAiInput): string {
  const updates = new Map<string, ScriptInstanceAiUpdate>()
  const addUpdate = (field: string, value: unknown, reason: string) => {
    if (!updates.has(field)) updates.set(field, { field, value, reason })
  }
  const instance = input.instance
  const args = instance.args && typeof instance.args === 'object' ? instance.args as Record<string, unknown> : {}
  const localIssues = input.validationIssues ?? []

  if (input.mode === 'fix') {
    const instanceName = String(instance.instanceName ?? '')
    const cleanName = instanceName.replace(/[!@#$%^&*|]/g, '').trim()
    if (cleanName !== instanceName && cleanName) addUpdate('instanceName', cleanName, 'Removed characters that are not allowed in an instance name.')

    if (instance.isRestmon) {
      const format = String(args.outputFormat || 'json').toLowerCase()
      const payload = String(args.payload ?? '')
      if (format === 'json' && payload.trim()) {
        try {
          JSON.parse(payload)
        } catch {
          addUpdate('payload', '{}', 'Replaced an invalid JSON payload with an empty JSON object.')
        }
      }
      const headers = String(args.headers ?? '').trim()
      if (headers && !(headers.startsWith('@{') && headers.endsWith('}'))) {
        addUpdate('headers', '@{"Content-Type"="application/json"}', 'Replaced a malformed headers value with a valid PowerShell hashtable.')
      }
      const method = String(args.method || '').toUpperCase()
      if ((method === 'GET' || method === 'HEAD') && payload.trim()) {
        addUpdate('method', 'POST', 'GET and HEAD requests should not send a payload.')
      }
    }

    const poll = Number(instance.pollIntervalSec)
    const timeout = Number(instance.timeoutSec)
    if (Number.isFinite(poll) && Number.isFinite(timeout) && poll > 0 && timeout >= poll) {
      addUpdate('timeoutSec', Math.max(1, Math.floor(poll / 2)), 'Made the timeout shorter than the poll interval.')
    }
  }

  if (input.mode === 'configure') {
    const request = input.request || ''
    const lower = request.toLowerCase()
    if (instance.isRestmon) {
      const url = request.match(/https?:\/\/[^\s,'"]+/i)?.[0]
      if (url) addUpdate('url', url, 'Used the URL from the request.')

      const method = request.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i)?.[1]?.toUpperCase()
      if (method) addUpdate('method', method, 'Used the HTTP method from the request.')

      const format = lower.match(/\b(json|xml|text)\b/)?.[1]
      if (format) addUpdate('outputFormat', format, 'Used the output format from the request.')
    }

    const every = lower.match(/every\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/)
    if (every) {
      const amount = Number(every[1])
      const unit = every[2]
      const seconds = unit.startsWith('h') ? amount * 3600 : unit.startsWith('m') ? amount * 60 : amount
      if (seconds > 0) addUpdate('pollIntervalSec', seconds, 'Set the poll interval from the request.')
    }

    const timeout = lower.match(/timeout\s+(?:of\s+)?(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/)
    if (timeout) {
      const amount = Number(timeout[1])
      const unit = timeout[2]
      const seconds = unit.startsWith('m') ? amount * 60 : amount
      if (seconds > 0) addUpdate('timeoutSec', seconds, 'Set the timeout from the request.')
    }

    const times = request.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)
    if (times?.length) {
      addUpdate('scriptStartTime', times[0].padStart(5, '0'), 'Set the schedule start time from the request.')
      if (times[1]) addUpdate('scriptEndTime', times[1].padStart(5, '0'), 'Set the schedule end time from the request.')
      addUpdate('scriptSchedulingEnable', true, 'Enabled scheduling because the request included a time window.')
    }

    const days = ['scriptSunday', 'scriptMonday', 'scriptTueday', 'scriptWednesday', 'scriptThursday', 'scriptFriday', 'scriptSaturday']
    if (/\bweekdays?\b/.test(lower)) {
      days.forEach(day => addUpdate(day, day !== 'scriptSunday' && day !== 'scriptSaturday', 'Applied the weekday schedule from the request.'))
      addUpdate('scriptSchedulingEnable', true, 'Enabled scheduling because the request included weekdays.')
    } else if (/\bweekends?\b/.test(lower)) {
      days.forEach(day => addUpdate(day, day === 'scriptSunday' || day === 'scriptSaturday', 'Applied the weekend schedule from the request.'))
      addUpdate('scriptSchedulingEnable', true, 'Enabled scheduling because the request included weekends.')
    } else if (/\b(daily|every day|all days)\b/.test(lower)) {
      days.forEach(day => addUpdate(day, true, 'Applied the daily schedule from the request.'))
      addUpdate('scriptSchedulingEnable', true, 'Enabled scheduling because the request included daily execution.')
    }
  }

  const updatesArray = [...updates.values()]
  const issues = localIssues.map(issue => ({
    field: issue.field,
    severity: issue.severity,
    message: issue.message,
    suggestion: issue.suggestion,
  }))
  const hasErrors = issues.some(issue => issue.severity === 'error')
  const hasWarnings = issues.some(issue => issue.severity === 'warning')
  const modeSummary = input.mode === 'review'
    ? `Mock review found ${issues.length} local validation finding${issues.length === 1 ? '' : 's'}.`
    : input.mode === 'fix'
      ? `Mock fix prepared ${updatesArray.length} change${updatesArray.length === 1 ? '' : 's'} for review.`
      : `Mock configuration prepared ${updatesArray.length} field change${updatesArray.length === 1 ? '' : 's'}.`

  return JSON.stringify({
    summary: modeSummary,
    assessment: hasErrors ? 'invalid' : hasWarnings || localIssues.length ? 'needs_attention' : 'valid',
    issues,
    updates: updatesArray,
    needsUserInput: [],
    confidence: 'medium',
  })
}

export async function assistScriptInstance(
  input: ScriptInstanceAiInput,
  models: AiModelConfig[] = [],
): Promise<ScriptInstanceAiResult> {
  if (!input.instance) throw new Error('There is no Script Instance to review.')
  if (input.mode === 'configure' && !input.request?.trim()) {
    throw new Error('Enter a configuration request before using Configure with AI.')
  }

  const chain = getFallbackChain(models)
  if (!chain.length) throw new Error('No AI models are enabled. Configure at least one model in Settings.')

  const instructions = buildScriptInstanceAssistantPrompt()
  const sanitizedInstance = sanitizeInstanceForAi(input.instance)
  const userPrompt = buildScriptInstanceAssistantUserPrompt(input, sanitizedInstance)
  const attemptedModels: string[] = []
  const failedModels: string[] = []
  const failures: string[] = []

  for (const model of chain) {
    attemptedModels.push(model.name)
    try {
      const response = model.provider === 'mock'
        ? mockScriptInstanceAssistantResponse(input)
        : await requestModel(model, userPrompt, instructions)
      const parsed = parseScriptInstanceAiResponse(response)
      return {
        ...parsed,
        modelName: model.name,
        usedFallback: attemptedModels.length > 1,
        attemptedModels,
        failedModels,
      }
    } catch (error) {
      failedModels.push(model.name)
      failures.push(`${model.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new AiGenerationError(`All configured AI models failed. ${failures.join(' | ')}`, attemptedModels)
}

export async function testAiModel(model: AiModelConfig, systemPrompt = getActiveSystemPrompt()): Promise<void> {
  await requestModel(model, 'Reply with a short confirmation that the connection is working.', systemPrompt)
}

export async function generateScriptFromPrompt(
  prompt: string,
  models: AiModelConfig[] = [],
  systemPrompt = getActiveSystemPrompt(),
  history: AiConversationTurn[] = [],
): Promise<{ result: AiGeneratedScript; suggestions: string[]; usedFallback: boolean; attemptedModels: string[]; failedModels: string[] }> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt) throw new Error('Enter a prompt before generating a script.')

  const chain = getFallbackChain(models)
  if (!chain.length) throw new Error('No AI models are enabled. Configure at least one model in Settings.')

  const attemptedModels: string[] = []
  const failedModels: string[] = []
  const failures: string[] = []
  const responseInstructions = `${systemPrompt}\n\nReturn a concise purpose-based title and a filename base that describes what the script does, not a copy of the user's request. Detect the language of the script you actually generate. Format your response as:\nSCRIPT_TITLE: concise human-readable title\nSCRIPT_NAME: short-purpose-based-filename-without-extension\nSCRIPT_LANGUAGE: language-name\nSCRIPT_SUMMARY: one or two sentences describing what the script does, what it connects to, and what it outputs. If this request modifies a previously generated script, describe what you changed or added instead.\nACTIONS_REQUIRED:\n- every manual step the user must take before this script can run: define or point to credentials/secrets and the file permissions or ACLs to apply, edit placeholder values, populate the list of objects/hosts/targets the script operates on, install required tools or modules, grant permissions or set the execution policy, and note the target/deployment path\n- this section is mandatory whenever the script reads any external value (a secret/credential file, an API key or token, a config file, a hardcoded path, a list of hosts/objects, or an installed tool); never leave such a requirement unlisted\n- one concrete prerequisite per line, written as an imperative instruction\n- output exactly "ACTIONS_REQUIRED: NONE" only when the script is fully self-contained and needs no manual setup whatsoever\nIn the script itself, start with a header comment block whose CONFIGURATION section documents every external value the user must provide: the credential/secret file path, the exact file format and the order of its fields, placeholder values to replace, the list of objects/hosts/targets, required tools/modules, and the file permissions/ACLs to set. Any value a user must supply or edit must be explained there, never left buried in the code.\nInclude the complete script in one fenced code block labelled with that language.\nNEXT_PROMPTS: ["first relevant follow-up", "second relevant follow-up", "third relevant follow-up"]\nDo not include an extension in SCRIPT_NAME; the application adds the extension from SCRIPT_LANGUAGE.`
  for (const model of chain) {
    attemptedModels.push(model.name)
    try {
      const response = await requestModel(model, normalizedPrompt, responseInstructions, history)
      const parsed = parseResponse(response)
      if (!parsed.script) throw new Error('Provider response did not contain a script')
      const scriptLanguage = normalizeLanguage(parsed.language, parsed.script, normalizedPrompt)
      const requestedBaseName = parsed.fileName || parsed.title || normalizedPrompt
      const safeBaseName = slugify(requestedBaseName.replace(/\.(sh|bash|ps1|py|js|ts|rb|pl|php|go|rs|bat|cmd)$/i, ''))
      const scriptTitle = parsed.title || humanizeFileName(safeBaseName)

      let suggestions = parsed.suggestions
      if (suggestions.length !== 3) {
        try {
          const suggestionResponse = await requestModel(
            model,
            `Generate exactly three concise follow-up prompts based on this request and script. Return only a JSON array of three strings.\n\nRequest:\n${normalizedPrompt}\n\nScript:\n${parsed.script}`,
            `${systemPrompt}\nReturn only a valid JSON array containing exactly three context-specific follow-up prompt strings.`,
          )
          suggestions = parseSuggestions(suggestionResponse)
        } catch {
          suggestions = []
        }
      }
      if (suggestions.length !== 3) {
        suggestions = [
          `Add validation and error handling specific to: ${normalizedPrompt}`,
          `Improve the logging and reporting for this ${scriptTypeFromContent(parsed.script)} script.`,
          `Add a safe dry-run option to preview the effects of: ${normalizedPrompt}`,
        ]
      }
      return {
        result: {
          id: `${model.id}-${Date.now()}`,
          title: scriptTitle,
          name: `${safeBaseName}.${scriptLanguage.extension}`,
          content: parsed.script,
          prompt: normalizedPrompt,
          modelName: model.name,
          createdAt: new Date().toISOString(),
          summary: parsed.summary,
          actionsRequired: parsed.actionsRequired,
          contentHash: hashScriptContent(parsed.script),
        },
        suggestions,
        usedFallback: attemptedModels.length > 1,
        attemptedModels,
        failedModels,
      }
    } catch (error) {
      failedModels.push(model.name)
      failures.push(`${model.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new AiGenerationError(`All configured AI models failed. ${failures.join(' | ')}`, attemptedModels)
}

export async function generateMoreSuggestions(
  prompt: string,
  script: string,
  existing: string[] = [],
  models: AiModelConfig[] = [],
  systemPrompt = getActiveSystemPrompt(),
  count = 3,
): Promise<string[]> {
  const chain = getFallbackChain(models)
  if (!chain.length) return []

  const avoidList = existing.map(item => `- ${item}`).join('\n')
  const seen = new Set(existing.map(item => item.trim().toLowerCase()))
  const userPrompt = `Suggest ${count} new follow-up prompts the user might want next for this automation script. They must be relevant and different from the existing suggestions.\n\nOriginal request:\n${prompt}\n\nCurrent script:\n${script}\n\nExisting suggestions to avoid:\n${avoidList || '(none)'}`
  const instructions = `${systemPrompt}\nReturn only a valid JSON array containing exactly ${count} new, context-specific follow-up prompt strings.`

  for (const model of chain) {
    try {
      const response = await requestModel(model, userPrompt, instructions)
      const fresh = parseSuggestionList(response).filter(item => !seen.has(item.trim().toLowerCase()))
      if (fresh.length) return fresh.slice(0, count)
    } catch {
      continue
    }
  }

  return []
}

function scriptTypeFromContent(content: string): string {
  if (/^\s*#!/m.test(content)) return content.match(/^#!.*$/m)?.[0].replace(/^#!\S*\/?/, '').trim() || 'automation'
  return 'automation'
}

function extractJsonObject(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fence?.[1] ?? text
  const start = source.indexOf('{')
  if (start === -1) return ''

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index++) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth++
    else if (character === '}') {
      depth--
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return ''
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function truncateForPrompt(value: string | undefined, limit: number): string {
  const text = String(value ?? '')
  if (!text) return '(empty)'
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n… (${text.length - limit} more characters omitted)`
}

function parseDiagnosisResponse(response: string): Omit<AiDiagnosis, 'modelName' | 'usedFallback' | 'attemptedModels' | 'failedModels'> {
  const jsonText = extractJsonObject(response)
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText)
      if (parsed && typeof parsed === 'object') {
        const rawFixed = typeof parsed.fixedScript === 'string'
          ? parsed.fixedScript
          : typeof parsed.script === 'string'
            ? parsed.script
            : ''
        const confidence = asText(parsed.confidence).toLowerCase()
        return {
          diagnosis: asText(parsed.diagnosis),
          rootCause: asText(parsed.rootCause ?? parsed.root_cause),
          fixedScript: extractScript(rawFixed),
          changes: parseActionItems(parsed.changes),
          risks: parseActionItems(parsed.risks),
          confidence: confidence === 'high' || confidence === 'low' ? confidence : 'medium',
          needsUserInput: parseActionItems(parsed.needsUserInput ?? parsed.needs_user_input ?? parsed.needsInput),
          rawResponse: response,
        }
      }
    } catch {
      // Fall through to the fenced-script fallback below.
    }
  }

  const fenced = response.match(/```(?:[\w.+-]+)?[^\S\r\n]*\r?\n([\s\S]*?)```/)
  return {
    diagnosis: '',
    rootCause: '',
    fixedScript: fenced?.[1]?.trim() ?? '',
    changes: [],
    risks: [],
    confidence: 'medium',
    needsUserInput: [],
    rawResponse: response,
  }
}

function buildDiagnosisPrompt(input: AiDiagnosisInput): string {
  const validation = input.validationOk === undefined ? 'not checked' : input.validationOk ? 'yes' : 'no'
  const issues = (input.validationIssues ?? []).map(item => `- ${item}`).join('\n')
  const warnings = (input.validationWarnings ?? []).map(item => `- ${item}`).join('\n')

  return [
    'A monitoring script failed. Diagnose the failure and propose a corrected script.',
    '',
    `Script name: ${input.name || 'script'}`,
    `Target OS: ${input.os || 'unknown'}`,
    input.transport ? `Transport: ${input.transport}` : '',
    input.command ? `Command: ${input.command}` : '',
    `Exit code: ${input.exitCode ?? 'unknown'}`,
    `PATROL output valid: ${validation}`,
    issues ? `PATROL validation errors:\n${issues}` : '',
    warnings ? `PATROL validation warnings:\n${warnings}` : '',
    '',
    'STDOUT:',
    '```',
    truncateForPrompt(input.stdout, 12000),
    '```',
    '',
    'STDERR:',
    '```',
    truncateForPrompt(input.stderr, 8000),
    '```',
    '',
    'CURRENT SCRIPT:',
    '```',
    input.script,
    '```',
  ].filter(Boolean).join('\n')
}

export async function diagnoseScriptFailure(
  input: AiDiagnosisInput,
  models: AiModelConfig[] = [],
  systemPrompt = getActiveSystemPrompt(),
): Promise<AiDiagnosis> {
  if (!input.script?.trim()) throw new Error('There is no script content to diagnose.')
  const chain = getFallbackChain(models)
  if (!chain.length) throw new Error('No AI models are enabled. Configure at least one model in Settings.')

  const instructions = `${systemPrompt}

You are diagnosing a failed monitoring script for BMC PATROL for Scripting (TrueSight / Helix Operations Management).
Fix only what is needed so the script runs successfully and its output matches the PATROL format.
Rules:
- Keep the original language and intent.
- Apply the smallest possible change. Copy every unchanged line verbatim, including indentation and blank lines. Do not reformat, reorder, or restructure code that does not need to change.
- Preserve every existing comment line verbatim. Do not remove, shorten, reword, or relocate comments while fixing code.
- Delete a comment only when you also delete the section it documents or when the comment is now factually wrong.
- Never add destructive commands, credential values, or invented file paths.
- If the cause is environmental (permissions, missing tool, network, wrong host), explain it and return an empty fixedScript when no code change is required.
- fixedScript must be the COMPLETE corrected script, not a diff.
Return ONLY a JSON object with exactly these fields:
{"diagnosis":"one short paragraph","rootCause":"the specific cause","fixedScript":"complete corrected script or empty string","changes":["code change"],"risks":["remaining risk"],"confidence":"high|medium|low","needsUserInput":["value the user must provide or verify"]}
Do not wrap the JSON in markdown fences. Escape newlines inside fixedScript.`

  const userPrompt = buildDiagnosisPrompt(input)
  const attemptedModels: string[] = []
  const failedModels: string[] = []
  const failures: string[] = []

  for (const model of chain) {
    attemptedModels.push(model.name)
    try {
      const response = await requestModel(model, userPrompt, instructions)
      const parsed = parseDiagnosisResponse(response)
      if (!parsed.diagnosis && !parsed.rootCause && !parsed.fixedScript) {
        throw new Error('Provider response did not contain a diagnosis')
      }
      const fixedScript = parsed.fixedScript
        ? preserveOriginalComments(input.script, parsed.fixedScript)
        : ''
      return {
        ...parsed,
        fixedScript,
        modelName: model.name,
        usedFallback: attemptedModels.length > 1,
        attemptedModels,
        failedModels,
      }
    } catch (error) {
      failedModels.push(model.name)
      failures.push(`${model.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new AiGenerationError(`All configured AI models failed. ${failures.join(' | ')}`, attemptedModels)
}

