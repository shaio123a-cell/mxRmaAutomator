
import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Box, Button, Grid, MenuItem, Stack, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Checkbox, FormControlLabel, Tooltip } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { Device, ScriptInstance, updateScript } from '../store/fbcskmSlice'
import { useAppDispatch } from '../store/store'
import config from '../config'

export type ScriptFormHandle = {
  isDirty: () => boolean
  save: () => void
  discard: () => void
}

export default forwardRef<ScriptFormHandle, { device: Device, script: ScriptInstance, onChange: (s: ScriptInstance) => void }>(
  function ScriptForm({ device, script, onChange }, ref) {
    const dispatch = useAppDispatch()
    const [draft, setDraft] = useState<ScriptInstance>(script)
    const [dryRunOpen, setDryRunOpen] = useState(false)
    const [dryRunResults, setDryRunResults] = useState<{ command: string, originalCommand: string, results: string } | null>(null)



    const [headersError, setHeadersError] = useState(false)
    const [payloadError, setPayloadError] = useState(false)

    const validateHeaders = (value: string) => !value || (value.trim().startsWith('@{') && value.trim().endsWith('}'))

    const validatePayload = (value: string, format: string) => {
      if (!value.trim()) return true
      if (format === 'json') {
        try {
          JSON.parse(value)
          return true
        } catch {
          return false
        }
      } else if (format === 'xml') {
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(value, 'text/xml')
          return !doc.querySelector('parsererror')
        } catch {
          return false
        }
      } else if (format === 'text') {
        return true
      }
      return true
    }

    // Keep local draft in sync when the parent selects a different script
    useEffect(() => {
      setDraft(script)
    }, [script])

    useEffect(() => {
      if (draft.isRestmon) {
        setPayloadError(!validatePayload(draft.args.payload || '', draft.args.outputFormat || 'json'))
      }
    }, [draft.args.outputFormat, draft.args.payload])

    useImperativeHandle(ref, () => ({
      isDirty: () => JSON.stringify(draft) !== JSON.stringify(script),
      save: () => { dispatch(updateScript({ deviceId: device.id, script: draft })); onChange(draft) },
      discard: () => setDraft(script)
    }), [draft, script, device, dispatch, onChange])

    const set = (fieldName: string, value: any) => {
      const field = config.scriptUI.allFields.find(f => f.name === fieldName)
      const isNumber = field?.type === 'number'
      const restmonSpecific = ['method', 'outputFormat', 'url', 'payload', 'headers', 'matchRegex', 'username', 'password', 'decryptPass']
      setDraft(prev => {
        const next = { ...prev }
        if (draft.isRestmon && restmonSpecific.includes(fieldName)) {
          if (typeof next.args !== 'object' || !next.args) next.args = {}
          next.args = { ...next.args }
            ; (next.args as any)[fieldName] = isNumber ? Number(value) : value
        } else if (fieldName === 'args') {
          next.args = value
        } else {
          ; (next as any)[fieldName] = isNumber ? Number(value) : value
        }
        return next
      })
    }

    const encodedPreview = (() => {
      // Use single quotes for wrapping, escape single quotes as '' (PowerShell standard)
      const escapeArg = (s: string) => s.replace(/'/g, "''")
      const encodeSpecials = (s: string): string => s.replace(/\|/g, '<BMC_SEP>').replace(/\*/g, '<BMC_STAR>')
      if (!draft.isRestmon) return encodeSpecials(draft.args || '')
      if (typeof draft.args !== 'object' || !draft.args) return ' '
      const parts: string[] = []
      const a = draft.args
      if (a.url) parts.push(`-url ${a.url}`)
      if (a.method) parts.push(`-method ${a.method}`)
      if (a.outputFormat) parts.push(`-outputFormat ${a.outputFormat}`)
      if (a.payload) parts.push(`-payload '${escapeArg(a.payload)}'`)
      if (a.searchKey) parts.push(`-searchKey '${escapeArg(a.searchKey)}'`)
      if (a.searchString) parts.push(`-searchString '${escapeArg(a.searchString)}'`)
      if (a.matchRegex) parts.push(`-matchRegex '${escapeArg(a.matchRegex)}'`)
      if (a.username) parts.push(`-username '${escapeArg(a.username)}'`)
      if (a.password) parts.push(`-password '${escapeArg(a.password)}'`)
      // headers: passed raw without quotes or escaping, as requested
      if (a.headers) parts.push(`-headers ${a.headers}`)
      if (a.decryptPass) parts.push(`-decryptPass ${a.decryptPass}`)
      let cmd = ' ' + parts.join(' ') + ' '
      cmd = cmd.replace(/\|/g, '<BMC_SEP>').replace(/\*/g, '<BMC_STAR>')
      return cmd
    })()

    const fieldOrder = draft.isRestmon ? config.scriptUI.restmonOrder : config.scriptUI.genericOrder
    const fieldsToShow = fieldOrder.map(name => config.scriptUI.allFields.find(f => f.name === name)).filter(Boolean) as FieldConfig[]

    const getValue = (fieldName: string) => {
      const restmonSpecific = ['method', 'outputFormat', 'url', 'payload', 'headers', 'matchRegex', 'username', 'password', 'decryptPass']
      if (draft.isRestmon && restmonSpecific.includes(fieldName)) {
        if (typeof draft.args === 'object' && draft.args) {
          return (draft.args as any)[fieldName] || ''
        } else {
          return ''
        }
      } else if (fieldName === 'args') {
        return draft.args || ''
      } else {
        return (draft as any)[fieldName] || ''
      }
    }

    const save = () => {
      dispatch(updateScript({ deviceId: device.id, script: draft }))
      onChange(draft)
    }

    return (
      <Stack spacing={2}>
        <Typography variant='h6'>Edit Script</Typography>
        <FormControlLabel control={<Checkbox checked={draft.isRestmon ?? false} onChange={e => setDraft(prev => {
          const next = { ...prev, isRestmon: e.target.checked }
          if (next.isRestmon) {
            if (typeof next.args !== 'object') next.args = {}
          } else {
            if (typeof next.args === 'object') next.args = ''
          }
          return next
        })} />} label="Is Restmon Script" />
        <Grid container spacing={2}>
          {fieldsToShow.map(field => {
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
                  <TextField
                    label={field.label}
                    fullWidth
                    value={value}
                    onChange={e => { set(field.name, e.target.value); setPayloadError(!validatePayload(e.target.value, draft.args.outputFormat || 'json')) }}
                    error={payloadError}
                    helperText={payloadError ? `Invalid ${draft.args.outputFormat || 'json'} format` : ''}
                  />
                </Grid>
              )
            }

            if (field.name === 'password') {
              return (
                <Grid item xs={12} md={6} key={field.name}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <TextField
                      label={field.label}
                      type={isPassword ? 'password' : 'text'}
                      fullWidth
                      value={value}
                      onChange={e => set(field.name, e.target.value)}
                    />
                    <Button size='small' variant='outlined'
                      onClick={async () => {
                        const pw = value;
                        if (!pw) { alert('Enter a password to encrypt'); return; }

                        try {
                          // 1) UTF‑16LE bytes of the password (NO null terminator)
                          const pwBytes = new Uint8Array(pw.length * 2);
                          for (let i = 0; i < pw.length; i++) {
                            const code = pw.charCodeAt(i);
                            pwBytes[i * 2] = code & 0xFF;        // little-endian
                            pwBytes[i * 2 + 1] = code >> 8;
                          }

                          // 2) 32-byte key = (1..32)
                          const keyBytes = new Uint8Array(32);
                          for (let i = 0; i < 32; i++) keyBytes[i] = i + 1;
                          const key = await crypto.subtle.importKey(
                            'raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']
                          );

                          // 3) Random 16-byte IV
                          const iv = crypto.getRandomValues(new Uint8Array(16));

                          // 4) Encrypt (AES-CBC, PKCS#7 padding)
                          const ctBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, pwBytes);
                          const ct = new Uint8Array(ctBuf);

                          // 5) Build V2 package: HEADER + base64( UTF-16LE("2|<IV-b64>|<cipher-hex>") )
                          const HEADER = '76492d1116743f0423413b16050a5345'; // SecureStringExportHeader

                          // IV → Base64
                          const ivB64 = btoa(String.fromCharCode(...iv));

                          // Ciphertext → lowercase hex
                          const cipherHex = Array.from(ct).map(b => b.toString(16).padStart(2, '0')).join('');

                          // "2|<IV>|<HEX>"
                          const pkg = `2|${ivB64}|${cipherHex}`;

                          // UTF‑16LE encode the package string
                          const pkgUtf16 = new Uint8Array(pkg.length * 2);
                          for (let i = 0; i < pkg.length; i++) {
                            const code = pkg.charCodeAt(i);
                            pkgUtf16[i * 2] = code & 0xFF;
                            pkgUtf16[i * 2 + 1] = code >> 8;
                          }

                          // Base64 encode UTF‑16LE bytes
                          let b64Input = '';
                          for (let i = 0; i < pkgUtf16.length; i++) b64Input += String.fromCharCode(pkgUtf16[i]);
                          const encoded = btoa(b64Input);

                          const finalString = HEADER + encoded;

                          set('password', finalString);
                          set('decryptPass', 'TRUE');
                        } catch (e) {
                          console.error('Encryption failed', e);
                        }
                      }}>Encrypt Pass</Button>
                  </div>
                </Grid>
              )
            }

            if (field.name === 'decryptPass') {
              return (
                <Grid item xs={12} md={6} key={field.name}>
                  <TextField
                    label={field.label}
                    select
                    fullWidth
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

            return (
              <Grid item xs={12} md={
                field.name === 'url' || field.name === 'payload' || field.name === 'args' || field.name === 'regexField' ? 12 :
                  field.name === 'pollIntervalSec' || field.name === 'timeoutSec' ? 3 :
                    6
              } key={field.name}>
                {field.name === 'scriptPath' ? (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                      label={field.label}
                      fullWidth
                      value={value}
                      onChange={e => set(field.name, e.target.value)}
                    />
                    <IconButton onClick={async () => {
                      const path = await window.electronAPI.selectPath({ file: true });
                      if (path) set(field.name, path);
                    }}>
                      <FolderOpenIcon />
                    </IconButton>
                  </Box>
                ) : (
                  <TextField
                    label={field.label}
                    type={isPassword ? 'password' : isNumber ? 'number' : 'text'}
                    select={isSelect}
                    multiline={isTextarea}
                    minRows={isTextarea ? 3 : undefined}
                    fullWidth
                    value={value}
                    onChange={e => set(field.name, e.target.value)}
                  >
                    {isSelect && field.options?.map(option => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </TextField>
                )}
              </Grid>
            )
          })}
          <Grid item xs={12}>
            <TextField label={draft.isRestmon ? 'Encoded Command Preview' : 'Arguments Preview'} fullWidth multiline minRows={2} value={encodedPreview} InputProps={{ readOnly: true }} />
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant='contained' sx={{ backgroundColor: 'white', color: 'black' }} onClick={async () => {
            const isPs1 = draft.scriptPath.toLowerCase().endsWith('.ps1')
            const pathQuoted = `"${draft.scriptPath}"`

            // Simplify: use encodedPreview (which now uses single quotes) for both.
            // Just revert the placeholder replacements for execution/display.
            const argsBase = (draft.isRestmon ? ' ' + encodedPreview.replace(/<BMC_SEP>/g, '|').replace(/<BMC_STAR>/g, '*') : (' ' + (draft.args || '')))

            const originalCmd = `${pathQuoted}${argsBase}`
            const cmd = isPs1
              ? `powershell.exe -ExecutionPolicy Bypass -Command "& '${draft.scriptPath}' ${argsBase.replace(/"/g, '\\"')}"`
              : `${pathQuoted}${argsBase}`

            let results = ''
            if (window.electronAPI?.runCommand) {
              try {
                const res = await window.electronAPI.runCommand(cmd)
                results = res.error ? `Error: ${res.error}\nStdout: ${res.stdout}\nStderr: ${res.stderr}` : `Stdout: ${res.stdout}\nStderr: ${res.stderr}`
              } catch (e) {
                results = `Failed to run: ${e}`
              }
            } else {
              results = 'Dry run is only available in the Electron app.'
            }
            setDryRunResults({ command: cmd, originalCommand: originalCmd, results })
            setDryRunOpen(true)
          }}>Dry Run</Button>
          <Button variant='contained' onClick={save}>Save Script</Button>
        </Box>

        <Dialog open={dryRunOpen} onClose={() => setDryRunOpen(false)} maxWidth='md' fullWidth>
          <DialogTitle>Dry Run Results</DialogTitle>
          <DialogContent>
            {dryRunResults && (
              <>
                <Box sx={{ position: 'relative', mb: 2 }}>
                  <Typography variant='h6'>Original Command</Typography>
                  <IconButton sx={{ position: 'absolute', top: 0, right: 0 }} onClick={() => navigator.clipboard.writeText(dryRunResults.originalCommand)}>
                    <ContentCopyIcon />
                  </IconButton>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                    {dryRunResults.originalCommand}
                  </pre>
                </Box>
                <Box sx={{ position: 'relative', mb: 2 }}>
                  <Typography variant='h6'>Executed Command</Typography>
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
                  <Box sx={{ fontFamily: 'monospace', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 400, overflow: 'auto' }}>
                    {dryRunResults.results.split(/\r?\n/).map((line, i) => (
                      <div key={i} style={{
                        color: line.toLowerCase().includes('error') ? 'red' : line.toLowerCase().includes('warn') ? 'orange' : 'inherit',
                        minHeight: '1.2em'
                      }}>
                        {line}
                      </div>
                    ))}
                  </Box>
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
  })
