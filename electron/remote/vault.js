const { safeStorage } = require('electron')
const { readJson, writeJsonAtomic } = require('./util')

class Vault {
  constructor(file) {
    this.file = file
    this.data = null
  }

  isAvailable() {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  async load() {
    if (this.data) return this.data
    const parsed = await readJson(this.file, {})
    this.data = parsed && typeof parsed === 'object' ? parsed : {}
    return this.data
  }

  async has(ref) {
    const data = await this.load()
    return Boolean(data[ref])
  }

  async set(ref, secret) {
    if (!this.isAvailable()) {
      throw new Error('OS credential encryption is not available on this machine. Refusing to store a secret in plaintext.')
    }
    const encrypted = safeStorage.encryptString(String(secret))
    const data = await this.load()
    data[ref] = encrypted.toString('base64')
    await writeJsonAtomic(this.file, data)
  }

  async get(ref) {
    const data = await this.load()
    const stored = data[ref]
    if (!stored) return null
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      return null
    }
  }

  async clear(ref) {
    const data = await this.load()
    if (!data[ref]) return
    delete data[ref]
    await writeJsonAtomic(this.file, data)
  }
}

module.exports = { Vault }
