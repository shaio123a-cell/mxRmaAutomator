
import React, { useState, useEffect } from 'react'
import { Button, Box, List, ListItem, ListItemButton, ListItemText, Stack, TextField, Typography, IconButton, Menu, MenuItem, FormControlLabel, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import EditIcon from '@mui/icons-material/Edit'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { useAppDispatch, useAppSelector } from '../store/store'
import { addScript, deleteScript, reorderScripts } from '../store/fbcskmSlice'
import { v4 as uuid } from 'uuid'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableScriptItem({ s, idx, isSelected, onSelect, onSelectScript, dev, openMenu }: { s: any, idx: number, isSelected: boolean, onSelect: (id: string | null) => void, onSelectScript?: (id: string, deviceId: string) => void, dev: any, openMenu: (e: React.MouseEvent<HTMLElement>, id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <ListItem ref={setNodeRef} style={style} secondaryAction={
      <IconButton edge='end' onClick={(e) => openMenu(e, s.id)} aria-label='actions' size='small' sx={{ color: isSelected ? '#fff' : undefined }}>
        <MoreVertIcon />
      </IconButton>
    } sx={{ backgroundColor: isSelected ? '#0b3d91' : (idx % 2 === 1 ? 'rgba(11,61,145,0.08)' : 'transparent') }}>
      <IconButton {...attributes} {...listeners} size='small' sx={{ mr: 1, cursor: 'grab' }}>
        <DragIndicatorIcon />
      </IconButton>
      <ListItemButton
        selected={isSelected}
        onClick={() => { if (onSelectScript) onSelectScript(s.id, dev.id); else onSelect(s.id) }}
        sx={{ py: 0.5, color: isSelected ? '#fff' : undefined, flex: 1 }}
      >
        <ListItemText primary={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {s.dirty && <EditIcon sx={{ mr: 1, fontSize: 16, color: '#4a148c' }} />}
            {s.instanceName}
          </Box>
        } secondary={`${s.args.method || 'GET'} ${s.args.outputFormat || 'json'}`} sx={{ '& .MuiListItemText-primary': { color: isSelected ? '#fff' : 'inherit' }, '& .MuiListItemText-secondary': { color: isSelected ? '#fff' : 'inherit' } }} />
      </ListItemButton>
    </ListItem>
  )
}

export default function ScriptList({ deviceId, selectedId, onSelect, onRequestEdit, onSelectScript, searchText, searchInScripts, onCopyScript, onCutScript }: { deviceId?: string | null, selectedId?: string | null, onSelect: (id: string | null) => void, onRequestEdit?: (id: string, deviceId: string) => void, onSelectScript?: (id: string, deviceId: string) => void, searchText?: string, searchInScripts?: boolean, onCopyScript?: (id: string, deviceId: string) => void, onCutScript?: (id: string, deviceId: string) => void }) {
  const dispatch = useAppDispatch()
  const dev = useAppSelector(s => s.fbcskm.devices.find(d => d.id === deviceId))
  const q = (searchText || '').trim().toLowerCase()
  // When searching inside scripts, only show scripts that match for the selected device
  const shownScripts = dev ? ((q && searchInScripts) ? dev.scripts.filter(s => {
    if ((s.instanceName || '').toLowerCase().includes(q)) return true
    if ((s.scriptPath || '').toLowerCase().includes(q)) return true
    if (JSON.stringify(s.args || {}).toLowerCase().includes(q)) return true
    return false
  }) : dev.scripts) : []
  const scriptDefaults = useAppSelector(s => (s.fbcskm as any).defaultScriptSettings || {})
  const computeDefaultScriptPath = (base: string) => {
    if (!base || base.trim() === '') return '/myscripts/RestMon.ps1'
    const b = base.trim()
    if (b.toLowerCase().endsWith('.ps1') || b.toLowerCase().includes('.ps1')) return b
    // otherwise treat as directory and append RestMon.ps1
    return `${b.replace(/\/$/, '')}/RestMon.ps1`
  }

  const [instanceName, setInstanceName] = useState('NEW_Script')
  const [scriptPath, setScriptPath] = useState(() => computeDefaultScriptPath(scriptDefaults.matrixKBPath))
  const [isRestmon, setIsRestmon] = useState(scriptDefaults.isRestmonDefault)

  // Update the scriptPath when defaults change so new scripts use the new default
  useEffect(() => {
    if (isRestmon) {
      setScriptPath(computeDefaultScriptPath(scriptDefaults.matrixKBPath))
    } else {
      setScriptPath(scriptDefaults.genericPath || '/myscripts/generic.ps1')
    }
  }, [scriptDefaults, isRestmon])

  useEffect(() => {
    setIsRestmon(scriptDefaults.isRestmonDefault ?? false)
  }, [scriptDefaults.isRestmonDefault])

  // menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuScriptId, setMenuScriptId] = useState<string | null>(null)
  const [dryRunOpen, setDryRunOpen] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<{ command: string, results: string } | null>(null)

  const openMenu = (e: React.MouseEvent<HTMLElement>, id: string) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); setMenuScriptId(id) }
  const closeMenu = () => { setMenuAnchor(null); setMenuScriptId(null) }

  const dryRun = async (scriptId: string) => {
    const s = dev?.scripts.find(x => x.id === scriptId)
    if (!s) return
    const cmd = s.scriptPath + (s.isRestmon ? (' ' + encodedPreviewForScript(s)) : (' ' + (s.args || '')))
    let results = '(placeholder - command not executed)'
    if (window.electronAPI?.runCommand) {
      try {
        const res = await window.electronAPI.runCommand(cmd)
        results = res.error ? `Error: ${res.error}\nStdout: ${res.stdout}\nStderr: ${res.stderr}` : `Stdout: ${res.stdout}\nStderr: ${res.stderr}`
      } catch (e) {
        results = `Failed to run: ${e}`
      }
    }
    setDryRunResults({ command: cmd, results })
    setDryRunOpen(true)
  }

  const encodedPreviewForScript = (s: any) => {
    if (!s.isRestmon) return s.args || ''
    const parts: string[] = []
    const a = s.args || {}
    if (a.url) parts.push(`-url '${a.url}'`)
    if (a.method) parts.push(`-method ${a.method}`)
    if (a.outputFormat) parts.push(`-outputFormat ${a.outputFormat}`)
    if (a.payload) parts.push(`-payload '${a.payload}'`)
    if (a.searchKey) parts.push(`-searchKey '${a.searchKey}'`)
    if (a.searchString) parts.push(`-searchString '${a.searchString}'`)
    if (a.matchRegex) parts.push(`-matchRegex '${a.matchRegex}'`)
    if (a.username) parts.push(`-username '${a.username}'`)
    if (a.password) parts.push(`-password '${a.password}'`)
    if (a.headers) parts.push(`-headers '${a.headers}'`)
    if (a.decryptPass) parts.push(`-decryptPass ${a.decryptPass}`)
    let cmd = parts.join(' ')
    cmd = cmd.replace(/\|/g, '<BMC_SEP>').replace(/\*/g, '<BMC_STAR>')
    return cmd
  }

  const onEdit = (id: string) => {
    // ensure parent knows which device the script belongs to so App can render the ScriptForm
    onSelect(id)
    if (onRequestEdit && deviceId) onRequestEdit(id, deviceId)
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = shownScripts.findIndex(s => s.id === active.id)
      const newIndex = shownScripts.findIndex(s => s.id === over.id)
      const reordered = arrayMove(shownScripts, oldIndex, newIndex)
      dispatch(reorderScripts({ deviceId: dev.id, scripts: reordered }))
    }
  }

  if (!dev) return <Typography color='text.secondary'>Select a device.</Typography>

  const create = () => {
    // Generate unique instance name
    let baseName = instanceName.trim() || 'NEW_Script'
    let counter = 0
    let uniqueName = baseName
    while (dev.scripts.some(s => s.instanceName === uniqueName)) {
      counter++
      uniqueName = `${baseName}${counter}`
    }
    const script = {
      id: uuid(),
      instanceName: uniqueName,
      scriptPath,
      args: isRestmon ? { method: 'GET', outputFormat: 'json' } : '',
      pollIntervalSec: 300,
      timeoutSec: 300,
      isRestmon
    }
    dispatch(addScript({ deviceId: dev.id, script }))
    // Select the new script
    onSelect(script.id)
    if (onRequestEdit && deviceId) onRequestEdit(script.id, deviceId)
    setInstanceName('NEW_Script'); setScriptPath(computeDefaultScriptPath(scriptDefaults.matrixKBPath)); setIsRestmon(scriptDefaults.isRestmonDefault)
  }

  const remove = (id: string) => {
    const s = dev.scripts.find(x => x.id === id)
    if (!s) return
    if (!confirm(`Delete script '${s.instanceName}'?`)) return
    dispatch(deleteScript({ deviceId: dev.id, scriptId: id }))
    if (selectedId === id) onSelect(null)
  }

  const duplicate = (id: string) => {
    const s = dev.scripts.find(x => x.id === id)
    if (!s) return
    const copy = { ...s, id: uuid(), instanceName: `${s.instanceName} (copy)` }
    dispatch(addScript({ deviceId: dev.id, script: copy }))
    onSelect(copy.id)
  }

  return (
    <Stack spacing={2} sx={{ minWidth: 420 }}>
      <Typography variant='h6'>Scripts for: {dev.name}</Typography>
      <FormControlLabel control={<Checkbox checked={isRestmon} onChange={e => setIsRestmon(e.target.checked)} />} label="Is Restmon Script" />
      <Stack direction='row' spacing={1}>
        <TextField label='Instance name' value={instanceName} onChange={e => setInstanceName(e.target.value)} />
        <TextField label='Script path' value={scriptPath} onChange={e => setScriptPath(e.target.value)} />
        <Button variant='contained' onClick={create}>Add</Button>
      </Stack>

      {/* Limit visible scripts to 10 and make the list scrollable to avoid pushing the edit form down */}
      <Box sx={{ maxHeight: 10 * 48, overflowY: 'auto' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={shownScripts.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <List dense>
              {shownScripts.map((s, idx) => {
                const isSelected = selectedId === s.id
                return (
                  <SortableScriptItem key={s.id} s={s} idx={idx} isSelected={isSelected} onSelect={onSelect} onSelectScript={onSelectScript} dev={dev} openMenu={openMenu} />
                )
              })}
              {shownScripts.length === 0 && <Typography color='text.secondary'>No scripts.</Typography>}
            </List>
          </SortableContext>
        </DndContext>
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={() => { if (menuScriptId) onEdit(menuScriptId); closeMenu() }}>Edit</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId) duplicate(menuScriptId); closeMenu() }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId) dryRun(menuScriptId); closeMenu() }}>Dry Run</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId && onCopyScript && deviceId) onCopyScript(menuScriptId, deviceId); closeMenu() }}>Copy</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId && onCutScript && deviceId) onCutScript(menuScriptId, deviceId); closeMenu() }}>Cut</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId) remove(menuScriptId); closeMenu() }} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>

      <Dialog open={dryRunOpen} onClose={() => setDryRunOpen(false)} maxWidth='md' fullWidth>
        <DialogTitle>Dry Run Results</DialogTitle>
        <DialogContent>
          {dryRunResults && (
            <>
              <Box sx={{ position: 'relative', mb: 2 }}>
                <Typography variant='h6'>Command</Typography>
                <IconButton sx={{ position: 'absolute', top: 0, right: 0 }} onClick={() => navigator.clipboard.writeText(dryRunResults.command)}>
                  <ContentCopyIcon />
                </IconButton>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                  {dryRunResults.command}
                </pre>
              </Box>
              <Box sx={{ position: 'relative' }}>
                <Typography variant='h6'>Results</Typography>
                <IconButton sx={{ position: 'absolute', top: 0, right: 0 }} onClick={() => navigator.clipboard.writeText(dryRunResults.results)}>
                  <ContentCopyIcon />
                </IconButton>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                  {dryRunResults.results.split('\n').map((line, i) => {
                    if (line.toLowerCase().includes('error')) return <span key={i} style={{ color: 'red' }}>{line}\n</span>
                    if (line.toLowerCase().includes('warn')) return <span key={i} style={{ color: 'orange' }}>{line}\n</span>
                    return <span key={i}>{line}\n</span>
                  })}
                </pre>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDryRunOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
