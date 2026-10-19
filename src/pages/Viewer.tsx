
import React, { useEffect, useState } from 'react'
import { Paper, Stack, Typography, Tabs, Tab, Box, IconButton, Tooltip, Snackbar, Alert, useTheme } from '@mui/material'
import CodeEditor from 'react-simple-code-editor'
import { useAppSelector } from '../store/store'
import { serializeDevicesWithComments } from '../services/serializer'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import WrapTextIcon from '@mui/icons-material/WrapText'
import { highlightConfig } from '../components/ConfigHighlighter'

export default function Viewer({ raw, onRawChange }: { raw: string, onRawChange: (t: string) => void }){
  const theme = useTheme()
  const devices = useAppSelector(s => s.fbcskm.devices)
  const originalLines = useAppSelector(s => s.fbcskm.originalLines)

  // track whether the raw textarea was edited/pasted manually and not saved
  const [rawEdited, setRawEdited] = useState(false)
  const dirty = useAppSelector(s => s.fbcskm.dirty)

  // when a save occurs, clear the pasted/manual-edited indicator
  useEffect(() => { if (!dirty) setRawEdited(false) }, [dirty])

  const [tab, setTab] = useState<number>(0)
  const [wrapText, setWrapText] = useState(false)
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

  const editorStyle: React.CSSProperties = {
    minHeight: 120,
    boxSizing: 'border-box',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.6,
    color: theme.palette.text.primary,
    tabSize: 2,
    whiteSpace: wrapText ? 'pre-wrap' : 'pre',
    overflowWrap: wrapText ? 'anywhere' : 'normal',
    wordBreak: wrapText ? 'break-word' : 'normal',
  }

  const wrapToggle = (
    <Tooltip title={wrapText ? 'Disable text wrapping' : 'Wrap long lines'}>
      <IconButton
        size='small'
        color={wrapText ? 'primary' : 'default'}
        onClick={() => setWrapText(v => !v)}
        aria-label='toggle text wrapping'
        aria-pressed={wrapText}
      >
        <WrapTextIcon />
      </IconButton>
    </Tooltip>
  )

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
          </Box>
        </Box>

        {tab === 0 ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
              {wrapToggle}
            </Box>
            <Box
              sx={{
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1,
                backgroundColor: theme.palette.background.paper,
                overflow: 'auto',
                '& .config-playground-textarea, & .config-playground-pre': {
                  whiteSpace: wrapText ? 'pre-wrap !important' : 'pre !important',
                  overflowWrap: wrapText ? 'anywhere !important' : 'normal !important',
                  wordBreak: wrapText ? 'break-word !important' : 'normal !important',
                },
              }}
            >
              <CodeEditor
                value={raw}
                onValueChange={(code) => { onRawChange(code); setRawEdited(true) }}
                highlight={(code) => highlightConfig(code, theme)}
                padding={12}
                textareaId='config-playground-editor'
                textareaClassName='config-playground-textarea'
                preClassName='config-playground-pre'
                style={{ ...editorStyle, overflow: wrapText ? 'hidden' : 'auto' }}
              />
            </Box>
            {rawEdited && (
              <Typography color='warning.main' sx={{mt:1}}>Unsaved configuration — this was pasted/manually edited. After editing, copy from the "Preview Configuration" tab or save to a file.</Typography>
            )}
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
              {wrapToggle}
              <Tooltip title="Copy preview to clipboard">
                <IconButton size="small" onClick={handleCopy} aria-label="copy preview">
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
            </Box>
            <Box component='pre' sx={{ m: 0, width: '100%', minHeight: 120, backgroundColor: 'action.hover', border: `1px solid ${theme.palette.divider}`, borderRadius: 1, p: 1, overflow: 'auto', ...editorStyle }}>
              {highlightConfig(preview, theme)}
            </Box>
          </>
        )}
      </Stack>
      <Snackbar open={copiedOpen} autoHideDuration={2000} onClose={()=>setCopiedOpen(false)} anchorOrigin={{vertical:'bottom', horizontal:'center'}}>
        <Alert onClose={()=>setCopiedOpen(false)} severity="success" sx={{width:'100%'}}>Preview copied to clipboard</Alert>
      </Snackbar>
    </Paper>
  )
}
