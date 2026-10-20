import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer,
  FormControlLabel, IconButton, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import LockIcon from '@mui/icons-material/Lock'
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser'
import DnsIcon from '@mui/icons-material/Dns'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { GuideBox, StepList, transportGuidance } from './RemoteGuidance'
import type { Device } from '../store/fbcskmSlice'
import type {
  CredentialProfile, CredentialProfileInput, EnvironmentTag, ExecutionHost, ExecutionHostInput, RemoteAuthType,
  RemoteBridge, RemoteInventory, RemoteOs, RemoteTransport,
} from '../services/remoteTypes'

type TabKey = 'hosts' | 'credentials'

function getBridge(): RemoteBridge | null {
  const bridge = window.electronAPI?.remote
  return bridge?.available ? bridge : null
}

const emptyHost: ExecutionHostInput = {
  name: '',
  address: '',
  os: 'windows',
  transport: 'winrm',
  credentialProfileId: '',
  environment: 'lab',
  remoteWorkingDir: '',
  insecureHttp: true,
}

const emptyProfile: CredentialProfileInput = {
  name: '',
  authType: 'password',
  username: '',
  privateKeyPath: '',
}

type AuthGuidance = {
  summary: string
  username: 'required' | 'optional' | 'hidden'
  secretLabel?: string
  secretHelp?: string
  steps: string[]
}

const authGuidance: Record<RemoteAuthType, AuthGuidance> = {
  password: {
    summary: 'Sign in with a normal username and password.',
    username: 'required',
    secretLabel: 'Password',
    secretHelp: 'Encrypted with your Windows account and stored on this PC. Never written to scripts or logs. Leave blank to keep the existing password.',
    steps: [
      'Enter the account username exactly as it exists on the target server.',
      'Enter that account\'s password.',
      'The password is encrypted by Windows and kept on this PC only.',
    ],
  },
  'private-key': {
    summary: 'Sign in with an SSH key file that already exists on this PC.',
    username: 'required',
    secretLabel: 'Key passphrase (optional)',
    secretHelp: 'Only needed if your key file is protected by a passphrase. Leave blank if it is not.',
    steps: [
      'Put the private key file on THIS PC, for example C:\\Users\\<you>\\.ssh\\id_rsa.',
      'Use Browse to select that file. Never select the .pub file here.',
      'Copy the matching public key (.pub) into ~/.ssh/authorized_keys on the target server.',
    ],
  },
  'ssh-agent': {
    summary: 'Use SSH keys that are already loaded in your SSH agent. Nothing is stored here.',
    username: 'required',
    steps: [
      'Start your SSH agent and load your key with ssh-add.',
      'The app finds the key through the SSH_AUTH_SOCK environment variable.',
      'If this PC is not already set up this way, choose Password or Private key instead.',
    ],
  },
  'windows-integrated': {
    summary: 'Use the Windows account you are signed in with right now. No password is stored.',
    username: 'hidden',
    steps: [
      'Nothing to enter: the app uses your current Windows sign-in.',
      'Your PC and the target server must be in the same domain or a trusted domain.',
      'The target must allow Windows authentication through WinRM / PowerShell Remoting.',
    ],
  },
}

export default function ExecutionHostsView({ devices }: { devices: Device[] }) {
  const bridge = getBridge()
  const [tab, setTab] = useState<TabKey>('hosts')
  const [inventory, setInventory] = useState<RemoteInventory>({ hosts: [], profiles: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [hostDrawer, setHostDrawer] = useState(false)
  const [profileDrawer, setProfileDrawer] = useState(false)
  const [hostDraft, setHostDraft] = useState<ExecutionHostInput>(emptyHost)
  const [profileDraft, setProfileDraft] = useState<CredentialProfileInput>(emptyProfile)
  const [secret, setSecret] = useState('')
  const [testingId, setTestingId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ kind: TabKey, id: string, name: string } | null>(null)

  const refresh = async () => {
    if (!bridge) return
    try {
      setInventory(await bridge.listInventory())
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [bridge])

  const profilesById = useMemo(() => new Map(inventory.profiles.map(profile => [profile.id, profile])), [inventory.profiles])
  const profileGuide = authGuidance[profileDraft.authType]
  const hostGuide = transportGuidance(hostDraft.os, hostDraft.transport)

  const changeOs = (os: RemoteOs) => {
    setHostDraft(current => ({
      ...current,
      os,
      transport: os === 'linux' && current.transport !== 'ssh' ? 'ssh' : current.transport,
    }))
  }

  const browsePrivateKey = async () => {
    const selected = await window.electronAPI?.selectPath?.({ file: true })
    if (selected) setProfileDraft(current => ({ ...current, privateKeyPath: selected }))
  }

  const openHost = (host?: ExecutionHost) => {
    setHostDraft(host
      ? { ...host, transport: host.os === 'linux' && host.transport !== 'ssh' ? 'ssh' : host.transport }
      : { ...emptyHost })
    setHostDrawer(true)
  }

  const openProfile = (profile?: CredentialProfile) => {
    setProfileDraft(profile ? { id: profile.id, name: profile.name, authType: profile.authType, username: profile.username, privateKeyPath: profile.privateKeyPath || '' } : { ...emptyProfile })
    setSecret('')
    setProfileDrawer(true)
  }

  const saveHost = async () => {
    if (!bridge) return
    try {
      await bridge.saveHost({ ...hostDraft, id: hostDraft.id })
      setHostDrawer(false)
      setNotice('Execution host saved.')
      await refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  const saveProfile = async () => {
    if (!bridge) return
    try {
      const saved = await bridge.saveProfile(profileDraft)
      if (secret) await bridge.setSecret(saved.id, secret)
      setProfileDrawer(false)
      setSecret('')
      setNotice(secret ? 'Credential profile and secret saved.' : 'Credential profile saved.')
      await refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  const clearSecret = async (profile: CredentialProfile) => {
    if (!bridge) return
    try {
      await bridge.clearSecret(profile.id)
      setNotice(`Stored secret cleared for ${profile.name}.`)
      await refresh()
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError))
    }
  }

  const testHost = async (host: ExecutionHost) => {
    if (!bridge) return
    setTestingId(host.id)
    setNotice('')
    try {
      const response = await bridge.testConnection({
        target: { kind: 'host', hostId: host.id },
        credentialSource: { kind: 'profile', profileId: host.credentialProfileId },
      })
      setNotice(response.ok ? `${host.name}: ${response.message}` : `${host.name}: ${response.message}`)
      await refresh()
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError))
    } finally {
      setTestingId('')
    }
  }

  const remove = async () => {
    if (!bridge || !confirmDelete) return
    try {
      if (confirmDelete.kind === 'hosts') await bridge.deleteHost(confirmDelete.id)
      else await bridge.deleteProfile(confirmDelete.id)
      setConfirmDelete(null)
      setNotice('Deleted.')
      await refresh()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  if (!bridge) {
    return <Alert severity='warning'>Execution hosts are only available in the desktop app.</Alert>
  }

  return (
    <Box>
      <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 2 }}>
        <DnsIcon color='primary' />
        <Typography variant='h5' sx={{ flex: 1 }}>Execution Hosts</Typography>
        <Button variant='contained' startIcon={<AddIcon />} onClick={() => tab === 'hosts' ? openHost() : openProfile()}>
          {tab === 'hosts' ? 'Add host' : 'Add credential profile'}
        </Button>
      </Stack>

      <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
        Set this up in two steps: create a <strong>credential profile</strong> (how to sign in), then add a <strong>host</strong> (which server to run on).
      </Typography>

      <Tabs value={tab} onChange={(event, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value='hosts' label={`Hosts (${inventory.hosts.length})`} />
        <Tab value='credentials' label={`Credentials (${inventory.profiles.length})`} />
      </Tabs>

      {error && <Alert severity='error' sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity='info' sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      {tab === 'hosts' && (
        inventory.hosts.length === 0 ? (
          <Alert severity='info'>
            <Typography variant='subtitle2'>{loading ? 'Loading…' : 'No execution hosts yet'}</Typography>
            {!loading && (
              <Box sx={{ mt: 1 }}>
                <Typography variant='body2' sx={{ mb: 0.5 }}>A host is a server you want to run scripts on.</Typography>
                <StepList steps={[
                  'Open the Credentials tab and add a credential profile (how to sign in).',
                  'Come back here, click Add host, and enter the server name or IP address.',
                  'Click Test on the row to confirm the connection works.',
                ]} />
              </Box>
            )}
          </Alert>
        ) : (
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Address</TableCell>
                <TableCell>OS</TableCell>
                <TableCell>Transport</TableCell>
                <TableCell>Credentials</TableCell>
                <TableCell>Environment</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align='right'>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {inventory.hosts.map(host => {
                const profile = profilesById.get(host.credentialProfileId)
                return (
                  <TableRow key={host.id} hover>
                    <TableCell>{host.name}</TableCell>
                    <TableCell>{host.address}</TableCell>
                    <TableCell>{host.os === 'windows' ? 'Windows' : 'Linux'}</TableCell>
                    <TableCell>{host.transport}</TableCell>
                    <TableCell>
                      <Stack direction='row' spacing={0.5} alignItems='center'>
                        <Typography variant='body2'>{profile?.name || 'Missing profile'}</Typography>
                        {profile?.hasSecret ? <Tooltip title='Secret stored in the OS vault'><LockIcon fontSize='small' color='success' /></Tooltip> : null}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip size='small' color={host.environment === 'prod' ? 'error' : host.environment === 'stage' ? 'warning' : 'default'} label={host.environment || 'lab'} />
                    </TableCell>
                    <TableCell>
                      <Stack direction='row' spacing={0.5} alignItems='center'>
                        {host.hostKeyFingerprint && <Tooltip title={host.hostKeyFingerprint}><VerifiedUserIcon fontSize='small' color='success' /></Tooltip>}
                        <Typography variant='caption' color='text.secondary'>
                          {host.lastConnectedAt ? new Date(host.lastConnectedAt).toLocaleString() : 'Never'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align='right'>
                      <Button size='small' disabled={testingId === host.id || !host.credentialProfileId} onClick={() => void testHost(host)}>
                        {testingId === host.id ? 'Testing…' : 'Test'}
                      </Button>
                      <IconButton size='small' onClick={() => openHost(host)} aria-label='edit host'><EditIcon fontSize='small' /></IconButton>
                      <IconButton size='small' onClick={() => setConfirmDelete({ kind: 'hosts', id: host.id, name: host.name })} aria-label='delete host'><DeleteIcon fontSize='small' /></IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )
      )}

      {tab === 'credentials' && (
        inventory.profiles.length === 0 ? (
          <Alert severity='info'>
            <Typography variant='subtitle2'>{loading ? 'Loading…' : 'No credential profiles yet'}</Typography>
            {!loading && (
              <Box sx={{ mt: 1 }}>
                <Typography variant='body2' sx={{ mb: 0.5 }}>A credential profile is a saved login. One profile can be reused by many hosts.</Typography>
                <StepList steps={[
                  'Click Add credential profile.',
                  'Choose how you sign in. Password is the easiest to start with.',
                  'Enter the username and password, then click Save.',
                ]} />
              </Box>
            )}
          </Alert>
        ) : (
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Auth type</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Private key</TableCell>
                <TableCell>Secret</TableCell>
                <TableCell align='right'>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {inventory.profiles.map(profile => (
                <TableRow key={profile.id} hover>
                  <TableCell>{profile.name}</TableCell>
                  <TableCell>{profile.authType}</TableCell>
                  <TableCell>{profile.username || '—'}</TableCell>
                  <TableCell>{profile.privateKeyPath || '—'}</TableCell>
                  <TableCell>{profile.hasSecret ? <Chip size='small' color='success' label='Stored' /> : <Chip size='small' label='Not set' />}</TableCell>
                  <TableCell align='right'>
                    <Button size='small' disabled={!profile.hasSecret} onClick={() => void clearSecret(profile)}>Clear secret</Button>
                    <IconButton size='small' onClick={() => openProfile(profile)} aria-label='edit profile'><EditIcon fontSize='small' /></IconButton>
                    <IconButton size='small' onClick={() => setConfirmDelete({ kind: 'credentials', id: profile.id, name: profile.name })} aria-label='delete profile'><DeleteIcon fontSize='small' /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      <Drawer anchor='right' open={hostDrawer} onClose={() => setHostDrawer(false)} PaperProps={{ sx: { width: 480 } }}>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', overflowY: 'auto' }}>
          <Typography variant='h6'>{hostDraft.id ? 'Edit execution host' : 'Add execution host'}</Typography>
          <TextField size='small' label='Name' value={hostDraft.name} onChange={event => setHostDraft({ ...hostDraft, name: event.target.value })} required />
          <TextField size='small' label='Host or FQDN' value={hostDraft.address} onChange={event => setHostDraft({ ...hostDraft, address: event.target.value })} required />
          <Stack direction='row' spacing={1}>
            <TextField select size='small' label='OS' value={hostDraft.os} onChange={event => changeOs(event.target.value as RemoteOs)} fullWidth>
              <MenuItem value='windows'>Windows</MenuItem>
              <MenuItem value='linux'>Linux</MenuItem>
            </TextField>
            <TextField select size='small' label='Transport' value={hostDraft.transport} onChange={event => setHostDraft({ ...hostDraft, transport: event.target.value as RemoteTransport })} fullWidth>
              <MenuItem value='ssh'>SSH / OpenSSH</MenuItem>
              {hostDraft.os === 'windows' && <MenuItem value='winrm'>WinRM</MenuItem>}
              {hostDraft.os === 'windows' && <MenuItem value='powershell-remoting'>PowerShell Remoting</MenuItem>}
            </TextField>
          </Stack>
          <GuideBox
            title={hostGuide.title}
            lines={hostGuide.warning ? [hostGuide.warning, ...hostGuide.lines] : hostGuide.lines}
            commands={hostGuide.commands}
            tone={hostGuide.warning ? 'warning' : 'info'}
          />
          <TextField
            select
            size='small'
            label='Credential profile'
            value={hostDraft.credentialProfileId}
            onChange={event => setHostDraft({ ...hostDraft, credentialProfileId: event.target.value })}
            required
            helperText={inventory.profiles.length === 0 ? 'No profiles yet. Create one in the Credentials tab first.' : 'The saved login to use on this server.'}
          >
            {inventory.profiles.map(profile => <MenuItem key={profile.id} value={profile.id}>{profile.name}</MenuItem>)}
          </TextField>
          <TextField select size='small' label='Environment' value={hostDraft.environment || 'lab'} onChange={event => setHostDraft({ ...hostDraft, environment: event.target.value as EnvironmentTag })} helperText='A label only. Use prod to make production servers easy to spot.'>
            <MenuItem value='prod'>prod</MenuItem>
            <MenuItem value='stage'>stage</MenuItem>
            <MenuItem value='lab'>lab</MenuItem>
          </TextField>
          <TextField select size='small' label='Linked device (optional)' value={hostDraft.linkedDeviceId || ''} onChange={event => setHostDraft({ ...hostDraft, linkedDeviceId: event.target.value || '' })}>
            <MenuItem value=''>None</MenuItem>
            {devices.map(device => <MenuItem key={device.id} value={device.id}>{device.name}</MenuItem>)}
          </TextField>
          <TextField
            size='small'
            label='Remote working directory'
            value={hostDraft.remoteWorkingDir || ''}
            onChange={event => setHostDraft({ ...hostDraft, remoteWorkingDir: event.target.value })}
            placeholder={hostDraft.os === 'windows' ? 'C:\\ProgramData\\mx-rma' : '/tmp/mx-rma'}
            helperText='Scripts are copied here before they run. Leave blank to use the default shown in the box.'
          />
          {hostDraft.os === 'windows' && hostDraft.transport !== 'ssh' && (
            <>
              <FormControlLabel control={<Checkbox checked={Boolean(hostDraft.insecureHttp)} onChange={event => setHostDraft({ ...hostDraft, insecureHttp: event.target.checked })} />} label='Allow insecure HTTP (WinRM port 5985)' />
              <Typography variant='caption' color='text.secondary'>
                Checked: use HTTP port 5985. Easier, but traffic is not encrypted — use only on trusted networks.
                Unchecked: use HTTPS port 5986, which needs a valid certificate on the server.
              </Typography>
            </>
          )}
          {hostDraft.hostKeyFingerprint && (
            <Box>
              <Typography variant='caption' color='text.secondary'>SSH host key</Typography>
              <Typography variant='body2' sx={{ wordBreak: 'break-all' }}>{hostDraft.hostKeyFingerprint}</Typography>
              <Button size='small' onClick={() => setHostDraft({ ...hostDraft, hostKeyFingerprint: '' })}>Forget host key</Button>
            </Box>
          )}
          <Box sx={{ flex: 1 }} />
          <Divider />
          <Stack direction='row' spacing={1} justifyContent='flex-end'>
            <Button onClick={() => setHostDrawer(false)}>Cancel</Button>
            <Button variant='contained' onClick={() => void saveHost()} disabled={!hostDraft.name.trim() || !hostDraft.address.trim() || !hostDraft.credentialProfileId}>Save</Button>
          </Stack>
        </Box>
      </Drawer>

      <Drawer anchor='right' open={profileDrawer} onClose={() => setProfileDrawer(false)} PaperProps={{ sx: { width: 480 } }}>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', overflowY: 'auto' }}>
          <Typography variant='h6'>{profileDraft.id ? 'Edit credential profile' : 'Add credential profile'}</Typography>
          <TextField size='small' label='Name' value={profileDraft.name} onChange={event => setProfileDraft({ ...profileDraft, name: event.target.value })} required />
          <TextField select size='small' label='Auth type' value={profileDraft.authType} onChange={event => setProfileDraft({ ...profileDraft, authType: event.target.value as RemoteAuthType })} helperText={profileGuide.summary}>
            <MenuItem value='password'>Password</MenuItem>
            <MenuItem value='private-key'>Private key</MenuItem>
            <MenuItem value='ssh-agent'>SSH agent</MenuItem>
            <MenuItem value='windows-integrated'>Windows integrated</MenuItem>
          </TextField>
          <Alert severity='info' sx={{ alignItems: 'flex-start' }}>
            <Typography variant='subtitle2'>How this sign-in works</Typography>
            <Box sx={{ mt: 0.5 }}><StepList steps={profileGuide.steps} /></Box>
          </Alert>
          {profileGuide.username === 'hidden' ? (
            <Typography variant='body2' color='text.secondary'>
              No username needed. Windows integrated signs in with the account this app is currently running as.
            </Typography>
          ) : (
            <TextField size='small' label='Username' value={profileDraft.username} onChange={event => setProfileDraft({ ...profileDraft, username: event.target.value })} required={profileGuide.username === 'required'} helperText='The account name on the target server.' />
          )}
          {profileDraft.authType === 'private-key' && (
            <Stack direction='row' spacing={1} alignItems='flex-start'>
              <TextField
                size='small'
                label='Private key path'
                value={profileDraft.privateKeyPath || ''}
                onChange={event => setProfileDraft({ ...profileDraft, privateKeyPath: event.target.value })}
                placeholder='C:\Users\<you>\.ssh\id_rsa'
                helperText='Full path to the private key on this PC. Do not select the .pub file.'
                fullWidth
              />
              <Button variant='outlined' startIcon={<FolderOpenIcon />} onClick={() => void browsePrivateKey()} sx={{ mt: 0.25, whiteSpace: 'nowrap' }}>
                Browse
              </Button>
            </Stack>
          )}
          {(profileDraft.authType === 'password' || profileDraft.authType === 'private-key') && (
            <TextField
              size='small'
              type='password'
              label={profileGuide.secretLabel}
              value={secret}
              onChange={event => setSecret(event.target.value)}
              helperText={profileGuide.secretHelp}
            />
          )}
          <Box sx={{ flex: 1 }} />
          <Divider />
          <Stack direction='row' spacing={1} justifyContent='flex-end'>
            <Button onClick={() => setProfileDrawer(false)}>Cancel</Button>
            <Button variant='contained' onClick={() => void saveProfile()} disabled={!profileDraft.name.trim()}>Save</Button>
          </Stack>
        </Box>
      </Drawer>

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete {confirmDelete?.kind === 'hosts' ? 'execution host' : 'credential profile'}?</DialogTitle>
        <DialogContent><Typography>{confirmDelete?.name} will be removed. Stored secrets are cleared.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color='error' onClick={() => void remove()}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
