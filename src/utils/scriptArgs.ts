import type { ScriptInstance } from '../store/fbcskmSlice'

const escapeArg = (s: string) => s.replace(/'/g, "''")

export const encodeBmcPlaceholders = (s: string) => s.replace(/\|/g, '<BMC_SEP>').replace(/\*/g, '<BMC_STAR>')
export const decodeBmcPlaceholders = (s: string) => s.replace(/<BMC_SEP>/g, '|').replace(/<BMC_STAR>/g, '*')

export function buildEncodedArgs(script: Pick<ScriptInstance, 'isRestmon' | 'args'>): string {
  if (!script.isRestmon) return encodeBmcPlaceholders(script.args || '')
  if (typeof script.args !== 'object' || !script.args) return ' '
  const parts: string[] = []
  const a = script.args
  if (a.url) parts.push(`-url '${escapeArg(a.url)}'`)
  if (a.method) parts.push(`-method ${a.method}`)
  if (a.outputFormat) parts.push(`-outputFormat ${a.outputFormat}`)
  if (a.payload) parts.push(`-payload '${escapeArg(a.payload)}'`)
  if (a.searchKey) parts.push(`-searchKey '${escapeArg(a.searchKey)}'`)
  if (a.searchString) parts.push(`-searchString '${escapeArg(a.searchString)}'`)
  if (a.matchRegex) parts.push(`-matchRegex '${escapeArg(a.matchRegex)}'`)
  if (a.username) parts.push(`-username '${escapeArg(a.username)}'`)
  if (a.password) parts.push(`-password '${escapeArg(a.password)}'`)
  // headers: passed raw without quotes or escaping, as requested
  if (a.headers) parts.push(`-headers ${a.headers}`)
  if (a.decryptPass) parts.push(`-decryptPass ${a.decryptPass}`)
  return encodeBmcPlaceholders(' ' + parts.join(' ') + ' ')
}

export function buildDryRunCommands(script: Pick<ScriptInstance, 'isRestmon' | 'args' | 'scriptPath'>): { originalCommand: string, command: string } {
  const isPs1 = (script.scriptPath || '').toLowerCase().endsWith('.ps1')
  const pathQuoted = `"${script.scriptPath}"`
  const encoded = buildEncodedArgs(script)
  const argsFinal = script.isRestmon ? decodeBmcPlaceholders(encoded) : ` ${script.args || ''}`
  const originalCommand = `${pathQuoted}${argsFinal}`
  const command = isPs1
    ? `powershell.exe -ExecutionPolicy Bypass -File ${pathQuoted}${argsFinal}`
    : originalCommand
  return { originalCommand, command }
}
