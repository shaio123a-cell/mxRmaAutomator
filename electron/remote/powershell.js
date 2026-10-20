const { spawn } = require('child_process')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { splitArgs } = require('./util')

function encodeCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function runPowerShell(script, env, { registerCancel, onStdout, onStderr, timeoutMs = 60000 } = {}) {
  return new Promise(resolve => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeCommand(script),
    ], { windowsHide: true, env: { ...process.env, ...env } })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timer = null
    const finish = (code, error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ code: typeof code === 'number' ? code : -1, stdout, stderr, error })
    }
    if (registerCancel) registerCancel(() => { try { child.kill() } catch { /* already gone */ } })
    timer = setTimeout(() => { try { child.kill() } catch { /* already gone */ }; finish(-1, `Timed out after ${timeoutMs} ms`) }, timeoutMs)

    child.stdout.on('data', chunk => { const text = chunk.toString(); stdout += text; onStdout?.(text) })
    child.stderr.on('data', chunk => { const text = chunk.toString(); stderr += text; onStderr?.(text) })
    child.on('error', error => finish(-1, error.message))
    child.on('close', code => finish(code))
  })
}

function sessionPrelude(host, credentials) {
  const useSsl = !host.insecureHttp
  const port = host.port || (useSsl ? 5986 : 5985)
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    '$ProgressPreference = "SilentlyContinue"',
    "$sessionParams = @{ ComputerName = $env:MX_HOST; Port = [int]$env:MX_PORT; ErrorAction = 'Stop' }",
    "if ($env:MX_SSL -eq '1') { $sessionParams['UseSSL'] = $true }",
    "if ($env:MX_AUTH -eq 'password') {",
    '  $sec = ConvertTo-SecureString $env:MX_PASS -AsPlainText -Force',
    '  $sessionParams["Credential"] = New-Object System.Management.Automation.PSCredential($env:MX_USER, $sec)',
    '  $sessionParams["Authentication"] = if ($env:MX_SSL -eq "1") { "Negotiate" } else { "Basic" }',
    '}',
    '$session = New-PSSession @sessionParams',
    'try {',
  ]
  return { lines, port, useSsl }
}

function envFor(host, credentials, extra = {}) {
  const useSsl = !host.insecureHttp
  return {
    MX_HOST: host.address,
    MX_PORT: String(host.port || (useSsl ? 5986 : 5985)),
    MX_SSL: useSsl ? '1' : '0',
    MX_AUTH: credentials.authType === 'password' ? 'password' : 'integrated',
    MX_USER: credentials.username || '',
    MX_PASS: credentials.password || '',
    ...extra,
  }
}

class PowerShellRemotingTransport {
  constructor({ address, port, os, creds, insecureHttp, timeoutMs = 30000, onFingerprint }) {
    this.address = address
    this.port = port
    this.os = os === 'linux' ? 'linux' : 'windows'
    this.creds = creds || {}
    this.insecureHttp = Boolean(insecureHttp)
    this.timeoutMs = timeoutMs
    this.onFingerprint = onFingerprint
  }

  buildScript(bodyLines) {
    const { lines } = sessionPrelude(this, this.creds)
    return [...lines, ...bodyLines, '} finally {', '  Remove-PSSession -Session $session -ErrorAction SilentlyContinue', '}'].join('\n')
  }

  async execute(bodyLines) {
    const script = this.buildScript(bodyLines)
    const env = envFor(this, this.creds)
    return runPowerShell(script, env, { timeoutMs: this.timeoutMs + 30000 })
  }

  static parseResult(output) {
    const match = output.match(/MX_RESULT:([^\r\n]*)/)
    return match ? match[1].trim() : null
  }

  async readFile(remotePath) {
    const body = [
      '$value = Invoke-Command -Session $session -ScriptBlock {',
      '  param($p)',
      '  if (Test-Path -LiteralPath $p) { Get-Content -LiteralPath $p -Raw -Encoding UTF8 } else { "" }',
      '} -ArgumentList $env:MX_PATH',
      "Write-Output ('MX_RESULT:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$value)))",
    ]
    const result = await this.execute(body)
    if (result.error) throw new Error(result.error)
    const encoded = PowerShellRemotingTransport.parseResult(result.stdout)
    if (encoded === null || encoded === '') return null
    return Buffer.from(encoded, 'base64').toString('utf8')
  }

  async writeFile(remotePath, content) {
    const tempFile = path.join(os.tmpdir(), `mx-rma-upload-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`)
    await fs.writeFile(tempFile, content, 'utf8')
    try {
      const body = [
        'Invoke-Command -Session $session -ScriptBlock {',
        '  param($p)',
        '  $d = Split-Path -Parent $p',
        '  if ($d -and -not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }',
        '} -ArgumentList $env:MX_PATH',
        'Copy-Item -LiteralPath $env:MX_LOCAL -Destination $env:MX_PATH -ToSession $session -Force',
        "Write-Output 'MX_RESULT:ok'",
      ]
      const env = envFor(this, this.creds, { MX_LOCAL: tempFile })
      const result = await runPowerShell(this.buildScript(body), env, { timeoutMs: this.timeoutMs + 30000 })
      if (result.error) throw new Error(result.error)
      if (PowerShellRemotingTransport.parseResult(result.stdout) !== 'ok') {
        throw new Error(`Upload failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`}`)
      }
    } finally {
      await fs.unlink(tempFile).catch(() => {})
    }
  }

  async backup(remotePath) {
    const body = [
      '$value = Invoke-Command -Session $session -ScriptBlock {',
      '  param($p)',
      '  if (Test-Path -LiteralPath $p) {',
      "    $b = \"$p.\" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak'",
      '    Copy-Item -LiteralPath $p -Destination $b -Force',
      '    $b',
      '  } else { "" }',
      '} -ArgumentList $env:MX_PATH',
      "Write-Output ('MX_RESULT:' + $value)",
    ]
    const result = await this.execute(body)
    if (result.error) throw new Error(result.error)
    const value = PowerShellRemotingTransport.parseResult(result.stdout)
    return value ? value : null
  }

  async runBody(body, extraEnv, { registerCancel, onStdout, onStderr } = {}) {
    const env = envFor(this, this.creds, extraEnv)
    let pending = ''
    const filteredStdout = text => {
      pending += text
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      const kept = lines.filter(line => !/^MX_EXIT:-?\d+\s*$/.test(line))
      if (kept.length > 0) onStdout?.(`${kept.join('\n')}\n`)
    }
    const result = await runPowerShell(this.buildScript(body), env, {
      registerCancel,
      onStdout: filteredStdout,
      onStderr,
      timeoutMs: Math.max(this.timeoutMs, 30 * 60 * 1000),
    })
    if (pending && !/^MX_EXIT:-?\d+\s*$/.test(pending)) onStdout?.(pending)
    const marker = result.stdout.match(/MX_EXIT:(-?\d+)/)
    const exitCode = marker ? Number(marker[1]) : result.code
    const cleanStdout = result.stdout.replace(/^MX_EXIT:-?\d+\s*$/gm, '')
    return { exitCode, stdout: cleanStdout, stderr: result.stderr, error: result.error }
  }

  async exec({ remotePath, args, registerCancel, onStdout, onStderr }) {
    const body = [
      'Invoke-Command -Session $session -ScriptBlock {',
      '  param($p, $argJson)',
      '  $argList = @()',
      '  if ($argJson) { $argList = $argJson | ConvertFrom-Json }',
      '  & $p @argList',
      '  if ($LASTEXITCODE -ne $null) { Write-Output ("MX_EXIT:" + $LASTEXITCODE) }',
      '} -ArgumentList $env:MX_PATH, $env:MX_ARGS_JSON',
    ]
    const argList = splitArgs(args)
    return this.runBody(body, { MX_ARGS_JSON: JSON.stringify(argList) }, { registerCancel, onStdout, onStderr })
  }

  async execCommand(command, { registerCancel, onStdout, onStderr } = {}) {
    const body = [
      'Invoke-Command -Session $session -ScriptBlock {',
      '  param($c)',
      '  Invoke-Expression $c',
      '  if ($LASTEXITCODE -ne $null) { Write-Output ("MX_EXIT:" + $LASTEXITCODE) }',
      '} -ArgumentList $env:MX_COMMAND',
    ]
    return this.runBody(body, { MX_COMMAND: command }, { registerCancel, onStdout, onStderr })
  }

  async test() {
    const body = [
      '$value = Invoke-Command -Session $session -ScriptBlock { Write-Output "mx-ok" }',
      "Write-Output ('MX_RESULT:' + $value)",
    ]
    const result = await this.execute(body)
    if (result.error) return { ok: false, message: result.error }
    const ok = PowerShellRemotingTransport.parseResult(result.stdout) === 'mx-ok'
    return {
      ok,
      message: ok
        ? `Connected to ${this.address} over PowerShell Remoting`
        : `PowerShell Remoting test returned: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`}`,
    }
  }

  close() { /* each operation owns its session */ }
}

module.exports = { PowerShellRemotingTransport }
