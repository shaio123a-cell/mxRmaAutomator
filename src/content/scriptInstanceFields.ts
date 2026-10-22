import config, { type FieldConfig } from '../config'
import type { ScriptInstance } from '../store/fbcskmSlice'

export type ScriptFieldStorage = 'top' | 'args' | 'restmon-args'

export interface ScriptInstanceFieldDefinition {
  name: string
  label: string
  storage: ScriptFieldStorage
  type: FieldConfig['type'] | 'boolean'
  options?: string[]
  description: string
  rules: string
  interactions: string
  aiEditable: boolean
  examples?: string[]
}

export const RESTMON_ARG_FIELDS = [
  'method',
  'outputFormat',
  'url',
  'payload',
  'headers',
  'matchRegex',
  'username',
  'password',
  'decryptPass',
  'searchKey',
  'searchString',
] as const

export const SCHEDULE_DAY_FIELDS = [
  'scriptSunday',
  'scriptMonday',
  'scriptTueday',
  'scriptWednesday',
  'scriptThursday',
  'scriptFriday',
  'scriptSaturday',
] as const

const FIELD_NAMES = [
  'instanceName',
  'scriptPath',
  'isRestmon',
  'args',
  'method',
  'outputFormat',
  'url',
  'payload',
  'headers',
  'matchRegex',
  'username',
  'password',
  'decryptPass',
  'pollIntervalSec',
  'timeoutSec',
  'regexField',
  'ScriptIndependentMonitorView',
  'scriptSchedulingEnable',
  'scriptScheduleDateRegex',
  'scriptSunday',
  'scriptMonday',
  'scriptTueday',
  'scriptWednesday',
  'scriptThursday',
  'scriptFriday',
  'scriptSaturday',
  'scriptStartTime',
  'scriptEndTime',
  'searchKey',
  'searchString',
] as const

type FieldMetadata = Omit<ScriptInstanceFieldDefinition, 'name' | 'label' | 'type' | 'options' | 'storage'> & {
  label?: string
  type?: FieldConfig['type'] | 'boolean'
  storage?: ScriptFieldStorage
}

const metadata: Record<string, FieldMetadata> = {
  instanceName: {
    description: 'Unique name for this script instance in the device configuration.',
    rules: 'Required. Must not contain ! @ # $ % ^ & * |. Should be unique within the device.',
    interactions: 'Used in lists, dry-run labels, and the saved configuration.',
    aiEditable: true,
    examples: ['CPU_Usage', 'api-health'],
  },
  scriptPath: {
    description: 'Absolute path to the script file on the monitored system.',
    rules: 'Required. RestMon instances normally use a .ps1 file.',
    interactions: 'Used by dry run and by the PATROL Agent at execution time.',
    aiEditable: true,
    examples: ['C:\\MatrixKB\\Scripts\\Restmon\\check-api.ps1', '/opt/matrixkb/restmon/check.sh'],
  },
  isRestmon: {
    description: 'Selects the RestMon request editor and stores request fields inside args.',
    rules: 'The AI must never change this field.',
    interactions: 'Changes how every request field is stored and serialized.',
    aiEditable: false,
    type: 'boolean',
  },
  args: {
    description: 'Generic script arguments, or the RestMon args object depending on isRestmon.',
    rules: 'For generic scripts this is one string. For RestMon scripts the individual fields are edited instead.',
    interactions: 'Determines the encoded command preview and the saved command line.',
    aiEditable: true,
    storage: 'args',
    type: 'textarea',
  },
  method: {
    description: 'HTTP method used by the RestMon request.',
    rules: 'One of GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. GET and HEAD should not carry a payload.',
    interactions: 'Must agree with payload presence and output format.',
    aiEditable: true,
  },
  outputFormat: {
    description: 'Expected payload and response format.',
    rules: 'One of json, xml, text. JSON and XML payloads must parse in that format.',
    interactions: 'Controls payload validation and highlighting.',
    aiEditable: true,
  },
  url: {
    description: 'Endpoint called by the RestMon script.',
    rules: 'Required for RestMon requests. Should be an absolute URL; prefer HTTPS.',
    interactions: 'Used with method, payload, headers, and authentication fields.',
    aiEditable: true,
  },
  payload: {
    description: 'Request body for methods that send a body.',
    rules: 'Must be valid JSON or XML when outputFormat is json or xml. Do not use with GET or HEAD.',
    interactions: 'Stored as a one-line value when the instance is saved.',
    aiEditable: true,
    type: 'textarea',
  },
  headers: {
    description: 'PowerShell hashtable of request headers.',
    rules: 'When present, must start with @{ and end with }. Do not invent secret values.',
    interactions: 'Sensitive header values are redacted before AI review.',
    aiEditable: true,
    examples: ['@{"Content-Type"="application/json"}'],
  },
  matchRegex: {
    description: 'Regular expression used by RestMon to match the response.',
    rules: 'Must be a valid regular expression. Keep it simple and anchored when possible.',
    interactions: 'Works alongside regexField and output parsing.',
    aiEditable: true,
  },
  username: {
    description: 'Username used for request authentication.',
    rules: 'Optional. Do not invent a username. Do not put secrets here.',
    interactions: 'Pairs with password and decryptPass.',
    aiEditable: true,
  },
  password: {
    description: 'Password or encrypted SecureString used for request authentication.',
    rules: 'The AI must never read, set, echo, or invent this field. New values must be entered manually by the user.',
    interactions: 'When encrypted, decryptPass should be TRUE.',
    aiEditable: false,
    type: 'password',
  },
  decryptPass: {
    description: 'Controls whether the stored password is decrypted at runtime.',
    rules: 'TRUE or FALSE. TRUE is expected when the password is encrypted.',
    interactions: 'Must be consistent with the password field.',
    aiEditable: true,
  },
  pollIntervalSec: {
    description: 'How often the instance runs, in seconds.',
    rules: 'Positive integer. Use a value that matches the monitoring requirement.',
    interactions: 'Timeout should normally be shorter than the poll interval.',
    aiEditable: true,
    type: 'number',
  },
  timeoutSec: {
    description: 'Maximum runtime for one execution, in seconds.',
    rules: 'Positive integer. Should be shorter than the poll interval.',
    interactions: 'Used with pollIntervalSec to avoid overlapping runs.',
    aiEditable: true,
    type: 'number',
  },
  regexField: {
    description: 'Trailing regex field used to check the script output.',
    rules: 'Must be a valid regular expression when present.',
    interactions: 'Complements matchRegex and output parsing.',
    aiEditable: true,
  },
  ScriptIndependentMonitorView: {
    description: 'Keeps this instance in its own monitor view.',
    rules: 'Checkbox value 1 or 0.',
    interactions: 'Affects how PATROL groups the instance in the console.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptSchedulingEnable: {
    description: 'Turns the scheduling window on or off.',
    rules: 'Checkbox value 1 or 0. When enabled, define every day and both times.',
    interactions: 'Controls whether the day, time, and date-regex fields apply.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptScheduleDateRegex: {
    description: 'Optional regex that restricts the dates on which the schedule runs.',
    rules: 'Must be a valid regular expression when present.',
    interactions: 'Used with scriptSchedulingEnable and the day/time fields.',
    aiEditable: true,
  },
  scriptSunday: {
    description: 'Run on Sunday.',
    rules: 'Checkbox value 1 or 0. Must be explicit when scheduling is enabled.',
    interactions: 'Part of the weekly schedule.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptMonday: {
    description: 'Run on Monday.',
    rules: 'Checkbox value 1 or 0. Must be explicit when scheduling is enabled.',
    interactions: 'Part of the weekly schedule.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptTueday: {
    description: 'Run on Tuesday. The field name intentionally keeps the historical typo Tueday.',
    rules: 'Checkbox value 1 or 0. Must be explicit when scheduling is enabled. Use this exact field name.',
    interactions: 'Part of the weekly schedule.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptWednesday: {
    description: 'Run on Wednesday.',
    rules: 'Checkbox value 1 or 0. Must be explicit when scheduling is enabled.',
    interactions: 'Part of the weekly schedule.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptThursday: {
    description: 'Run on Thursday.',
    rules: 'Checkbox value 1 or 0. Must be explicit when scheduling is enabled.',
    interactions: 'Part of the weekly schedule.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptFriday: {
    description: 'Run on Friday.',
    rules: 'Checkbox value 1 or 0. Must be explicit when scheduling is enabled.',
    interactions: 'Part of the weekly schedule.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptSaturday: {
    description: 'Run on Saturday.',
    rules: 'Checkbox value 1 or 0. Must be explicit when scheduling is enabled.',
    interactions: 'Part of the weekly schedule.',
    aiEditable: true,
    type: 'checkbox',
  },
  scriptStartTime: {
    description: 'Start of the daily scheduling window.',
    rules: 'Use HH:mm, 24-hour time.',
    interactions: 'Used with scriptEndTime and the selected days.',
    aiEditable: true,
    type: 'time',
  },
  scriptEndTime: {
    description: 'End of the daily scheduling window.',
    rules: 'Use HH:mm, 24-hour time.',
    interactions: 'Used with scriptStartTime and the selected days.',
    aiEditable: true,
    type: 'time',
  },
  searchKey: {
    description: 'Legacy RestMon search key stored in args.',
    rules: 'Optional legacy field. Do not invent a value.',
    interactions: 'Used only by legacy RestMon configurations.',
    aiEditable: true,
  },
  searchString: {
    description: 'Legacy RestMon search string stored in args.',
    rules: 'Optional legacy field. Do not invent a value.',
    interactions: 'Used only by legacy RestMon configurations.',
    aiEditable: true,
  },
}

function fieldConfig(name: string): FieldConfig | undefined {
  return config.scriptUI.allFields.find(field => field.name === name)
}

function storageFor(name: string, explicit?: ScriptFieldStorage): ScriptFieldStorage {
  if (explicit) return explicit
  if ((RESTMON_ARG_FIELDS as readonly string[]).includes(name)) return 'restmon-args'
  return 'top'
}

function labelFor(name: string, explicit?: string): string {
  if (explicit) return explicit
  if (name === 'isRestmon') return 'Is RestMon Script'
  if (name === 'searchKey') return 'Search Key'
  if (name === 'searchString') return 'Search String'
  return fieldConfig(name)?.label || name
}

export const SCRIPT_INSTANCE_FIELDS: ScriptInstanceFieldDefinition[] = FIELD_NAMES.map(name => {
  const meta = metadata[name]
  const field = fieldConfig(name)
  return {
    name,
    label: labelFor(name, meta.label),
    storage: storageFor(name, meta.storage),
    type: meta.type ?? field?.type ?? 'text',
    options: field?.options,
    description: meta.description,
    rules: meta.rules,
    interactions: meta.interactions,
    aiEditable: meta.aiEditable,
    examples: meta.examples,
  }
})

const fieldsByName = new Map(SCRIPT_INSTANCE_FIELDS.map(field => [field.name, field]))

export function getScriptInstanceFieldDefinition(name: string): ScriptInstanceFieldDefinition | undefined {
  return fieldsByName.get(name)
}

export function getScriptInstanceFieldLabel(name: string): string {
  return fieldsByName.get(name)?.label || name || 'General'
}

export function getScriptInstanceFieldValue(instance: ScriptInstance, name: string): unknown {
  if (name === 'args') return instance.args
  if (name === 'isRestmon') return Boolean(instance.isRestmon)
  const definition = fieldsByName.get(name)
  if (definition?.storage === 'restmon-args') {
    return instance.args && typeof instance.args === 'object' ? (instance.args as any)[name] : ''
  }
  return (instance as any)[name]
}

export function isCheckboxField(name: string): boolean {
  const type = fieldsByName.get(name)?.type
  return type === 'checkbox' || type === 'boolean'
}

function storageDescription(storage: ScriptFieldStorage): string {
  if (storage === 'restmon-args') return 'RestMon args object'
  if (storage === 'args') return 'top-level args (string for generic scripts, object for RestMon)'
  return 'top level'
}

export function renderScriptInstanceFieldCatalog(): string {
  return SCRIPT_INSTANCE_FIELDS.map(field => {
    const options = field.options?.length ? ` Allowed values: ${field.options.join(', ')}.` : ''
    const examples = field.examples?.length ? `\n  Examples: ${field.examples.join(' | ')}` : ''
    return [
      `- ${field.name} (${field.label})`,
      `  Storage: ${storageDescription(field.storage)}`,
      `  Type: ${field.type}.${options}`,
      `  Meaning: ${field.description}`,
      `  Rules: ${field.rules}`,
      `  Interactions: ${field.interactions}`,
      `  AI may change: ${field.aiEditable ? 'yes' : 'no'}${examples}`,
    ].join('\n')
  }).join('\n\n')
}
