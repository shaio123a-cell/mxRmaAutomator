
import React, { useEffect, useState } from 'react'
import { Paper, Stack, Typography, Tabs, Tab, Box, IconButton, Tooltip, Snackbar, Alert } from '@mui/material'
import { useAppDispatch, useAppSelector } from '../store/store'
import { parseFBCSKM } from '../store/fbcskmSlice'
import { serializeDevices, serializeDevicesWithComments } from '../services/serializer'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

export default function Viewer({ raw, onRawChange }: { raw: string, onRawChange: (t: string) => void }){
  const dispatch = useAppDispatch()
  const devices = useAppSelector(s => s.fbcskm.devices)
  const originalLines = useAppSelector(s => s.fbcskm.originalLines)

  // track whether the raw textarea was edited/pasted manually and not saved
  const [rawEdited, setRawEdited] = useState(false)
  const dirty = useAppSelector(s => s.fbcskm.dirty)

  useEffect(() => { if (raw && raw.trim().length>0) dispatch(parseFBCSKM(raw)) }, [raw])

  // when a save occurs, clear the pasted/manual-edited indicator
  useEffect(() => { if (!dirty) setRawEdited(false) }, [dirty])

  const [tab, setTab] = useState<number>(0)
  const preview = serializeDevicesWithComments(devices, originalLines)

  const [copiedOpen, setCopiedOpen] = useState(false)
  const handleCopy = async () => {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(preview || '')
      } else {
        const ta = document.createElement('textarea')
        ta.value = preview || ''
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      setCopiedOpen(true)
    } catch (e) {
      console.error('Copy failed', e)
      setCopiedOpen(true)
    }
  }

  return (
    <Paper variant='outlined' sx={{p:2}}>
      <Stack spacing={1}>
        <Box>
          <Typography variant='h6'>{tab === 0 ? 'Paste Configuration File' : 'Preview Configuration'}</Typography>
          <Box sx={{display:'flex', alignItems:'center', justifyContent: 'space-between', mt:1}}>
            <Tabs value={tab} onChange={(e, v) => setTab(v)} aria-label="Viewer / Preview Tabs">
              <Tab label="Configuration Playground" />
              <Tab label="Preview Configuration" />
            </Tabs>

            {tab === 1 && (
              <Tooltip title="Copy preview to clipboard">
                <IconButton size="small" onClick={handleCopy} aria-label="copy preview">
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {tab === 0 ? (
          <>
            <textarea style={{width:'100%', minHeight: 120}} value={raw} onChange={e=>{ onRawChange(e.target.value); setRawEdited(true) }} />
            {rawEdited && (
              <Typography color='warning.main' sx={{mt:1}}>Unsaved configuration — this was pasted/manually edited. After editing, copy from the "Preview Configuration" tab or save to a file.</Typography>
            )}
          </>
        ) : (
          <textarea readOnly style={{width:'100%', minHeight: 120, background: '#f7f7f7'}} value={preview} />
        )}
      </Stack>
      <Snackbar open={copiedOpen} autoHideDuration={2000} onClose={()=>setCopiedOpen(false)} anchorOrigin={{vertical:'bottom', horizontal:'center'}}>
        <Alert onClose={()=>setCopiedOpen(false)} severity="success" sx={{width:'100%'}}>Preview copied to clipboard</Alert>
      </Snackbar>
    </Paper>
  )
}
