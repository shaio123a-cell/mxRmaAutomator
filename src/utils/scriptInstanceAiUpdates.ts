import {
  getScriptInstanceFieldDefinition,
  isCheckboxField,
  SCRIPT_INSTANCE_FIELDS,
} from '../content/scriptInstanceFields'
import type { ScriptInstance } from '../store/fbcskmSlice'

export interface ScriptInstanceAiUpdate {
  field: string
  value: unknown
  reason?: string
}

export interface AiUpdateValidationResult {
  valid: boolean
  errors: string[]
  updates: ScriptInstanceAiUpdate[]
}

export interface AiUpdatePreview {
  field: string
  label: string
  current: unknown
  proposed: unknown
  reason: string
}

const ALLOWED_FIELDS = new Set(SCRIPT_INSTANCE_FIELDS.map(field => field.name))
const SECRET_FIELD_PATTERN = /(password|passwd|pwd|token|api[-_]?key|apikey|secret|client[-_]?secret|authorization|auth[-_]?token|cookie)/i
const SECRET_ARGUMENT_PATTERN = /(^|\s)(--?(?:password|passwd|pwd|token|api[-_]?key|apikey|secret|client[-_]?secret|authorization|cookie|auth[-_]?token)\b\s*)(["']?)([^\s"']+)\3/gi
const SECRET_ASSIGNMENT_PATTERN = /(^|\s)(--?(?:password|passwd|pwd|token|api[-_]?key|apikey|secret|client[-_]?secret|authorization|cookie|auth[-_]?token)\b\s*=\s*)(["']?)([^\s"']+)\3/gi
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const REDACTION_MARKER = '[REDACTED]'

function maskHeaders(value: string): string {
  if (!value.trim()) return value
  return value.replace(
    /(["'][^"']+["']\s*=\s*)(["'])([\s\S]*?)\2/g,
    (match, keyPart: string, quote: string) => SECRET_FIELD_PATTERN.test(keyPart) ? `${keyPart}${quote}${REDACTION_MARKER}${quote}` : match,
  )
}

function maskArguments(value: string): string {
  return value
    .replace(SECRET_ARGUMENT_PATTERN, (_match, prefix: string, flag: string, quote: string) => `${prefix}${flag}${quote}${REDACTION_MARKER}${quote}`)
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, prefix: string, flag: string, quote: string) => `${prefix}${flag}${quote}${REDACTION_MARKER}${quote}`)
}

function containsRedaction(value: unknown): boolean {
  return typeof value === 'string' && value.includes(REDACTION_MARKER)
}

export function sanitizeInstanceForAi(instance: ScriptInstance): Record<string, unknown> {
  const {
    id: _id,
    contentHash: _contentHash,
    lastVerified: _lastVerified,
    dirty: _dirty,
    validationErrors: _validationErrors,
    ...rest
  } = instance as Record<string, unknown>

  const redactedFields: string[] = []
  let args: unknown = rest.args

  if (instance.isRestmon && instance.args && typeof instance.args === 'object') {
    const sanitizedArgs = { ...(instance.args as Record<string, unknown>) }
    if (sanitizedArgs.password !== undefined && sanitizedArgs.password !== null && String(sanitizedArgs.password)) {
      delete sanitizedArgs.password
      redactedFields.push('password')
    }
    if (typeof sanitizedArgs.headers === 'string' && sanitizedArgs.headers.trim()) {
      const masked = maskHeaders(sanitizedArgs.headers)
      if (masked !== sanitizedArgs.headers) redactedFields.push('headers')
      sanitizedArgs.headers = masked
    }
    args = sanitizedArgs
  } else if (typeof rest.args === 'string' && rest.args.trim()) {
    const masked = maskArguments(rest.args)
    if (masked !== rest.args) redactedFields.push('args')
    args = masked
  }

  return {
    ...rest,
    args,
    hasPassword: Boolean(instance.isRestmon && instance.args && typeof instance.args === 'object' && (instance.args as any).password),
    redactedFields,
  }
}

function normalizeAllowedValue(value: string, options: string[]): string {
  return options.find(option => option.toLowerCase() === value.toLowerCase()) ?? value
}

export function validateAiUpdates(updates: ScriptInstanceAiUpdate[], instance: ScriptInstance): AiUpdateValidationResult {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const update of updates) {
    const field = typeof update.field === 'string' ? update.field.trim() : ''
    if (!field) {
      errors.push('An update is missing a field name.')
      continue
    }
    if (seen.has(field)) {
      errors.push(`${field}: the response contains more than one update for this field.`)
      continue
    }
    seen.add(field)

    const definition = getScriptInstanceFieldDefinition(field)
    if (!definition || !ALLOWED_FIELDS.has(field)) {
      errors.push(`${field}: unknown script instance field.`)
      continue
    }
    if (!definition.aiEditable) {
      errors.push(`${definition.label} cannot be changed by AI.`)
      continue
    }
    if (definition.storage === 'restmon-args' && !instance.isRestmon) {
      errors.push(`${definition.label} only applies to RestMon scripts.`)
      continue
    }
    if (field === 'args' && instance.isRestmon) {
      errors.push('RestMon fields must be updated individually instead of replacing args.')
      continue
    }
    if (containsRedaction(update.value)) {
      errors.push(`${definition.label}: a redacted secret cannot be applied. Enter the value manually.`)
      continue
    }

    const value = update.value
    if (value === null) continue

    if (isCheckboxField(field)) {
      if (!['1', '0', 1, 0, true, false].includes(value as any)) {
        errors.push(`${definition.label}: expected true or false.`)
      }
      continue
    }

    if (definition.type === 'number') {
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric)) {
        errors.push(`${definition.label}: expected a number.`)
      } else if ((field === 'pollIntervalSec' || field === 'timeoutSec') && numeric <= 0) {
        errors.push(`${definition.label}: expected a positive number.`)
      }
      continue
    }

    if (definition.type === 'time') {
      if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
        errors.push(`${definition.label}: expected a time in HH:mm format.`)
      }
      continue
    }

    if (definition.options?.length) {
      if (typeof value !== 'string' || !definition.options.some(option => option.toLowerCase() === value.toLowerCase())) {
        errors.push(`${definition.label}: expected one of ${definition.options.join(', ')}.`)
      }
      continue
    }

    if (typeof value !== 'string') {
      errors.push(`${definition.label}: expected text.`)
    }
  }

  return { valid: errors.length === 0, errors, updates }
}

function valueForStorage(update: ScriptInstanceAiUpdate, instance: ScriptInstance): unknown {
  const definition = getScriptInstanceFieldDefinition(update.field)
  const value = update.value

  if (value === null) {
    if (definition?.type === 'number') return undefined
    if (isCheckboxField(update.field)) return '0'
    return ''
  }

  if (isCheckboxField(update.field)) {
    return value === true || value === 1 || value === '1' ? '1' : '0'
  }

  if (definition?.type === 'number') return Number(value)

  if (definition?.options?.length && typeof value === 'string') {
    return normalizeAllowedValue(value, definition.options)
  }

  return typeof value === 'string' ? value : String(value)
}

export function applyScriptFieldUpdates(instance: ScriptInstance, updates: ScriptInstanceAiUpdate[]): ScriptInstance {
  const next: ScriptInstance = { ...instance }
  let args: unknown = instance.args
  if (instance.args && typeof instance.args === 'object') {
    args = { ...(instance.args as Record<string, unknown>) }
  }

  for (const update of updates) {
    const definition = getScriptInstanceFieldDefinition(update.field)
    if (!definition) continue
    const value = valueForStorage(update, instance)

    if (update.field === 'args') {
      next.args = value
    } else if (definition.storage === 'args') {
      next.args = value
    } else if (definition.storage === 'restmon-args') {
      if (!args || typeof args !== 'object') args = {}
      ;(args as Record<string, unknown>)[update.field] = value
    } else {
      ;(next as any)[update.field] = value
    }
  }

  if (args && typeof args === 'object') next.args = args
  return next
}

export function buildUpdatePreviews(updates: ScriptInstanceAiUpdate[], instance: ScriptInstance): AiUpdatePreview[] {
  return updates.map(update => {
    const definition = getScriptInstanceFieldDefinition(update.field)
    const current = definition
      ? (definition.storage === 'restmon-args'
        ? (instance.args && typeof instance.args === 'object' ? (instance.args as any)[update.field] : '')
        : (update.field === 'args' ? instance.args : (instance as any)[update.field]))
      : ''
    return {
      field: update.field,
      label: definition?.label || update.field,
      current,
      proposed: update.value,
      reason: update.reason || '',
    }
  })
}

export function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}
