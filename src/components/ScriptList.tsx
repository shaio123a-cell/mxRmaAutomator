
import React, { useState, useEffect } from 'react'
import { Button, Box, List, ListItem, ListItemButton, ListItemText, Stack, TextField, Typography, IconButton, Menu, MenuItem, FormControlLabel, Checkbox, Tooltip } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import ScienceIcon from '@mui/icons-material/Science'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import FileCopyOutlinedIcon from '@mui/icons-material/FileCopyOutlined'
import { useAppDispatch, useAppSelector } from '../store/store'
import { addScript, deleteScript, reorderScripts } from '../store/fbcskmSlice'
import { v4 as uuid } from 'uuid'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import RunDialog, { RunDialogScript } from './RunDialog'
import { buildEncodedArgs, decodeBmcPlaceholders } from '../utils/scriptArgs'
import { hashScriptContent } from '../utils/contentHash'

function SortableScriptItem({ s, idx, isSelected, onSelect, onSelectScript, dev, openMenu }: { s: any, idx: number, isSelected: boolean, onSelect: (id: string | null) => void, onSelectScript?: (id: string, deviceId: string) => void, dev: any, openMenu: (e: React.MouseEvent<HTMLElement>, id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const errorMessage = (!s.disabled && Array.isArray(s.validationErrors) && s.validationErrors.length)
    ? s.validationErrors.join('\n')
    : ''

  return (
    <ListItem ref={setNodeRef} style={style} secondaryAction={
      <IconButton edge='end' onClick={(e) => openMenu(e, s.id)} aria-label='actions' size='small' sx={{ color: isSelected ? 'common.white' : undefined }}>
        <MoreVertIcon />
      </IconButton>
    } sx={theme => ({ backgroundColor: isSelected ? theme.palette.primary.main : (idx % 2 === 1 ? theme.palette.action.hover : 'transparent') })}>
      <IconButton {...attributes} {...listeners} size='small' sx={{ mr: 1, cursor: 'grab' }}>
        <DragIndicatorIcon />
      </IconButton>
      <ListItemButton
        selected={isSelected}
        onClick={() => { if (onSelectScript) onSelectScript(s.id, dev.id); else onSelect(s.id) }}
        sx={{ py: 0.25, color: isSelected ? 'common.white' : undefined, flex: 1 }}
      >
        <ListItemText primary={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {errorMessage && (
              <Tooltip title={errorMessage} placement='top'>
                <ErrorOutlineIcon sx={{ mr: 1, fontSize: 14, color: 'error.main' }} />
              </Tooltip>
            )}
            {s.dirty && <EditIcon sx={{ mr: 1, fontSize: 14, color: 'secondary.main' }} />}
            {s.instanceName}
          </Box>
        } secondary={`${s.args.method || 'GET'} ${s.args.outputFormat || 'json'}`}
          sx={{ my: 0, '& .MuiListItemText-primary': { color: isSelected ? 'common.white' : 'inherit' }, '& .MuiListItemText-secondary': { color: isSelected ? 'common.white' : 'inherit' } }} />
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
    // Helper to extract all values recursively
    const getAllValues = (obj: any): string => {
      if (obj === null || obj === undefined) return ''
      if (typeof obj !== 'object') return String(obj)
      return Object.values(obj).map(getAllValues).join(' ')
    }
    // Search only within values, ignoring keys
    if (getAllValues(s).toLowerCase().includes(q)) return true
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
  const [runOpen, setRunOpen] = useState(false)
  const [runScript, setRunScript] = useState<RunDialogScript | null>(null)

  const openMenu = (e: React.MouseEvent<HTMLElement>, id: string) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); setMenuScriptId(id) }
  const closeMenu = () => { setMenuAnchor(null); setMenuScriptId(null) }

  const dryRun = async (scriptId: string) => {
    const s = dev?.scripts.find(x => x.id === scriptId)
    if (!s) return

    const fileName = s.scriptPath.split(/[\\/]/).pop() || s.scriptPath || 'script.ps1'
    const args = s.isRestmon ? decodeBmcPlaceholders(buildEncodedArgs(s)) : ` ${s.args || ''}`
    let content: string | undefined
    try {
      content = await window.electronAPI.readFile(s.scriptPath)
    } catch {
      content = undefined
    }
    setRunScript({
      key: `instance:${dev?.id}:${s.id}`,
      name: fileName,
      content,
      contentHash: content ? hashScriptContent(content) : s.contentHash,
      versionId: s.id,
      sourceKind: 'saved-instance',
      args: args.trim(),
      isRestmon: s.isRestmon,
      localPath: s.scriptPath,
    })
    setRunOpen(true)
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
      timeoutSec: 30,
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
    <Stack spacing={2} sx={{ flex: 1, minWidth: 0, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, backgroundColor: 'background.paper' }}>
      <Stack direction='row' alignItems='center' spacing={1}>
        <Typography variant='h6' sx={{ flex: 1 }}>Scripts for: {dev.name}</Typography>
      </Stack>
      <Stack direction='row' spacing={1} alignItems='center' sx={{ flexWrap: 'wrap' }}>
        <FormControlLabel sx={{ mr: 1, whiteSpace: 'nowrap' }} control={<Checkbox size='small' checked={isRestmon} onChange={e => setIsRestmon(e.target.checked)} />} label="Is Restmon Script" />
        <TextField label='Instance name' value={instanceName} onChange={e => setInstanceName(e.target.value)} />
        <TextField label='Script path' value={scriptPath} onChange={e => setScriptPath(e.target.value)} />
        <IconButton onClick={async () => {
          const path = await window.electronAPI.selectPath({ file: true, filters: [{ name: 'PowerShell Scripts', extensions: ['ps1'] }] });
          if (path) setScriptPath(path);
        }}>
          <FolderOpenIcon />
        </IconButton>
        <Tooltip title='Add script'>
          <IconButton size='small' color='primary' onClick={create} aria-label='add script'>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Limit visible scripts to 10 and make the list scrollable to avoid pushing the edit form down */}
      <Box sx={{ maxHeight: 10 * 48, overflowY: 'auto' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={shownScripts.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <List>
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
        <MenuItem onClick={() => { if (menuScriptId) onEdit(menuScriptId); closeMenu() }}><DriveFileRenameOutlineIcon fontSize='small' sx={{ mr: 1 }} />Edit</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId) duplicate(menuScriptId); closeMenu() }}><FileCopyOutlinedIcon fontSize='small' sx={{ mr: 1 }} />Duplicate</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId) dryRun(menuScriptId); closeMenu() }}><ScienceIcon fontSize='small' sx={{ mr: 1 }} />Run…</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId && onCopyScript && deviceId) onCopyScript(menuScriptId, deviceId); closeMenu() }}><ContentCopyIcon fontSize='small' sx={{ mr: 1 }} />Copy</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId && onCutScript && deviceId) onCutScript(menuScriptId, deviceId); closeMenu() }}><ContentCutIcon fontSize='small' sx={{ mr: 1 }} />Cut</MenuItem>
        <MenuItem onClick={() => { if (menuScriptId) remove(menuScriptId); closeMenu() }} sx={{ color: 'error.main' }}><DeleteOutlineIcon fontSize='small' sx={{ mr: 1 }} />Delete</MenuItem>
      </Menu>

      <RunDialog open={runOpen} onClose={() => setRunOpen(false)} script={runScript} />
    </Stack>
  )
}
