import { SCHEDULE_DAY_FIELDS } from '../content/scriptInstanceFields'
import type { ScriptInstance } from '../store/fbcskmSlice'

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  field?: string
  severity: ValidationSeverity
  message: string
  code?: string
  suggestion?: string
}

export interface ScriptValidationOptions {
  existingScripts?: ScriptInstance[]
}

const FORBIDDEN_INSTANCE_NAME = /[!@#$%^&*|]/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const ENCRYPTED_PASSWORD_PREFIX = '76492d1116743f0423413b16050a5345'

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function isTruthyCheckbox(value: unknown): boolean {
  return value === '1' || value === 1 || value === true || String(value).toLowerCase() === 'true'
}

function isExplicitCheckbox(value: unknown): boolean {
  return value === '1' || value === 1 || value === true || value === '0' || value === 0 || value === false
}

function parseJson(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

function parseXml(value: string): boolean {
  try {
    const parser = new DOMParser()
    const document = parser.parseFromString(value, 'text/xml')
    return !document.querySelector('parsererror')
  } catch {
    return false
  }
}

function parseRegex(value: string): boolean {
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

function parseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function addUnique(issues: ValidationIssue[], issue: ValidationIssue) {
  const duplicate = issues.some(item => item.field === issue.field && item.message === issue.message && item.severity === issue.severity)
  if (!duplicate) issues.push(issue)
}

export function getScriptInstanceIssues(script: ScriptInstance, options: ScriptValidationOptions = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const instanceName = text(script.instanceName)

  if (!instanceName.trim()) {
    addUnique(issues, {
      field: 'instanceName',
      severity: 'warning',
      message: 'Instance name is empty.',
      suggestion: 'Enter a unique name for this script instance.',
      code: 'instance-name-empty',
    })
  } else if (FORBIDDEN_INSTANCE_NAME.test(instanceName)) {
    addUnique(issues, {
      field: 'instanceName',
      severity: 'error',
      message: 'Instance name contains a forbidden character.',
      suggestion: 'Remove these characters: ! @ # $ % ^ & * |',
      code: 'instance-name-characters',
    })
  }

  const duplicate = options.existingScripts?.find(other => other.id !== script.id && text(other.instanceName).trim().toLowerCase() === instanceName.trim().toLowerCase())
  if (instanceName.trim() && duplicate) {
    addUnique(issues, {
      field: 'instanceName',
      severity: 'warning',
      message: `Another script instance is already named ${instanceName.trim()}.`,
      suggestion: 'Use a unique instance name within this device.',
      code: 'instance-name-duplicate',
    })
  }

  if (!text(script.scriptPath).trim()) {
    addUnique(issues, {
      field: 'scriptPath',
      severity: 'warning',
      message: 'Script path is empty.',
      suggestion: 'Select or enter the script file on the monitored system.',
      code: 'script-path-empty',
    })
  } else if (script.isRestmon && !/\.ps1$/i.test(text(script.scriptPath))) {
    addUnique(issues, {
      field: 'scriptPath',
      severity: 'info',
      message: 'RestMon scripts normally use a .ps1 file.',
      suggestion: 'Confirm the selected script path is correct for RestMon.',
      code: 'script-path-extension',
    })
  }

  const poll = positiveNumber(script.pollIntervalSec)
  if (script.pollIntervalSec !== undefined && script.pollIntervalSec !== null && !poll) {
    addUnique(issues, {
      field: 'pollIntervalSec',
      severity: 'warning',
      message: 'Poll interval must be a positive number.',
      suggestion: 'Enter the number of seconds between runs.',
      code: 'poll-invalid',
    })
  }

  const timeout = positiveNumber(script.timeoutSec)
  if (script.timeoutSec !== undefined && script.timeoutSec !== null && !timeout) {
    addUnique(issues, {
      field: 'timeoutSec',
      severity: 'warning',
      message: 'Timeout must be a positive number.',
      suggestion: 'Enter the maximum number of seconds for one run.',
      code: 'timeout-invalid',
    })
  }

  if (poll && timeout && timeout >= poll) {
    addUnique(issues, {
      field: 'timeoutSec',
      severity: 'warning',
      message: 'Timeout is not shorter than the poll interval.',
      suggestion: 'Make the timeout shorter than the poll interval to avoid overlapping runs.',
      code: 'timeout-overlap',
    })
  }

  const regexField = text(script.regexField)
  if (regexField && !parseRegex(regexField)) {
    addUnique(issues, {
      field: 'regexField',
      severity: 'warning',
      message: 'Trailing regex field is not a valid regular expression.',
      suggestion: 'Fix the regex or clear the field.',
      code: 'regex-field-invalid',
    })
  }

  if (script.isRestmon) {
    if (!script.args || typeof script.args !== 'object') {
      addUnique(issues, {
        field: 'args',
        severity: 'warning',
        message: 'RestMon arguments are not stored as an object.',
        suggestion: 'Reopen the instance and verify the RestMon request fields.',
        code: 'restmon-args-invalid',
      })
    } else {
      const args = script.args as Record<string, unknown>
      const method = text(args.method).toUpperCase()
      const outputFormat = text(args.outputFormat).toLowerCase()
      const payload = text(args.payload)
      const url = text(args.url)
      const headers = text(args.headers)

      if (!url.trim()) {
        addUnique(issues, {
          field: 'url',
          severity: 'warning',
          message: 'URL is empty.',
          suggestion: 'Enter the endpoint called by this RestMon script.',
          code: 'url-empty',
        })
      } else if (!parseUrl(url)) {
        addUnique(issues, {
          field: 'url',
          severity: 'warning',
          message: 'URL is not a valid absolute HTTP or HTTPS address.',
          suggestion: 'Use a complete URL such as https://api.example.com/health.',
          code: 'url-invalid',
        })
      } else if (url.startsWith('http://')) {
        addUnique(issues, {
          field: 'url',
          severity: 'info',
          message: 'URL uses HTTP instead of HTTPS.',
          suggestion: 'Use HTTPS when the endpoint supports it.',
          code: 'url-http',
        })
      }

      if (method && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
        addUnique(issues, {
          field: 'method',
          severity: 'warning',
          message: `Method ${method} is not supported by this editor.`,
          suggestion: 'Use GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS.',
          code: 'method-invalid',
        })
      }

      if (outputFormat && !['json', 'xml', 'text'].includes(outputFormat)) {
        addUnique(issues, {
          field: 'outputFormat',
          severity: 'warning',
          message: `Output format ${outputFormat} is not supported.`,
          suggestion: 'Use json, xml, or text.',
          code: 'output-format-invalid',
        })
      }

      if (payload.trim() && (method === 'GET' || method === 'HEAD')) {
        addUnique(issues, {
          field: 'payload',
          severity: 'warning',
          message: `${method} requests should not send a payload.`,
          suggestion: 'Clear the payload or use POST, PUT, or PATCH.',
          code: 'payload-method',
        })
      }

      if (payload.trim() && outputFormat === 'json' && !parseJson(payload)) {
        addUnique(issues, {
          field: 'payload',
          severity: 'error',
          message: 'Payload is not valid JSON.',
          suggestion: 'Fix the JSON or change the output format to text.',
          code: 'payload-json',
        })
      }

      if (payload.trim() && outputFormat === 'xml' && !parseXml(payload)) {
        addUnique(issues, {
          field: 'payload',
          severity: 'error',
          message: 'Payload is not valid XML.',
          suggestion: 'Fix the XML or change the output format to text.',
          code: 'payload-xml',
        })
      }

      if (headers.trim() && !(headers.trim().startsWith('@{') && headers.trim().endsWith('}'))) {
        addUnique(issues, {
          field: 'headers',
          severity: 'error',
          message: 'Headers must be a PowerShell hashtable.',
          suggestion: 'Use a value such as @{"Content-Type"="application/json"}.',
          code: 'headers-format',
        })
      }

      const matchRegex = text(args.matchRegex)
      if (matchRegex && !parseRegex(matchRegex)) {
        addUnique(issues, {
          field: 'matchRegex',
          severity: 'warning',
          message: 'Regex Match is not a valid regular expression.',
          suggestion: 'Fix the regex or clear the field.',
          code: 'match-regex-invalid',
        })
      }

      const password = text(args.password)
      const decryptPass = text(args.decryptPass).toUpperCase()
      const encryptedPassword = password.startsWith(ENCRYPTED_PASSWORD_PREFIX)
      if (decryptPass === 'TRUE' && !password) {
        addUnique(issues, {
          field: 'decryptPass',
          severity: 'warning',
          message: 'Decrypt Pass is TRUE but no password is set.',
          suggestion: 'Enter and encrypt a password, or set Decrypt Pass to FALSE.',
          code: 'decrypt-pass-empty',
        })
      } else if (encryptedPassword && decryptPass !== 'TRUE') {
        addUnique(issues, {
          field: 'decryptPass',
          severity: 'warning',
          message: 'The password looks encrypted but Decrypt Pass is not TRUE.',
          suggestion: 'Set Decrypt Pass to TRUE or replace the password.',
          code: 'decrypt-pass-encrypted',
        })
      } else if (password && !encryptedPassword && decryptPass === 'TRUE') {
        addUnique(issues, {
          field: 'password',
          severity: 'warning',
          message: 'Decrypt Pass is TRUE but the password does not look encrypted.',
          suggestion: 'Use the lock button to encrypt the password, or set Decrypt Pass to FALSE.',
          code: 'decrypt-pass-plain',
        })
      }
    }
  } else if (typeof script.args !== 'string' && script.args !== undefined && script.args !== null) {
    addUnique(issues, {
      field: 'args',
      severity: 'warning',
      message: 'Generic script arguments should be a single string.',
      suggestion: 'Convert the arguments to a single command-line string.',
      code: 'generic-args-invalid',
    })
  }

  const schedulingEnabled = isTruthyCheckbox(script.scriptSchedulingEnable)
  if (schedulingEnabled) {
    const missingDays = SCHEDULE_DAY_FIELDS.filter(day => !isExplicitCheckbox((script as any)[day]))
    if (missingDays.length > 0) {
      addUnique(issues, {
        severity: 'warning',
        message: 'Scheduling is enabled but some days are not explicitly set to 0 or 1.',
        suggestion: 'Set every day checkbox explicitly so the saved schedule is unambiguous.',
        code: 'schedule-days-missing',
      })
    }

    const start = text(script.scriptStartTime)
    const end = text(script.scriptEndTime)
    if (start && !TIME_PATTERN.test(start)) {
      addUnique(issues, {
        field: 'scriptStartTime',
        severity: 'warning',
        message: 'Start time must use HH:mm.',
        suggestion: 'Use 24-hour time such as 08:00.',
        code: 'schedule-start-invalid',
      })
    }
    if (end && !TIME_PATTERN.test(end)) {
      addUnique(issues, {
        field: 'scriptEndTime',
        severity: 'warning',
        message: 'End time must use HH:mm.',
        suggestion: 'Use 24-hour time such as 18:00.',
        code: 'schedule-end-invalid',
      })
    }
    if (!start || !end) {
      addUnique(issues, {
        severity: 'warning',
        message: 'Scheduling is enabled but the operating window is incomplete.',
        suggestion: 'Set both the start and end time.',
        code: 'schedule-window-missing',
      })
    } else if (TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && end <= start) {
      addUnique(issues, {
        field: 'scriptStartTime',
        severity: 'info',
        message: 'End time is not after start time.',
        suggestion: 'Confirm this is an intentional overnight scheduling window.',
        code: 'schedule-window-overnight',
      })
    }

    const dateRegex = text(script.scriptScheduleDateRegex)
    if (dateRegex && !parseRegex(dateRegex)) {
      addUnique(issues, {
        field: 'scriptScheduleDateRegex',
        severity: 'warning',
        message: 'Schedule Date Regex is not a valid regular expression.',
        suggestion: 'Fix the regex or clear the field.',
        code: 'schedule-date-regex-invalid',
      })
    }
  }

  return issues
}

export function getBlockingValidationIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter(issue => issue.severity === 'error')
}

export function validationCounts(issues: ValidationIssue[]): { errors: number; warnings: number; infos: number } {
  return issues.reduce((counts, issue) => {
    if (issue.severity === 'error') counts.errors++
    else if (issue.severity === 'warning') counts.warnings++
    else counts.infos++
    return counts
  }, { errors: 0, warnings: 0, infos: 0 })
}
