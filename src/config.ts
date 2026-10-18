import configData from '../config.json'
import type { ThemePreference } from './theme'

export interface FieldConfig {
  name: string
  type: 'text' | 'textarea' | 'number' | 'password' | 'select' | 'checkbox' | 'time'
  label: string
  options?: string[]
}

export interface ScriptStructure {
  delimiter: string
  fields: string[]
  terminator: string
}

export interface ScriptUI {
  allFields: FieldConfig[]
  restmonOrder: string[]
  genericOrder: string[]
}

export interface AIModelConfig {
  id: string
  name: string
  provider: 'openai-compatible' | 'anthropic' | 'google-gemini' | 'azure-openai' | 'ollama' | 'mock'
  model: string
  baseUrl: string
  apiKey: string
  enabled: boolean
  timeoutMs: number
  apiVersion?: string
  status: 'healthy' | 'degraded' | 'offline'
}

export interface AISystemPrompt {
  id: string
  name: string
  content: string
}

export interface AIConfig {
  models: AIModelConfig[]
  systemPrompts: AISystemPrompt[]
  activeSystemPromptId: string | null
}

export interface Config {
  client: string
  scriptStructure: ScriptStructure
  scriptUI: ScriptUI
  ai: AIConfig
  ui?: {
    defaultTheme?: ThemePreference
  }
}

const config: Config = configData as Config

export default config