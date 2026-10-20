const fs = require('fs').promises
const path = require('path')

const SECRET_KEYS = new Set(['password', 'passphrase', 'secret', 'token', 'apiKey', 'privateKey', 'keyMaterial', 'stdout', 'stderr'])

function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const result = {}
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEYS.has(key)) continue
      result[key] = redact(nested)
    }
    return result
  }
  return value
}

class Audit {
  constructor(file) {
    this.file = file
  }

  async append(entry) {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const safe = redact({ at: new Date().toISOString(), ...entry })
    await fs.appendFile(this.file, `${JSON.stringify(safe)}\n`, 'utf8')
    try { await fs.chmod(this.file, 0o600) } catch { /* handled by the OS user profile */ }
  }

  async list(limit = 200) {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const entries = raw.split(/\r?\n/).filter(Boolean).map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)
      return entries.slice(-limit).reverse()
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }
}

module.exports = { Audit }
