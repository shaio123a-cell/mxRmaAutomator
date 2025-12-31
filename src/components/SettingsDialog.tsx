import React, { useState, useEffect } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, TextField, Typography, Divider, FormControlLabel, Checkbox } from '@mui/material'
import { useAppDispatch, useAppSelector } from '../store/store'
import { setDefaultDeviceSettings, setDefaultScriptSettings } from '../store/fbcskmSlice'

export default function SettingsDialog({ open, onClose }: { open: boolean, onClose: ()=>void }){
  const dispatch = useAppDispatch()
  const defaults = useAppSelector(s => (s.fbcskm as any).defaultDeviceSettings || {})
  const scriptDefaults = useAppSelector(s => (s.fbcskm as any).defaultScriptSettings || {})

  const [port, setPort] = useState<string|number | null>(null)
  const [cto, setCto] = useState<string|number | null>(null)
  const [cpoll, setCpoll] = useState<string|number | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [publicKeyPath, setPublicKeyPath] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [matrixPath, setMatrixPath] = useState('')
  const [genericPath, setGenericPath] = useState('')
  const [isRestmonDefault, setIsRestmonDefault] = useState(true)

  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(()=>{
    setPort(defaults.port ?? null)
    setCto(defaults.connectionTimeoutMs ?? null)
    setCpoll(defaults.connectionPollSec ?? null)
    setUsername(defaults.username ?? '')
    setPassword(defaults.password ?? '')
    setPublicKeyPath(defaults.publicKeyPath ?? '')
    setPrivateKeyPath(defaults.privateKeyPath ?? '')
    setPassphrase(defaults.passphrase ?? '')
    setMatrixPath(scriptDefaults.matrixKBPath ?? '/opt/matrixkb/restmon')
    setGenericPath(scriptDefaults.genericPath ?? scriptDefaults.matrixKBPath ?? '/opt/matrixkb/restmon')
    setIsRestmonDefault(scriptDefaults.isRestmonDefault ?? true)
  }, [defaults, scriptDefaults, open])

  const isDirty = () => {
    if ((defaults.port ?? null) !== (port ?? null)) return true
    if ((defaults.connectionTimeoutMs ?? null) !== (cto ?? null)) return true
    if ((defaults.connectionPollSec ?? null) !== (cpoll ?? null)) return true
    if ((defaults.username ?? '') !== (username || '')) return true
    if ((defaults.password ?? '') !== (password || '')) return true
    if ((defaults.publicKeyPath ?? '') !== (publicKeyPath || '')) return true
    if ((defaults.privateKeyPath ?? '') !== (privateKeyPath || '')) return true
    if ((defaults.passphrase ?? '') !== (passphrase || '')) return true
    if ((scriptDefaults.matrixKBPath ?? '') !== (matrixPath || '')) return true
    if ((scriptDefaults.genericPath ?? '') !== (genericPath || '')) return true
    if ((scriptDefaults.isRestmonDefault ?? true) !== isRestmonDefault) return true
    return false
  }

  const save = () => {
    dispatch(setDefaultDeviceSettings({
      port: port === '' ? null : (port === null ? null : Number(port)),
      connectionTimeoutMs: cto === '' ? null : (cto === null ? null : Number(cto)),
      connectionPollSec: cpoll === '' ? null : (cpoll === null ? null : Number(cpoll)),
      username: username || '',
      password: password || '',
      publicKeyPath: publicKeyPath || '',
      privateKeyPath: privateKeyPath || '',
      passphrase: passphrase || ''
    }))

    dispatch(setDefaultScriptSettings({ matrixKBPath: matrixPath || '/opt/matrixkb/restmon', genericPath: genericPath || matrixPath || '/opt/matrixkb/restmon', isRestmonDefault }))

    setConfirmOpen(false)
    onClose()
  }

  const handleRequestClose = (_ev?: any, reason?: string) => {
    if (reason === 'backdropClick' || reason === 'escapeKeyDown' || reason === undefined) {
      if (isDirty()) { setConfirmOpen(true); return }
      onClose()
    }
  }

  const handleCancelClick = () => {
    if (isDirty()) { setConfirmOpen(true); return }
    onClose()
  }

  const discardAndClose = () => {
    // reset values from store and close
    setPort(defaults.port ?? null)
    setCto(defaults.connectionTimeoutMs ?? null)
    setCpoll(defaults.connectionPollSec ?? null)
    setUsername(defaults.username ?? '')
    setPassword(defaults.password ?? '')
    setPublicKeyPath(defaults.publicKeyPath ?? '')
    setPrivateKeyPath(defaults.privateKeyPath ?? '')
    setPassphrase(defaults.passphrase ?? '')
    setMatrixPath(scriptDefaults.matrixKBPath ?? '/opt/matrixkb/restmon')
    setGenericPath(scriptDefaults.genericPath ?? scriptDefaults.matrixKBPath ?? '/opt/matrixkb/restmon')
    setIsRestmonDefault(scriptDefaults.isRestmonDefault ?? true)
    setConfirmOpen(false)
    onClose()
  }

  return (
    <>
    <Dialog open={open} onClose={handleRequestClose} maxWidth='sm' fullWidth>
      <DialogTitle>Configuration</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{mt:1}}>
          <Typography variant='subtitle1'>New Device Default Settings</Typography>
          <Typography variant='body2' color='text.secondary'>These defaults apply to newly created devices only (not name or IP).</Typography>
          <Stack direction='row' spacing={1}>
            <TextField label='Port' value={port ?? ''} onChange={e=>setPort(e.target.value)} size='small' />
            <TextField label='Connection timeout (ms)' value={cto ?? ''} onChange={e=>setCto(e.target.value)} size='small' />
            <TextField label='Connection poll (sec)' value={cpoll ?? ''} onChange={e=>setCpoll(e.target.value)} size='small' />
          </Stack>
          <Stack direction='row' spacing={1}>
            <TextField label='Username' value={username} onChange={e=>setUsername(e.target.value)} size='small' sx={{flex:1}} />
            <TextField label='Password' value={password} onChange={e=>setPassword(e.target.value)} size='small' sx={{flex:1}} />
          </Stack>
          <Stack direction='row' spacing={1}>
            <TextField label='Public Key Path' value={publicKeyPath} onChange={e=>setPublicKeyPath(e.target.value)} size='small' sx={{flex:1}} />
            <TextField label='Private Key Path' value={privateKeyPath} onChange={e=>setPrivateKeyPath(e.target.value)} size='small' sx={{flex:1}} />
          </Stack>
          <TextField label='Passphrase' value={passphrase} onChange={e=>setPassphrase(e.target.value)} size='small' />

          <Divider />

          <Typography variant='subtitle1'>New Script Default Settings</Typography>
          <Typography variant='body2' color='text.secondary'>MatrixKB RestMon path and default for Generic scripts (for now Generic defaults to MatrixKB path).</Typography>
          <TextField label='MatrixKB RestMon Script Path' value={matrixPath} onChange={e=>setMatrixPath(e.target.value)} size='small' />
          <TextField label='Generic Script Path' value={genericPath} onChange={e=>setGenericPath(e.target.value)} size='small' />
          <FormControlLabel control={<Checkbox checked={isRestmonDefault} onChange={e=>setIsRestmonDefault(e.target.checked)} />} label="Default to RestMon Script" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancelClick}>Cancel</Button>
        <Button onClick={discardAndClose}>Discard Changes</Button>
        <Button variant='contained' onClick={save}>Save Changes</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={confirmOpen} onClose={()=>setConfirmOpen(false)}>
      <DialogTitle>Unsaved changes</DialogTitle>
      <DialogContent>
        <Typography>You have unsaved changes in settings. What would you like to do?</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setConfirmOpen(false)}>Cancel</Button>
        <Button color='error' onClick={discardAndClose}>Discard Changes</Button>
        <Button variant='contained' onClick={save}>Save Changes</Button>
      </DialogActions>
    </Dialog>
    </>
  )
}
