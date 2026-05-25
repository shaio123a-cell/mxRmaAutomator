
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuid } from 'uuid'
import config from '../config'

export interface RestMonArgs {
  url?: string
  payload?: string
  outputFormat?: 'json' | 'xml' | 'text'
  validationErrors?: string[]
  [key: string]: any
  searchKey?: string
  searchString?: string
  matchRegex?: string
  username?: string
  password?: string
  decryptPass?: 'TRUE' | 'FALSE'
  encryptPass?: 'TRUE' | 'FALSE'
  headers?: string
}

export interface ScriptInstance {
  id: string
  instanceName: string
  scriptPath: string
  args: any // RestMonArgs for Restmon scripts, string for generic
  pollIntervalSec?: number
  timeoutSec?: number
  regexField?: string
  isRestmon?: boolean
  dirty?: boolean
  validationErrors?: string[]
  [key: string]: any
}

export interface Device {
  id: string
  name: string
  forcedIp?: string
  disabled?: boolean
  // original line index when parsed from a file (used to preserve comments/positions)
  originalLineIndex?: number
  port?: number | null
  connectionTimeoutMs?: number | null
  connectionPollSec?: number | null
  username?: string
  password?: string
  publicKeyPath?: string
  privateKeyPath?: string
  passphrase?: string
  scripts: ScriptInstance[]
  dirty?: boolean
  originalLine?: string
}

export interface DefaultScriptSettings {
  matrixKBPath: string
  genericPath: string
  isRestmonDefault: boolean
  maxBackups?: number
}

export interface FBCSKMState {
  devices: Device[]
  originalLines?: string[]
  dirty?: boolean
  defaultDeviceSettings?: Partial<Omit<Device, 'id' | 'name' | 'forcedIp' | 'scripts'>>
  defaultScriptSettings?: DefaultScriptSettings
}

const initialState: FBCSKMState = {
  devices: [],
  originalLines: [],
  dirty: false,
  defaultDeviceSettings: {
    port: 5985,
    connectionTimeoutMs: 2000,
    connectionPollSec: 300,
    username: '',
    password: '',
    publicKeyPath: '',
    privateKeyPath: '',
    passphrase: ''
  },
  defaultScriptSettings: {
    matrixKBPath: 'c:/MatrixKB/Scripts/Restmon',
    genericPath: 'c:/MatrixKB/Scripts',
    isRestmonDefault: true,
    maxBackups: 10
  }
}

/**
 * Normalize smart quotes and parse CLI-like args to structured RestMonArgs.
 */
function parseArgsToStruct(argstr: string): RestMonArgs {
  const args: RestMonArgs = {}

  // Normalize smart quotes to straight quotes
  const normalized = (argstr ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')

  // Tokenize: keep quoted segments intact, otherwise split on whitespace
  const tokens = normalized.match(/(?:"[^"]*"|'[^']*'|\S+)/g) || []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t.startsWith('-')) continue

    const key = t.replace(/^--?/, '').toLowerCase()
    const next = tokens[i + 1]
    const valRaw = (next && !next.startsWith('-')) ? next : undefined
    const val = valRaw ? valRaw.replace(/^['"]|['"]$/g, '') : 'TRUE'

    switch (key) {
      case 'url':
        args.url = val
        break
      case 'payload':
        args.payload = val
        break
      case 'outputformat':
        if (['json', 'xml', 'text'].includes(val.toLowerCase())) {
          args.outputFormat = val.toLowerCase() as any
        }
        break
      case 'method':
        if (['get', 'post', 'GET', 'POST'].includes(val)) {
          args.method = val.toUpperCase() as any
        }
        break
      case 'searchkey':
        args.searchKey = val
        break
      case 'searchstring':
        args.searchString = val
        break
      case 'matchregex':
        args.matchRegex = val
        break
      case 'username':
        args.username = val
        break
      case 'password':
        args.password = val
        break
      case 'decryptpass':
        args.decryptPass = val.toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'
        break
      case 'encryptpass':
        args.encryptPass = val.toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'
        break
      case 'headers':
        args.headers = val
        break
    }
  }

  return args
}

const scheduleDayFields = ['scriptMonday', 'scriptTueday', 'scriptWednesday', 'scriptThursday', 'scriptFriday', 'scriptSaturday', 'scriptSunday']

function normalizeScheduleDayValue(value: any): string {
  return value === '1' || value === 1 || value === true || String(value).toLowerCase() === 'true' ? '1' : '0'
}

function isScheduleEnabled(script: any): boolean {
  const value = script?.scriptSchedulingEnable
  return value === '1' || value === 1 || value === true || String(value).toLowerCase() === 'true'
}

function getScriptValidationErrors(script: ScriptInstance): string[] {
  const errors: string[] = []
  if (script.isRestmon && script.args && typeof script.args === 'object') {
    const format = String(script.args.outputFormat || '').toLowerCase()
    if (format === 'json' && script.args.payload) {
      try {
        JSON.parse(script.args.payload)
      } catch {
        errors.push('Invalid JSON payload format')
      }
    }
  }
  if (isScheduleEnabled(script)) {
    const missing = scheduleDayFields.filter(day => {
      const value = (script as any)[day]
      return value !== '1' && value !== 1 && value !== true && value !== '0' && value !== 0 && value !== false
    })
    if (missing.length > 0) {
      errors.push('Inactive weekdays must be explicit 0/1')
    }
  }
  return errors
}

/**
 * Parse a single FBCSKM line (device + scripts).
 */
function parseLine(line: string) {
  const segments = line.split('|')
  const deviceSeg = segments.shift() || ''
  const fields = deviceSeg.split(',')

  while (fields.length < 10) fields.push('')

  const [name, forcedIp, port, cto, cpoll, username, password, publicKeyPath, privateKeyPath, passphrase] = fields

  const dev: Device = {
    id: uuid(),
    name: name || 'UNKNOWN',
    forcedIp: forcedIp || undefined,
    port: port ? Number(port) : null,
    connectionTimeoutMs: cto ? Number(cto) : null,
    connectionPollSec: cpoll ? Number(cpoll) : null,
    username: username || undefined,
    password: password || undefined,
    publicKeyPath: publicKeyPath || undefined,
    privateKeyPath: privateKeyPath || undefined,
    passphrase: passphrase || undefined,
    scripts: []
  }

  for (const seg of segments) {
    if (!seg.trim()) continue
    const parts = seg.split(config.scriptStructure.delimiter)
    // Pad parts to match fields length
    while (parts.length < config.scriptStructure.fields.length) parts.push('')

    let instanceName = '', scriptPath = '', argstrRaw = '', poll: number | undefined, tout: number | undefined, regex: string | undefined

    const extra: any = {}
    const missingScheduleDays: string[] = []

    config.scriptStructure.fields.forEach((field, i) => {
      if (!field.trim()) return
      const value = parts[i] || ''

      if (field === 'instanceName') instanceName = value
      else if (field === 'scriptPath') scriptPath = value
      else if (field === 'args') argstrRaw = value
      else if (field === 'poll') poll = value ? Number(value) : undefined
      else if (field === 'timeout') tout = value ? Number(value) : undefined
      else if (field === 'regex') {
        // Decode BMC placeholders for regex field
        regex = value ? value.replace(/<BMC_SEP>/g, '|').replace(/<BMC_STAR>/g, '*') : undefined
      }
      else if (field === 'scriptScheduleDateRegex') {
        // Decode BMC placeholders for scheduling regex
        extra[field] = value ? value.replace(/<BMC_SEP>/g, '|').replace(/<BMC_STAR>/g, '*') : value
      }
      else if (scheduleDayFields.includes(field)) {
        if (value === '' || value === undefined) missingScheduleDays.push(field)
        extra[field] = normalizeScheduleDayValue(value)
      }
      else extra[field] = value
    })

    // Decode protocol placeholders back to raw characters
    const argstr = argstrRaw
      .replace(/<BMC_SEP>/g, '|')
      .replace(/<BMC_STAR>/g, '*')

    const args = parseArgsToStruct(argstr)
    const isRestmon = argstr.includes('-') // Simple check: if has -, it's Restmon

    const script: ScriptInstance = {
      id: uuid(),
      instanceName,
      scriptPath,
      args: isRestmon ? args : argstr, // For Restmon, parsed object; else, raw string
      pollIntervalSec: poll,
      timeoutSec: tout,
      regexField: regex,
      isRestmon,
      ...extra
    }
    script.validationErrors = getScriptValidationErrors(script)
    dev.scripts.push(script)
  }

  return dev
}

/**
 * Helper to safely single-quote values in serialized command sections.
 * Escapes internal single quotes with '"'"' (POSIX-safe pattern).
 */
function singleQuote(value: string): string {
  return `'${String(value ?? '').replace(/'/g, `'"'"'`)}'`
}

/**
 * Serialize a device to the FBCSKM line format.
 */
function serializeDevice(dev: Device): string {
  const devSeg = [
    dev.name ?? '',
    dev.forcedIp ?? '',
    dev.port ?? '',
    dev.connectionTimeoutMs ?? '',
    dev.connectionPollSec ?? '',
    dev.username ?? '',
    dev.password ?? '',
    dev.publicKeyPath ?? '',
    dev.privateKeyPath ?? '',
    dev.passphrase ?? ''
  ].join(',')

  const scripts = (dev.scripts ?? []).map(s => {
    const parts: string[] = []
    const a = s.args || {}

    if (a.url) parts.push(`-url ${a.url}`)
    if (a.method) parts.push(`-method ${a.method}`)
    if (a.outputFormat) parts.push(`-outputFormat ${a.outputFormat}`)
    if (a.payload) parts.push(`-payload ${singleQuote(a.payload)}`)
    if (a.searchKey) parts.push(`-searchKey ${singleQuote(a.searchKey)}`)
    if (a.searchString) parts.push(`-searchString ${singleQuote(a.searchString)}`)
    if (a.matchRegex) parts.push(`-matchRegex ${singleQuote(a.matchRegex)}`)
    if (a.username) parts.push(`-username ${singleQuote(a.username)}`)
    if (a.password) parts.push(`-password ${singleQuote(a.password)}`)
    if (a.decryptPass) parts.push(`-decryptPass ${a.decryptPass}`)
    if (a.encryptPass) parts.push(`-encryptPass ${a.encryptPass}`)
    if (a.headers) parts.push(`-headers ${singleQuote(a.headers)}`)

    let cmd = ` ${parts.join(' ')} `
    // Encode reserved separators in args payload
    cmd = cmd.replace(/\|/g, '<BMC_SEP>').replace(/\*/g, '<BMC_STAR>')

    const values = config.scriptStructure.fields.map(field => {
      if (field === '') return ''
      if (field === 'instanceName') return s.instanceName ?? ''
      if (field === 'scriptPath') return s.scriptPath ?? ''
      if (field === 'poll') return s.pollIntervalSec ?? ''
      if (field === 'timeout') return s.timeoutSec ?? ''
      if (field === 'regex') {
        // Encode BMC placeholders for regex field
        const regexVal = s.regexField ?? ''
        return regexVal ? String(regexVal).replace(/\|/g, '<BMC_SEP>').replace(/\*/g, '<BMC_STAR>') : ''
      }
      if (field === 'args') return cmd
      // dynamic fields - encode scriptScheduleDateRegex
      if (field === 'scriptScheduleDateRegex') {
        const scheduleRegex = (s as any)[field] ?? ''
        return scheduleRegex ? String(scheduleRegex).replace(/\|/g, '<BMC_SEP>').replace(/\*/g, '<BMC_STAR>') : ''
      }
      return (s as any)[field] ?? ''
    })

    return values.join(config.scriptStructure.delimiter) + '|'
  })

  return [devSeg, ...scripts].join('|')
}

const slice = createSlice({
  name: 'fbcskm',
  initialState,
  reducers: {
    parseFBCSKM(state, action: PayloadAction<string>) {
      const allLines = action.payload.split(/\r?\n/)
      // preserve original lines (including comments and blanks)
      state.originalLines = allLines.slice()

      state.devices = []
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i]
        if (!line || !line.trim()) continue

        // If the line is commented out but looks like a device definition, parse it
        if (line.trim().startsWith('#')) {
          const uncomment = line.replace(/^\s*#\s*/, '')
          if (uncomment.split(',').length >= 2) { // Only if it has commas, meaning device fields
            try {
              const d = parseLine(uncomment)
              if (d) { (d as any).originalLineIndex = i; d.disabled = true; d.originalLine = line; d.dirty = false; d.scripts.forEach(s => s.dirty = false); state.devices.push(d) }
              continue
            } catch (e) {
              // not a device line, leave as comment
              continue
            }
          }
        }
        const d = parseLine(line)
        if (d) { (d as any).originalLineIndex = i; d.dirty = false; d.scripts.forEach(s => s.dirty = false); state.devices.push(d) }
      }
      state.dirty = false
    },
    addDevice(state, action: PayloadAction<Device>) {
      state.devices.push(action.payload)
      state.dirty = true
    },
    updateDevice(state, action: PayloadAction<Device>) {
      const i = state.devices.findIndex(d => d.id === action.payload.id)
      if (i >= 0) {
        state.devices[i] = { ...action.payload, dirty: true };
        state.devices[i].scripts.forEach(s => s.dirty = false)
        // if disabled, update originalLine
        if (state.devices[i].disabled) {
          const dev = state.devices[i]
          const devSeg = [
            dev.name ?? '',
            dev.forcedIp ?? '',
            dev.port ?? '',
            dev.connectionTimeoutMs ?? '',
            dev.connectionPollSec ?? '',
            dev.username ?? '',
            dev.password ?? '',
            dev.publicKeyPath ?? '',
            dev.privateKeyPath ?? '',
            dev.passphrase ?? ''
          ].join(',')
          // Use the shared serializeDevice function which is now dynamic
          const serialized = serializeDevice(dev)
          state.devices[i].originalLine = '# ' + serialized
        }
      }
      state.dirty = true
    },
    deleteDevice(state, action: PayloadAction<string>) {
      const d = state.devices.find(x => x.id === action.payload)
      if (d) {
        const idx = (d as any).originalLineIndex as number | undefined
        if (typeof idx === 'number' && state.originalLines) {
          state.originalLines[idx] = ''
        }
      }
      state.devices = state.devices.filter(d => d.id !== action.payload)
      state.dirty = true
    },
    addScript(state, action: PayloadAction<{ deviceId: string, script: ScriptInstance }>) {
      const d = state.devices.find(x => x.id === action.payload.deviceId)
      if (d) {
        const script = { ...action.payload.script }
        script.validationErrors = getScriptValidationErrors(script)
        d.scripts.push(script)
      }
      state.dirty = true
    },
    updateScript(state, action: PayloadAction<{ deviceId: string, script: ScriptInstance }>) {
      const d = state.devices.find(x => x.id === action.payload.deviceId)
      if (!d) return
      const i = d.scripts.findIndex(s => s.id === action.payload.script.id)
      if (i >= 0) {
        const script = { ...action.payload.script, dirty: true }
        script.validationErrors = getScriptValidationErrors(script)
        d.scripts[i] = script
      }
      state.dirty = true
    },
    enableDevice(state, action: PayloadAction<string>) {
      const d = state.devices.find(x => x.id === action.payload)
      if (!d) return
      d.disabled = false
      const idx = (d as any).originalLineIndex as number | undefined
      if (typeof idx === 'number' && state.originalLines && state.originalLines[idx]) {
        state.originalLines[idx] = state.originalLines[idx].replace(/^\s*#\s*/, '')
      }
      state.dirty = true
    },
    disableDevice(state, action: PayloadAction<string>) {
      const d = state.devices.find(x => x.id === action.payload)
      if (!d) return
      d.disabled = true
      const idx = (d as any).originalLineIndex as number | undefined
      if (typeof idx === 'number' && state.originalLines) {
        const line = state.originalLines[idx] ?? ''
        if (!line.trim().startsWith('#')) state.originalLines[idx] = `# ${line}`
      }
      state.dirty = true
    },
    deleteScript(state, action: PayloadAction<{ deviceId: string, scriptId: string }>) {
      const d = state.devices.find(x => x.id === action.payload.deviceId)
      if (!d) return
      d.scripts = d.scripts.filter(s => s.id !== action.payload.scriptId)
      state.dirty = true
    },
    setDirty(state, action: PayloadAction<boolean>) {
      state.dirty = action.payload
      if (!action.payload) {
        state.devices.forEach(d => { d.dirty = false; d.scripts.forEach(s => s.dirty = false) })
      }
    },
    setClipboard(state, action: PayloadAction<any | null>) { (state as any).clipboard = action.payload },
    setDefaultDeviceSettings(state, action: PayloadAction<Partial<Omit<Device, 'id' | 'name' | 'forcedIp' | 'scripts'>>>) {
      state.defaultDeviceSettings = { ...(state.defaultDeviceSettings || {}), ...action.payload }
    },
    setDefaultScriptSettings(state, action: PayloadAction<DefaultScriptSettings>) {
      state.defaultScriptSettings = action.payload
    },
    reorderDevices(state, action: PayloadAction<Device[]>) {
      state.devices = action.payload.map(d => ({ ...d, originalLineIndex: undefined }))
      state.originalLines = [] // Clear original lines to avoid duplication after reorder
      state.dirty = true
    },
    reorderScripts(state, action: PayloadAction<{ deviceId: string, scripts: ScriptInstance[] }>) {
      const d = state.devices.find(x => x.id === action.payload.deviceId)
      if (d) {
        d.scripts = action.payload.scripts
        state.dirty = true
      }
    }
  }
})

export const {
  parseFBCSKM,
  addDevice,
  updateDevice,
  deleteDevice,
  addScript,
  updateScript,
  deleteScript,
  enableDevice,
  disableDevice,
  setDirty,
  setClipboard,
  setDefaultDeviceSettings,
  setDefaultScriptSettings,
  reorderDevices,
  reorderScripts
} = slice.actions

export default slice.reducer
