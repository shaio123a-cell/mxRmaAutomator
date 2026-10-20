import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, alpha,
} from '@mui/material'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { diagnoseScriptFailure, type AiDiagnosis, type AiDiagnosisInput, type AiModelConfig } from '../services/aiService'
import { diffLines, diffStats, type DiffLine } from '../utils/lineDiff'

interface Props {
  open: boolean
  onClose: () => void
  input: AiDiagnosisInput | null
  models: AiModelConfig[]
  systemPrompt: string
  onApply?: (fixedScript: string) => void
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant='subtitle2' sx={{ mb: 0.5 }}>{title}</Typography>
      {children}
    </Box>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <Box component='ul' sx={{ m: 0, pl: 2.5 }}>
      {items.map(item => <Typography key={item} component='li' variant='body2' sx={{ mb: 0.25 }}>{item}</Typography>)}
    </Box>
  )
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <Box
      component='pre'
      sx={{
        m: 0, mt: 1, p: 1, maxHeight: 360, overflow: 'auto', borderRadius: 1, border: '1px solid', borderColor: 'divider',
        fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap',
      }}
    >
      {lines.map((line, index) => (
        <Box
          component='span'
          key={index}
          sx={theme => ({
            display: 'block',
            px: 0.5,
            backgroundColor: line.type === 'added'
              ? alpha(theme.palette.success.main, 0.14)
              : line.type === 'removed'
                ? alpha(theme.palette.error.main, 0.14)
                : 'transparent',
            color: line.type === 'added' ? 'success.main' : line.type === 'removed' ? 'error.main' : 'text.primary',
          })}
        >
          <Box component='span' sx={{ display: 'inline-block', width: 14, mr: 1, userSelect: 'none', opacity: 0.65 }}>
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </Box>
          {line.text || ' '}
        </Box>
      ))}
    </Box>
  )
}

export default function AiDiagnosisDialog({ open, onClose, input, models, systemPrompt, onApply }: Props) {
  const [diagnosis, setDiagnosis] = useState<AiDiagnosis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [applied, setApplied] = useState(false)

  const inputRef = useRef(input)
  const modelsRef = useRef(models)
  const promptRef = useRef(systemPrompt)
  inputRef.current = input
  modelsRef.current = models
  promptRef.current = systemPrompt

  useEffect(() => {
    if (!open) return
    const current = inputRef.current
    if (!current) return

    let cancelled = false
    setDiagnosis(null)
    setError('')
    setCopied(false)
    setApplied(false)
    setLoading(true)

    diagnoseScriptFailure(current, modelsRef.current, promptRef.current)
      .then(result => { if (!cancelled) setDiagnosis(result) })
      .catch((diagnosisError: unknown) => {
        if (!cancelled) setError(diagnosisError instanceof Error ? diagnosisError.message : String(diagnosisError))
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [open])

  const diff = useMemo(
    () => diagnosis && input ? diffLines(input.script, diagnosis.fixedScript) : [],
    [diagnosis, input],
  )
  const stats = useMemo(() => diffStats(diff), [diff])
  const hasPatch = Boolean(diagnosis?.fixedScript?.trim()) && diagnosis!.fixedScript.trim() !== input?.script.trim()

  const copyPatch = async () => {
    if (!diagnosis?.fixedScript) return
    try {
      await navigator.clipboard.writeText(diagnosis.fixedScript)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const applyPatch = () => {
    if (!diagnosis?.fixedScript || !onApply) return
    onApply(diagnosis.fixedScript)
    setApplied(true)
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth='lg' fullWidth>
      <DialogTitle>
        <Stack direction='row' spacing={1} alignItems='center'>
          <AutoFixHighIcon color='primary' />
          <Box sx={{ flex: 1 }}>
            <Typography variant='h6'>AI diagnosis</Typography>
            <Typography variant='caption' color='text.secondary'>
              Patch only — nothing is run, saved, or deployed.
            </Typography>
          </Box>
          {diagnosis && (
            <Chip
              size='small'
              label={`${diagnosis.confidence} confidence`}
              color={diagnosis.confidence === 'high' ? 'success' : diagnosis.confidence === 'low' ? 'warning' : 'default'}
            />
          )}
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity='info' sx={{ mb: 2 }}>
          Review the suggestion before applying it. No changes have been made.
        </Alert>

        {loading && (
          <Stack alignItems='center' spacing={1} sx={{ py: 6 }}>
            <CircularProgress size={28} />
            <Typography variant='body2' color='text.secondary'>Analyzing the script and failure output…</Typography>
          </Stack>
        )}

        {error && !loading && <Alert severity='error'>{error}</Alert>}

        {diagnosis && !loading && (
          <Stack spacing={2}>
            {diagnosis.diagnosis && (
              <Section title='What went wrong'>
                <Typography variant='body2'>{diagnosis.diagnosis}</Typography>
              </Section>
            )}
            {diagnosis.rootCause && (
              <Section title='Root cause'>
                <Typography variant='body2'>{diagnosis.rootCause}</Typography>
              </Section>
            )}
            {diagnosis.needsUserInput.length > 0 && (
              <Alert severity='warning'>
                <Typography variant='subtitle2' sx={{ mb: 0.5 }}>You need to provide or verify</Typography>
                <BulletList items={diagnosis.needsUserInput} />
              </Alert>
            )}
            {diagnosis.changes.length > 0 && (
              <Section title='Changes proposed'>
                <BulletList items={diagnosis.changes} />
              </Section>
            )}
            {diagnosis.risks.length > 0 && (
              <Alert severity='warning'>
                <Typography variant='subtitle2' sx={{ mb: 0.5 }}>Risks to check</Typography>
                <BulletList items={diagnosis.risks} />
              </Alert>
            )}

            <Box>
              <Stack direction='row' spacing={1} alignItems='center'>
                <Typography variant='subtitle2' sx={{ flex: 1 }}>Proposed patch</Typography>
                {hasPatch
                  ? <Chip size='small' label={`+${stats.added} / -${stats.removed}`} />
                  : <Chip size='small' label='No code change suggested' />}
              </Stack>
              {hasPatch ? (
                <DiffView lines={diff} />
              ) : (
                <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                  The AI did not propose a code change. Read the diagnosis above to resolve the environment or input issue.
                </Typography>
              )}
            </Box>

            <Typography variant='caption' color='text.secondary'>
              Diagnosed by {diagnosis.modelName}{diagnosis.usedFallback ? ' (fallback model)' : ''}. The script content and output were sent to your configured AI provider.
            </Typography>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Close</Button>
        {diagnosis && hasPatch && (
          <Button startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />} onClick={() => void copyPatch()}>
            {copied ? 'Copied' : 'Copy patched script'}
          </Button>
        )}
        {diagnosis && hasPatch && onApply && (
          <Button variant='contained' onClick={applyPatch} disabled={applied}>
            {applied ? 'Applied as new version' : 'Apply as new version'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
