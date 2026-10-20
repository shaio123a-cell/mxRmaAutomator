const { SshTransport } = require('./ssh')
const { PowerShellRemotingTransport } = require('./powershell')
const { runLocal } = require('./local')
const { Vault } = require('./vault')
const { Inventory } = require('./inventory')
const { Audit } = require('./audit')
const { sha256Hex } = require('./util')

function joinRemote(directory, name) {
  const base = String(directory || '').replace(/[\\/]+$/, '')
  if (!base) return name
  const separator = base.includes('\\') || /^[A-Za-z]:/.test(base) ? '\\' : '/'
  return `${base}${separator}${name}`
}

function isPowerShell(nameOrPath) {
  return /\.ps1$/i.test(nameOrPath || '')
}

function defaultWorkingDirectory(os) {
  return os === 'windows' ? 'C:\\ProgramData\\mx-rma' : '/tmp/mx-rma'
}

async function resolveCredentialProfile(inventory, vault, profileId) {
  if (!profileId) throw new Error('Select a credential profile for this host.')
  const { profiles } = await inventory.list()
  const profile = profiles.find(item => item.id === profileId)
  if (!profile) throw new Error('The selected credential profile no longer exists.')
  const secret = await vault.get(profile.id)
  if (profile.authType === 'private-key') {
    if (!profile.privateKeyPath) throw new Error(`Profile "${profile.name}" has no private key path.`)
    return { authType: 'private-key', username: profile.username, privateKeyPath: profile.privateKeyPath, passphrase: secret || undefined }
  }
  if (profile.authType === 'ssh-agent') {
    return { authType: 'ssh-agent', username: profile.username, useAgent: true }
  }
  if (profile.authType === 'windows-integrated') {
    return { authType: 'windows-integrated', username: profile.username }
  }
  if (!secret) throw new Error(`Profile "${profile.name}" has no stored secret.`)
  return { authType: 'password', username: profile.username, password: secret }
}

function credentialsFromDevice(deviceTarget) {
  if (deviceTarget.privateKeyPath) {
    return {
      authType: 'private-key',
      username: deviceTarget.username || '',
      privateKeyPath: deviceTarget.privateKeyPath,
      passphrase: deviceTarget.passphrase || undefined,
    }
  }
  if (deviceTarget.password) {
    return { authType: 'password', username: deviceTarget.username || '', password: deviceTarget.password }
  }
  return { authType: 'windows-integrated', username: deviceTarget.username || '' }
}

async function resolveConnection(request, inventory, vault) {
  const target = request.target
  if (!target || typeof target !== 'object') throw new Error('A run target is required.')

  if (target.kind === 'local') {
    return { local: true, os: process.platform === 'win32' ? 'windows' : 'linux', transport: 'local', creds: null }
  }

  let descriptor
  let hostId = null
  if (target.kind === 'host') {
    const host = await inventory.getHost(target.hostId)
    if (!host) throw new Error('The selected execution host no longer exists.')
    hostId = host.id
    descriptor = {
      address: host.address,
      os: host.os,
      transport: host.transport,
      insecureHttp: host.insecureHttp,
      remoteWorkingDir: host.remoteWorkingDir,
      hostKeyFingerprint: host.hostKeyFingerprint,
    }
  } else if (target.kind === 'device') {
    if (!request.deviceTarget) throw new Error('Device connection details are missing.')
    descriptor = {
      address: request.deviceTarget.address,
      os: request.deviceTarget.os,
      transport: request.deviceTarget.transport,
      port: request.deviceTarget.port,
      insecureHttp: request.deviceTarget.insecureHttp,
      remoteWorkingDir: request.deviceTarget.remoteWorkingDir,
    }
  } else if (target.kind === 'adhoc') {
    const windowsRemote = target.transport !== 'ssh'
    descriptor = {
      address: target.address,
      os: target.os,
      transport: target.transport,
      port: target.port,
      insecureHttp: windowsRemote ? target.port !== 5986 : false,
      remoteWorkingDir: target.remoteWorkingDir,
    }
  } else {
    throw new Error('Unsupported run target.')
  }

  const source = request.credentialSource || { kind: 'device' }
  let creds
  if (source.kind === 'profile') {
    const profileId = source.profileId || (target.kind === 'host' ? (await inventory.getHost(target.hostId))?.credentialProfileId : '')
    creds = await resolveCredentialProfile(inventory, vault, profileId)
  } else if (source.kind === 'adhoc') {
    creds = {
      authType: source.authType,
      username: source.username,
      password: source.password,
      privateKeyPath: source.privateKeyPath,
      passphrase: source.passphrase,
      useAgent: source.useAgent,
    }
  } else {
    if (target.kind === 'device' && request.deviceTarget) {
      creds = credentialsFromDevice(request.deviceTarget)
    } else if (target.kind === 'host') {
      const host = await inventory.getHost(target.hostId)
      creds = await resolveCredentialProfile(inventory, vault, host?.credentialProfileId)
    } else {
      throw new Error('Choose a credential profile or enter credentials for this run.')
    }
  }

  return { local: false, os: descriptor.os, transport: descriptor.transport, descriptor, creds, hostId }
}

function createTransport(connection, options = {}) {
  const descriptor = connection.descriptor
  const timeoutMs = options.timeoutMs || 30000
  if (connection.transport === 'ssh') {
    return new SshTransport({
      address: descriptor.address,
      port: descriptor.port || 22,
      os: connection.os,
      creds: connection.creds,
      knownFingerprint: descriptor.hostKeyFingerprint,
      timeoutMs,
      onFingerprint: options.onFingerprint,
    })
  }
  return new PowerShellRemotingTransport({
    address: descriptor.address,
    port: descriptor.port,
    os: connection.os,
    creds: connection.creds,
    insecureHttp: descriptor.insecureHttp,
    timeoutMs,
    onFingerprint: options.onFingerprint,
  })
}

function registerRemoteIpc({ ipcMain, basePath }) {
  const path = require('path')
  const inventory = new Inventory(path.join(basePath, 'remote-hosts.json'), path.join(basePath, 'remote-profiles.json'))
  const vault = new Vault(path.join(basePath, 'remote-vault.json'))
  const audit = new Audit(path.join(basePath, 'remote-audit.jsonl'))
  const runs = new Map()

  async function inventoryWithSecretFlags() {
    const { hosts, profiles } = await inventory.list()
    const withFlags = await Promise.all(profiles.map(async profile => ({ ...profile, secretRef: profile.id, hasSecret: await vault.has(profile.id) })))
    return { hosts, profiles: withFlags }
  }

  ipcMain.handle('remote:inventory:list', async () => inventoryWithSecretFlags())

  ipcMain.handle('remote:host:save', async (event, host) => {
    const saved = await inventory.saveHost(host)
    return saved
  })

  ipcMain.handle('remote:host:delete', async (event, id) => {
    await inventory.deleteHost(id)
  })

  ipcMain.handle('remote:profile:save', async (event, profile) => {
    const saved = await inventory.saveProfile(profile)
    return { ...saved, secretRef: saved.id, hasSecret: await vault.has(saved.id) }
  })

  ipcMain.handle('remote:profile:delete', async (event, id) => {
    await inventory.deleteProfile(id)
    await vault.clear(id)
  })

  ipcMain.handle('remote:secret:set', async (event, profileId, secret) => {
    if (typeof profileId !== 'string' || !profileId) throw new Error('Invalid credential profile.')
    await vault.set(profileId, secret)
  })

  ipcMain.handle('remote:secret:clear', async (event, profileId) => {
    if (typeof profileId !== 'string' || !profileId) throw new Error('Invalid credential profile.')
    await vault.clear(profileId)
  })

  ipcMain.handle('remote:test', async (event, input) => {
    try {
      const connection = await resolveConnection(input, inventory, vault)
      if (connection.local) return { ok: true, message: 'Local execution is always available.' }
      const transport = createTransport(connection, {
        timeoutMs: input.timeoutMs,
        onFingerprint: fingerprint => {
          if (connection.hostId) inventory.updateFingerprint(connection.hostId, fingerprint).catch(() => {})
        },
      })
      try {
        const result = await transport.test()
        if (result.ok && connection.hostId) await inventory.markConnected(connection.hostId)
        return result
      } finally {
        transport.close()
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('remote:cancel', async (event, runId) => {
    const callbacks = runs.get(runId)
    if (callbacks) {
      for (const callback of callbacks) {
        try { callback() } catch { /* already cancelled */ }
      }
      runs.delete(runId)
    }
  })

  ipcMain.handle('remote:audit:list', async () => audit.list())

  ipcMain.handle('remote:run', async (event, request) => {
    if (!request || typeof request !== 'object' || typeof request.runId !== 'string') {
      throw new Error('Invalid run request.')
    }
    const runId = request.runId
    const cancelCallbacks = new Set()
    runs.set(runId, cancelCallbacks)
    const registerCancel = callback => { cancelCallbacks.add(callback) }
    const send = payload => {
      try {
        if (!event.sender.isDestroyed()) event.sender.send('remote:output', { runId, ...payload })
      } catch { /* window closed */ }
    }

    const start = Date.now()
    let transport = null
    const stdoutChunks = []
    const stderrChunks = []
    const onStdout = text => { stdoutChunks.push(text); send({ type: 'stdout', data: text }) }
    const onStderr = text => { stderrChunks.push(text); send({ type: 'stderr', data: text }) }

    try {
      send({ type: 'status', message: 'Resolving target and credentials...' })
      const connection = await resolveConnection(request, inventory, vault)

      if (connection.local) {
        send({ type: 'status', message: 'Running locally...' })
        const localResult = await runLocal({
          content: request.content,
          name: request.name || 'script.sh',
          localPath: request.localPath,
          localTempPath: request.localTempPath,
          args: request.args,
          commandOverride: request.commandOverride,
          registerCancel,
          onStdout,
          onStderr,
        })
        if (localResult.error) throw new Error(localResult.error)
        const result = {
          runId,
          target: request.target,
          credentialSource: request.credentialSource,
          versionId: request.versionId,
          contentHash: request.contentHash || (request.content ? sha256Hex(request.content) : ''),
          exitCode: localResult.exitCode,
          durationMs: Date.now() - start,
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          uploaded: false,
          decision: 'local',
        }
        await audit.append({ runId, target: 'local', versionId: request.versionId, contentHash: result.contentHash, decision: result.decision, uploaded: false, exitCode: result.exitCode, durationMs: result.durationMs })
        send({ type: 'done', result })
        return result
      }

      transport = createTransport(connection, {
        timeoutMs: request.timeoutMs,
        onFingerprint: fingerprint => {
          if (connection.hostId) inventory.updateFingerprint(connection.hostId, fingerprint).catch(() => {})
        },
      })

      const descriptor = connection.descriptor
      const remotePath = request.remotePath || joinRemote(descriptor.remoteWorkingDir || defaultWorkingDirectory(connection.os), request.name || 'script')
      const powershellScript = isPowerShell(request.name || remotePath)
      let decision = 'invoked-path'
      let remoteHashBefore
      let remoteHashAfter
      let backupPath
      let uploaded = false

      const hasContent = typeof request.content === 'string' && request.content.length > 0
      const expectedHash = request.contentHash || (hasContent ? sha256Hex(request.content) : '')

      if (hasContent && expectedHash && request.runMode !== 'push-and-run') {
        send({ type: 'status', message: `Verifying ${remotePath}...` })
        let remoteContent = null
        try { remoteContent = await transport.readFile(remotePath) } catch { remoteContent = null }
        remoteHashBefore = remoteContent === null ? undefined : sha256Hex(remoteContent)
        if (remoteHashBefore !== expectedHash) {
          send({ type: 'status', message: 'Remote copy differs. Backing up and uploading the selected version...' })
          try { backupPath = await transport.backup(remotePath) || undefined } catch { backupPath = undefined }
          await transport.writeFile(remotePath, request.content)
          uploaded = true
          try {
            const after = await transport.readFile(remotePath)
            remoteHashAfter = after === null ? undefined : sha256Hex(after)
          } catch { remoteHashAfter = undefined }
          decision = 'uploaded-after-mismatch'
          send({ type: 'notice', message: backupPath ? `Remote differed; replaced with your version. Backup kept at ${backupPath}` : 'Remote differed; replaced with your version.' })
        } else {
          decision = 'matched'
          send({ type: 'status', message: 'Remote copy matches the selected version.' })
        }
      } else if (hasContent && request.runMode === 'push-and-run') {
        send({ type: 'status', message: 'Backing up and uploading the selected version...' })
        try { backupPath = await transport.backup(remotePath) || undefined } catch { backupPath = undefined }
        await transport.writeFile(remotePath, request.content)
        uploaded = true
        try {
          const after = await transport.readFile(remotePath)
          remoteHashAfter = after === null ? undefined : sha256Hex(after)
        } catch { remoteHashAfter = undefined }
        decision = 'uploaded-after-mismatch'
      }

      if (connection.hostId) await inventory.markConnected(connection.hostId)
      const commandOverride = typeof request.commandOverride === 'string' ? request.commandOverride.trim() : ''
      let execResult
      if (commandOverride) {
        send({ type: 'status', message: `Running edited command on ${descriptor.address}...` })
        execResult = await transport.execCommand(commandOverride, {
          registerCancel,
          onStdout,
          onStderr,
        })
      } else {
        send({ type: 'status', message: `Running ${remotePath} on ${descriptor.address}...` })
        execResult = await transport.exec({
          remotePath,
          args: request.args,
          isPs1: powershellScript,
          registerCancel,
          onStdout,
          onStderr,
        })
      }
      const result = {
        runId,
        target: request.target,
        credentialSource: request.credentialSource,
        versionId: request.versionId,
        contentHash: expectedHash,
        remoteHashBefore,
        remoteHashAfter,
        uploaded,
        backupPath,
        exitCode: execResult.exitCode,
        durationMs: Date.now() - start,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        decision,
      }
      await audit.append({
        runId,
        target: `${connection.transport}:${descriptor.address}:${remotePath}`,
        versionId: request.versionId,
        contentHash: expectedHash,
        decision,
        uploaded,
        backupPath,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      })
      send({ type: 'done', result })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await audit.append({
        runId,
        target: request.target?.kind || 'unknown',
        versionId: request.versionId,
        contentHash: request.contentHash || '',
        decision: 'error',
        uploaded: false,
        exitCode: -1,
        durationMs: Date.now() - start,
      }).catch(() => {})
      send({ type: 'error', message })
      throw error
    } finally {
      runs.delete(runId)
      try { transport?.close() } catch { /* already closed */ }
    }
  })
}

module.exports = { registerRemoteIpc, resolveConnection, createTransport }
