import type { AIModelConfig as ConfigAIModelConfig, AISystemPrompt as ConfigAISystemPrompt } from '../config'

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
}

export interface AiConversationTurn {
  role: 'user' | 'assistant'
  content: string
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
  const selected = systemPrompts.find(prompt => prompt.id === activePromptId) ?? systemPrompts[0]
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

function parseResponse(response: string): { script: string; suggestions: string[]; title: string; fileName: string; language: string } {
  try {
    const parsed = JSON.parse(response)
    if (parsed && typeof parsed === 'object') {
      const script = typeof parsed.script === 'string' ? parsed.script : typeof parsed.content === 'string' ? parsed.content : ''
      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 3)
        : []
      if (script) return {
        script: extractScript(script),
        suggestions,
        title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
        fileName: typeof parsed.fileName === 'string' ? parsed.fileName.trim() : typeof parsed.name === 'string' ? parsed.name.trim() : '',
        language: typeof parsed.language === 'string' ? parsed.language.trim() : '',
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
  const responseInstructions = `${systemPrompt}\n\nReturn a concise purpose-based title and a filename base that describes what the script does, not a copy of the user's request. Detect the language of the script you actually generate. Format your response as:\nSCRIPT_TITLE: concise human-readable title\nSCRIPT_NAME: short-purpose-based-filename-without-extension\nSCRIPT_LANGUAGE: language-name\nInclude the complete script in one fenced code block labelled with that language.\nNEXT_PROMPTS: ["first relevant follow-up", "second relevant follow-up", "third relevant follow-up"]\nDo not include an extension in SCRIPT_NAME; the application adds the extension from SCRIPT_LANGUAGE.`
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
