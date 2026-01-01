
import React, { useState, useMemo } from 'react'
import { Box, Button, Stack, Typography, TextField, FormControlLabel, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, IconButton, Snackbar } from '@mui/material'
import Viewer from './Viewer'
import DeviceList from '../components/DeviceList'
import ScriptList from '../components/ScriptList'
import ScriptForm from '../components/ScriptForm'
import DeviceForm from '../components/DeviceForm'
import { useAppSelector } from '../store/store'

declare global {
  interface Window {
    electronAPI: {
      openFile: (filter?: any) => Promise<string | null>
      saveFile: (suggested: string) => Promise<string | null>
      readFile: (filePath: string) => Promise<string>
      writeFile: (filePath: string, content: string, options?: { maxBackups?: number }) => Promise<boolean>
      rotateBackups: (filePath: string) => Promise<boolean>
      openInElectron?: () => Promise<void>
      openExternal?: (url: string) => Promise<void>
      isElectron?: boolean
    }
  }
}

import ErrorBoundary from '../components/ErrorBoundary'
import SettingsDialog from '../components/SettingsDialog'
import SettingsIcon from '@mui/icons-material/Settings'

// Logos
import BMCHelixLogo from '../../logo/BMCHelix Logo Medium Transparent.png'
import MatrixLogo from '../../logo/Matrix-Logo-Flat.png'
import MatrixKBLogo from '../../logo/MatrixKB for BMC Helix.png'

export default function App() {
  // Global error logging to help capture runtime issues in dev
  React.useEffect(() => {
    const onErr = (ev: any) => { console.error('window.onerror', ev) }
    const onRej = (ev: any) => { console.error('unhandledrejection', ev) }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej) }
  }, [])

  const [filePath, setFilePath] = useState<string | null>(null)
  const [raw, setRaw] = useState<string>('')
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null)
  const [deviceFormOpen, setDeviceFormOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showDisabled, setShowDisabled] = useState(false)

  // Unsaved changes dialog state
  const [unsavedOpen, setUnsavedOpen] = useState(false)
  const unsavedActionRef = React.useRef<() => void | null>(null)
  const currentUnsavedTargetRef = React.useRef<{ type: 'device' | 'script' | 'closeDeviceForm', payload?: any } | null>(null)

  // Search state
  const [searchText, setSearchText] = useState('')
  const [searchInScripts, setSearchInScripts] = useState(true) // default checked

  const devices = useAppSelector(s => s.fbcskm.devices)

  const [loadUnsavedOpen, setLoadUnsavedOpen] = useState(false)
  const loadPendingPathRef = React.useRef<string | null>(null)

  const openFile = async () => {
    const p = await window.electronAPI.openFile()
    if (!p) return

    // If there are unsaved changes, prompt first
    const state = (await import('../store/store')).store.getState()
    if (state.fbcskm.dirty) {
      loadPendingPathRef.current = p
      setLoadUnsavedOpen(true)
      return
    }

    const txt = await window.electronAPI.readFile(p)
    setFilePath(p)
    setRaw(txt)
  }

  const filteredDevices = useMemo(() => {
    const q = (searchText || '').trim().toLowerCase()
    if (!q) return devices
    return devices.map(d => {
      const nameMatch = (d.name || '').toLowerCase().includes(q)
      let scriptMatches = 0
      if (searchInScripts) {
        // Helper to extract all values recursively
        const getAllValues = (obj: any): string => {
          if (obj === null || obj === undefined) return ''
          if (typeof obj !== 'object') return String(obj)
          return Object.values(obj).map(getAllValues).join(' ')
        }

        for (const s of d.scripts || []) {
          // Search only within values, ignoring keys
          if (getAllValues(s).toLowerCase().includes(q)) {
            scriptMatches++
          }
        }
      }
      const matches = nameMatch || scriptMatches > 0
      if (matches) {
        return { ...d, matchingScriptsCount: nameMatch ? d.scripts.length : scriptMatches }
      }
      return null
    }).filter(Boolean) as typeof devices
  }, [devices, searchText, searchInScripts])

  const displayDevices = useMemo(() => {
    return filteredDevices.filter(d => showDisabled || !d.disabled)
  }, [filteredDevices, showDisabled])

  // Counts to show under search box
  const devicesCount = displayDevices.length
  const scriptsCount = displayDevices.reduce((acc, d) => {
    // If we have a calculated matching count from the filter step, use it.
    // Otherwise (no search text), use total scripts length.
    if (typeof (d as any).matchingScriptsCount === 'number') {
      return acc + (d as any).matchingScriptsCount
    }
    return acc + (d.scripts?.length || 0)
  }, 0)

  // Refs to forms to check dirty state and call save/discard programmatically
  const scriptFormRef = React.useRef<any>(null)
  const deviceFormRef = React.useRef<any>(null)
  const dirtyFormTypeRef = React.useRef<'script' | 'device' | null>(null)

  // clipboard for script copy/cut
  const [clipboard, setClipboardLocal] = useState<any | null>(null)
  const setClipboard = (cb: any | null) => { setClipboardLocal(cb); (async () => { try { const { setClipboard } = await import('../store/fbcskmSlice'); const { store } = await import('../store/store'); store.dispatch(setClipboard(cb)); console.log('store clipboard set', cb) } catch (err) { console.error('setClipboard dispatch failed', err) } })() }

  const [clipMsg, setClipMsg] = useState<string | null>(null)

  const onCopyScript = (scriptId: string, deviceId: string) => {
    const d = devices.find(x => x.id === deviceId)
    if (!d) return
    const s = d.scripts.find(x => x.id === scriptId)
    if (!s) return
    setClipboard({ type: 'script', script: s, fromDeviceId: deviceId, cut: false })
    setClipMsg('Copied script to clipboard')
  }

  const onCutScript = (scriptId: string, deviceId: string) => {
    const d = devices.find(x => x.id === deviceId)
    if (!d) return
    const s = d.scripts.find(x => x.id === scriptId)
    if (!s) return
    setClipboard({ type: 'script', script: s, fromDeviceId: deviceId, cut: true })
    setClipMsg('Cut script to clipboard')
  }

  const onPasteScriptToDevice = async (targetDeviceId: string) => {
    if (!clipboard || clipboard.type !== 'script') { setClipMsg('Nothing to paste'); return }
    console.log('Pasting script to', targetDeviceId, 'clipboard:', clipboard)

    try {
      const { v4: uuidv4 } = (await import('uuid')) as any
      const newScript = { ...clipboard.script, id: uuidv4() }
      const sliceMod = await import('../store/fbcskmSlice')
      const storeMod = await import('../store/store')
      const addScript = sliceMod.addScript
      const deleteScript = sliceMod.deleteScript
      const store = storeMod.store

      store.dispatch(addScript({ deviceId: targetDeviceId, script: newScript }))
      // if it was a cut, delete original only after successful paste
      if (clipboard.cut && clipboard.fromDeviceId && clipboard.script?.id) {
        store.dispatch(deleteScript({ deviceId: clipboard.fromDeviceId, scriptId: clipboard.script.id }))
      }
      // clear clipboard only if this was a cut; copies are preserved to allow multiple pastes
      if (clipboard.cut) setClipboard(null)
      setClipMsg('Pasted script')
    } catch (err) {
      console.error('Paste failed', err)
      setClipMsg('Paste failed')
    }
  }
  const requestSelectDevice = (id: string | null) => {
    // If switching to same device, allow
    if (id === selectedDeviceId) { setSelectedDeviceId(id); return }

    // If a script is being edited and dirty, prompt first
    if (selectedScriptId && scriptFormRef.current && scriptFormRef.current.isDirty && scriptFormRef.current.isDirty()) {
      dirtyFormTypeRef.current = 'script'
      currentUnsavedTargetRef.current = { type: 'device', payload: { id } }
      unsavedActionRef.current = () => { setSelectedDeviceId(id); setSelectedScriptId(null) }
      setUnsavedOpen(true)
      return
    }

    // If device form is open and dirty, prompt
    if (deviceFormOpen && deviceFormRef.current && deviceFormRef.current.isDirty && deviceFormRef.current.isDirty()) {
      dirtyFormTypeRef.current = 'device'
      currentUnsavedTargetRef.current = { type: 'device', payload: { id } }
      unsavedActionRef.current = () => { setSelectedDeviceId(id); setSelectedScriptId(null) }
      setUnsavedOpen(true)
      return
    }

    // No dirty state, proceed
    setSelectedDeviceId(id)
    setSelectedScriptId(null)
  }

  const requestOpenDeviceForm = (id: string | null) => {
    // Selecting a device and opening its form — guard as above
    if (id !== selectedDeviceId) {
      requestSelectDevice(id)
      // If there were no dirty blockers then the selection happened and we can open immediately
      if (!unsavedOpen) setDeviceFormOpen(true)
    } else {
      // same device - just open
      setDeviceFormOpen(true)
    }
  }

  const requestSelectScript = (scriptId: string | null, deviceId?: string | null) => {
    // If selecting same script, nothing
    if (scriptId === selectedScriptId) { setSelectedScriptId(scriptId); return }

    if (scriptFormRef.current && scriptFormRef.current.isDirty && scriptFormRef.current.isDirty()) {
      dirtyFormTypeRef.current = 'script'
      currentUnsavedTargetRef.current = { type: 'script', payload: { scriptId, deviceId } }
      unsavedActionRef.current = () => { if (deviceId) setSelectedDeviceId(deviceId); setSelectedScriptId(scriptId) }
      setUnsavedOpen(true)
      return
    }

    setSelectedDeviceId(deviceId || null)
    setSelectedScriptId(scriptId)
  }

  const handleDeviceFormClose = () => {
    if (deviceFormRef.current && deviceFormRef.current.isDirty && deviceFormRef.current.isDirty()) {
      dirtyFormTypeRef.current = 'device'
      currentUnsavedTargetRef.current = { type: 'closeDeviceForm' }
      unsavedActionRef.current = () => setDeviceFormOpen(false)
      setUnsavedOpen(true)
      return
    }
    setDeviceFormOpen(false)
  }

  const handleUnsavedSave = () => {
    // First save programmatically (device save avoids auto-close to prevent re-check loops)
    if (dirtyFormTypeRef.current === 'script' && scriptFormRef.current && scriptFormRef.current.save) {
      scriptFormRef.current.save()
    } else if (dirtyFormTypeRef.current === 'device' && deviceFormRef.current && deviceFormRef.current.save) {
      // pass false to avoid calling onClose inside the device form which would re-trigger the unsaved check
      deviceFormRef.current.save(false)
    }

    // then perform pending action (select / close)
    if (unsavedActionRef.current) { unsavedActionRef.current(); unsavedActionRef.current = null }

    // finally close dialog and clear refs
    setUnsavedOpen(false)
    dirtyFormTypeRef.current = null
    currentUnsavedTargetRef.current = null
  }

  const handleUnsavedDiscard = () => {
    setUnsavedOpen(false)
    if (dirtyFormTypeRef.current === 'script' && scriptFormRef.current && scriptFormRef.current.discard) {
      scriptFormRef.current.discard()
    } else if (dirtyFormTypeRef.current === 'device' && deviceFormRef.current && deviceFormRef.current.discard) {
      deviceFormRef.current.discard()
    }
    if (unsavedActionRef.current) { unsavedActionRef.current(); unsavedActionRef.current = null }
    dirtyFormTypeRef.current = null
    currentUnsavedTargetRef.current = null
  }

  const handleUnsavedCancel = () => {
    setUnsavedOpen(false)
    unsavedActionRef.current = null
    currentUnsavedTargetRef.current = null
    dirtyFormTypeRef.current = null
  }

  return (
    <ErrorBoundary>
      <Stack spacing={2} sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'stretch', width: '100%' }}>
          <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
            <img src={MatrixKBLogo} alt="MatrixKB for BMC Helix" style={{ height: 56 }} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Typography variant='h4'>PATROL Scripting KM File Based Configuraiton Editor</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <IconButton size='small' aria-label='settings' onClick={() => setSettingsOpen(true)}><SettingsIcon /></IconButton>
              {window.electronAPI?.isElectron ? (
                <Button size='small' variant='outlined' onClick={() => window.electronAPI.openExternal?.('http://localhost:5173')}>Open in Browser</Button>
              ) : (
                <Button size='small' variant='outlined' onClick={async () => { if (window.electronAPI?.openInElectron) { await window.electronAPI.openInElectron() } }}>Open in Electron</Button>
              )}
              <img src={MatrixLogo} alt="Matrix" style={{ height: 30 }} />
              <img src={BMCHelixLogo} alt="BMCHelix" style={{ height: 34, background: 'transparent' }} />
            </Box>
          </Box>
        </Box>

        <Stack direction='row' spacing={1}>
          <Button variant='contained' onClick={openFile}>Load Configuration File</Button>
          <Button variant='outlined' onClick={async () => {
            if (!filePath) return
            if (!window.electronAPI) { alert('Save not available in browser mode. Use Save As.'); return }
            const { store } = await import('../store/store')
            const { serializeDevicesWithComments } = await import('../services/serializer')
            const text = serializeDevicesWithComments(store.getState().fbcskm.devices, store.getState().fbcskm.originalLines)
            const maxBackups = store.getState().fbcskm.defaultScriptSettings?.maxBackups ?? 10
            await window.electronAPI.writeFile(filePath, text, { maxBackups })
            // mark as saved
            const { setDirty } = await import('../store/fbcskmSlice')
            store.dispatch(setDirty(false))
            alert(`Saved with backup rotation (${maxBackups} generations).`)
          }}>Save</Button>
          <Button variant='outlined' onClick={async () => {
            const suggested = filePath || 'config.txt'
            const saveTo = await window.electronAPI.saveFile(suggested)
            if (!saveTo) return
            const { store } = await import('../store/store')
            const { serializeDevicesWithComments } = await import('../services/serializer')
            const text = serializeDevicesWithComments(store.getState().fbcskm.devices, store.getState().fbcskm.originalLines)
            const maxBackups = store.getState().fbcskm.defaultScriptSettings?.maxBackups ?? 10
            await window.electronAPI.writeFile(saveTo, text, { maxBackups })
            // mark as saved
            const { setDirty } = await import('../store/fbcskmSlice')
            store.dispatch(setDirty(false))
            alert('Exported file saved.')
          }}>Save As</Button>
          {filePath && <Typography sx={{ ml: 2 }} component='span'>{filePath}</Typography>}
        </Stack>

        <Viewer raw={raw} onRawChange={(t: string) => { setRaw(t); /* mark dirty when raw edited */ (async () => { const { setDirty } = await import('../store/fbcskmSlice'); const { store } = await import('../store/store'); store.dispatch(setDirty(true)) })() }} />

        {/* Show unsaved indicator when configuration is dirty */}
        {(useAppSelector(s => s.fbcskm.dirty)) && <Typography color='error' sx={{ ml: 1 }}>Unsaved Changes</Typography>}

        {/* Search area */}
        <Stack direction='row' spacing={1} alignItems='center'>
          <TextField
            placeholder='Search devices...'
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            size='small'
            sx={{ minWidth: 300 }}
            InputProps={{
              endAdornment: searchText ? (
                <InputAdornment position='end'>
                  <IconButton size='small' edge='end' aria-label='clear search' onClick={() => setSearchText('')}>
                    ✕
                  </IconButton>
                </InputAdornment>
              ) : undefined
            }}
          />
          <FormControlLabel control={<Checkbox checked={searchInScripts} onChange={e => setSearchInScripts(e.target.checked)} />} label='Include scripts' />
          <Button variant='contained' onClick={() => { /* explicit search button — filtering is live */ }}>Search</Button>
        </Stack>

        {/* Search results counts */}
        <Typography variant='body2' color='text.secondary'>Devices found: <strong>{devicesCount}</strong> • Scripts: <strong>{scriptsCount}</strong></Typography>

        {/* One clean device list — scripts shown on selection */}
        <Stack direction='row' spacing={2}>
          <DeviceList devices={displayDevices} fullDevices={devices} selectedId={selectedDeviceId} onSelect={(id: any) => requestSelectDevice(id)} onRequestEdit={(id) => { requestSelectDevice(id); setDeviceFormOpen(true) }} onPasteScript={(deviceId) => onPasteScriptToDevice(deviceId)} clipboard={clipboard} showDisabled={showDisabled} onToggleShowDisabled={() => setShowDisabled(!showDisabled)} />
          <ScriptList deviceId={selectedDeviceId} selectedId={selectedScriptId} searchText={searchText} searchInScripts={searchInScripts} onSelect={(id: any) => requestSelectScript(id, selectedDeviceId)} onRequestEdit={(scriptId, deviceId) => { requestSelectScript(scriptId, deviceId); }} onSelectScript={(scriptId, deviceId) => { requestSelectScript(scriptId, deviceId) }} onCopyScript={onCopyScript} onCutScript={onCutScript} />
        </Stack>

        {(() => {
          const d = devices.find(x => x.id === selectedDeviceId)
          if (!d) return null
          const s = d.scripts.find(x => x.id === selectedScriptId)
          if (!s) return null
          return <ScriptForm ref={scriptFormRef} device={d} script={s} onChange={() => { }} />
        })()}

        <DeviceForm ref={deviceFormRef} open={deviceFormOpen} device={devices.find(x => x.id === selectedDeviceId) || null} onClose={handleDeviceFormClose} />

        {/* Unsaved changes dialog */}
        <Dialog open={unsavedOpen} onClose={handleUnsavedCancel}>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogContent>
            <Typography>You have unsaved changes. Do you want to save them or discard?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleUnsavedCancel}>Cancel</Button>
            <Button color='error' onClick={handleUnsavedDiscard}>Discard Changes</Button>
            <Button variant='contained' onClick={handleUnsavedSave}>Save Changes</Button>
          </DialogActions>
        </Dialog>

        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {/* Load unsaved changes confirmation dialog for file open */}
        <Dialog open={loadUnsavedOpen} onClose={() => setLoadUnsavedOpen(false)}>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogContent>
            <Typography>You have unsaved changes. What would you like to do before loading a new file?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setLoadUnsavedOpen(false); loadPendingPathRef.current = null }}>Cancel</Button>
            <Button color='error' onClick={async () => {
              // Discard changes and load
              setLoadUnsavedOpen(false)
              const p = loadPendingPathRef.current
              loadPendingPathRef.current = null
              if (!p) return
              const txt = await window.electronAPI.readFile(p)
              setFilePath(p)
              setRaw(txt)
            }}>Discard Changes</Button>
            <Button onClick={async () => {
              // Save in place
              const p = loadPendingPathRef.current
              if (!p) return
              const { store } = await import('../store/store')
              const { serializeDevicesWithComments } = await import('../services/serializer')
              const text = serializeDevicesWithComments(store.getState().fbcskm.devices, store.getState().fbcskm.originalLines)
              const maxBackups = store.getState().fbcskm.defaultScriptSettings?.maxBackups ?? 10
              await window.electronAPI.writeFile(p, text, { maxBackups })
              const { setDirty } = await import('../store/fbcskmSlice')
              store.dispatch(setDirty(false))
              setLoadUnsavedOpen(false)
              const txt = await window.electronAPI.readFile(p)
              setFilePath(p)
              setRaw(txt)
              loadPendingPathRef.current = null
            }}>Save in place</Button>
            <Button variant='contained' onClick={async () => {
              // Export (save as) then load
              const p = loadPendingPathRef.current
              if (!p) return
              const suggested = filePath || 'config.txt'
              const saveTo = await window.electronAPI.saveFile(suggested)
              if (!saveTo) return
              const { store } = await import('../store/store')
              const { serializeDevicesWithComments } = await import('../services/serializer')
              const text = serializeDevicesWithComments(store.getState().fbcskm.devices, store.getState().fbcskm.originalLines)
              const maxBackups = store.getState().fbcskm.defaultScriptSettings?.maxBackups ?? 10
              await window.electronAPI.writeFile(saveTo, text, { maxBackups })
              const { setDirty } = await import('../store/fbcskmSlice')
              store.dispatch(setDirty(false))
              setLoadUnsavedOpen(false)
              const txt = await window.electronAPI.readFile(p)
              setFilePath(p)
              setRaw(txt)
              loadPendingPathRef.current = null
            }}>Export</Button>
          </DialogActions>
        </Dialog>

        {/* Snack for clipboard actions */}
        <Snackbar open={Boolean(clipMsg)} autoHideDuration={2000} onClose={() => setClipMsg(null)} message={clipMsg || ''} />

      </Stack>
    </ErrorBoundary>
  )
}
