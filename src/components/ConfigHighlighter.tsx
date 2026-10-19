import React from 'react'
import type { Theme } from '@mui/material/styles'

interface Palette {
  comment: string
  deviceName: string
  number: string
  flag: string
  string: string
  path: string
  placeholder: string
  sep: string
}

function palette(theme: Theme): Palette {
  const dark = theme.palette.mode === 'dark'
  return {
    comment: dark ? '#7f8ea3' : '#94a3b8',
    deviceName: dark ? '#7cc4ff' : '#0b3d91',
    number: dark ? '#f0a868' : '#b45309',
    flag: dark ? '#c792ea' : '#7c3aed',
    string: dark ? '#7ee787' : '#15803d',
    path: dark ? '#82aaff' : '#0369a1',
    placeholder: dark ? '#ff7b72' : '#b91c1c',
    sep: dark ? '#5c6b7a' : '#9aa4b2',
  }
}

const TOKEN_RE = /(<BMC_(?:SEP|STAR)>)|('[^']*')|("[^"]*")|(--?[A-Za-z][\w-]*)|(\d+(?:\.\d+)?)|([,|*])|(\s+)|([^\s,|*]+)/g

function highlightLine(line: string, colors: Palette, keyPrefix: string, deviceNameSeen: { value: boolean }): React.ReactNode[] {
  if (line.trimStart().startsWith('#')) {
    return [React.createElement('span', { key: `${keyPrefix}-comment`, style: { color: colors.comment, fontStyle: 'italic' } }, line)]
  }

  const nodes: React.ReactNode[] = []
  let match: RegExpExecArray | null
  let i = 0
  TOKEN_RE.lastIndex = 0
  while ((match = TOKEN_RE.exec(line)) !== null) {
    const [text, placeholder, single, double, flag, num, sep, ws, bare] = match
    const key = `${keyPrefix}-${i++}`
    let style: React.CSSProperties | undefined
    if (placeholder) style = { color: colors.placeholder, fontWeight: 600 }
    else if (single || double) style = { color: colors.string }
    else if (flag) style = { color: colors.flag }
    else if (num) style = { color: colors.number }
    else if (sep) style = { color: colors.sep, fontWeight: 600 }
    else if (bare) {
      if (!deviceNameSeen.value && !/^\d+$/.test(bare)) {
        deviceNameSeen.value = true
        style = { color: colors.deviceName, fontWeight: 700 }
      } else if (bare.startsWith('/') || bare.startsWith('\\') || bare.includes('/') || bare.includes('\\')) {
        style = { color: colors.path }
      }
    }
    nodes.push(style ? React.createElement('span', { key, style }, text) : text)
  }
  return nodes
}

export function highlightConfig(code: string, theme: Theme): React.ReactNode[] {
  const colors = palette(theme)
  const out: React.ReactNode[] = []
  const lines = code.split('\n')
  lines.forEach((line, index) => {
    out.push(...highlightLine(line, colors, `l${index}`, { value: false }))
    if (index < lines.length - 1) out.push('\n')
  })
  return out
}
