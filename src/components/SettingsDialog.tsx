import React, { useEffect, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import { useAppDispatch, useAppSelector } from '../store/store'
import {
  setActiveSystemPromptId,
  setAiModels,
  setDefaultDeviceSettings,
  setDefaultScriptSettings,
  setSystemPrompts,
  setThemePreference,
} from '../store/fbcskmSlice'
import type { AIModelConfig, AISystemPrompt } from '../config'
import type { DefaultScriptSettings } from '../store/fbcskmSlice'
import type { ThemePreference } from '../theme'
import { fetchProviderModels, testAiModel } from '../services/aiService'

const newModel = (): AIModelConfig => ({
  id: '',
  name: '',
  provider: 'openai-compatible',
  model: '',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  enabled: true,
  timeoutMs: 30000,
  apiVersion: '2024-10-21',
  status: 'healthy',
})

const providerBaseUrls: Record<AIModelConfig['provider'], string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  'google-gemini': 'https://generativelanguage.googleapis.com/v1beta',
  'azure-openai': 'https://YOUR-RESOURCE.openai.azure.com',
  ollama: 'http://localhost:11434/v1',
  mock: 'http://localhost',
}

const newPrompt = (): AISystemPrompt => ({ id: '', name: '', content: '' })

type ModelTestResult = { signature: string; passed: boolean }

function modelTestSignature(model: AIModelConfig): string {
  return JSON.stringify({
    provider: model.provider,
    baseUrl: model.baseUrl,
    model: model.model,
    apiKey: model.apiKey,
    apiVersion: model.apiVersion,
  })
}

export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const defaults = useAppSelector(state => state.fbcskm.defaultDeviceSettings || {})
  const scriptDefaults = useAppSelector(state => state.fbcskm.defaultScriptSettings) || ({} as DefaultScriptSettings)
  const aiModels = useAppSelector(state => state.fbcskm.aiModels)
  const systemPrompts = useAppSelector(state => state.fbcskm.systemPrompts)
  const activeSystemPromptId = useAppSelector(state => state.fbcskm.activeSystemPromptId)
  const currentThemePreference = useAppSelector(state => state.fbcskm.themePreference)

  const [port, setPort] = useState<string | number | null>(null)
  const [timeoutMs, setTimeoutMs] = useState<string | number | null>(null)
  const [pollSec, setPollSec] = useState<string | number | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [publicKeyPath, setPublicKeyPath] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [matrixPath, setMatrixPath] = useState('')
  const [genericPath, setGenericPath] = useState('')
  const [isRestmonDefault, setIsRestmonDefault] = useState(true)
  const [maxBackups, setMaxBackups] = useState<string | number>(10)
  const [models, setModels] = useState<AIModelConfig[]>([])
  const [prompts, setPrompts] = useState<AISystemPrompt[]>([])
  const [activePromptId, setActivePromptId] = useState<string | null>(null)
  const [modelDraft, setModelDraft] = useState<AIModelConfig>(newModel())
  const [promptDraft, setPromptDraft] = useState<AISystemPrompt>(newPrompt())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [modelStatus, setModelStatus] = useState('')
  const [testingModelId, setTestingModelId] = useState<string | null>(null)
  const [availableModelIds, setAvailableModelIds] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [modelTestResults, setModelTestResults] = useState<Record<string, ModelTestResult>>({})
  const [draftTestResult, setDraftTestResult] = useState<ModelTestResult | null>(null)
  const [isTestingDraft, setIsTestingDraft] = useState(false)
  const [theme, setTheme] = useState<ThemePreference>('system')

  useEffect(() => {
    if (!open) return
    setPort(defaults.port ?? null)
    setTimeoutMs(defaults.connectionTimeoutMs ?? null)
    setPollSec(defaults.connectionPollSec ?? null)
    setUsername(defaults.username ?? '')
    setPassword(defaults.password ?? '')
    setPublicKeyPath(defaults.publicKeyPath ?? '')
    setPrivateKeyPath(defaults.privateKeyPath ?? '')
    setPassphrase(defaults.passphrase ?? '')
    setMatrixPath(scriptDefaults.matrixKBPath ?? '/opt/matrixkb/restmon')
    setGenericPath(scriptDefaults.genericPath ?? scriptDefaults.matrixKBPath ?? '/opt/matrixkb/restmon')
    setIsRestmonDefault(scriptDefaults.isRestmonDefault ?? true)
    setMaxBackups(scriptDefaults.maxBackups ?? 10)
    setModels(aiModels.map(model => ({ ...model })))
    setPrompts(systemPrompts.map(prompt => ({ ...prompt })))
    setActivePromptId(activeSystemPromptId)
    setModelDraft(newModel())
    setAvailableModelIds([])
    setModelTestResults({})
    setDraftTestResult(null)
    setPromptDraft(newPrompt())
    setModelStatus('')
    setTheme(currentThemePreference)
  }, [open, defaults, scriptDefaults, aiModels, systemPrompts, activeSystemPromptId, currentThemePreference])

  const isDirty = () => (
    (defaults.port ?? null) !== (port ?? null)
    || (defaults.connectionTimeoutMs ?? null) !== (timeoutMs ?? null)
    || (defaults.connectionPollSec ?? null) !== (pollSec ?? null)
    || (defaults.username ?? '') !== username
    || (defaults.password ?? '') !== password
    || (defaults.publicKeyPath ?? '') !== publicKeyPath
    || (defaults.privateKeyPath ?? '') !== privateKeyPath
    || (defaults.passphrase ?? '') !== passphrase
    || (scriptDefaults.matrixKBPath ?? '') !== matrixPath
    || (scriptDefaults.genericPath ?? '') !== genericPath
    || (scriptDefaults.isRestmonDefault ?? true) !== isRestmonDefault
    || (scriptDefaults.maxBackups ?? 10) !== Number(maxBackups)
    || JSON.stringify(models) !== JSON.stringify(aiModels)
    || JSON.stringify(prompts) !== JSON.stringify(systemPrompts)
    || activePromptId !== activeSystemPromptId
    || Boolean(modelDraft.name || modelDraft.model || modelDraft.apiKey || modelDraft.baseUrl !== 'https://api.openai.com/v1')
    || Boolean(promptDraft.name || promptDraft.content)
    || theme !== currentThemePreference
  )

  const save = () => {
    dispatch(setDefaultDeviceSettings({
      port: port === '' || port === null ? null : Number(port),
      connectionTimeoutMs: timeoutMs === '' || timeoutMs === null ? null : Number(timeoutMs),
      connectionPollSec: pollSec === '' || pollSec === null ? null : Number(pollSec),
      username,
      password,
      publicKeyPath,
      privateKeyPath,
      passphrase,
    }))
    dispatch(setDefaultScriptSettings({
      matrixKBPath: matrixPath || '/opt/matrixkb/restmon',
      genericPath: genericPath || matrixPath || '/opt/matrixkb/restmon',
      isRestmonDefault,
      maxBackups: Number(maxBackups),
    }))
    dispatch(setAiModels(models))
    dispatch(setSystemPrompts(prompts))
    dispatch(setActiveSystemPromptId(activePromptId))
    dispatch(setThemePreference(theme))
    setConfirmOpen(false)
    onClose()
  }

  const requestClose = () => {
    if (isDirty()) setConfirmOpen(true)
    else onClose()
  }

  const discardAndClose = () => {
    setConfirmOpen(false)
    onClose()
  }

  const saveModel = () => {
    if (!modelDraft.name.trim() || !modelDraft.model.trim() || !modelDraft.baseUrl.trim()) {
      setModelStatus('Enter a model name, model ID, and base URL.')
      return
    }
    const model = { ...modelDraft, id: modelDraft.id || `model-${Date.now()}` }
    setModels(current => {
      const index = current.findIndex(item => item.id === model.id)
      if (index < 0) return [...current, model]
      return current.map(item => item.id === model.id ? model : item)
    })
    setModelTestResults(current => {
      const next = { ...current }
      delete next[model.id]
      return next
    })
    setModelDraft(newModel())
    setDraftTestResult(null)
    setModelStatus('Model saved. Drag models to set fallback priority.')
  }

  const fetchModels = async () => {
    setIsFetchingModels(true)
    setModelStatus(`Fetching model IDs from ${modelDraft.provider}...`)
    try {
      const foundModels = await fetchProviderModels(modelDraft)
      if (!foundModels.length) throw new Error('No models were returned by this provider.')
      setAvailableModelIds(foundModels)
      setModelDraft(current => ({
        ...current,
        model: foundModels.includes(current.model) ? current.model : foundModels[0],
      }))
      setModelStatus(`Found ${foundModels.length} model ID(s). Select the model or deployment you want to use.`)
    } catch (error) {
      setAvailableModelIds([])
      setModelStatus(`Could not fetch models: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsFetchingModels(false)
    }
  }

  const testModel = async (model: AIModelConfig) => {
    const signature = modelTestSignature(model)
    setTestingModelId(model.id)
    setModelStatus(`Testing ${model.name}...`)
    try {
      const activePrompt = prompts.find(prompt => prompt.id === activePromptId)?.content
      await testAiModel(model, activePrompt)
      setModelTestResults(current => ({ ...current, [model.id]: { signature, passed: true } }))
      setModels(current => current.map(item => item.id === model.id ? { ...item, status: 'healthy' } : item))
      setModelStatus(`${model.name} responded successfully.`)
    } catch (error) {
      setModelTestResults(current => ({ ...current, [model.id]: { signature, passed: false } }))
      setModels(current => current.map(item => item.id === model.id ? { ...item, status: 'degraded' } : item))
      setModelStatus(`${model.name} failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setTestingModelId(null)
    }
  }

  const testModelDraft = async () => {
    const signature = modelTestSignature(modelDraft)
    setIsTestingDraft(true)
    setModelStatus(`Testing ${modelDraft.name || modelDraft.provider}...`)
    try {
      const activePrompt = prompts.find(prompt => prompt.id === activePromptId)?.content
      await testAiModel(modelDraft, activePrompt)
      setDraftTestResult({ signature, passed: true })
      setModelStatus(`${modelDraft.name || modelDraft.provider} responded successfully.`)
    } catch (error) {
      setDraftTestResult({ signature, passed: false })
      setModelStatus(`${modelDraft.name || modelDraft.provider} failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsTestingDraft(false)
    }
  }

  const savePrompt = () => {
    if (!promptDraft.name.trim() || !promptDraft.content.trim()) return
    const prompt = { ...promptDraft, id: promptDraft.id || `prompt-${Date.now()}` }
    setPrompts(current => {
      const index = current.findIndex(item => item.id === prompt.id)
      if (index < 0) return [...current, prompt]
      return current.map(item => item.id === prompt.id ? prompt : item)
    })
    if (!activePromptId) setActivePromptId(prompt.id)
    setPromptDraft(newPrompt())
  }

  const reorder = (from: number, to: number) => {
    if (from === to) return
    setModels(current => {
      const next = [...current]
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      return next
    })
  }

  const sectionSx = { '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '4px !important', boxShadow: 'none', backgroundColor: 'background.paper' }

  return (
    <>
      <Dialog open={open} onClose={requestClose} maxWidth='md' fullWidth>
        <DialogTitle>Configuration</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Accordion defaultExpanded sx={sectionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={600}>Appearance</Typography></AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <Typography variant='body2' color='text.secondary'>Theme for the whole application. "System" follows your operating system's light/dark setting.</Typography>
                  <RadioGroup row value={theme} onChange={event => setTheme(event.target.value as ThemePreference)}>
                    <FormControlLabel value='light' control={<Radio size='small' />} label='Light' />
                    <FormControlLabel value='dark' control={<Radio size='small' />} label='Dark' />
                    <FormControlLabel value='system' control={<Radio size='small' />} label='System' />
                  </RadioGroup>
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Accordion sx={sectionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={600}>Device Defaults</Typography></AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <Typography variant='body2' color='text.secondary'>Applied only to newly created devices.</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField label='Port' value={port ?? ''} onChange={event => setPort(event.target.value)} size='small' fullWidth />
                    <TextField label='Connection timeout (ms)' value={timeoutMs ?? ''} onChange={event => setTimeoutMs(event.target.value)} size='small' fullWidth />
                    <TextField label='Connection poll (sec)' value={pollSec ?? ''} onChange={event => setPollSec(event.target.value)} size='small' fullWidth />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField label='Username' value={username} onChange={event => setUsername(event.target.value)} size='small' fullWidth />
                    <TextField label='Password' type='password' value={password} onChange={event => setPassword(event.target.value)} size='small' fullWidth />
                  </Stack>
                  <TextField label='Public key path' value={publicKeyPath} onChange={event => setPublicKeyPath(event.target.value)} size='small' fullWidth />
                  <TextField label='Private key path' value={privateKeyPath} onChange={event => setPrivateKeyPath(event.target.value)} size='small' fullWidth />
                  <TextField label='Passphrase' type='password' value={passphrase} onChange={event => setPassphrase(event.target.value)} size='small' fullWidth />
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Accordion sx={sectionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={600}>Script Defaults</Typography></AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <TextField label='MatrixKB RestMon Script Path' value={matrixPath} onChange={event => setMatrixPath(event.target.value)} size='small' fullWidth />
                  <TextField label='Generic Script Path' value={genericPath} onChange={event => setGenericPath(event.target.value)} size='small' fullWidth />
                  <FormControlLabel control={<Checkbox checked={isRestmonDefault} onChange={event => setIsRestmonDefault(event.target.checked)} />} label='Default to RestMon scripts' />
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Accordion sx={sectionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={600}>AI Models and Fallback Chain</Typography></AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <Typography variant='body2' color='text.secondary'>Enabled models are tried in the order shown. Timeouts, rate limits, network failures, and invalid responses move generation to the next enabled model.</Typography>
                  {models.map((model, index) => (
                    <Box key={model.id} draggable onDragStart={event => { setDragIndex(index); event.dataTransfer.effectAllowed = 'move' }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragIndex !== null) reorder(dragIndex, index); setDragIndex(null) }} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, backgroundColor: 'background.paper', cursor: 'grab' }}>
                      <Typography variant='caption' color='text.secondary' sx={{ minWidth: 24 }}>{index + 1}.</Typography>
                      <Box sx={{ flex: 1, minWidth: 150 }}>
                        <Typography fontWeight={600}>{model.name}</Typography>
                        <Typography variant='caption' color='text.secondary'>{model.provider} · {model.model}</Typography>
                      </Box>
                      <Chip label={model.enabled ? model.status : 'disabled'} size='small' color={model.enabled ? (model.status === 'healthy' ? 'success' : model.status === 'degraded' ? 'warning' : 'error') : 'default'} />
                      <Tooltip title='Test provider'>
                        <span><IconButton size='small' aria-label={`Test ${model.name}`} color={modelTestResults[model.id]?.signature === modelTestSignature(model) ? (modelTestResults[model.id]?.passed ? 'success' : 'error') : 'default'} disabled={testingModelId === model.id} onClick={() => void testModel(model)}>
                          {testingModelId === model.id ? <CircularProgress size={18} /> : <ScienceOutlinedIcon fontSize='small' />}
                          </IconButton></span>
                      </Tooltip>
                      <Tooltip title='Edit provider'><IconButton size='small' aria-label={`Edit ${model.name}`} onClick={() => { setModelDraft({ ...model }); setAvailableModelIds([]) }}><EditOutlinedIcon fontSize='small' /></IconButton></Tooltip>
                      <Tooltip title='Delete provider'><IconButton size='small' aria-label={`Delete ${model.name}`} color='error' onClick={() => setModels(current => current.filter(item => item.id !== model.id))}><DeleteOutlineIcon fontSize='small' /></IconButton></Tooltip>
                    </Box>
                  ))}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField label='Model name' value={modelDraft.name} onChange={event => setModelDraft({ ...modelDraft, name: event.target.value })} size='small' fullWidth />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 200 }}>
                      {availableModelIds.length > 0 ? (
                        <TextField select label={modelDraft.provider === 'azure-openai' ? 'Deployment name' : 'Model ID'} value={modelDraft.model} onChange={event => {
                          if (event.target.value === '__custom_model__') {
                            setAvailableModelIds([])
                            setModelDraft({ ...modelDraft, model: '' })
                          } else {
                            setModelDraft({ ...modelDraft, model: event.target.value })
                          }
                        }} size='small' fullWidth>
                          {availableModelIds.map(modelId => <MenuItem key={modelId} value={modelId}>{modelId}</MenuItem>)}
                          <MenuItem value='__custom_model__'>Enter a custom model ID…</MenuItem>
                        </TextField>
                      ) : (
                        <TextField label={modelDraft.provider === 'azure-openai' ? 'Deployment name' : 'Model ID'} value={modelDraft.model} onChange={event => setModelDraft({ ...modelDraft, model: event.target.value })} size='small' fullWidth />
                      )}
                      <Tooltip title='Fetch models from provider'>
                        <span><IconButton aria-label='Fetch models' size='small' disabled={isFetchingModels || !modelDraft.baseUrl.trim() || (modelDraft.provider !== 'openai-compatible' && modelDraft.provider !== 'ollama' && modelDraft.provider !== 'mock' && !modelDraft.apiKey.trim())} onClick={() => void fetchModels()}>
                          {isFetchingModels ? <CircularProgress size={18} /> : <AutorenewIcon fontSize='small' />}
                        </IconButton></span>
                      </Tooltip>
                    </Box>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField select label='Provider' value={modelDraft.provider} onChange={event => {
                      const provider = event.target.value as AIModelConfig['provider']
                      const previousDefault = providerBaseUrls[modelDraft.provider]
                      setAvailableModelIds([])
                      setModelDraft({ ...modelDraft, provider, model: '', baseUrl: modelDraft.baseUrl === previousDefault ? providerBaseUrls[provider] : modelDraft.baseUrl })
                    }} size='small' fullWidth>
                      <MenuItem value='openai-compatible'>OpenAI-compatible</MenuItem>
                      <MenuItem value='anthropic'>Anthropic</MenuItem>
                      <MenuItem value='google-gemini'>Google Gemini</MenuItem>
                      <MenuItem value='azure-openai'>Azure OpenAI</MenuItem>
                      <MenuItem value='ollama'>Ollama (local)</MenuItem>
                      <MenuItem value='mock'>Mock (local testing)</MenuItem>
                    </TextField>
                    <TextField label='Base URL' value={modelDraft.baseUrl} onChange={event => { setAvailableModelIds([]); setModelDraft({ ...modelDraft, baseUrl: event.target.value }) }} size='small' fullWidth helperText={modelDraft.provider === 'ollama' ? 'Ollama OpenAI-compatible endpoint, usually http://localhost:11434/v1.' : modelDraft.provider === 'azure-openai' ? 'Azure OpenAI resource URL. Model ID is the deployment name.' : modelDraft.provider === 'google-gemini' ? 'Gemini API root; the model generateContent route is added automatically.' : undefined} />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField label={modelDraft.provider === 'azure-openai' ? 'Azure API key' : modelDraft.provider === 'google-gemini' ? 'Google API key' : 'API key'} type='password' value={modelDraft.apiKey} onChange={event => { setAvailableModelIds([]); setModelDraft({ ...modelDraft, apiKey: event.target.value }) }} size='small' fullWidth helperText={modelDraft.provider === 'ollama' ? 'Optional for local Ollama.' : undefined} />
                    <TextField label='Timeout (ms)' type='number' value={modelDraft.timeoutMs} onChange={event => setModelDraft({ ...modelDraft, timeoutMs: Number(event.target.value) || 30000 })} size='small' fullWidth />
                  </Stack>
                  {modelDraft.provider === 'azure-openai' && <TextField label='Azure API version' value={modelDraft.apiVersion ?? ''} onChange={event => setModelDraft({ ...modelDraft, apiVersion: event.target.value })} size='small' fullWidth />}
                  <Stack direction='row' alignItems='center' spacing={1}>
                    <FormControlLabel control={<Checkbox checked={modelDraft.enabled} onChange={event => setModelDraft({ ...modelDraft, enabled: event.target.checked })} />} label='Enabled' />
                    <Tooltip title='Test provider connection'>
                      <span><IconButton aria-label='Test provider connection' color={draftTestResult?.signature === modelTestSignature(modelDraft) ? (draftTestResult.passed ? 'success' : 'error') : 'default'} disabled={isTestingDraft || !modelDraft.model.trim() || !modelDraft.baseUrl.trim() || (modelDraft.provider !== 'openai-compatible' && modelDraft.provider !== 'ollama' && modelDraft.provider !== 'mock' && !modelDraft.apiKey.trim())} onClick={() => void testModelDraft()}>
                        {isTestingDraft ? <CircularProgress size={18} /> : <ScienceOutlinedIcon fontSize='small' />}
                      </IconButton></span>
                    </Tooltip>
                    <Button variant='contained' onClick={saveModel}>Save Model</Button>
                    <Button onClick={() => setModelDraft(newModel())}>Reset</Button>
                  </Stack>
                  {modelStatus && <Typography variant='caption' color='text.secondary'>{modelStatus}</Typography>}
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Accordion sx={sectionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={600}>System Prompts</Typography></AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <Typography variant='body2' color='text.secondary'>The active system prompt is sent with each user request to the model chain.</Typography>
                  {prompts.map(prompt => (
                    <Box key={prompt.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                      <Button size='small' variant={activePromptId === prompt.id ? 'contained' : 'outlined'} onClick={() => setActivePromptId(prompt.id)}>{activePromptId === prompt.id ? 'Active' : 'Use'}</Button>
                      <Typography sx={{ flex: 1 }}>{prompt.name}</Typography>
                      <Button size='small' onClick={() => setPromptDraft({ ...prompt })}>Edit</Button>
                      <Button size='small' color='error' onClick={() => { setPrompts(current => current.filter(item => item.id !== prompt.id)); if (activePromptId === prompt.id) setActivePromptId(prompts.find(item => item.id !== prompt.id)?.id ?? null) }}>Delete</Button>
                    </Box>
                  ))}
                  <TextField label='Prompt name' value={promptDraft.name} onChange={event => setPromptDraft({ ...promptDraft, name: event.target.value })} size='small' fullWidth />
                  <TextField label='System prompt content' value={promptDraft.content} onChange={event => setPromptDraft({ ...promptDraft, content: event.target.value })} multiline minRows={5} fullWidth />
                  <Box><Button variant='contained' onClick={savePrompt}>Save Prompt</Button><Button sx={{ ml: 1 }} onClick={() => setPromptDraft(newPrompt())}>Reset</Button></Box>
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Accordion sx={sectionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={600}>Backup Settings</Typography></AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <Typography variant='body2' color='text.secondary'>Automatic configuration-file versioning when saving.</Typography>
                  <TextField label='Max backups to keep' type='number' value={maxBackups} onChange={event => setMaxBackups(event.target.value)} size='small' inputProps={{ min: 0, max: 100 }} sx={{ maxWidth: 220 }} />
                  <Typography variant='caption' color='text.secondary'>Generations per file; set to 0 to disable.</Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={requestClose}>Cancel</Button>
          <Button variant='contained' onClick={save}>Save Changes</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogContent><Typography>Discard the configuration changes made in this dialog?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Continue editing</Button>
          <Button color='error' onClick={discardAndClose}>Discard Changes</Button>
          <Button variant='contained' onClick={save}>Save Changes</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
