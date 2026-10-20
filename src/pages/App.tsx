
import React, { useState, useMemo } from 'react'
import { Box, Button, Chip, Stack, Typography, TextField, FormControlLabel, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, IconButton, Snackbar, Alert, Tooltip, Tabs, Tab } from '@mui/material'
import Viewer from './Viewer'
import DeviceList from '../components/DeviceList'
import ScriptList from '../components/ScriptList'
import ScriptForm from '../components/ScriptForm'
import DeviceForm from '../components/DeviceForm'
import { useAppDispatch, useAppSelector } from '../store/store'
import { parseFBCSKM } from '../store/fbcskmSlice'

import ErrorBoundary from '../components/ErrorBoundary'
import SettingsDialog from '../components/SettingsDialog'
import HelpDialog from '../components/HelpDialog'
import AgenticScriptPanel from '../components/AgenticScriptPanel'
import ExecutionHostsView from '../components/ExecutionHostsView'
import AppShell, { AppView } from '../components/AppShell'
import BrandHeader from '../components/BrandHeader'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SaveIcon from '@mui/icons-material/Save'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import OpenInBrowserIcon from '@mui/icons-material/OpenInBrowser'
import LaunchIcon from '@mui/icons-material/Launch'
import CloseIcon from '@mui/icons-material/Close'
import DnsIcon from '@mui/icons-material/Dns'
import DataObjectIcon from '@mui/icons-material/DataObject'

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
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false)
  const [deviceFormOpen, setDeviceFormOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [showDisabled, setShowDisabled] = useState(false)
  const [view, setView] = useState<AppView>('editor')
  const [editorTab, setEditorTab] = useState<'manage' | 'raw'>('manage')

  const [toast, setToast] = useState<{ id: number; message: string; severity: 'success' | 'warning' } | null>(null)
  const showToast = (message: string, severity: 'success' | 'warning') => setToast({ id: Date.now(), message, severity })

  // Resizable split between Devices and Scripts panes
  const [devicePanePct, setDevicePanePct] = useState(() => {
    const stored = Number(window.localStorage.getItem('mx-rma-device-pane-pct'))
    return stored >= 15 && stored <= 70 ? stored : 30
  })
  const splitRef = React.useRef<HTMLDivElement | null>(null)
  const devicePanePctRef = React.useRef(devicePanePct)
  const resizingRef = React.useRef(false)
  React.useEffect(() => { devicePanePctRef.current = devicePanePct }, [devicePanePct])
  React.useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!resizingRef.current || !splitRef.current) return
      const rect = splitRef.current.getBoundingClientRect()
      const pct = ((event.clientX - rect.left) / rect.width) * 100
      setDevicePanePct(Math.min(70, Math.max(15, pct)))
    }
    const onUp = () => {
      if (!resizingRef.current) return
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.localStorage.setItem('mx-rma-device-pane-pct', String(Math.round(devicePanePctRef.current)))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])
  const startResize = (event: React.MouseEvent) => {
    event.preventDefault()
    resizingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Unsaved changes dialog state
  const [unsavedOpen, setUnsavedOpen] = useState(false)
  const unsavedActionRef = React.useRef<(() => void) | null>(null)
  const currentUnsavedTargetRef = React.useRef<{ type: 'device' | 'script' | 'closeDeviceForm' | 'closeScriptEditor', payload?: any } | null>(null)

  // Search state
  const [searchText, setSearchText] = useState('')
  const [searchInScripts, setSearchInScripts] = useState(true) // default checked

  const devices = useAppSelector(s => s.fbcskm.devices)
  const isDirty = useAppSelector(s => s.fbcskm.dirty)
  const aiModels = useAppSelector(s => s.fbcskm.aiModels)
  const systemPrompts = useAppSelector(s => s.fbcskm.systemPrompts)
  const activeSystemPromptId = useAppSelector(s => s.fbcskm.activeSystemPromptId)

  const [loadUnsavedOpen, setLoadUnsavedOpen] = useState(false)

  const dispatch = useAppDispatch()
  // Parse raw text into the store whenever the raw text itself changes.
  // This must live in App (which never unmounts): if it lived in Viewer, it
  // would re-run on every mount and wipe in-memory changes (e.g. a script
  // just added by the agentic panel) because parseFBCSKM rebuilds devices
  // from the raw text.
  React.useEffect(() => {
    if (raw && raw.trim().length > 0) dispatch(parseFBCSKM(raw))
  }, [raw])
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

  const saveConfigFile = async (targetPath: string) => {
    try {
      const { store } = await import('../store/store')
      const { serializeDevicesWithComments } = await import('../services/serializer')
      const text = serializeDevicesWithComments(store.getState().fbcskm.devices, store.getState().fbcskm.originalLines)
      const maxBackups = store.getState().fbcskm.defaultScriptSettings?.maxBackups ?? 10
      await window.electronAPI.writeFile(targetPath, text, { maxBackups })
      const { setDirty } = await import('../store/fbcskmSlice')
      store.dispatch(setDirty(false))
      showToast('Configuration saved successfully', 'success')
    } catch (error) {
      console.error('Failed to save configuration', error)
      showToast('Failed to save configuration', 'warning')
      throw error
    }
  }

  const onSave = async () => {
    if (!filePath) return
    if (!window.electronAPI) { showToast('Save not available in browser mode. Use Save As.', 'warning'); return }
    try { await saveConfigFile(filePath) } catch { /* toast already shown */ }
  }

  const onSaveAs = async () => {
    const suggested = filePath || 'config.txt'
    const saveTo = await window.electronAPI.saveFile(suggested)
    if (!saveTo) return
    try { await saveConfigFile(saveTo) } catch { /* toast already shown */ }
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

    const proceed = () => { setSelectedDeviceId(id); setSelectedScriptId(null); setScriptEditorOpen(false) }

    // If a script is being edited and dirty, prompt first
    if (scriptEditorOpen && scriptFormRef.current && scriptFormRef.current.isDirty && scriptFormRef.current.isDirty()) {
      dirtyFormTypeRef.current = 'script'
      currentUnsavedTargetRef.current = { type: 'device', payload: { id } }
      unsavedActionRef.current = proceed
      setUnsavedOpen(true)
      return
    }

    // If device form is open and dirty, prompt
    if (deviceFormOpen && deviceFormRef.current && deviceFormRef.current.isDirty && deviceFormRef.current.isDirty()) {
      dirtyFormTypeRef.current = 'device'
      currentUnsavedTargetRef.current = { type: 'device', payload: { id } }
      unsavedActionRef.current = proceed
      setUnsavedOpen(true)
      return
    }

    // No dirty state, proceed
    proceed()
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
    if (scriptId === selectedScriptId) { setSelectedScriptId(scriptId); if (scriptId) setScriptEditorOpen(true); return }

    const proceed = () => {
      if (deviceId) setSelectedDeviceId(deviceId)
      setSelectedScriptId(scriptId)
      setScriptEditorOpen(Boolean(scriptId))
    }

    if (scriptEditorOpen && scriptFormRef.current && scriptFormRef.current.isDirty && scriptFormRef.current.isDirty()) {
      dirtyFormTypeRef.current = 'script'
      currentUnsavedTargetRef.current = { type: 'script', payload: { scriptId, deviceId } }
      unsavedActionRef.current = proceed
      setUnsavedOpen(true)
      return
    }

    proceed()
  }

  const handleScriptEditorClose = () => {
    if (scriptFormRef.current && scriptFormRef.current.isDirty && scriptFormRef.current.isDirty()) {
      dirtyFormTypeRef.current = 'script'
      currentUnsavedTargetRef.current = { type: 'closeScriptEditor' }
      unsavedActionRef.current = () => { setScriptEditorOpen(false); setSelectedScriptId(null) }
      setUnsavedOpen(true)
      return
    }
    setScriptEditorOpen(false)
    setSelectedScriptId(null)
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

  const selectedDevice = devices.find(x => x.id === selectedDeviceId) || null
  const selectedScript = selectedDevice?.scripts.find(x => x.id === selectedScriptId) || null

  const appContent = (
    <AppShell
      view={view}
      onViewChange={setView}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenHelp={() => setHelpOpen(true)}
      electronAction={window.electronAPI?.isElectron ? (
        <Tooltip title='Open in Browser' placement='right'>
          <IconButton size='small' onClick={() => window.electronAPI.openExternal?.('http://localhost:5173')} aria-label='open in browser'>
            <OpenInBrowserIcon fontSize='small' />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title='Open in Electron client' placement='right'>
          <IconButton size='small' color='primary' onClick={async () => { if (window.electronAPI?.openInElectron) { await window.electronAPI.openInElectron() } }} aria-label='open in electron client'>
            <LaunchIcon fontSize='small' />
          </IconButton>
        </Tooltip>
      )}
    >
      {view === 'hosts' ? (
        <Stack spacing={2}>
          <BrandHeader compact />
          <ExecutionHostsView devices={devices} />
        </Stack>
      ) : view === 'agentic' ? (
        <Stack spacing={2}>
          <BrandHeader compact />
          <AgenticScriptPanel
            models={aiModels}
            prompts={systemPrompts}
            activePromptId={activeSystemPromptId}
            defaultDeviceId={selectedDeviceId}
            onAddToConfig={(deviceId, scriptId) => {
              setSearchText('')
              setView('editor')
              setSelectedDeviceId(deviceId)
              setSelectedScriptId(scriptId)
              setScriptEditorOpen(true)
            }}
          />
        </Stack>
      ) : (
      <Stack spacing={2}>
          <BrandHeader />

        <Stack direction='row' spacing={1} alignItems='center' sx={{ flexWrap: 'wrap' }}>
          <Tooltip title='Load Configuration File'>
            <IconButton color='primary' onClick={openFile} aria-label='load configuration file'>
              <FolderOpenIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title='Save'>
            <span>
              <IconButton onClick={onSave} disabled={!filePath} aria-label='save'>
                <SaveIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title='Save As'>
            <IconButton onClick={onSaveAs} aria-label='save as'>
              <SaveAltIcon />
            </IconButton>
          </Tooltip>
          {isDirty && <Chip label='Unsaved Changes' color='error' size='small' />}
          {filePath && <Typography sx={{ ml: 1 }} variant='body2' color='text.secondary' component='span'>{filePath}</Typography>}
        </Stack>

        <Tabs value={editorTab} onChange={(_, value) => setEditorTab(value)} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab value='manage' icon={<DnsIcon fontSize='small' />} iconPosition='start' label='Devices & Scripts' />
          <Tab value='raw' icon={<DataObjectIcon fontSize='small' />} iconPosition='start' label='Raw Configuration' />
        </Tabs>

        {editorTab === 'raw' ? (
          <Viewer raw={raw} onRawChange={(t: string) => { setRaw(t); /* mark dirty when raw edited */ (async () => { const { setDirty } = await import('../store/fbcskmSlice'); const { store } = await import('../store/store'); store.dispatch(setDirty(true)) })() }} />
        ) : (
        <>
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
                    <CloseIcon fontSize='small' />
                  </IconButton>
                </InputAdornment>
              ) : undefined
            }}
          />
          <FormControlLabel control={<Checkbox size='small' checked={searchInScripts} onChange={e => setSearchInScripts(e.target.checked)} />} label='Include scripts' />
        </Stack>

        {/* Search results counts */}
        <Typography variant='body2' color='text.secondary'>Devices found: <strong>{devicesCount}</strong> • Scripts: <strong>{scriptsCount}</strong></Typography>

        {/* One clean device list — scripts shown on selection */}
        <Box ref={splitRef} sx={{ display: 'flex', alignItems: 'stretch', width: '100%' }}>
          <Box sx={{ width: `calc(${devicePanePct}% - 3px)`, minWidth: 0, display: 'flex' }}>
            <DeviceList devices={displayDevices} fullDevices={devices} selectedId={selectedDeviceId} onSelect={(id: any) => requestSelectDevice(id)} onRequestEdit={(id) => { requestSelectDevice(id); setDeviceFormOpen(true) }} onPasteScript={(deviceId) => onPasteScriptToDevice(deviceId)} clipboard={clipboard} showDisabled={showDisabled} onToggleShowDisabled={() => setShowDisabled(!showDisabled)} />
          </Box>
          <Box
            onMouseDown={startResize}
            role='separator'
            aria-orientation='vertical'
            title='Drag to resize'
            sx={{
              width: 6,
              flexShrink: 0,
              cursor: 'col-resize',
              position: 'relative',
              '&::after': { content: '""', position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', transform: 'translateX(-50%)', backgroundColor: 'divider' },
              '&:hover::after': { width: '3px', backgroundColor: 'primary.main' },
              '&:active::after': { width: '3px', backgroundColor: 'primary.main' },
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
            <ScriptList deviceId={selectedDeviceId} selectedId={selectedScriptId} searchText={searchText} searchInScripts={searchInScripts} onSelect={(id: any) => requestSelectScript(id, selectedDeviceId)} onRequestEdit={(scriptId, deviceId) => { requestSelectScript(scriptId, deviceId) }} onSelectScript={(scriptId, deviceId) => { requestSelectScript(scriptId, deviceId) }} onCopyScript={onCopyScript} onCutScript={onCutScript} />
          </Box>
        </Box>
        </>
        )}

        {selectedDevice && selectedScript && (
          <ScriptForm
            ref={scriptFormRef}
            open={scriptEditorOpen}
            device={selectedDevice}
            script={selectedScript}
            onChange={() => { }}
            onClose={handleScriptEditorClose}
          />
        )}

        <DeviceForm ref={deviceFormRef} open={deviceFormOpen} device={selectedDevice} onClose={handleDeviceFormClose} />

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

        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={showToast} />
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
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
              await saveConfigFile(p)
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
              await saveConfigFile(saveTo)
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

        <Snackbar
          key={toast?.id}
          open={Boolean(toast)}
          autoHideDuration={2000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setToast(null)}
            severity={toast?.severity || 'success'}
            variant='filled'
            sx={{ py: 0.5, px: 1.5, fontSize: '0.875rem', alignItems: 'center' }}
          >
            {toast?.message || ''}
          </Alert>
        </Snackbar>

      </Stack>
      )}
    </AppShell>
  )

  return (
    <ErrorBoundary>
      {appContent}
    </ErrorBoundary>
  )
}
