const { spawn } = require('child_process')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { splitArgs } = require('./util')

function runLocal({ content, name, localPath, localTempPath, args, commandOverride, registerCancel, onStdout, onStderr }) {
  return new Promise(async (resolve) => {
    const hasInlineContent = typeof content === 'string' && content.length > 0
    const extension = path.extname(hasInlineContent ? (name || '') : (localPath || name || '')).toLowerCase() || '.sh'
    const tempFile = hasInlineContent
      ? (localTempPath || path.join(os.tmpdir(), `mx-rma-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`))
      : null
    const targetFile = tempFile || localPath
    const override = typeof commandOverride === 'string' ? commandOverride.trim() : ''
    if (!targetFile && !override) {
      resolve({ exitCode: -1, error: 'No script content or local script path was provided.' })
      return
    }
    if (hasInlineContent) {
      await fs.mkdir(path.dirname(tempFile), { recursive: true }).catch(() => {})
      await fs.writeFile(tempFile, content, 'utf8')
    }

    let command
    let commandArgs
    if (override) {
      if (extension === '.ps1') {
        command = 'powershell.exe'
        commandArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', override]
      } else if (extension === '.bat' || extension === '.cmd') {
        command = 'cmd.exe'
        commandArgs = ['/d', '/s', '/c', override]
      } else {
        command = process.platform === 'win32' ? 'bash.exe' : 'bash'
        commandArgs = ['-lc', override]
      }
    } else if (extension === '.ps1') {
      command = 'powershell.exe'
      commandArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', targetFile]
    } else if (extension === '.bat' || extension === '.cmd') {
      command = 'cmd.exe'
      commandArgs = ['/c', targetFile]
    } else {
      command = process.platform === 'win32' ? 'bash.exe' : 'bash'
      commandArgs = [targetFile]
    }
    if (!override) {
      const extra = splitArgs(args)
      commandArgs.push(...extra)
    }

    let child
    try {
      child = spawn(command, commandArgs, { windowsHide: true })
    } catch (error) {
      if (tempFile) await fs.unlink(tempFile).catch(() => {})
      resolve({ exitCode: -1, error: error.message })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (exitCode, error) => {
      if (settled) return
      settled = true
      if (tempFile) fs.unlink(tempFile).catch(() => {})
      resolve({ exitCode, stdout, stderr, error })
    }

    if (registerCancel) registerCancel(() => { try { child.kill() } catch { /* already gone */ } })
    child.stdout.on('data', chunk => { const text = chunk.toString(); stdout += text; onStdout?.(text) })
    child.stderr.on('data', chunk => { const text = chunk.toString(); stderr += text; onStderr?.(text) })
    child.on('error', error => finish(-1, error.message))
    child.on('close', code => finish(typeof code === 'number' ? code : -1))
  })
}

module.exports = { runLocal }
