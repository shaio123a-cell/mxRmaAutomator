const { Client } = require('ssh2')
const fs = require('fs').promises
const crypto = require('crypto')
const { timestamp } = require('./util')

function sftpPath(remotePath, os) {
  return os === 'windows' ? String(remotePath).replace(/\\/g, '/') : String(remotePath)
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function windowsQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

class SshTransport {
  constructor({ address, port, os, creds, knownFingerprint, timeoutMs = 20000, onFingerprint }) {
    this.address = address
    this.port = port || 22
    this.os = os === 'linux' ? 'linux' : 'windows'
    this.creds = creds || {}
    this.knownFingerprint = knownFingerprint
    this.timeoutMs = timeoutMs
    this.onFingerprint = onFingerprint
    this.client = null
    this.sftp = null
    this.newFingerprint = null
    this.hostKeyError = null
  }

  async connect() {
    if (this.client) return this.client
    const client = new Client()
    const options = {
      host: this.address,
      port: this.port,
      username: this.creds.username || '',
      readyTimeout: this.timeoutMs,
      hostVerifier: key => {
        const fingerprint = `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
        if (this.knownFingerprint) {
          if (fingerprint !== this.knownFingerprint) {
            this.hostKeyError = fingerprint
            return false
          }
          return true
        }
        this.newFingerprint = fingerprint
        return true
      },
    }
    if (this.creds.password) options.password = this.creds.password
    if (this.creds.privateKeyPath) {
      options.privateKey = await fs.readFile(this.creds.privateKeyPath)
      if (this.creds.passphrase) options.passphrase = this.creds.passphrase
    }
    if (this.creds.useAgent) {
      options.agent = process.env.SSH_AUTH_SOCK || process.env.SSH_AUTH_SOCKET
    }
    await new Promise((resolve, reject) => {
      const onReady = () => { cleanup(); resolve() }
      const onError = error => {
        cleanup()
        reject(this.hostKeyError
          ? new Error(`Host key changed. Expected ${this.knownFingerprint}, received ${this.hostKeyError}.`)
          : error)
      }
      const cleanup = () => {
        client.removeListener('ready', onReady)
        client.removeListener('error', onError)
      }
      client.once('ready', onReady)
      client.once('error', onError)
      try { client.connect(options) } catch (error) { cleanup(); reject(error) }
    })
    this.client = client
    if (this.newFingerprint && this.onFingerprint) {
      try { this.onFingerprint(this.newFingerprint) } catch { /* inventory may be read-only */ }
    }
    return client
  }

  async getSftp() {
    if (this.sftp) return this.sftp
    await this.connect()
    this.sftp = await new Promise((resolve, reject) => {
      this.client.sftp((error, sftp) => error ? reject(error) : resolve(sftp))
    })
    return this.sftp
  }

  async makeDir(remotePath) {
    const sftp = await this.getSftp()
    const normalized = sftpPath(remotePath, this.os)
    const parts = normalized.split('/')
    parts.pop()
    let accumulated = ''
    for (const part of parts) {
      if (!part) { accumulated = '/'; continue }
      if (this.os === 'windows' && /^[A-Za-z]:$/.test(part)) { accumulated = part; continue }
      accumulated = accumulated === '' ? part : (accumulated.endsWith('/') ? `${accumulated}${part}` : `${accumulated}/${part}`)
      await new Promise(resolve => sftp.mkdir(accumulated, { mode: 0o700 }, () => resolve()))
    }
  }

  async readFile(remotePath) {
    const sftp = await this.getSftp()
    const target = sftpPath(remotePath, this.os)
    return new Promise((resolve, reject) => {
      sftp.readFile(target, (error, data) => {
        if (error) {
          if (error.code === 2 || /no such file/i.test(error.message || '')) resolve(null)
          else reject(error)
          return
        }
        resolve(data.toString('utf8'))
      })
    })
  }

  async writeFile(remotePath, content) {
    const sftp = await this.getSftp()
    const target = sftpPath(remotePath, this.os)
    await this.makeDir(remotePath)
    await new Promise((resolve, reject) => {
      sftp.writeFile(target, content, { mode: 0o600 }, error => error ? reject(error) : resolve())
    })
  }

  async backup(remotePath) {
    const existing = await this.readFile(remotePath)
    if (existing === null) return null
    const backupPath = `${remotePath}.${timestamp()}.bak`
    await this.writeFile(backupPath, existing)
    return backupPath
  }

  buildCommand(remotePath, args, isPs1) {
    const suffix = args ? ` ${args}` : ''
    if (this.os === 'windows') {
      if (isPs1) return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${windowsQuote(remotePath)}${suffix}`
      if (/\.(bat|cmd)$/i.test(remotePath)) return `cmd.exe /c ${windowsQuote(remotePath)}${suffix}`
      return `cmd.exe /c ${windowsQuote(remotePath)}${suffix}`
    }
    if (isPs1) return `pwsh -NoProfile -File ${shellQuote(remotePath)}${suffix}`
    return `bash ${shellQuote(remotePath)}${suffix}`
  }

  execRaw(command, { registerCancel, onStdout, onStderr } = {}) {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (error, stream) => {
        if (error) { reject(error); return }
        let stdout = ''
        let stderr = ''
        if (registerCancel) {
          registerCancel(() => {
            try { stream.close() } catch { /* already closed */ }
            try { this.client.end() } catch { /* already closed */ }
          })
        }
        stream.on('data', data => { const text = data.toString(); stdout += text; onStdout?.(text) })
        stream.stderr.on('data', data => { const text = data.toString(); stderr += text; onStderr?.(text) })
        stream.on('close', code => resolve({ exitCode: typeof code === 'number' ? code : -1, stdout, stderr }))
        stream.on('error', err => resolve({ exitCode: -1, stdout, stderr, error: err.message }))
      })
    })
  }

  async exec({ remotePath, args, isPs1, registerCancel, onStdout, onStderr }) {
    await this.connect()
    const command = this.buildCommand(remotePath, args, isPs1)
    return this.execRaw(command, { registerCancel, onStdout, onStderr })
  }

  async execCommand(command, options = {}) {
    await this.connect()
    return this.execRaw(command, options)
  }

  async test() {
    await this.connect()
    const command = this.os === 'windows'
      ? 'powershell.exe -NoProfile -Command "Write-Output mx-ok"'
      : 'printf mx-ok'
    const result = await new Promise((resolve, reject) => {
      this.client.exec(command, (error, stream) => {
        if (error) { reject(error); return }
        let output = ''
        stream.on('data', data => { output += data.toString() })
        stream.stderr.on('data', data => { output += data.toString() })
        stream.on('close', code => resolve({ code, output }))
      })
    })
    const ok = result.output.includes('mx-ok')
    return {
      ok,
      message: ok ? `Connected to ${this.address}:${this.port}` : `Connected but the test command returned: ${result.output.trim() || `exit ${result.code}`}`,
      fingerprint: this.newFingerprint || this.knownFingerprint,
    }
  }

  close() {
    try { this.sftp?.end() } catch { /* already closed */ }
    try { this.client?.end() } catch { /* already closed */ }
    this.sftp = null
    this.client = null
  }
}

module.exports = { SshTransport }
