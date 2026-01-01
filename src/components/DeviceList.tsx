
import React, { useState } from 'react'
import { Button, List, ListItem, ListItemButton, ListItemText, Stack, TextField, Typography, IconButton, Menu, MenuItem, Box } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/Edit'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { useAppDispatch, useAppSelector } from '../store/store'
import { addDevice, deleteDevice, enableDevice, disableDevice, reorderDevices } from '../store/fbcskmSlice'
import { v4 as uuid } from 'uuid'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableItem({ d, idx, isSelected, selectedId, onSelect, openMenu }: { d: any, idx: number, isSelected: boolean, selectedId: string | null, onSelect: (id: string) => void, openMenu: (e: React.MouseEvent<HTMLElement>, id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <ListItem ref={setNodeRef} style={style} secondaryAction={
      <IconButton edge='end' onClick={(e) => openMenu(e, d.id)} aria-label='actions' size='small' sx={{ color: isSelected ? '#fff' : undefined }}>
        <MoreVertIcon />
      </IconButton>
    } sx={{ backgroundColor: isSelected ? '#0b3d91' : (idx % 2 === 1 ? 'rgba(11,61,145,0.08)' : 'transparent') }}>
      <IconButton {...attributes} {...listeners} size='small' sx={{ mr: 1, cursor: 'grab' }}>
        <DragIndicatorIcon />
      </IconButton>
      <ListItemButton
        selected={isSelected}
        onClick={() => onSelect(d.id)}
        sx={{ py: 0.25, color: isSelected ? '#fff' : undefined, flex: 1 }}
      >
        <ListItemText primary={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {d.dirty && <EditIcon sx={{ mr: 1, fontSize: 14, color: '#4a148c' }} />}
            {d.disabled && d.originalLine ? (d.originalLine.length > 50 ? d.originalLine.substring(0, 50) + '...' : d.originalLine) : d.name}
          </Box>
        } secondary={`Scripts: ${(d as any).matchingScriptsCount ?? d.scripts.length}`}
          sx={{
            my: 0,
            '& .MuiListItemText-primary': { color: isSelected ? '#fff' : (d.disabled ? 'text.disabled' : 'inherit') },
            '& .MuiListItemText-secondary': { color: isSelected ? '#fff' : (d.disabled ? 'text.disabled' : 'inherit') }
          }}
        />
      </ListItemButton>
    </ListItem>
  )
}

export default function DeviceList({ devices: devicesProp, fullDevices: fullDevicesProp, selectedId, onSelect, onRequestEdit, onPasteScript, clipboard: clipboardProp, showDisabled, onToggleShowDisabled }: { devices?: any[], fullDevices?: any[], selectedId?: string | null, onSelect: (id: string | null) => void, onRequestEdit?: (id: string) => void, onPasteScript?: (deviceId: string) => void, clipboard?: any | null, showDisabled?: boolean, onToggleShowDisabled?: () => void }) {
  const dispatch = useAppDispatch()
  const devices = devicesProp ?? useAppSelector(s => s.fbcskm.devices)
  const fullDevices = fullDevicesProp ?? devices
  const clipboard = useAppSelector(s => (s.fbcskm as any).clipboard)
  const [name, setName] = useState('')
  const [forcedIp, setForcedIp] = useState('')

  // menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuDeviceId, setMenuDeviceId] = useState<string | null>(null)
  const [globalMenuAnchor, setGlobalMenuAnchor] = useState<HTMLElement | null>(null)

  const displayDevices = devices

  const openMenu = (e: React.MouseEvent<HTMLElement>, id: string) => { setMenuAnchor(e.currentTarget); setMenuDeviceId(id) }
  const closeMenu = () => { setMenuAnchor(null); setMenuDeviceId(null) }

  const handlePasteToDevice = (deviceId: string) => { console.log('DeviceList: paste requested to', deviceId); if (onPasteScript) onPasteScript(deviceId); closeMenu() }

  const defaults = useAppSelector(s => (s.fbcskm as any).defaultDeviceSettings)

  const create = () => {
    if (!name.trim()) return
    // prevent duplicates by name
    if ((devices || []).some(d => (d.name || '').toLowerCase() === name.trim().toLowerCase())) { alert('Device already exists. Use search to find and edit the device.'); return }
    const base = {
      ...(defaults || {}),
      id: uuid(),
      name,
      forcedIp,
      scripts: []
    }
    dispatch(addDevice(base as any))
    setName(''); setForcedIp('')
  }

  const remove = (id: string) => {
    const d = devices.find(x => x.id === id)
    if (!d) return
    if (!confirm(`Delete device '${d.name}'?`)) return
    dispatch(deleteDevice(id))
    if (selectedId === id) onSelect(null)
  }

  const duplicate = (id: string) => {
    const d = devices.find(x => x.id === id)
    if (!d) return
    const copy = {
      ...d,
      id: uuid(),
      name: `${d.name} (copy)`,
      scripts: (d.scripts || []).map(s => ({ ...s, id: uuid() })),
      originalLineIndex: undefined
    }
    dispatch(addDevice(copy as any))
    onSelect(copy.id)
  }

  const onEdit = (id: string) => {
    onSelect(id)
    if (onRequestEdit) onRequestEdit(id)
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
      const oldIndex = fullDevices.findIndex(d => d.id === active.id)
      const newIndex = fullDevices.findIndex(d => d.id === over.id)
      const reordered = arrayMove(fullDevices, oldIndex, newIndex)
      dispatch(reorderDevices(reordered))
    }
  }

  return (
    <Stack spacing={2} sx={{ minWidth: 360 }}>
      <Stack direction='row' alignItems='center' spacing={1}>
        <Typography variant='h6'>Devices</Typography>
        <IconButton size='small' onClick={(e) => setGlobalMenuAnchor(e.currentTarget)} aria-label='device options'>
          <MoreVertIcon />
        </IconButton>
      </Stack>
      <Stack direction='row' spacing={1}>
        <TextField label='Device name' value={name} onChange={e => setName(e.target.value)} />
        <TextField label='Forced IP (optional)' value={forcedIp} onChange={e => setForcedIp(e.target.value)} />
        <Button variant='contained' onClick={create}>Add</Button>
      </Stack>
      {/* limit visible devices to 10 and make list scrollable */}
      <div style={{ maxHeight: 10 * 48, overflowY: 'auto' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayDevices.map(d => d.id)} strategy={verticalListSortingStrategy}>
            <List>
              {displayDevices.map((d, idx) => {
                const isSelected = selectedId === d.id
                return (
                  <SortableItem key={d.id} d={d} idx={idx} isSelected={isSelected} selectedId={selectedId} onSelect={onSelect} openMenu={openMenu} />
                )
              })}
              {displayDevices.length === 0 && <Typography color='text.secondary'>No devices.</Typography>}
            </List>
          </SortableContext>
        </DndContext>
      </div>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={() => { if (menuDeviceId) onEdit(menuDeviceId); closeMenu() }}>Edit</MenuItem>
        <MenuItem onClick={() => { if (menuDeviceId) duplicate(menuDeviceId); closeMenu() }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { if (menuDeviceId) handlePasteToDevice(menuDeviceId); closeMenu() }} disabled={!((clipboardProp || clipboard) && (clipboardProp || clipboard).type === 'script')}>Paste Script</MenuItem>
        {/* Enable / Disable device (comment/uncomment) */}
        <MenuItem onClick={() => { if (menuDeviceId) { const d = devices.find(x => x.id === menuDeviceId); if (d) { if (d.disabled) dispatch(enableDevice(menuDeviceId)); else dispatch(disableDevice(menuDeviceId)) } } closeMenu() }}>
          {menuDeviceId && ((devices.find(x => x.id === menuDeviceId) || {}).disabled) ? 'Enable Device' : 'Disable Device'}
        </MenuItem>
        <MenuItem onClick={() => { if (menuDeviceId) remove(menuDeviceId); closeMenu() }} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>

      <Menu anchorEl={globalMenuAnchor} open={Boolean(globalMenuAnchor)} onClose={() => setGlobalMenuAnchor(null)}>
        <MenuItem onClick={() => { if (onToggleShowDisabled) onToggleShowDisabled(); setGlobalMenuAnchor(null) }}>
          {showDisabled ? 'Hide Disabled Devices and Remarks' : 'Show Disabled Devices and Remarks'}
        </MenuItem>
      </Menu>
    </Stack>
  )
}
