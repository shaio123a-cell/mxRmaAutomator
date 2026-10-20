
import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, Divider, Drawer, FormControlLabel, Grid, IconButton, MenuItem, Snackbar, Stack, TextField, Tooltip, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CloseIcon from '@mui/icons-material/Close'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import LockIcon from '@mui/icons-material/Lock'
import ScienceIcon from '@mui/icons-material/Science'
import SaveIcon from '@mui/icons-material/Save'
import { Device, ScriptInstance, updateScript } from '../store/fbcskmSlice'
import { useAppDispatch } from '../store/store'
import config, { FieldConfig } from '../config'
import { TimePicker } from '@mui/x-date-pickers'
import dayjs from 'dayjs'
import DryRunResultsDialog, { DryRunResults } from './DryRunResultsDialog'
import PayloadEditor, { minifyPayload } from './PayloadEditor'
import { buildDryRunCommands, buildEncodedArgs } from '../utils/scriptArgs'

export type ScriptFormHandle = {
  isDirty: () => boolean
  save: () => void
  discard: () => void
}

interface Props {
  open: boolean
  device: Device
  script: ScriptInstance
  onChange: (s: ScriptInstance) => void
  onClose: () => void
}

const SECTION_FIELDS: Record<string, string[]> = {
  request: ['url', 'method', 'outputFormat', 'payload', 'headers', 'matchRegex', 'args', 'searchKey', 'searchString'],
  auth: ['username', 'password', 'decryptPass'],
  monitoring: ['pollIntervalSec', 'timeoutSec', 'regexField', 'ScriptIndependentMonitorView'],
}

function sectionForField(name: string): string {
  for (const [section, names] of Object.entries(SECTION_FIELDS)) {
    if (names.includes(name)) return section
  }
  return 'request'
}

const ACCORDION_STORAGE_KEY = 'mx-rma-script-editor-accordions'
type AccordionState = Record<string, boolean>
const DEFAULT_ACCORDION_STATE: AccordionState = {
  identity: true,
  request: true,
  auth: false,
  monitoring: false,
  scheduling: false,
  output: false,
}

function readAccordionState(): AccordionState {
  try {
    const raw = localStorage.getItem(ACCORDION_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return { ...DEFAULT_ACCORDION_STATE, ...parsed }
    }
  } catch { /* ignore malformed/unavailable storage */ }
  return DEFAULT_ACCORDION_STATE
}

export default forwardRef<ScriptFormHandle, Props>(
  function ScriptForm({ open, device, script, onChange, onClose }, ref) {
    const dispatch = useAppDispatch()
    const [draft, setDraft] = useState<ScriptInstance>(script)
    const [dryRunOpen, setDryRunOpen] = useState(false)
    const [dryRunResults, setDryRunResults] = useState<DryRunResults | null>(null)

    const [headersError, setHeadersError] = useState(false)
    const [payloadError, setPayloadError] = useState(false)
    const [scriptNameError, setScriptNameError] = useState(false)
    const [toast, setToast] = useState<{ id: number; message: string; severity: 'success' | 'warning' } | null>(null)
    const notify = (message: string, severity: 'success' | 'warning') => setToast({ id: Date.now(), message, severity })

    // Per-browser accordion expand/collapse preferences, restored on every open.
    const [expandedSections, setExpandedSections] = useState<AccordionState>(readAccordionState)
    useEffect(() => {
      try { localStorage.setItem(ACCORDION_STORAGE_KEY, JSON.stringify(expandedSections)) } catch { /* ignore */ }
    }, [expandedSections])
    const toggleSection = (id: string) => (_event: React.SyntheticEvent, isExpanded: boolean) =>
      setExpandedSections(prev => ({ ...prev, [id]: isExpanded }))

    const validateScriptName = (value: string) => !/[!@#$%^&*|]/.test(value)
    const validateHeaders = (value: string) => !value || (value.trim().startsWith('@{') && value.trim().endsWith('}'))
    const validatePayload = (value: string, format: string) => {
      if (!value.trim()) return true
      if (format === 'json') {
        try { JSON.parse(value); return true } catch { return false }
      } else if (format === 'xml') {
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(value, 'text/xml')
          return !doc.querySelector('parsererror')
        } catch { return false }
      }
      return true
    }

    useEffect(() => { setDraft(script) }, [script])

    useEffect(() => {
      if (draft.isRestmon) {
        setPayloadError(!validatePayload(draft.args.payload || '', draft.args.outputFormat || 'json'))
      }
    }, [draft.args.outputFormat, draft.args.payload])

    useEffect(() => { setScriptNameError(!validateScriptName(draft.instanceName || '')) }, [draft.instanceName])

    const withOneLinePayload = (source: ScriptInstance): ScriptInstance => {
      if (!source || typeof source.args !== 'object' || !source.args) return source
      const args = source.args as any
      if (typeof args.payload !== 'string') return source
      const payload = minifyPayload(args.payload, args.outputFormat || 'json')
      if (payload === args.payload) return source
      return { ...source, args: { ...args, payload } }
    }

    useImperativeHandle(ref, () => ({
      isDirty: () => JSON.stringify(draft) !== JSON.stringify(script),
      save: () => {
        const next = withOneLinePayload(draft)
        dispatch(updateScript({ deviceId: device.id, script: next }))
        setDraft(next)
        onChange(next)
        notify('Script instance saved successfully', 'success')
      },
      discard: () => setDraft(script)
    }), [draft, script, device, dispatch, onChange])

    const set = (fieldName: string, value: any) => {
      const field = config.scriptUI.allFields.find(f => f.name === fieldName)
      const isNumber = field?.type === 'number'
      const isCheckbox = field?.type === 'checkbox'
      const restmonSpecific = ['method', 'outputFormat', 'url', 'payload', 'headers', 'matchRegex', 'username', 'password', 'decryptPass']
      setDraft(prev => {
        const next = { ...prev }
        let finalValue = value
        if (isNumber) finalValue = Number(value)
        if (isCheckbox) finalValue = value ? '1' : '0'

        if (draft.isRestmon && restmonSpecific.includes(fieldName)) {
          if (typeof next.args !== 'object' || !next.args) next.args = {}
          next.args = { ...next.args }
            ; (next.args as any)[fieldName] = finalValue
        } else if (fieldName === 'args') {
          next.args = value
        } else {
          ; (next as any)[fieldName] = finalValue
        }
        return next
      })
    }

    const encodedPreview = buildEncodedArgs(draft)

    const fieldOrder = draft.isRestmon ? config.scriptUI.restmonOrder : config.scriptUI.genericOrder
    const fieldsToShow = fieldOrder.map(name => config.scriptUI.allFields.find(f => f.name === name)).filter(Boolean) as FieldConfig[]

    const isSchedulingField = (name: string) =>
      name.startsWith('scriptSunday') || name.startsWith('scriptMonday') || name.startsWith('scriptTueday') ||
      name.startsWith('scriptWednesday') || name.startsWith('scriptThursday') || name.startsWith('scriptFriday') ||
      name.startsWith('scriptSaturday') || name === 'scriptStartTime' || name === 'scriptEndTime'

    const getValue = (fieldName: string) => {
      const field = config.scriptUI.allFields.find(f => f.name === fieldName)
      const isCheckbox = field?.type === 'checkbox'
      const restmonSpecific = ['method', 'outputFormat', 'url', 'payload', 'headers', 'matchRegex', 'username', 'password', 'decryptPass']

      let val: any = ''
      if (draft.isRestmon && restmonSpecific.includes(fieldName)) {
        if (typeof draft.args === 'object' && draft.args) {
          val = (draft.args as any)[fieldName] || ''
        }
      } else if (fieldName === 'args') {
        val = draft.args || ''
      } else {
        val = (draft as any)[fieldName] || ''
      }

      // Decode BMC placeholders for regex fields when displaying
      if (fieldName === 'scriptScheduleDateRegex' || fieldName === 'regexField') {
        val = String(val).replace(/<BMC_SEP>/g, '|').replace(/<BMC_STAR>/g, '*')
      }

      if (isCheckbox) return val === '1' || val === 1 || val === true
      return val
    }

    const save = () => {
      if (scriptNameError || headersError || payloadError) {
        notify('Script not saved — fix validation errors', 'warning')
        return
      }
      const next = withOneLinePayload(draft)
      dispatch(updateScript({ deviceId: device.id, script: next }))
      setDraft(next)
      onChange(next)
      notify('Script instance saved successfully', 'success')
    }

    const runDryRun = async () => {
      const { originalCommand, command } = buildDryRunCommands(draft)
      let results = ''
      if (window.electronAPI?.runCommand) {
        try {
          const res = await window.electronAPI.runCommand(command)
          results = res.error ? `Error: ${res.error}\nStdout: ${res.stdout}\nStderr: ${res.stderr}` : `Stdout: ${res.stdout}\nStderr: ${res.stderr}`
        } catch (e) {
          results = `Failed to run: ${e}`
        }
      } else {
        results = 'Dry run is only available in the Electron app.'
      }
      setDryRunResults({ command, originalCommand, results })
      setDryRunOpen(true)
    }

    const encryptPass = async () => {
      const pw = getValue('password')
      if (!pw) { alert('Enter a password to encrypt'); return }
      try {
        const pwBytes = new Uint8Array(pw.length * 2)
        for (let i = 0; i < pw.length; i++) {
          const code = pw.charCodeAt(i)
          pwBytes[i * 2] = code & 0xFF
          pwBytes[i * 2 + 1] = code >> 8
        }
        const keyBytes = new Uint8Array(32)
        for (let i = 0; i < 32; i++) keyBytes[i] = i + 1
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt'])
        const iv = crypto.getRandomValues(new Uint8Array(16))
        const ctBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, pwBytes)
        const ct = new Uint8Array(ctBuf)
        const HEADER = '76492d1116743f0423413b16050a5345'
        const ivB64 = btoa(String.fromCharCode(...iv))
        const cipherHex = Array.from(ct).map(b => b.toString(16).padStart(2, '0')).join('')
        const pkg = `2|${ivB64}|${cipherHex}`
        const pkgUtf16 = new Uint8Array(pkg.length * 2)
        for (let i = 0; i < pkg.length; i++) {
          const code = pkg.charCodeAt(i)
          pkgUtf16[i * 2] = code & 0xFF
          pkgUtf16[i * 2 + 1] = code >> 8
        }
        let b64Input = ''
        for (let i = 0; i < pkgUtf16.length; i++) b64Input += String.fromCharCode(pkgUtf16[i])
        const encoded = btoa(b64Input)
        set('password', HEADER + encoded)
        set('decryptPass', 'TRUE')
      } catch (e) {
        console.error('Encryption failed', e)
      }
    }

    const renderField = (field: FieldConfig) => {
      const value = getValue(field.name)
      const isSelect = field.type === 'select'
      const isTextarea = field.type === 'textarea'
      const isPassword = field.type === 'password'
      const isNumber = field.type === 'number'

      if (field.name === 'headers') {
        return (
          <Grid item xs={12} key={field.name}>
            <Tooltip title='Example: @{"Content-Type" = "application/json"; "Authorization" = "token"}'>
              <TextField
                label={field.label}
                fullWidth
                size='small'
                value={value}
                onChange={e => { set(field.name, e.target.value); setHeadersError(!validateHeaders(e.target.value)) }}
                error={headersError}
                helperText={headersError ? 'Invalid format. Must be a PowerShell hashtable like @{"key"="value"}' : ''}
              />
            </Tooltip>
          </Grid>
        )
      }

      if (field.name === 'payload') {
        return (
          <Grid item xs={12} key={field.name}>
            <PayloadEditor
              label={field.label}
              format={draft.args.outputFormat || 'json'}
              value={String(value ?? '')}
              error={payloadError}
              helperText={payloadError ? `Invalid ${draft.args.outputFormat || 'json'} format` : ''}
              onChange={(next) => { set(field.name, next); setPayloadError(!validatePayload(next, draft.args.outputFormat || 'json')) }}
            />
          </Grid>
        )
      }

      if (field.name === 'password') {
        return (
          <Grid item xs={12} md={6} lg={4} key={field.name}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                label={field.label}
                type={isPassword ? 'password' : 'text'}
                fullWidth
                size='small'
                value={value}
                onChange={e => set(field.name, e.target.value)}
              />
              <Tooltip title='Encrypt password (PowerShell SecureString)'>
                <IconButton onClick={encryptPass} size='small' color='primary'>
                  <LockIcon fontSize='small' />
                </IconButton>
              </Tooltip>
            </Box>
          </Grid>
        )
      }

      if (field.name === 'decryptPass') {
        return (
          <Grid item xs={12} md={6} lg={4} key={field.name}>
            <TextField
              label={field.label}
              select
              fullWidth
              size='small'
              value={value}
              onChange={e => set(field.name, e.target.value)}
            >
              {field.options?.map(option => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </TextField>
          </Grid>
        )
      }

      if (isSchedulingField(field.name)) return null

      if (field.name === 'instanceName') {
        return (
          <Grid item xs={12} md={6} lg={4} key={field.name}>
            <TextField
              label={field.label}
              fullWidth
              size='small'
              value={value}
              onChange={e => { set(field.name, e.target.value); setScriptNameError(!validateScriptName(e.target.value)) }}
              error={scriptNameError}
              helperText={scriptNameError ? 'Script name must not contain these characters: !@#$%^&*|' : ''}
            />
          </Grid>
        )
      }

      if (field.type === 'checkbox') {
        return (
          <Grid item xs={12} md={4} key={field.name}>
            <FormControlLabel
              control={<Checkbox size='small' checked={!!value} onChange={e => set(field.name, e.target.checked)} />}
              label={field.label}
            />
          </Grid>
        )
      }

      return (
        <Grid item xs={12} md={
          field.name === 'url' || field.name === 'payload' || field.name === 'args' || field.name === 'regexField' || field.type === 'textarea' ? 12 :
            field.name === 'pollIntervalSec' || field.name === 'timeoutSec' ? 6 :
              6
        } lg={
          field.name === 'url' || field.name === 'payload' || field.name === 'args' || field.name === 'regexField' || field.type === 'textarea' ? 12 : 4
        } key={field.name}>
          {field.name === 'scriptPath' ? (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                label={field.label}
                fullWidth
                size='small'
                value={value}
                onChange={e => set(field.name, e.target.value)}
              />
              <Tooltip title='Browse for script file'>
                <IconButton size='small' onClick={async () => {
                  const path = await window.electronAPI.selectPath({ file: true });
                  if (path) set(field.name, path);
                }}>
                  <FolderOpenIcon fontSize='small' />
                </IconButton>
              </Tooltip>
            </Box>
          ) : (
            <TextField
              label={field.label}
              type={isPassword ? 'password' : isNumber ? 'number' : field.type === 'time' ? 'time' : 'text'}
              select={isSelect}
              multiline={isTextarea}
              minRows={isTextarea ? 3 : undefined}
              fullWidth
              size='small'
              value={value}
              onChange={e => set(field.name, e.target.value)}
              InputLabelProps={field.type === 'time' ? { shrink: true } : undefined}
            >
              {isSelect && field.options?.map(option => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </TextField>
          )}
        </Grid>
      )
    }

    const sectionFields = (names: string[]) =>
      fieldsToShow.filter(f => names.includes(f.name)).map(renderField)

    const schedulingSection = (
      <Accordion expanded={expandedSections.scheduling} onChange={toggleSection('scheduling')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Scheduling</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            {fieldsToShow.filter(f => f.name === 'scriptSchedulingEnable' || f.name === 'scriptScheduleDateRegex').map(renderField)}
            <Grid item xs={12} md={6}>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, height: '100%' }}>
                <Typography variant='subtitle2' gutterBottom>Run Days</Typography>
                <Stack>
                  {['scriptSunday', 'scriptMonday', 'scriptTueday', 'scriptWednesday', 'scriptThursday', 'scriptFriday', 'scriptSaturday'].map(dayName => {
                    const f = config.scriptUI.allFields.find(field => field.name === dayName);
                    if (!f) return null;
                    return (
                      <FormControlLabel
                        key={dayName}
                        control={<Checkbox size='small' checked={!!getValue(dayName)} onChange={e => set(dayName, e.target.checked)} />}
                        label={f.label}
                        sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                      />
                    );
                  })}
                </Stack>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, height: '100%' }}>
                <Typography variant='subtitle2' gutterBottom>Operating Window</Typography>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  <TimePicker
                    label='Start Time'
                    ampm={false}
                    value={getValue('scriptStartTime') ? dayjs(getValue('scriptStartTime'), 'HH:mm') : null}
                    onChange={(newValue) => set('scriptStartTime', newValue ? newValue.format('HH:mm') : '')}
                    slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                  />
                  <TimePicker
                    label='End Time'
                    ampm={false}
                    value={getValue('scriptEndTime') ? dayjs(getValue('scriptEndTime'), 'HH:mm') : null}
                    onChange={(newValue) => set('scriptEndTime', newValue ? newValue.format('HH:mm') : '')}
                    slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                  />
                </Stack>
              </Box>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    )

    return (
      <Drawer anchor='right' open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 'min(1100px, 92vw)' }, display: 'flex', flexDirection: 'column' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box>
            <Typography variant='h6'>Edit Script</Typography>
            <Typography variant='body2' color='text.secondary'>{draft.instanceName}</Typography>
          </Box>
          <Tooltip title='Close'>
            <IconButton onClick={onClose} aria-label='close editor'><CloseIcon /></IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1 }}>
          <FormControlLabel
            control={<Checkbox size='small' checked={draft.isRestmon ?? false} onChange={e => setDraft(prev => {
              const next = { ...prev, isRestmon: e.target.checked }
              if (next.isRestmon) {
                if (typeof next.args !== 'object') next.args = {}
              } else {
                if (typeof next.args === 'object') next.args = ''
              }
              return next
            })} />}
            label='Is Restmon Script'
            sx={{ mb: 1 }}
          />

          <Accordion expanded={expandedSections.identity} onChange={toggleSection('identity')} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>Identity</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {sectionFields(['instanceName', 'scriptPath'])}
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion expanded={expandedSections.request} onChange={toggleSection('request')} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>{draft.isRestmon ? 'Request' : 'Arguments'}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {sectionFields(SECTION_FIELDS.request)}
              </Grid>
            </AccordionDetails>
          </Accordion>

          {draft.isRestmon && (
            <Accordion expanded={expandedSections.auth} onChange={toggleSection('auth')} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>Authentication</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {sectionFields(SECTION_FIELDS.auth)}
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}

          <Accordion expanded={expandedSections.monitoring} onChange={toggleSection('monitoring')} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>Monitoring</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {sectionFields(SECTION_FIELDS.monitoring)}
              </Grid>
            </AccordionDetails>
          </Accordion>

          {schedulingSection}

          <Accordion expanded={expandedSections.output} onChange={toggleSection('output')} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>Output Preview</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                label={draft.isRestmon ? 'Encoded Command Preview' : 'Arguments Preview'}
                fullWidth multiline minRows={2} size='small'
                value={encodedPreview}
                InputProps={{ readOnly: true }}
              />
            </AccordionDetails>
          </Accordion>
        </Box>

        <Divider />
        <Box sx={{ display: 'flex', gap: 1, p: 2, backgroundColor: 'background.paper' }}>
          <Button variant='outlined' startIcon={<ScienceIcon />} onClick={runDryRun}>Dry Run</Button>
          <Button variant='contained' startIcon={<SaveIcon />} onClick={save}>Save Script</Button>
          <Button variant='text' startIcon={<CloseIcon />} onClick={onClose}>Cancel</Button>
        </Box>

        <DryRunResultsDialog open={dryRunOpen} onClose={() => setDryRunOpen(false)} results={dryRunResults} />

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
      </Drawer>
    )
  })
