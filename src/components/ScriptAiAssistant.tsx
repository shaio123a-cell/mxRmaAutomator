import React, { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import UndoIcon from '@mui/icons-material/Undo'
import SettingsIcon from '@mui/icons-material/Settings'
import { useAppSelector } from '../store/store'
import type { ScriptInstance } from '../store/fbcskmSlice'
import {
  assistScriptInstance,
  type ScriptInstanceAiMode,
  type ScriptInstanceAiResult,
} from '../services/aiService'
import { getScriptInstanceFieldLabel } from '../content/scriptInstanceFields'
import {
  buildUpdatePreviews,
  formatPreviewValue,
  validateAiUpdates,
  type ScriptInstanceAiUpdate,
} from '../utils/scriptInstanceAiUpdates'
import {
  getBlockingValidationIssues,
  validationCounts,
  type ValidationIssue,
} from '../utils/scriptInstanceValidation'
import { diffLines, type DiffLine } from '../utils/lineDiff'

interface Props {
  open: boolean
  instance: ScriptInstance
  deviceName: string
  issues: ValidationIssue[]
  onApply: (updates: ScriptInstanceAiUpdate[]) => void
  onUndo: () => void
  canUndo: boolean
  onClose: () => void
  onOpenSettings: () => void
}

function severityColor(severity: ValidationIssue['severity']): 'error' | 'warning' | 'info' {
  return severity
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <Box
      component='pre'
      sx={{
        m: 0,
        mt: 0.5,
        p: 1,
        maxHeight: 220,
        overflow: 'auto',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        fontFamily: 'monospace',
        fontSize: 11.5,
        whiteSpace: 'pre-wrap',
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

function ChangePreview({ label, current, proposed, reason }: { label: string, current: unknown, proposed: unknown, reason: string }) {
  const currentText = formatPreviewValue(current)
  const proposedText = formatPreviewValue(proposed)
  const multiline = currentText.includes('\n') || proposedText.includes('\n') || currentText.length > 100 || proposedText.length > 100
  const diff = useMemo(
    () => multiline && currentText !== proposedText ? diffLines(currentText, proposedText) : [],
    [currentText, multiline, proposedText],
  )

  return (
    <Box sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
        <Typography variant='subtitle2' sx={{ flex: 1 }}>{label}</Typography>
        <Chip size='small' label='AI change' color='primary' variant='outlined' />
      </Stack>
      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        {currentText}
      </Typography>
      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', my: 0.25 }}>→</Typography>
      <Typography variant='body2' sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {proposedText}
      </Typography>
      {reason && <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.75 }}>{reason}</Typography>}
      {diff.length > 0 && <DiffView lines={diff} />}
    </Box>
  )
}

export default function ScriptAiAssistant({
  open,
  instance,
  deviceName,
  issues,
  onApply,
  onUndo,
  canUndo,
  onClose,
  onOpenSettings,
}: Props) {
  const models = useAppSelector(state => state.fbcskm.aiModels)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ScriptInstanceAiResult | null>(null)
  const [resultSignature, setResultSignature] = useState('')
  const [applied, setApplied] = useState(false)

  const currentSignature = useMemo(() => JSON.stringify(instance), [instance])
  const enabledModels = useMemo(() => models.filter(model => model.enabled), [models])
  const counts = useMemo(() => validationCounts(issues), [issues])
  const blockingIssues = useMemo(() => getBlockingValidationIssues(issues), [issues])
  const updateValidation = useMemo(
    () => result ? validateAiUpdates(result.updates, instance) : null,
    [instance, result],
  )
  const previews = useMemo(
    () => result ? buildUpdatePreviews(result.updates, instance) : [],
    [instance, result],
  )
  const stale = Boolean(result && resultSignature && resultSignature !== currentSignature && !applied)
  const canApply = Boolean(
    result
    && result.updates.length > 0
    && updateValidation?.valid
    && !stale
    && !applied
    && !loading,
  )

  const run = async (mode: ScriptInstanceAiMode) => {
    if (mode === 'configure' && !prompt.trim()) {
      setError('Describe the configuration you want before using Configure with AI.')
      return
    }
    if (!enabledModels.length) {
      setError('No AI models are enabled. Configure at least one model in Settings.')
      return
    }

    const signature = currentSignature
    setLoading(true)
    setError('')
    setResult(null)
    setApplied(false)
    setResultSignature('')

    try {
      const next = await assistScriptInstance({
        mode,
        instance,
        deviceName,
        validationIssues: issues,
        request: mode === 'configure' ? prompt : undefined,
      }, models)
      setResult(next)
      setResultSignature(signature)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError))
    } finally {
      setLoading(false)
    }
  }

  const apply = () => {
    if (!result || !canApply) return
    onApply(result.updates)
    setApplied(true)
  }

  const undo = () => {
    onUndo()
    setApplied(false)
  }

  return (
    <Box
      sx={{
        display: open ? 'flex' : 'none',
        flexDirection: 'column',
        width: { xs: '100%', md: 430 },
        flexShrink: 0,
        borderLeft: { md: '1px solid' },
        borderColor: 'divider',
        backgroundColor: 'background.default',
        minHeight: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <AutoAwesomeIcon color='primary' fontSize='small' />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant='subtitle2'>AI Assist</Typography>
          <Typography variant='caption' color='text.secondary'>Review, fix, or configure this instance.</Typography>
        </Box>
        <Tooltip title='Close AI Assist'>
          <IconButton size='small' onClick={onClose} aria-label='close AI assist'><CloseIcon fontSize='small' /></IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        <Stack spacing={1.5}>
          <Box sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Stack direction='row' spacing={1} alignItems='center'>
              <Typography variant='subtitle2' sx={{ flex: 1 }}>Local validation</Typography>
              <Chip
                size='small'
                label={counts.errors ? `${counts.errors} error${counts.errors === 1 ? '' : 's'}` : counts.warnings ? `${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}` : 'Valid'}
                color={counts.errors ? 'error' : counts.warnings ? 'warning' : 'success'}
                variant='outlined'
              />
            </Stack>
            {issues.length > 0 ? (
              <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                {issues.slice(0, 5).map((issue, index) => (
                  <Typography key={`${issue.field || 'general'}-${index}`} variant='caption' color='text.secondary'>
                    <Box component='span' sx={{ color: `${severityColor(issue.severity)}.main`, fontWeight: 600 }}>
                      {issue.field ? `${getScriptInstanceFieldLabel(issue.field)}: ` : ''}
                    </Box>
                    {issue.message}
                  </Typography>
                ))}
                {issues.length > 5 && (
                  <Typography variant='caption' color='text.secondary'>+{issues.length - 5} more finding{issues.length - 5 === 1 ? '' : 's'}.</Typography>
                )}
              </Stack>
            ) : (
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.75 }}>No local validation findings.</Typography>
            )}
          </Box>

          <Stack direction='row' spacing={1}>
            <Button
              fullWidth
              size='small'
              variant='outlined'
              startIcon={<AutoAwesomeIcon />}
              disabled={loading}
              onClick={() => void run('review')}
            >
              Review with AI
            </Button>
            <Button
              fullWidth
              size='small'
              variant='outlined'
              disabled={loading}
              onClick={() => void run('fix')}
            >
              {blockingIssues.length || counts.warnings ? `Fix ${blockingIssues.length + counts.warnings}` : 'Auto-fix'}
            </Button>
          </Stack>

          <Box>
            <TextField
              label='Configure with AI'
              placeholder='Call https://api.example.com every 5 minutes, POST JSON, expect status healthy, run weekdays 08:00–18:00.'
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              multiline
              minRows={3}
              fullWidth
              size='small'
            />
            <Button
              sx={{ mt: 1 }}
              fullWidth
              size='small'
              variant='contained'
              startIcon={<AutoAwesomeIcon />}
              disabled={loading || !prompt.trim()}
              onClick={() => void run('configure')}
            >
              Configure with AI
            </Button>
          </Box>

          {!enabledModels.length && (
            <Alert
              severity='warning'
              action={(
                <Button color='inherit' size='small' startIcon={<SettingsIcon />} onClick={onOpenSettings}>
                  Settings
                </Button>
              )}
            >
              No AI models are enabled.
            </Alert>
          )}

          {error && !loading && <Alert severity='error'>{error}</Alert>}

          {loading && (
            <Stack alignItems='center' spacing={1} sx={{ py: 3 }}>
              <CircularProgress size={26} />
              <Typography variant='body2' color='text.secondary'>Asking the configured model chain…</Typography>
            </Stack>
          )}

          {result && !loading && (
            <Stack spacing={1.5}>
              <Divider />
              <Stack direction='row' spacing={0.75} alignItems='center' flexWrap='wrap'>
                <Chip
                  size='small'
                  label={result.assessment === 'valid' ? 'Valid' : result.assessment === 'invalid' ? 'Invalid' : 'Needs attention'}
                  color={result.assessment === 'valid' ? 'success' : result.assessment === 'invalid' ? 'error' : 'warning'}
                />
                <Chip size='small' label={`${result.confidence} confidence`} variant='outlined' />
                <Chip size='small' label={result.modelName} variant='outlined' />
                {result.usedFallback && <Chip size='small' label='Fallback used' color='warning' variant='outlined' />}
              </Stack>

              {result.summary && <Typography variant='body2'>{result.summary}</Typography>}

              {stale && (
                <Alert severity='warning'>
                  The form changed after this response. Generate again before applying these changes.
                </Alert>
              )}

              {result.issues.length > 0 && (
                <Box>
                  <Typography variant='subtitle2' sx={{ mb: 0.5 }}>AI findings</Typography>
                  <Stack spacing={0.75}>
                    {result.issues.map((issue, index) => (
                      <Box key={`${issue.field || 'general'}-${index}`} sx={{ p: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Stack direction='row' spacing={0.75} alignItems='center'>
                          <Chip size='small' label={issue.severity} color={severityColor(issue.severity)} variant='outlined' />
                          <Typography variant='subtitle2'>{issue.field ? getScriptInstanceFieldLabel(issue.field) : 'General'}</Typography>
                        </Stack>
                        <Typography variant='body2' sx={{ mt: 0.5 }}>{issue.message}</Typography>
                        {issue.suggestion && <Typography variant='caption' color='text.secondary'>{issue.suggestion}</Typography>}
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              {result.needsUserInput.length > 0 && (
                <Alert severity='warning'>
                  <Typography variant='subtitle2' sx={{ mb: 0.5 }}>You need to provide</Typography>
                  <Box component='ul' sx={{ m: 0, pl: 2.5 }}>
                    {result.needsUserInput.map((item, index) => (
                      <Typography key={`${item}-${index}`} component='li' variant='body2'>{item}</Typography>
                    ))}
                  </Box>
                </Alert>
              )}

              {previews.length > 0 && (
                <Box>
                  <Typography variant='subtitle2' sx={{ mb: 0.75 }}>Proposed changes ({previews.length})</Typography>
                  <Stack spacing={1}>
                    {previews.map(preview => (
                      <ChangePreview
                        key={preview.field}
                        label={preview.label}
                        current={preview.current}
                        proposed={preview.proposed}
                        reason={preview.reason}
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              {updateValidation && !updateValidation.valid && (
                <Alert severity='error'>
                  <Typography variant='subtitle2' sx={{ mb: 0.5 }}>These changes cannot be applied</Typography>
                  <Box component='ul' sx={{ m: 0, pl: 2.5 }}>
                    {updateValidation.errors.map((item, index) => (
                      <Typography key={`${item}-${index}`} component='li' variant='body2'>{item}</Typography>
                    ))}
                  </Box>
                </Alert>
              )}

              <Stack direction='row' spacing={1}>
                <Button
                  fullWidth
                  size='small'
                  variant='contained'
                  disabled={!canApply}
                  onClick={apply}
                >
                  {applied
                    ? 'Changes applied'
                    : result.updates.length
                      ? `Apply ${result.updates.length} change${result.updates.length === 1 ? '' : 's'}`
                      : 'No changes to apply'}
                </Button>
                <Button size='small' onClick={() => { setResult(null); setApplied(false) }}>Dismiss</Button>
              </Stack>

              {applied && (
                <Alert severity='success'>
                  Changes applied to the open draft. Save Script is still required to persist them.
                </Alert>
              )}
            </Stack>
          )}

          {canUndo && (
            <Button size='small' startIcon={<UndoIcon />} onClick={undo}>
              Undo AI changes
            </Button>
          )}

          <Divider />
          <Typography variant='caption' color='text.secondary'>
            Only the open draft changes. Nothing is saved or run until you click Save Script.
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            Current field values and validation findings are sent to your configured AI provider. The password is never sent; secret header and argument values are masked.
          </Typography>
          <Link component='button' type='button' variant='caption' onClick={onOpenSettings} sx={{ alignSelf: 'flex-start' }}>
            View in Configuration
          </Link>
        </Stack>
      </Box>
    </Box>
  )
}
