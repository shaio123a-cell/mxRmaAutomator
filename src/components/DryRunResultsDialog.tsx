import React from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography, useTheme } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

export interface DryRunResults {
  command: string
  originalCommand: string
  results: string
}

function CopyableBlock({ title, value, monospace = true }: { title: string, value: string, monospace?: boolean }) {
  const theme = useTheme()
  return (
    <Box sx={{ position: 'relative', mb: 2 }}>
      <Typography variant='h6'>{title}</Typography>
      <TooltipCopy text={value} />
      {monospace ? (
        <Box component='pre' sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: 'action.hover', padding: 1, borderRadius: 1, m: 0 }}>
          {value}
        </Box>
      ) : (
        <Box sx={{ fontFamily: 'monospace', backgroundColor: 'action.hover', padding: 1, borderRadius: 1, maxHeight: 400, overflow: 'auto' }}>
          {value.split(/\r?\n/).map((line, i) => (
            <div key={i} style={{
              color: line.toLowerCase().includes('error') ? theme.palette.error.main : line.toLowerCase().includes('warn') ? theme.palette.warning.main : 'inherit',
              minHeight: '1.2em'
            }}>
              {line}
            </div>
          ))}
        </Box>
      )}
    </Box>
  )
}

function TooltipCopy({ text }: { text: string }) {
  return (
    <IconButton size='small' sx={{ position: 'absolute', top: 0, right: 0 }} aria-label='copy' onClick={() => navigator.clipboard.writeText(text)}>
      <ContentCopyIcon fontSize='small' />
    </IconButton>
  )
}

export default function DryRunResultsDialog({ open, onClose, results }: { open: boolean, onClose: () => void, results: DryRunResults | null }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>Dry Run Results</DialogTitle>
      <DialogContent>
        {results && (
          <>
            <CopyableBlock title='Original Command' value={results.originalCommand} />
            <CopyableBlock title='Executed Command' value={results.command} />
            <CopyableBlock title='Results' value={results.results} monospace={false} />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
