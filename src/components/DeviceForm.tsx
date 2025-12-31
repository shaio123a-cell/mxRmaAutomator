
import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef
} from 'react'
import { Drawer, Box, Stack, Typography, TextField, Button, Grid } from '@mui/material'
import { Device, updateDevice } from '../store/fbcskmSlice'
import { useAppDispatch } from '../store/store'

interface Props {
  open: boolean
  device?: Device | null
  onClose: () => void
}

export type DeviceFormHandle = {
  isDirty: () => boolean
  save: (closeAfter?: boolean) => boolean | Promise<boolean>
  discard: () => void
}

export default forwardRef<DeviceFormHandle, Props>(function DeviceForm({ open, device, onClose }, ref) {
  const dispatch = useAppDispatch()

  // Keep an original snapshot for consistent dirty checks
  const originalRef = useRef<Device | null>(device ?? null)

  // Local draft
  const [draft, setDraft] = useState<Device | null>(device ?? null)

  // Reset draft (and original snapshot) only when switching devices by id
  useEffect(() => {
    originalRef.current = device ?? null
    setDraft(device ?? null)
  }, [device?.id])

  const set = <K extends keyof Device>(key: K, value: Device[K]) => {
    if (!draft) return
    setDraft({ ...draft, [key]: value })
  }

  const buildPayload = (d: Device): Device => {
    const withDefaults: Device = {
      ...d,
      port: d.port ?? 5985,
      connectionTimeoutMs: d.connectionTimeoutMs ?? 2000,
      connectionPollSec: d.connectionPollSec ?? 60
    }

    // Ensure we do not mutate nested scripts
    const scripts = Array.isArray(withDefaults.scripts)
      ? withDefaults.scripts.map(s => ({ ...s, dirty: false }))
      : []

    // Typically after a successful save, "dirty" should be false on the device too
    return { ...withDefaults, scripts, dirty: false }
  }

  const validate = (d: Device | null): d is Device => {
    if (!d) return false
    if (!d.name || !d.name.trim()) {
      alert('Device Name/IP is required')
      return false
    }
    return true
  }

  const saveInternal = (closeAfter: boolean = true): boolean => {
    if (!validate(draft)) return false

    // Build a clean, immutable payload
    const payload = buildPayload(draft!)

    // Update local draft to match what we send
    setDraft(payload)

    // Dispatch update (if updateDevice is a thunk that returns a promise, you can await)
    // If it's sync, this will just run and we can close immediately.
    // @ts-ignore—if updateDevice returns a promise you can remove this ignore and `await` it
    const result = dispatch(updateDevice(payload))

    // If you need to await thunk:
    // await dispatch(updateDevice(payload)).unwrap()

    if (closeAfter) {
      onClose() // Close immediately—do NOT wait for prop change
    }

    // Refresh the original snapshot so isDirty() becomes false after save
    originalRef.current = payload
    return true
  }

  const isDirty = (): boolean => {
    // Safe, pragmatic deep compare; consider a deepEqual lib for production
    return JSON.stringify(draft) !== JSON.stringify(originalRef.current)
  }

  useImperativeHandle(ref, () => ({
    isDirty,
    save: (closeAfter: boolean = true) => saveInternal(closeAfter),
    discard: () => {
      setDraft(originalRef.current ?? null)
    }
  }), [draft])

  const save = () => { saveInternal(true) }

  return (
    <Drawer anchor='right' open={open} onClose={onClose}>
      <Box sx={{ width: 520, p: 3 }}>
        <Typography variant='h6'>Device Form</Typography>

        {!draft ? (
          <Typography color='text.secondary'>Select a device to edit.</Typography>
        ) : (
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label='Device Name/IP'
                  fullWidth
                  value={draft.name || ''}
                  onChange={e => set('name', e.target.value)}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label='Forced IP Address'
                  fullWidth
                  value={draft.forcedIp || ''}
                  onChange={e => set('forcedIp', e.target.value)}
                />
              </Grid>

              <Grid item xs={6}>
                <TextField
                  label='Port'
                  type='number'
                  fullWidth
                  value={draft.port ?? 5985}
                  onChange={e => set('port', Number(e.target.value))}
                />
              </Grid>

              <Grid item xs={6}>
                <TextField
                  label='Connection timeout (ms)'
                  type='number'
                  fullWidth
                  value={draft.connectionTimeoutMs ?? 2000}
                  onChange={e => set('connectionTimeoutMs', Number(e.target.value))}
                />
              </Grid>

              <Grid item xs={6}>
                <TextField
                  label='Connection poll interval (sec)'
                  type='number'
                  fullWidth
                  value={draft.connectionPollSec ?? 60}
                  onChange={e => set('connectionPollSec', Number(e.target.value))}
                />
              </Grid>

              <Grid item xs={6} />

              <Grid item xs={6}>
                <TextField
                  label='Username'
                  fullWidth
                  value={draft.username || ''}
                  onChange={e => set('username', e.target.value)}
                />
              </Grid>

              <Grid item xs={6}>
                <TextField
                  label='Password'
                  type='password'
                  fullWidth
                  value={draft.password || ''}
                  onChange={e => set('password', e.target.value)}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label='Public Key Path'
                  fullWidth
                  value={draft.publicKeyPath || ''}
                  onChange={e => set('publicKeyPath', e.target.value)}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label='Private Key Path'
                  fullWidth
                  value={draft.privateKeyPath || ''}
                  onChange={e => set('privateKeyPath', e.target.value)}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label='Passphrase'
                  type='password'
                  fullWidth
                  value={draft.passphrase || ''}
                  onChange={e => set('passphrase', e.target.value)}
                />
              </Grid>
            </Grid>

            <Stack direction='row' spacing={1}>
              <Button onClick={onClose}>Cancel</Button>
              <Button
                variant='contained'
                onClick={save}
                disabled={!isDirty()}
              >
                Save Device
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Drawer>
  )
})
