import React, { useEffect, useRef, useState } from 'react'
import { Box, FormHelperText, IconButton, Tooltip, useTheme } from '@mui/material'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import type { Theme } from '@mui/material/styles'
import CodeEditor from 'react-simple-code-editor'

interface Tone {
  key: string
  string: string
  number: string
  literal: string
  punctuation: string
  attr: string
  entity: string
  comment: string
  declaration: string
  brackets: string[]
}

function tones(theme: Theme): Tone {
  const dark = theme.palette.mode === 'dark'
  return {
    key: dark ? '#7cc4ff' : '#0b3d91',
    string: dark ? '#7ee787' : '#15803d',
    number: dark ? '#f0a868' : '#b45309',
    literal: dark ? '#c792ea' : '#7c3aed',
    punctuation: dark ? '#94a3b8' : '#64748b',
    attr: dark ? '#c792ea' : '#7c3aed',
    entity: dark ? '#ff7b72' : '#b91c1c',
    comment: dark ? '#7f8ea3' : '#94a3b8',
    declaration: dark ? '#f0a868' : '#b45309',
    brackets: dark
      ? ['#ffd166', '#f78c6c', '#c792ea', '#7ee787', '#7cc4ff']
      : ['#b45309', '#b91c1c', '#7c3aed', '#15803d', '#0369a1'],
  }
}

export function highlightJson(code: string, theme: Theme): React.ReactNode[] {
  const t = tones(theme)
  const nodes: React.ReactNode[] = []
  const re = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}\[\]])|([,:])|(\s+)|([\s\S])/g
  let depth = 0
  let i = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(code)) !== null) {
    const [text, key, str, num, lit, bracket, sep] = match
    const k = `j${i++}`
    let style: React.CSSProperties | undefined
    if (key) style = { color: t.key, fontWeight: 600 }
    else if (str) style = { color: t.string }
    else if (num) style = { color: t.number }
    else if (lit) style = { color: t.literal, fontWeight: 600 }
    else if (bracket) {
      if (text === '}' || text === ']') depth = Math.max(0, depth - 1)
      style = { color: t.brackets[depth % t.brackets.length], fontWeight: 700 }
      if (text === '{' || text === '[') depth++
    } else if (sep) style = { color: t.punctuation, fontWeight: 600 }
    nodes.push(style ? <span key={k} style={style}>{text}</span> : text)
  }
  return nodes
}

function highlightXml(code: string, theme: Theme): React.ReactNode[] {
  const t = tones(theme)
  const nodes: React.ReactNode[] = []
  let depth = 0
  let i = 0
  let key = 0

  const push = (text: string, style?: React.CSSProperties) => {
    if (!text) return
    nodes.push(style ? <span key={`x${key++}`} style={style}>{text}</span> : text)
  }

  const pushText = (text: string) => {
    const parts = text.split(/(&[\w#]+;)/g)
    for (const part of parts) {
      if (!part) continue
      if (/^&[\w#]+;$/.test(part)) push(part, { color: t.entity, fontWeight: 600 })
      else push(part)
    }
  }

  const pushTag = (raw: string, currentDepth: number) => {
    const tag = raw.match(/^(<\/?)([^\s/>]+)([\s\S]*?)(\/?>)$/)
    if (!tag) {
      push(raw, { color: t.punctuation })
      return
    }
    const [, open, name, attrs, close] = tag
    const tagDepth = open === '</' ? Math.max(0, currentDepth - 1) : currentDepth
    push(open, { color: t.punctuation })
    push(name, { color: t.brackets[tagDepth % t.brackets.length], fontWeight: 700 })

    const attrRe = /([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*')?/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = attrRe.exec(attrs)) !== null) {
      push(attrs.slice(last, match.index), { color: t.punctuation })
      push(match[1], { color: t.attr })
      if (match[2]) push(match[2], { color: t.punctuation })
      if (match[3]) push(match[3], { color: t.string })
      last = match.index + match[0].length
    }
    push(attrs.slice(last), { color: t.punctuation })
    push(close, { color: t.punctuation })
  }

  while (i < code.length) {
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i + 4)
      const stop = end === -1 ? code.length : end + 3
      push(code.slice(i, stop), { color: t.comment, fontStyle: 'italic' })
      i = stop
      continue
    }
    if (code.startsWith('<![CDATA[', i)) {
      const end = code.indexOf(']]>', i + 9)
      const stop = end === -1 ? code.length : end + 3
      push(code.slice(i, stop), { color: t.string })
      i = stop
      continue
    }
    if (code.startsWith('<?', i)) {
      const end = code.indexOf('?>', i + 2)
      const stop = end === -1 ? code.length : end + 2
      push(code.slice(i, stop), { color: t.declaration })
      i = stop
      continue
    }
    if (code.startsWith('<!', i)) {
      const end = code.indexOf('>', i + 2)
      const stop = end === -1 ? code.length : end + 1
      push(code.slice(i, stop), { color: t.declaration })
      i = stop
      continue
    }
    if (code[i] === '<') {
      let j = i + 1
      let quote: string | null = null
      while (j < code.length) {
        const ch = code[j]
        if (quote) {
          if (ch === quote) quote = null
        } else if (ch === '"' || ch === "'") {
          quote = ch
        } else if (ch === '>') {
          break
        }
        j++
      }
      const stop = Math.min(j + 1, code.length)
      const raw = code.slice(i, stop)
      pushTag(raw, depth)
      if (/^<\//.test(raw)) depth = Math.max(0, depth - 1)
      else if (!/^<\?/.test(raw) && !/^<!/.test(raw) && !/\/>\s*$/.test(raw)) depth++
      i = stop
      continue
    }
    const next = code.indexOf('<', i)
    const stop = next === -1 ? code.length : next
    pushText(code.slice(i, stop))
    i = stop
  }
  return nodes
}

export function beautifyJson(value: string): string {
  if (!value.trim()) return value
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

export function beautifyXml(value: string): string {
  if (!value.trim()) return value
  const compact = value.replace(/>\s*</g, '><').trim()
  const tokens = compact.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/[^>]+>|<[^>]+>|[^<]+/g)
  if (!tokens) return value
  let pad = 0
  const lines: string[] = []
  for (const token of tokens) {
    const text = token.trim()
    if (!text) continue
    if (text.startsWith('</')) {
      pad = Math.max(0, pad - 1)
      lines.push('  '.repeat(pad) + text)
    } else if (text.startsWith('<?') || text.startsWith('<!') || /\/>$/.test(text)) {
      lines.push('  '.repeat(pad) + text)
    } else if (text.startsWith('<')) {
      lines.push('  '.repeat(pad) + text)
      pad++
    } else {
      lines.push('  '.repeat(pad) + text)
    }
  }
  return lines.join('\n')
}

export function beautifyPayload(value: string, format: string): string {
  return (format || '').toLowerCase() === 'xml' ? beautifyXml(value) : beautifyJson(value)
}

export function minifyPayload(value: string, format: string): string {
  if (!value.trim()) return value
  if ((format || '').toLowerCase() !== 'xml') {
    try {
      return JSON.stringify(JSON.parse(value))
    } catch {
      /* fall back to whitespace collapse for invalid JSON */
    }
  }
  return value.replace(/\r?\n\s*/g, ' ').trim()
}

interface Props {
  value: string
  format: string
  label: string
  error?: boolean
  helperText?: string
  onChange: (value: string) => void
}

const FONT_SIZE = 13
const LINE_HEIGHT = 1.6
const MAX_ROWS = 20
const MAX_HEIGHT = Math.round(MAX_ROWS * FONT_SIZE * LINE_HEIGHT) + 20

export default function PayloadEditor({ value, format, label, error, helperText, onChange }: Props) {
  const theme = useTheme()
  const isXml = (format || '').toLowerCase() === 'xml'
  const isEmpty = !value.trim()
  const [pretty, setPretty] = useState(false)
  const [display, setDisplay] = useState(value)
  const lastValueRef = useRef(value)

  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value
      setDisplay(value)
      setPretty(false)
    }
  }, [value])

  useEffect(() => {
    lastValueRef.current = value
    setDisplay(value)
    setPretty(false)
  }, [format])

  const handleChange = (next: string) => {
    lastValueRef.current = next
    setDisplay(next)
    onChange(next)
  }

  const handleBeautify = () => {
    if (pretty) {
      setPretty(false)
      setDisplay(value)
    } else {
      setPretty(true)
      setDisplay(beautifyPayload(value, format))
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box component='label' sx={{ fontSize: 12, fontWeight: 500, color: error ? 'error.main' : 'text.secondary' }}>
          {label}
        </Box>
        <Tooltip title={pretty ? 'Show raw payload' : `Beautify ${isXml ? 'XML' : 'JSON'}`}>
          <span>
            <IconButton
              size='small'
              color={pretty ? 'primary' : 'default'}
              onClick={handleBeautify}
              disabled={isEmpty}
              aria-label='beautify payload'
              aria-pressed={pretty}
            >
              <AutoFixHighIcon fontSize='small' />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box
        sx={{
          border: '1px solid',
          borderColor: error ? 'error.main' : 'divider',
          borderRadius: 1,
          px: 1.5,
          py: 1,
          backgroundColor: 'background.paper',
          maxHeight: MAX_HEIGHT,
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'border-color 120ms ease',
          '&:focus-within': { borderColor: error ? 'error.main' : 'primary.main' },
          '& .payload-editor-textarea, & .payload-editor-pre': {
            tabSize: 2,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          },
          '& .payload-editor-textarea': { outline: 'none', caretColor: theme.palette.text.primary },
        }}
      >
        <CodeEditor
          value={display}
          onValueChange={handleChange}
          highlight={(code) => (isXml ? highlightXml(code, theme) : highlightJson(code, theme))}
          padding={0}
          textareaId='payload-editor'
          textareaClassName='payload-editor-textarea'
          preClassName='payload-editor-pre'
          placeholder={isXml ? '<root>\n  <item />\n</root>' : '{\n  "key": "value"\n}'}
          style={{
            minHeight: FONT_SIZE * LINE_HEIGHT,
            boxSizing: 'border-box',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            color: theme.palette.text.primary,
            tabSize: 2,
          }}
        />
      </Box>
      {helperText ? <FormHelperText error={error} sx={{ mx: 1.5 }}>{helperText}</FormHelperText> : null}
    </Box>
  )
}
