const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJsonAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
    await fs.rename(temporary, file)
    try { await fs.chmod(file, 0o600) } catch { /* Windows ACLs are handled by the user profile */ }
  } finally {
    await fs.unlink(temporary).catch(() => {})
  }
}

function normalizeEol(text) {
  return String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(normalizeEol(text), 'utf8').digest('hex')
}

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function timestamp() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function splitArgs(input) {
  const args = []
  let current = ''
  let quote = null
  const text = String(input ?? '')
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i]
    if (quote) {
      if (character === quote) quote = null
      else if (character === '\\' && quote === '"' && i + 1 < text.length) current += text[++i]
      else current += character
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (/\s/.test(character)) {
      if (current) { args.push(current); current = '' }
    } else {
      current += character
    }
  }
  if (current) args.push(current)
  return args
}

module.exports = { readJson, writeJsonAtomic, normalizeEol, sha256Hex, newId, timestamp, splitArgs }
