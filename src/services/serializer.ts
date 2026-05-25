
import { Device } from '../store/fbcskmSlice'
import config from '../config'

/**
 * Safely wrap a value in single quotes for shell-like serialization.
 * Escapes internal single quotes with '\'' (POSIX-safe via '"'"').
 */
function singleQuote(value: string): string {
  return `'${String(value ?? '').replace(/'/g, `'"'"'`)}'`
}

/**
 * Replace reserved characters with protocol tokens.
 */
const scheduleDayFields = ['scriptMonday', 'scriptTueday', 'scriptWednesday', 'scriptThursday', 'scriptFriday', 'scriptSaturday', 'scriptSunday']

function normalizeScheduleDayValue(value: any): string {
  return value === '1' || value === 1 || value === true || String(value).toLowerCase() === 'true' ? '1' : '0'
}

function encodeSpecials(s: string): string {
  return s
    .replace(/\|/g, '<BMC_SEP>')
    .replace(/\*/g, '<BMC_STAR>')
}

/**
 * Convert an args struct to a flat string of CLI-like flags.
 */
function structToArgString(args: any): string {
  if (!args || typeof args !== 'object') return ' '

  const parts: string[] = []

  if (args.url) parts.push(`-url ${args.url}`)
  if (args.method) parts.push(`-method ${args.method}`)
  if (args.outputFormat) parts.push(`-outputFormat ${args.outputFormat}`)
  if (args.payload) parts.push(`-payload ${singleQuote(args.payload)}`)
  if (args.searchKey) parts.push(`-searchKey ${singleQuote(args.searchKey)}`)
  if (args.searchString) parts.push(`-searchString ${singleQuote(args.searchString)}`)
  if (args.matchRegex) parts.push(`-matchRegex ${singleQuote(args.matchRegex)}`)
  if (args.username) parts.push(`-username ${singleQuote(args.username)}`)
  if (args.password) parts.push(`-password ${singleQuote(args.password)}`)
  if (args.decryptPass) parts.push(`-decryptPass ${args.decryptPass}`)
  if (args.encryptPass) parts.push(`-encryptPass ${args.encryptPass}`)
  if (args.headers) parts.push(`-headers ${singleQuote(args.headers)}`)

  let s = parts.join(' ')
  s = encodeSpecials(s)
  return parts.length ? ` ${s} ` : ' '
}

function serializeScript(s: any): string {
  const values = config.scriptStructure.fields.map(field => {
    if (field === '') return ''
    let value: any = ''
    if (field === 'instanceName') value = s.instanceName ?? ''
    else if (field === 'scriptPath') value = s.scriptPath ?? ''
    else if (field === 'args') {
      value = s.isRestmon ? structToArgString(s.args) : encodeSpecials(s.args ?? '')
    }
    else if (field === 'poll') value = s.pollIntervalSec ?? ''
    else if (field === 'timeout') value = s.timeoutSec ?? ''
    else if (field === 'regex') {
      // Encode BMC placeholders for regex field
      const regexVal = s.regexField ?? ''
      value = regexVal ? encodeSpecials(String(regexVal)) : ''
    }
    else if (field === 'scriptScheduleDateRegex') {
      // Encode BMC placeholders for scheduling regex
      const scheduleRegex = (s as any)[field] ?? ''
      value = scheduleRegex ? encodeSpecials(String(scheduleRegex)) : ''
    }
    else if (scheduleDayFields.includes(field)) {
      value = normalizeScheduleDayValue((s as any)[field])
    }
    else value = (s as any)[field] ?? ''
    return value
  })
  return values.join(config.scriptStructure.delimiter)
}

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

  const scripts = (dev.scripts ?? []).map(serializeScript)

  return [devSeg, ...scripts].join('|')
}

export function serializeDevices(devices: Device[]): string {
  return (devices ?? []).map(d => (d.disabled ? '# ' : '') + serializeDevice(d)).join('\n')
}

/**
 * Serialize devices while preserving comment/blank lines from originalLines.
 * Devices that had originalLineIndex will be placed back in those positions.
 * New devices (no original index) are appended at the end.
 */
export function serializeDevicesWithComments(devices: Device[], originalLines?: string[]): string {
  if (!originalLines || originalLines.length === 0) {
    return serializeDevices(devices)
  }

  const out: string[] = []
  const deviceByIndex = new Map<number, Device>()
  const appended: string[] = []

  for (const d of devices) {
    const idx = (d as any).originalLineIndex as number | undefined
    if (typeof idx === 'number') deviceByIndex.set(idx, d)
    else appended.push(d)
  }

  for (let i = 0; i < originalLines.length; i++) {
    const l = originalLines[i]
    if (!l || !l.trim()) { out.push(''); continue }
    if (l.trim().startsWith('#')) { out.push(l); continue }
    const dev = deviceByIndex.get(i)
    if (dev) out.push((dev.disabled ? '# ' : '') + serializeDevice(dev))
    // else if device was deleted, skip this line
  }

  // append new devices at the end
  for (const d of appended) out.push((d.disabled ? '# ' : '') + serializeDevice(d))

  return out.join('\n')
}
