import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { GuideBox, transportGuidance } from './RemoteGuidance'
import { useAppSelector } from '../store/store'
import type { Device } from '../store/fbcskmSlice'
import type {
  CredentialSource, DeviceTargetInfo, ExecutionHost, RemoteBridge, RemoteInventory, RemoteOs, RemoteTransport,
  RunEvent, RunMode, RunRequest, RunResult, RunSourceKind, RunTarget,
} from '../services/remoteTypes'
import { shortHash } from '../utils/contentHash'
import { validatePatrolOutput, type PatrolValidationResult } from '../utils/patrolOutput'

export interface RunDialogScript {
  key: string
  name: string
  content?: string
  contentHash?: string
  versionId: string
  sourceKind: RunSourceKind
  args?: string
  isRestmon?: boolean
  localPath?: string
  defaultRemotePath?: string
}

type TargetKind = 'local' | 'host' | 'device' | 'adhoc'
type CredentialKind = 'device' | 'profile' | 'adhoc'

const TARGET_STORAGE_PREFIX = 'mx-rma-run-target:'

const targetGuidance: Record<TargetKind, { title: string, lines: string[] }> = {
  local: {
    title: 'This computer',
    lines: ['Runs the script on the Windows machine where this app is open. No server login is needed.'],
  },
  host: {
    title: 'Saved host',
    lines: ['A server you already set up on the Execution Hosts page. Its address, OS and login are reused.'],
  },
  device: {
    title: 'Device from config file',
    lines: [
      'A device from the main device list. Its connection details are already stored in your configuration.',
      'This only reuses that device\'s address and login to run the script now. It does not change the config file.',
      'If the device has no usable login, choose a stored credential profile or enter credentials for this run.',
    ],
  },
  adhoc: {
    title: 'One-time server',
    lines: [
      'Runs on a server that is not saved, using the address you type below.',
      'Nothing is saved after the run unless you tick "Remember as an execution host".',
    ],
  },
}

function getBridge(): RemoteBridge | null {
  const bridge = window.electronAPI?.remote
  return bridge?.available ? bridge : null
}

function inferDeviceOs(device: Device): RemoteOs {
  return device.port === 22 || device.privateKeyPath ? 'linux' : 'windows'
}

function quoteWindows(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

function quoteShell(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function joinRemotePath(directory: string, name: string): string {
  const base = String(directory || '').replace(/[\\/]+$/, '')
  if (!base) return name
  const separator = base.includes('\\') || /^[A-Za-z]:/.test(base) ? '\\' : '/'
  return `${base}${separator}${name}`
}

function defaultRemoteDirectory(os: RemoteOs): string {
  return os === 'windows' ? 'C:\\ProgramData\\mx-rma' : '/tmp/mx-rma'
}

function buildCommandPreview({ os, path, args, isPs1 }: { os: RemoteOs, path: string, args: string, isPs1: boolean }): string {
  const suffix = args ? ` ${args}` : ''
  if (os === 'windows') {
    if (isPs1) return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${quoteWindows(path)}${suffix}`
    return `cmd.exe /c ${quoteWindows(path)}${suffix}`
  }
  if (isPs1) return `pwsh -NoProfile -File ${quoteShell(path)}${suffix}`
  return `bash ${quoteShell(path)}${suffix}`
}

function deviceTransportInfo(device: Device, os: RemoteOs): DeviceTargetInfo {
  const inferred = inferDeviceOs(device)
  const port = os === inferred ? (device.port ?? (os === 'linux' ? 22 : 5985)) : (os === 'linux' ? 22 : 5985)
  return {
    name: device.name,
    address: device.forcedIp || device.name,
    os,
    transport: os === 'linux' ? 'ssh' : 'winrm',
    port,
    insecureHttp: os === 'windows' ? port !== 5986 : undefined,
    username: device.username,
    password: device.password,
    publicKeyPath: device.publicKeyPath,
    privateKeyPath: device.privateKeyPath,
    passphrase: device.passphrase,
  }
}

function readStoredTarget(key: string): Partial<{ targetKind: TargetKind; hostId: string; deviceId: string }> {
  try {
    const raw = localStorage.getItem(`${TARGET_STORAGE_PREFIX}${key}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export default function RunDialog({ open, onClose, script }: { open: boolean, onClose: () => void, script: RunDialogScript | null }) {
  const devices = useAppSelector(state => state.fbcskm.devices)
  const bridge = getBridge()
  const [inventory, setInventory] = useState<RemoteInventory | null>(null)
  const [targetKind, setTargetKind] = useState<TargetKind>('local')
  const [hostId, setHostId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [deviceOs, setDeviceOs] = useState<RemoteOs>('windows')
  const [adhocName, setAdhocName] = useState('')
  const [adhocAddress, setAdhocAddress] = useState('')
  const [adhocOs, setAdhocOs] = useState<RemoteOs>('windows')
  const [adhocTransport, setAdhocTransport] = useState<RemoteTransport>('winrm')
  const [adhocPort, setAdhocPort] = useState('5985')
  const [credentialKind, setCredentialKind] = useState<CredentialKind>('profile')
  const [profileId, setProfileId] = useState('')
  const [adhocUsername, setAdhocUsername] = useState('')
  const [adhocPassword, setAdhocPassword] = useState('')
  const [adhocPrivateKey, setAdhocPrivateKey] = useState('')
  const [adhocPassphrase, setAdhocPassphrase] = useState('')
  const [runMode, setRunMode] = useState<RunMode>('verify-path')
  const [remotePath, setRemotePath] = useState('')
  const [rememberHost, setRememberHost] = useState(false)
  const [prodPhrase, setProdPhrase] = useState('')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<RunResult | null>(null)
  const [events, setEvents] = useState<{ kind: string, text: string }[]>([])
  const [testMessage, setTestMessage] = useState('')
  const [testing, setTesting] = useState(false)
  const [commandDraft, setCommandDraft] = useState('')
  const [commandTouched, setCommandTouched] = useState(false)
  const [copiedOutput, setCopiedOutput] = useState(false)
  const [patrolValidation, setPatrolValidation] = useState<PatrolValidationResult | null>(null)
  const runIdRef = useRef('')
  const consoleRef = useRef<HTMLPreElement | null>(null)

  const hosts = inventory?.hosts ?? []
  const profiles = inventory?.profiles ?? []
  const selectedHost = hosts.find(host => host.id === hostId)
  const selectedDevice = devices.find(device => device.id === deviceId)

  useEffect(() => {
    if (!open || !bridge) return
    bridge.listInventory().then(setInventory).catch(() => setInventory({ hosts: [], profiles: [] }))
  }, [open, bridge])

  useEffect(() => {
    if (!open || !script) return
    const stored = readStoredTarget(script.key)
    setTargetKind(stored.targetKind || 'local')
    setHostId(stored.hostId || '')
    setDeviceId(stored.deviceId || '')
    setRemotePath(script.defaultRemotePath || '')
    setRunMode('verify-path')
    setCredentialKind(stored.targetKind === 'device' ? 'device' : 'profile')
    setAdhocName('')
    setAdhocAddress('')
    setAdhocOs('windows')
    setAdhocTransport('winrm')
    setAdhocPort('5985')
    setAdhocUsername('')
    setAdhocPassword('')
    setAdhocPrivateKey('')
    setAdhocPassphrase('')
    setRememberHost(false)
    setProdPhrase('')
    setRunning(false)
    setStatus('')
    setError('')
    setResult(null)
    setEvents([])
    setTestMessage('')
    setCommandDraft('')
    setCommandTouched(false)
    setCopiedOutput(false)
    setPatrolValidation(null)
  }, [open, script])

  useEffect(() => {
    if (!open) return
    setCommandTouched(false)
  }, [open, script?.key, targetKind, hostId, deviceId, deviceOs, adhocOs, adhocTransport])

  useEffect(() => {
    if (!open || !bridge) return
    const off = bridge.onOutput((event: RunEvent) => {
      if (event.runId !== runIdRef.current) return
      if (event.type === 'stdout' || event.type === 'stderr') {
        setEvents(previous => [...previous, { kind: event.type, text: event.data || '' }])
      } else if (event.type === 'status') {
        setStatus(event.message || '')
      } else if (event.type === 'notice') {
        setEvents(previous => [...previous, { kind: 'notice', text: event.message || '' }])
      } else if (event.type === 'done' && event.result) {
        setResult(event.result)
        setStatus('')
        setRunning(false)
      } else if (event.type === 'error') {
        setError(event.message || 'Run failed.')
        setStatus('')
        setRunning(false)
      }
    })
    return off
  }, [open, bridge])

  useEffect(() => {
    if (!open) return
    const node = consoleRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [events, open])

  useEffect(() => {
    if (!open) return
    if (targetKind === 'host' && selectedHost && !profileId) setProfileId(selectedHost.credentialProfileId || '')
    if (targetKind === 'device' && selectedDevice) setDeviceOs(inferDeviceOs(selectedDevice))
  }, [open, targetKind, selectedHost, selectedDevice, profileId])

  useEffect(() => {
    if (!open) return
    if (!script) return
    try {
      localStorage.setItem(`${TARGET_STORAGE_PREFIX}${script.key}`, JSON.stringify({ targetKind, hostId, deviceId }))
    } catch { /* storage may be unavailable */ }
  }, [open, script, targetKind, hostId, deviceId])

  useEffect(() => {
    if (adhocTransport === 'ssh') {
      setAdhocPort(previous => previous === '5985' || previous === '5986' || !previous ? '22' : previous)
    } else if (adhocTransport === 'winrm' || adhocTransport === 'powershell-remoting') {
      setAdhocPort(previous => previous === '22' || !previous ? '5985' : previous)
    }
  }, [adhocTransport])

  useEffect(() => {
    if (!open) return
    if (targetKind === 'device') setCredentialKind('device')
    else if (targetKind === 'host') setCredentialKind(previous => previous === 'device' ? 'profile' : previous)
    else if (targetKind === 'adhoc') setCredentialKind(previous => previous === 'device' ? 'adhoc' : previous)
  }, [open, targetKind])

  const effectiveDeviceOs = deviceOs
  const deviceInfo = useMemo(() => selectedDevice ? deviceTransportInfo(selectedDevice, effectiveDeviceOs) : null, [selectedDevice, effectiveDeviceOs])
  const adhocGuide = transportGuidance(adhocOs, adhocTransport)

  const changeAdhocOs = (os: RemoteOs) => {
    setAdhocOs(os)
    if (os === 'linux') setAdhocTransport('ssh')
  }

  const resolvedOs: RemoteOs = targetKind === 'local'
    ? (/windows/i.test(navigator.userAgent) ? 'windows' : 'linux')
    : targetKind === 'host'
      ? (selectedHost?.os || 'windows')
      : targetKind === 'device'
        ? effectiveDeviceOs
        : adhocOs

  const localTempPath = useMemo(() => {
    if (!script || script.localPath || !script.content) return ''
    const directory = window.electronAPI?.tempDir || ''
    const base = (script.name || 'script.sh').replace(/[^A-Za-z0-9._-]+/g, '_')
    const fileName = `mx-rma-${script.contentHash ? shortHash(script.contentHash) : 'draft'}-${/\.[^.]+$/.test(base) ? base : `${base}.sh`}`
    if (!directory) return fileName
    const separator = directory.includes('\\') ? '\\' : '/'
    return `${directory.replace(/[\\/]+$/, '')}${separator}${fileName}`
  }, [script])

  const remoteWorkingDir = targetKind === 'host' ? selectedHost?.remoteWorkingDir : targetKind === 'device' ? deviceInfo?.remoteWorkingDir : ''
  const resolvedRemotePath = remotePath.trim() || script?.defaultRemotePath || (script ? joinRemotePath(remoteWorkingDir || defaultRemoteDirectory(resolvedOs), script.name) : '')
  const commandPath = targetKind === 'local' ? (script?.localPath || localTempPath) : resolvedRemotePath
  const commandIsPs1 = /\.ps1$/i.test(commandPath || script?.name || '')
  const defaultCommand = useMemo(() => script
    ? buildCommandPreview({ os: resolvedOs, path: commandPath, args: script.args || '', isPs1: commandIsPs1 })
    : '', [script, resolvedOs, commandPath, commandIsPs1])
  const commandEdited = Boolean(script) && commandDraft.trim() !== defaultCommand.trim()

  useEffect(() => {
    if (!open || commandTouched) return
    setCommandDraft(defaultCommand)
  }, [open, defaultCommand, commandTouched])

  const outputText = useMemo(() => {
    const streamed = events.map(event => event.text).join('')
    if (streamed) return streamed
    if (result) return [result.stdout, result.stderr].filter(Boolean).join('\n')
    return ''
  }, [events, result])

  const stdoutText = useMemo(() => {
    const streamed = events.filter(event => event.kind === 'stdout').map(event => event.text).join('')
    if (streamed) return streamed
    return result?.stdout || ''
  }, [events, result])

  useEffect(() => {
    setPatrolValidation(null)
  }, [stdoutText])

  const buildTarget = (): RunTarget => {
    if (targetKind === 'local') return { kind: 'local' }
    if (targetKind === 'host') return { kind: 'host', hostId }
    if (targetKind === 'device') return { kind: 'device', deviceId }
    return {
      kind: 'adhoc',
      save: rememberHost,
      name: adhocName || adhocAddress,
      address: adhocAddress,
      os: adhocOs,
      transport: adhocTransport,
      port: Number(adhocPort) || undefined,
    }
  }

  const buildCredentialSource = (): CredentialSource => {
    if (targetKind === 'local') return { kind: 'device' }
    if (credentialKind === 'profile') return { kind: 'profile', profileId }
    if (credentialKind === 'device') return { kind: 'device' }
    return {
      kind: 'adhoc',
      authType: adhocPrivateKey ? 'private-key' : 'password',
      username: adhocUsername,
      password: adhocPassword || undefined,
      privateKeyPath: adhocPrivateKey || undefined,
      passphrase: adhocPassphrase || undefined,
    }
  }

  const buildRequest = (runId: string): RunRequest => {
    const useLocalPath = targetKind === 'local' && Boolean(script?.localPath)
    return {
      runId,
      target: buildTarget(),
      credentialSource: buildCredentialSource(),
      sourceKind: script?.sourceKind || 'editor-draft',
      versionId: script?.versionId || '',
      name: script?.name || 'script.ps1',
      content: useLocalPath ? undefined : script?.content,
      contentHash: script?.contentHash,
      runMode,
      remotePath: remotePath || undefined,
      localPath: useLocalPath ? script?.localPath : undefined,
      localTempPath: targetKind === 'local' && !useLocalPath && script?.content ? localTempPath || undefined : undefined,
      args: script?.args,
      isRestmon: script?.isRestmon,
      commandOverride: commandEdited ? commandDraft : undefined,
      deviceTarget: targetKind === 'device' ? deviceInfo || undefined : undefined,
    }
  }

  const prodGuard = selectedHost?.environment === 'prod'
  const canRun = Boolean(bridge && script && !running && (targetKind === 'local' || inventory)
    && (targetKind !== 'host' || hostId) && (targetKind !== 'device' || deviceId)
    && (targetKind !== 'adhoc' || adhocAddress.trim())
    && (targetKind === 'local' || (credentialKind === 'profile' ? profileId : true))
    && (!prodGuard || prodPhrase.trim().toUpperCase() === 'PROD'))

  const start = async () => {
    if (!bridge || !script || !canRun) return
    const runId = `run-${Date.now()}-${Math.random().toString(16).slice(2)}`
    runIdRef.current = runId
    setEvents([])
    setResult(null)
    setError('')
    setStatus('Starting...')
    setRunning(true)
    setCopiedOutput(false)
    try {
      if (targetKind === 'adhoc' && rememberHost && credentialKind === 'profile' && profileId) {
        await bridge.saveHost({
          name: adhocName.trim() || adhocAddress.trim(),
          address: adhocAddress.trim(),
          os: adhocOs,
          transport: adhocTransport,
          credentialProfileId: profileId,
          environment: 'lab',
          insecureHttp: adhocTransport !== 'ssh' && adhocPort === '5985',
        })
      }
      const response = await bridge.run(buildRequest(runId))
      setResult(previous => previous ?? response)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError))
    } finally {
      setRunning(false)
      setStatus('')
    }
  }

  const cancel = async () => {
    if (!bridge || !runIdRef.current) return
    await bridge.cancel(runIdRef.current)
    setStatus('Cancelling...')
  }

  const testConnection = async () => {
    if (!bridge || !script) return
    setTesting(true)
    setTestMessage('')
    try {
      const response = await bridge.testConnection({
        target: buildTarget(),
        credentialSource: buildCredentialSource(),
        deviceTarget: targetKind === 'device' ? deviceInfo || undefined : undefined,
      })
      setTestMessage(response.message)
    } catch (testError) {
      setTestMessage(testError instanceof Error ? testError.message : String(testError))
    } finally {
      setTesting(false)
    }
  }

  const copyCommand = () => {
    if (!commandDraft) return
    void navigator.clipboard.writeText(commandDraft)
  }

  const resetCommand = () => {
    setCommandTouched(false)
    setCommandDraft(defaultCommand)
  }

  const copyOutput = () => {
    if (!outputText) return
    void navigator.clipboard.writeText(outputText)
    setCopiedOutput(true)
    window.setTimeout(() => setCopiedOutput(false), 1500)
  }

  const validateOutput = () => {
    setPatrolValidation(validatePatrolOutput(stdoutText))
  }

  const credentialOptions = targetKind === 'device'
    ? (['device', 'profile', 'adhoc'] as CredentialKind[])
    : (['profile', 'adhoc'] as CredentialKind[])

  return (
    <Dialog open={open} onClose={running ? undefined : onClose} maxWidth='md' fullWidth>
      <DialogTitle>Run Script</DialogTitle>
      <DialogContent dividers>
        {!bridge && <Alert severity='warning' sx={{ mb: 2 }}>Remote execution is only available in the desktop app.</Alert>}
        {script && (
          <Box sx={{ mb: 2 }}>
            <Typography variant='subtitle1' fontWeight={600}>{script.name}</Typography>
            <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap sx={{ mt: 0.5 }}>
              <Chip size='small' label={script.versionId} />
              <Chip size='small' label={`sha256:${shortHash(script.contentHash) || 'not computed'}`} />
              <Chip size='small' label={script.sourceKind} />
            </Stack>
          </Box>
        )}

        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select size='small' label='Target' value={targetKind} onChange={event => setTargetKind(event.target.value as TargetKind)} fullWidth>
              <MenuItem value='local'>This computer</MenuItem>
              <MenuItem value='host' disabled={hosts.length === 0}>Saved host (Execution Hosts)</MenuItem>
              <MenuItem value='device' disabled={devices.length === 0}>Device from config file</MenuItem>
              <MenuItem value='adhoc'>One-time server (not saved)</MenuItem>
            </TextField>
            {targetKind === 'host' && (
              <TextField select size='small' label='Execution host' value={hostId} onChange={event => { setHostId(event.target.value); setProfileId(hosts.find(host => host.id === event.target.value)?.credentialProfileId || '') }} fullWidth>
                {hosts.map((host: ExecutionHost) => (
                  <MenuItem key={host.id} value={host.id}>{host.name} ({host.address}) — {host.environment || 'lab'}</MenuItem>
                ))}
              </TextField>
            )}
            {targetKind === 'device' && (
              <TextField select size='small' label='Device' value={deviceId} onChange={event => setDeviceId(event.target.value)} fullWidth>
                {devices.map(device => <MenuItem key={device.id} value={device.id}>{device.name}</MenuItem>)}
              </TextField>
            )}
            {targetKind === 'device' && selectedDevice && (
              <TextField select size='small' label='Device OS' value={deviceOs} onChange={event => setDeviceOs(event.target.value as RemoteOs)} sx={{ minWidth: 140 }} helperText='Usually detected automatically. Change only if it is wrong.'>
                <MenuItem value='windows'>Windows</MenuItem>
                <MenuItem value='linux'>Linux</MenuItem>
              </TextField>
            )}
          </Stack>

          <Alert severity='info' sx={{ alignItems: 'flex-start', py: 0.5 }}>
            <Typography variant='subtitle2'>{targetGuidance[targetKind].title}</Typography>
            {targetGuidance[targetKind].lines.map(line => (
              <Typography key={line} variant='body2' sx={{ mt: 0.5 }}>{line}</Typography>
            ))}
          </Alert>

          {targetKind === 'adhoc' && (
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField size='small' label='Name' value={adhocName} onChange={event => setAdhocName(event.target.value)} fullWidth helperText='Optional label for this run.' />
                <TextField size='small' label='Host or IP' value={adhocAddress} onChange={event => setAdhocAddress(event.target.value)} fullWidth required helperText='Server name or IP address to connect to.' />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField select size='small' label='OS' value={adhocOs} onChange={event => changeAdhocOs(event.target.value as RemoteOs)} fullWidth>
                  <MenuItem value='windows'>Windows</MenuItem>
                  <MenuItem value='linux'>Linux</MenuItem>
                </TextField>
                <TextField select size='small' label='Transport' value={adhocTransport} onChange={event => setAdhocTransport(event.target.value as RemoteTransport)} fullWidth>
                  <MenuItem value='ssh'>SSH / OpenSSH</MenuItem>
                  {adhocOs === 'windows' && <MenuItem value='winrm'>WinRM</MenuItem>}
                  {adhocOs === 'windows' && <MenuItem value='powershell-remoting'>PowerShell Remoting</MenuItem>}
                </TextField>
                <TextField size='small' label='Port' value={adhocPort} onChange={event => setAdhocPort(event.target.value)} sx={{ width: 120 }} />
              </Stack>
              <GuideBox
                title={adhocGuide.title}
                lines={adhocGuide.warning ? [adhocGuide.warning, ...adhocGuide.lines] : adhocGuide.lines}
                commands={adhocGuide.commands}
                tone={adhocGuide.warning ? 'warning' : 'info'}
              />
              <FormControlLabel control={<Checkbox checked={rememberHost} onChange={event => setRememberHost(event.target.checked)} />} label='Remember as an execution host' />
              <Typography variant='caption' color='text.secondary'>
                Saves this address and OS to the Execution Hosts page for reuse. The login is stored separately in a credential profile.
              </Typography>
            </Stack>
          )}

          {targetKind !== 'local' && (
            <TextField
              select
              size='small'
              label='Credentials'
              value={credentialKind}
              onChange={event => setCredentialKind(event.target.value as CredentialKind)}
              fullWidth
              helperText={
                credentialKind === 'device'
                  ? 'Uses the username/password or SSH key already stored in this device\'s configuration entry.'
                  : credentialKind === 'profile'
                    ? 'Uses a login saved under Execution Hosts → Credentials. One profile can be reused by many servers.'
                    : 'Entered for this run only. It is not saved.'
              }
            >
              {credentialOptions.map(kind => (
                <MenuItem key={kind} value={kind}>
                  {kind === 'device' ? 'Use the device’s stored credentials' : kind === 'profile' ? 'Stored credential profile' : 'Enter for this run'}
                </MenuItem>
              ))}
            </TextField>
          )}

          {targetKind !== 'local' && credentialKind === 'profile' && (
            <TextField select size='small' label='Credential profile' value={profileId} onChange={event => setProfileId(event.target.value)} fullWidth helperText={profiles.length === 0 ? 'No profiles yet. Create one on the Execution Hosts → Credentials tab.' : 'The saved login to use on this server.'}>
              {profiles.map(profile => (
                <MenuItem key={profile.id} value={profile.id}>
                  {profile.name} — {profile.authType}{profile.hasSecret ? '' : ' (no secret stored)'}
                </MenuItem>
              ))}
            </TextField>
          )}

          {targetKind !== 'local' && credentialKind === 'adhoc' && (
            <Stack spacing={1.5}>
              <Alert severity='info' sx={{ alignItems: 'flex-start', py: 0.5 }}>
                <Typography variant='body2'>
                  Enter a <strong>password</strong> or a <strong>private key path</strong>, not both. The key file must already exist on this PC.
                </Typography>
              </Alert>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField size='small' label='Username' value={adhocUsername} onChange={event => setAdhocUsername(event.target.value)} fullWidth helperText='Account name on the server.' />
                <TextField size='small' label='Password' type='password' value={adhocPassword} onChange={event => setAdhocPassword(event.target.value)} fullWidth helperText='Leave blank if you use a private key.' />
              </Stack>
              <Stack direction='row' spacing={1} alignItems='flex-start'>
                <TextField size='small' label='Private key path' value={adhocPrivateKey} onChange={event => setAdhocPrivateKey(event.target.value)} fullWidth helperText='Full path on this PC, for example C:\Users\<you>\.ssh\id_rsa.' />
                <Button
                  variant='outlined'
                  startIcon={<FolderOpenIcon />}
                  onClick={async () => {
                    const selected = await window.electronAPI?.selectPath?.({ file: true })
                    if (selected) setAdhocPrivateKey(selected)
                  }}
                  sx={{ mt: 0.25, whiteSpace: 'nowrap' }}
                >
                  Browse
                </Button>
              </Stack>
              <TextField size='small' label='Key passphrase' type='password' value={adhocPassphrase} onChange={event => setAdhocPassphrase(event.target.value)} fullWidth helperText='Only if the key file is protected by a passphrase.' />
            </Stack>
          )}

          {targetKind !== 'local' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField select size='small' label='Run mode' value={runMode} onChange={event => setRunMode(event.target.value as RunMode)} fullWidth>
                <MenuItem value='verify-path'>Verify remote copy, replace if it differs</MenuItem>
                <MenuItem value='push-and-run'>Always back up, upload, and run</MenuItem>
              </TextField>
              <TextField size='small' label='Remote path' value={remotePath} onChange={event => setRemotePath(event.target.value)} placeholder={script?.defaultRemotePath || 'Host working directory + file name'} fullWidth />
            </Stack>
          )}

          {targetKind !== 'local' && (
            <Box>
              <Button size='small' variant='outlined' onClick={() => void testConnection()} disabled={testing}>
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
              {testMessage && <Typography variant='body2' sx={{ mt: 1 }}>{testMessage}</Typography>}
            </Box>
          )}

          {prodGuard && (
            <Alert severity='error'>
              <Typography variant='body2' sx={{ mb: 1 }}>
                This execution host is tagged PROD (Execution Hosts → Environment). Type PROD to confirm the production run.
              </Typography>
              <TextField size='small' value={prodPhrase} onChange={event => setProdPhrase(event.target.value)} placeholder='PROD' />
            </Alert>
          )}

          {script && (
            <Box>
              <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant='subtitle2'>Command</Typography>
                <Button size='small' startIcon={<ContentCopyIcon />} onClick={copyCommand} disabled={!commandDraft}>
                  Copy command
                </Button>
                {commandEdited && <Chip size='small' color='warning' label='Edited — will run as shown' />}
                {commandEdited && <Button size='small' onClick={resetCommand}>Reset</Button>}
              </Stack>
              <TextField
                size='small'
                fullWidth
                multiline
                minRows={2}
                maxRows={6}
                value={commandDraft}
                onChange={event => { setCommandTouched(true); setCommandDraft(event.target.value) }}
                inputProps={{ spellCheck: false }}
                InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
              />
              <Typography variant='caption' color='text.secondary'>
                Edit the command to test something else. Changes apply to this run only.
              </Typography>
            </Box>
          )}

          <Divider />
          <Stack direction='row' spacing={1} alignItems='center'>
            <Typography variant='body2' color='text.secondary' sx={{ flex: 1 }}>
              {status || (running ? 'Running…' : 'Ready')}
            </Typography>
            {running && <CircularProgress size={18} />}
          </Stack>

          <Box>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
              <Typography variant='subtitle2' sx={{ flex: 1 }}>Output</Typography>
              <Tooltip title='Check standard output against the PATROL for Scripting format'>
                <span>
                  <Button size='small' startIcon={<FactCheckOutlinedIcon />} onClick={validateOutput} disabled={!stdoutText}>
                    Validate PATROL output
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={copiedOutput ? 'Copied' : 'Copy output'}>
                <span>
                  <IconButton size='small' onClick={copyOutput} disabled={!outputText} aria-label='copy output'>
                    {copiedOutput ? <CheckIcon fontSize='small' /> : <ContentCopyIcon fontSize='small' />}
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            <Box
              component='pre'
              ref={consoleRef}
              sx={{
                m: 0, p: 1.5, minHeight: 180, maxHeight: 320, overflow: 'auto', borderRadius: 1,
                backgroundColor: 'action.hover', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap',
              }}
            >
              {events.length === 0 ? 'Output appears here.' : events.map((event, index) => (
                <Box component='span' key={index} sx={{ display: 'block', color: event.kind === 'stderr' ? 'error.main' : event.kind === 'notice' ? 'warning.main' : 'inherit' }}>
                  {event.text}
                </Box>
              ))}
            </Box>
            {patrolValidation && (
              <Alert
                severity={patrolValidation.ok ? 'success' : 'error'}
                onClose={() => setPatrolValidation(null)}
                sx={{ mt: 1 }}
              >
                <Typography variant='body2' fontWeight={600}>
                  {patrolValidation.ok
                    ? `Valid PATROL for Scripting output${patrolValidation.format ? ` (Format ${patrolValidation.format})` : ''}.`
                    : 'Output is not valid for PATROL for Scripting.'}
                </Typography>
                {patrolValidation.issues.slice(0, 6).map((issue, index) => (
                  <Typography key={`patrol-issue-${index}`} variant='caption' display='block'>
                    {issue.line ? `Line ${issue.line}: ` : ''}{issue.message}
                  </Typography>
                ))}
                {patrolValidation.issues.length > 6 && (
                  <Typography variant='caption' display='block'>
                    …and {patrolValidation.issues.length - 6} more issue(s).
                  </Typography>
                )}
                {patrolValidation.warnings.slice(0, 4).map((warning, index) => (
                  <Typography key={`patrol-warning-${index}`} variant='caption' display='block' color='text.secondary'>
                    Warning: {warning.line ? `line ${warning.line}: ` : ''}{warning.message}
                  </Typography>
                ))}
                {patrolValidation.warnings.length > 4 && (
                  <Typography variant='caption' display='block' color='text.secondary'>
                    …and {patrolValidation.warnings.length - 4} more warning(s).
                  </Typography>
                )}
              </Alert>
            )}
          </Box>

          {error && <Alert severity='error'>{error}</Alert>}

          {result && (
            <Alert severity={result.exitCode === 0 ? 'success' : 'warning'}>
              <Typography variant='body2'>
                Exit code {result.exitCode ?? 'unknown'} · {result.durationMs} ms · {result.decision}
                {result.backupPath ? ` · backup: ${result.backupPath}` : ''}
              </Typography>
              {result.remoteHashAfter && (
                <Typography variant='caption' display='block'>
                  Remote sha256: {shortHash(result.remoteHashAfter)}
                </Typography>
              )}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {running && <Button color='error' startIcon={<StopCircleIcon />} onClick={() => void cancel()}>Cancel</Button>}
        <Button onClick={onClose} disabled={running}>Close</Button>
        <Button variant='contained' startIcon={<PlayArrowIcon />} onClick={() => void start()} disabled={!canRun}>Run</Button>
      </DialogActions>
    </Dialog>
  )
}
