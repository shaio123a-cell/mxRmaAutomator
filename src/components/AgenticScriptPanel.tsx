import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  ListItemButton,
  ListItemText,
  Menu,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Accordion,
  AccordionDetails,
  AccordionSummary,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import AddIcon from '@mui/icons-material/Add'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import SearchIcon from '@mui/icons-material/Search'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import CodeEditor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-powershell'
import 'prismjs/themes/prism-tomorrow.css'
import { useAppDispatch, useAppSelector } from '../store/store'
import { addAgenticScript, addScript, setAiModels } from '../store/fbcskmSlice'
import { AiGenerationError, getActiveSystemPrompt, generateMoreSuggestions, generateScriptFromPrompt, type AiGeneratedScript, type AiModelConfig, type AiSystemPrompt } from '../services/aiService'
import { deleteAgenticChat, listAgenticChats, loadAgenticChat, saveAgenticChat } from '../services/chatStorage'
import type { AgenticChatMessage, AgenticChatRecord } from '../utils/fileApi'
import RunDialog, { RunDialogScript } from './RunDialog'
import { hashScriptContent, shortHash } from '../utils/contentHash'

type ChatMessage = AgenticChatMessage

function createChatRecord(): AgenticChatRecord {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    generatedScript: null,
    generatedScripts: [],
    suggestions: [],
    scriptName: 'agent-script.sh',
    testOutput: '',
    savedPath: null,
  }
}

function createChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() }
}

function chatDateGroup(updatedAt: string): string {
  const updated = new Date(updatedAt)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const updatedStart = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate())
  const daysAgo = Math.floor((todayStart.getTime() - updatedStart.getTime()) / 86400000)
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo < 7) return 'Previous 7 days'
  return 'Older'
}

export default function AgenticScriptPanel({
  models,
  prompts,
  activePromptId,
  onAddToConfig,
  defaultDeviceId,
}: {
  models: AiModelConfig[]
  prompts: AiSystemPrompt[]
  activePromptId: string | null
  onAddToConfig?: (deviceId: string, scriptId: string) => void
  defaultDeviceId?: string | null
}) {
  const dispatch = useAppDispatch()
  const devices = useAppSelector(state => state.fbcskm.devices)
  const [prompt, setPrompt] = useState('')
  const [scriptName, setScriptName] = useState('agent-script.sh')
  const [generatedScript, setGeneratedScript] = useState<AiGeneratedScript | null>(null)
  const [generatedScripts, setGeneratedScripts] = useState<AiGeneratedScript[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [statusText, setStatusText] = useState('Describe the script you want to create.')
  const [showTestOutput, setShowTestOutput] = useState(false)
  const [testOutput, setTestOutput] = useState('')
  const [runOpen, setRunOpen] = useState(false)
  const [runScript, setRunScript] = useState<RunDialogScript | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [targetDeviceId, setTargetDeviceId] = useState('')
  // Explicit selection wins; otherwise fall back to the device currently
  // selected in the editor, then the first device.
  const effectiveTargetDeviceId = targetDeviceId || defaultDeviceId || devices[0]?.id || ''
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [chatList, setChatList] = useState<AgenticChatRecord[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatTitle, setChatTitle] = useState('')
  const [lastChatActivityAt, setLastChatActivityAt] = useState<string | null>(null)
  const [chatSearch, setChatSearch] = useState('')
  const [chatMenuAnchor, setChatMenuAnchor] = useState<HTMLElement | null>(null)
  const [chatMenuId, setChatMenuId] = useState<string | null>(null)
  const [renameChatId, setRenameChatId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [storageError, setStorageError] = useState('')
  const chatListRef = useRef(chatList)
  const latestChatRecordRef = useRef<AgenticChatRecord | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem('mx-rma-agentic-sidebar-width'))
    return stored >= 200 && stored <= 640 ? stored : 290
  })
  const panelRef = useRef<HTMLDivElement | null>(null)
  const sidebarWidthRef = useRef(sidebarWidth)
  const draggingRef = useRef(false)
  useEffect(() => { sidebarWidthRef.current = sidebarWidth }, [sidebarWidth])
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current || !panelRef.current) return
      const rect = panelRef.current.getBoundingClientRect()
      const max = Math.max(240, rect.width - 320)
      const next = Math.min(max, Math.max(200, event.clientX - rect.left))
      setSidebarWidth(next)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.localStorage.setItem('mx-rma-agentic-sidebar-width', String(Math.round(sidebarWidthRef.current)))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])
  const startSidebarDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const systemPrompt = useMemo(
    () => getActiveSystemPrompt(prompts, activePromptId),
    [prompts, activePromptId],
  )

  const sidebarChats = useMemo(() => {
    const newestFirst = [...chatList].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    const query = chatSearch.trim().toLocaleLowerCase()
    if (!query) return newestFirst.slice(0, 15)
    return newestFirst.filter(chat => [
      chat.title,
      ...chat.messages.map(message => message.content),
      ...chat.generatedScripts.flatMap(script => [script.prompt, script.content]),
    ].join('\n').toLocaleLowerCase().includes(query))
  }, [chatList, chatSearch])

  const sidebarGroups = useMemo(() => {
    const groupNames = ['Today', 'Yesterday', 'Previous 7 days', 'Older']
    return groupNames.map(title => ({
      title,
      chats: sidebarChats.filter(chat => chatDateGroup(chat.updatedAt) === title),
    })).filter(group => group.chats.length > 0)
  }, [sidebarChats])

  const flushChatSave = async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const record = latestChatRecordRef.current
    if (!record) return
    try {
      await saveAgenticChat(record)
      setStorageError('')
    } catch (error) {
      setStorageError(`Chat could not be saved: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  useEffect(() => {
    chatListRef.current = chatList
  }, [chatList])

  useEffect(() => {
    let cancelled = false
    setIsHistoryLoading(true)
    listAgenticChats().then(savedChats => {
      if (cancelled) return
      setChatList(savedChats)
      const chat = savedChats[0] ?? createChatRecord()
      if (savedChats.length === 0) {
        setChatList([chat])
        void saveAgenticChat(chat)
      }
      setActiveChatId(chat.id)
      setChatTitle(chat.title)
      setLastChatActivityAt(null)
      setMessages(chat.messages)
      setGeneratedScript(chat.generatedScript)
      setGeneratedScripts(chat.generatedScripts ?? (chat.generatedScript ? [chat.generatedScript] : []))
      setSuggestions(chat.suggestions)
      setScriptName(chat.scriptName)
      setTestOutput(chat.testOutput)
      setSavedPath(chat.savedPath)
      latestChatRecordRef.current = chat
      setStorageError('')
    }).catch(error => {
      if (cancelled) return
      setStorageError(`Chat history could not be loaded: ${error instanceof Error ? error.message : String(error)}`)
      const chat = createChatRecord()
      setChatList([chat])
      setActiveChatId(chat.id)
      setChatTitle(chat.title)
      latestChatRecordRef.current = chat
    }).finally(() => {
      if (!cancelled) {
        setIsHistoryLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    const record = latestChatRecordRef.current
    if (record) void saveAgenticChat(record).catch(error => console.error('Unable to save chat while leaving Agentic Scripting.', error))
  }, [])

  useEffect(() => {
    if (isHistoryLoading || !activeChatId) return
    const existing = chatListRef.current.find(chat => chat.id === activeChatId)
    if (!existing) return

    const title = chatTitle.trim() || 'New chat'
    const record: AgenticChatRecord = {
      ...existing,
      title,
      updatedAt: lastChatActivityAt ?? existing.updatedAt,
      messages,
      generatedScript,
      generatedScripts,
      suggestions,
      scriptName,
      testOutput,
      savedPath,
    }
    latestChatRecordRef.current = record
    setChatList(current => current
      .map(chat => chat.id === record.id ? record : chat)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)))

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void saveAgenticChat(record).then(() => setStorageError('')).catch(error => {
        setStorageError(`Chat could not be saved: ${error instanceof Error ? error.message : String(error)}`)
      })
    }, 350)
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [activeChatId, chatTitle, generatedScript, generatedScripts, isHistoryLoading, lastChatActivityAt, messages, savedPath, scriptName, suggestions, testOutput])

  const startNewChat = () => {
    void flushChatSave()
    const chat = createChatRecord()
    setChatList(current => [chat, ...current])
    setActiveChatId(chat.id)
    setChatTitle(chat.title)
    setLastChatActivityAt(null)
    setMessages([])
    setGeneratedScript(null)
    setGeneratedScripts([])
    setSuggestions([])
    setScriptName(chat.scriptName)
    setTestOutput('')
    setSavedPath(null)
    setPrompt('')
    setStatusText('Describe the script you want to create.')
    latestChatRecordRef.current = chat
    void saveAgenticChat(chat).catch(error => setStorageError(`New chat could not be saved: ${String(error)}`))
  }

  const continueChat = async (id: string) => {
    if (id === activeChatId) return
    await flushChatSave()
    try {
      const chat = await loadAgenticChat(id)
      if (!chat) throw new Error('That chat could not be found.')
      setActiveChatId(chat.id)
      setChatTitle(chat.title)
      setLastChatActivityAt(null)
      setMessages(chat.messages)
      setGeneratedScript(chat.generatedScript)
      setGeneratedScripts(chat.generatedScripts ?? (chat.generatedScript ? [chat.generatedScript] : []))
      setSuggestions(chat.suggestions)
      setScriptName(chat.scriptName)
      setTestOutput(chat.testOutput)
      setSavedPath(chat.savedPath)
      setPrompt('')
      setStatusText('Chat restored. Continue where you left off.')
      latestChatRecordRef.current = chat
      setStorageError('')
    } catch (error) {
      setStorageError(`Chat could not be opened: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const openRenameDialog = (id: string) => {
    const chat = chatListRef.current.find(item => item.id === id)
    if (!chat) return
    setChatMenuAnchor(null)
    setChatMenuId(null)
    setRenameChatId(id)
    setRenameDraft(chat.title)
    setRenameDialogOpen(true)
  }

  const saveChatRename = async () => {
    const id = renameChatId
    const current = id ? chatListRef.current.find(chat => chat.id === id) : undefined
    const title = renameDraft.trim()
    if (!id || !current || !title) return
    const renamed = { ...current, title, updatedAt: new Date().toISOString() }
    setChatList(chats => chats.map(chat => chat.id === id ? renamed : chat)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)))
    if (id === activeChatId) {
      setChatTitle(title)
      latestChatRecordRef.current = latestChatRecordRef.current
        ? { ...latestChatRecordRef.current, title, updatedAt: renamed.updatedAt }
        : renamed
    }
    setRenameDialogOpen(false)
    setRenameChatId(null)
    try {
      await saveAgenticChat(renamed)
      setStorageError('')
    } catch (error) {
      setStorageError(`Chat could not be renamed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const deleteChat = async (deletedId: string) => {
    const deletingActiveChat = deletedId === activeChatId
    if (!window.confirm('Delete this chat and its saved script history?')) {
      setChatMenuAnchor(null)
      setChatMenuId(null)
      return
    }
    try {
      if (deletingActiveChat) {
        await flushChatSave()
        latestChatRecordRef.current = null
      }
      await deleteAgenticChat(deletedId)
      const remaining = chatListRef.current.filter(chat => chat.id !== deletedId)
      setChatList(remaining)
      setChatMenuAnchor(null)
      setChatMenuId(null)
      if (deletingActiveChat) {
        if (remaining.length > 0) await continueChat(remaining[0].id)
        else startNewChat()
      }
    } catch (error) {
      setStorageError(`Chat could not be deleted: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleGenerate = async () => {
    if (isGenerating || isHistoryLoading) return
    const submittedPrompt = prompt.trim()
    if (!submittedPrompt) {
      setStatusText('Enter a request before generating a script.')
      return
    }

    setMessages(current => [...current, createChatMessage('user', submittedPrompt)])
    setLastChatActivityAt(new Date().toISOString())
    setSuggestions([])
    setIsGenerating(true)
    setStatusText('Contacting the configured model chain...')
    try {
      const history = messages.slice(-8).map(message => ({ role: message.role, content: message.content }))
      if (generatedScript) history.push({ role: 'assistant', content: generatedScript.content })
      const { result, suggestions: nextSuggestions, attemptedModels, usedFallback, failedModels } = await generateScriptFromPrompt(submittedPrompt, models, systemPrompt, history)
      setPrompt('')
      if (generatedScripts.length === 0 && chatTitle.trim() === 'New chat') setChatTitle(result.title)
      setGeneratedScript(result)
      setGeneratedScripts(current => [...current, result])
      setSuggestions(nextSuggestions)
      setScriptName(result.name)
      setSavedPath(null)
      setTestOutput('')
      dispatch(setAiModels(models.map(model => ({
        ...model,
        status: failedModels.includes(model.name) ? 'degraded' : model.name === result.modelName ? 'healthy' : model.status,
      }))))
      dispatch(addAgenticScript(result))
      const summaryLine = result.summary?.trim()
        || `Generated "${result.title}" (${result.name}) from your request: "${result.prompt.replace(/[\r\n]+/g, ' ').slice(0, 120)}${result.prompt.length > 120 ? '…' : ''}"`
      const actionItems = (result.actionsRequired ?? []).filter(item => item.trim())
      const actionsLine = actionItems.length
        ? `Actions required to use the script:\n${actionItems.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
        : 'No additional setup steps were detected — skim the script for placeholders, then Test Run, Save, or Configure to Device.'
      setMessages(current => [...current, {
        ...createChatMessage('assistant', `${summaryLine}\n\n${actionsLine}\n\nReview and edit the script below.${usedFallback ? ` (Generated by ${result.modelName} after trying ${attemptedModels.join(' → ')}.)` : ''}`),
      }])
      setStatusText(usedFallback ? `Fallback used. Models tried: ${attemptedModels.join(' → ')}` : `Generated by ${result.modelName}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed.'
      if (error instanceof AiGenerationError) {
        dispatch(setAiModels(models.map(model => error.attemptedModels.includes(model.name) ? { ...model, status: 'degraded' } : model)))
      }
      setMessages(current => [...current, createChatMessage('assistant', message)])
      setStatusText(message)
    } finally {
      setIsGenerating(false)
      window.requestAnimationFrame(() => {
        const active = document.activeElement
        if (!active || active === document.body) promptInputRef.current?.focus()
      })
    }
  }

  const fetchMoreSuggestions = async (mode: 'append' | 'replace') => {
    if (isLoadingSuggestions || !generatedScript) return
    const seedPrompt = generatedScript.prompt
      || [...messages].reverse().find(message => message.role === 'user')?.content
      || ''
    setIsLoadingSuggestions(true)
    try {
      const fresh = await generateMoreSuggestions(
        seedPrompt,
        generatedScript.content,
        mode === 'append' ? suggestions : [],
        models,
        systemPrompt,
        3,
      )
      if (fresh.length) {
        setSuggestions(current => (mode === 'append' ? [...current, ...fresh] : fresh))
        setStatusText(mode === 'append' ? 'Added more suggested prompts.' : 'Refreshed suggested prompts.')
      } else {
        setStatusText('No additional suggestions were returned.')
      }
    } catch {
      setStatusText('Unable to load additional suggestions.')
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  const updateScript = (content: string) => {
    setLastChatActivityAt(new Date().toISOString())
    setSavedPath(null)
    const contentHash = hashScriptContent(content)
    setGeneratedScript(current => current ? { ...current, content, contentHash } : current)
    setGeneratedScripts(current => generatedScript
      ? current.map(script => script.id === generatedScript.id ? { ...script, content, contentHash } : script)
      : current)
  }

  const copyScript = async () => {
    if (!generatedScript) return
    try {
      await navigator.clipboard.writeText(generatedScript.content)
      setStatusText('Script copied to the clipboard.')
    } catch {
      setStatusText('Clipboard access is unavailable in this browser context.')
    }
  }

  const saveScript = async (forceSaveAs = false): Promise<string | null> => {
    if (!generatedScript) return null
    const finalName = scriptName.trim() || generatedScript.name
    try {
      // If we already have a saved path and not forcing save as, just overwrite it
      if (savedPath && !forceSaveAs && window.electronAPI.writeFile) {
        await window.electronAPI.writeFile(savedPath, generatedScript.content)
        setLastChatActivityAt(new Date().toISOString())
        setStatusText(`Saved script to ${savedPath}.`)
        return savedPath
      }
      const target = await window.electronAPI.saveFile(finalName)
      if (!target) return null
      await window.electronAPI.writeFile(target, generatedScript.content)
      setSavedPath(target)
      setLastChatActivityAt(new Date().toISOString())
      setStatusText(`Saved script to ${target}.`)
      return target
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Unable to save script.')
      return null
    }
  }

  const addToConfiguration = async () => {
    if (!generatedScript) return
    const deviceId = effectiveTargetDeviceId
    const device = devices.find(item => item.id === deviceId)
    if (!device) {
      setStatusText('Add a device in the main app before configuring this script.')
      return
    }

    try {
      // Always save the current script content before configuring the device
      const scriptPath = await saveScript(false)
      if (!scriptPath) {
        setStatusText('Script was not saved, so nothing was added to the device.')
        return
      }

      const baseName = (scriptName.trim() || generatedScript.name).replace(/\.[^.]+$/, '') || 'AI_Generated'
      let instanceName = baseName
      let suffix = 1
      while (device.scripts.some(script => script.instanceName === instanceName)) {
        instanceName = `${baseName}_${suffix++}`
      }
      const scriptId = crypto.randomUUID()
      dispatch(addScript({
        deviceId: device.id,
        script: {
          id: scriptId,
          instanceName,
          scriptPath,
          args: '',
          pollIntervalSec: 300,
          timeoutSec: 30,
          isRestmon: false,
          contentHash: generatedScript.contentHash || hashScriptContent(generatedScript.content),
        },
      }))
      setStatusText(`Added ${instanceName} to ${device.name}. Continue editing it below.`)
      // Switch to the main app and open the new script in the editor
      onAddToConfig?.(device.id, scriptId)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Unable to configure the script on the device.')
    }
  }

  const testScript = async () => {
    if (!generatedScript) return
    setLastChatActivityAt(new Date().toISOString())
    setRunScript({
      key: `agentic:${generatedScript.id}`,
      name: scriptName || generatedScript.name,
      content: generatedScript.content,
      contentHash: generatedScript.contentHash || hashScriptContent(generatedScript.content),
      versionId: generatedScript.id,
      sourceKind: 'agentic-version',
      isRestmon: false,
    })
    setRunOpen(true)
  }

  const enabledModelCount = models.filter(model => model.enabled).length

  return (
    <Paper ref={panelRef} sx={theme => ({ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: 'min(780px, calc(100vh - 140px))', overflow: 'hidden', backgroundColor: 'background.paper', color: 'text.primary', border: '1px solid', borderColor: 'divider', boxShadow: theme.shadows[2] })}>
      <Box component='aside' sx={theme => ({ width: { xs: '100%', md: sidebarWidth }, flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#f7f9fb', borderBottom: { xs: '1px solid', md: 0 }, borderColor: 'divider', maxHeight: { xs: 300, md: 'none' } })}>
        <Box sx={{ p: 1.5, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>Chats</Typography>
            <IconButton aria-label='New chat' title='New chat' size='small' onClick={startNewChat} disabled={isHistoryLoading}>
              <AddIcon />
            </IconButton>
          </Box>
          <TextField
            size='small'
            fullWidth
            placeholder='Search chats'
            value={chatSearch}
            onChange={event => setChatSearch(event.target.value)}
            InputProps={{ startAdornment: <InputAdornment position='start'><SearchIcon fontSize='small' /></InputAdornment> }}
          />
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1 }}>
          {isHistoryLoading && <Typography variant='caption' color='text.secondary' sx={{ display: 'block', p: 1 }}>Loading chats…</Typography>}
          {!isHistoryLoading && sidebarGroups.length === 0 && (
            <Typography variant='body2' color='text.secondary' sx={{ p: 1.5 }}>{chatSearch.trim() ? 'No matching chats.' : 'No chats yet.'}</Typography>
          )}
          {sidebarGroups.map(group => (
            <Box key={group.title} sx={{ mb: 1.5 }}>
              <Typography variant='overline' color='text.secondary' sx={{ display: 'block', px: 1.25, py: 0.5, fontWeight: 700 }}>{group.title}</Typography>
              <Stack spacing={0.25}>
                {group.chats.map(chat => (
                  <ListItemButton
                    key={chat.id}
                    className='agentic-chat-row'
                    selected={chat.id === activeChatId}
                    onClick={() => void continueChat(chat.id)}
                    sx={theme => ({ minHeight: 38, py: 0.25, pl: 1.25, pr: 0.5, borderRadius: 1, '&.Mui-selected': { backgroundColor: theme.palette.mode === 'dark' ? 'rgba(91,143,212,0.24)' : '#e5edf5' }, '&.Mui-selected:hover': { backgroundColor: theme.palette.mode === 'dark' ? 'rgba(91,143,212,0.32)' : '#dce7f1' } })}
                  >
                    <ListItemText primary={
                      <Tooltip title={chat.title || 'Untitled chat'} placement='right' enterDelay={500}>
                        <span>{chat.title || 'Untitled chat'}</span>
                      </Tooltip>
                    } primaryTypographyProps={{ noWrap: true, variant: 'body2', fontWeight: chat.id === activeChatId ? 600 : 400, sx: { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                    <IconButton
                      className='agentic-chat-menu-button'
                      aria-label={`Options for ${chat.title || 'chat'}`}
                      title='Chat options'
                      size='small'
                      onClick={event => {
                        event.stopPropagation()
                        setChatMenuId(chat.id)
                        setChatMenuAnchor(event.currentTarget)
                      }}
                      sx={{ flexShrink: 0, opacity: { xs: 1, md: 0 }, '.agentic-chat-row:hover &': { opacity: 1 }, '.agentic-chat-row.Mui-selected &': { opacity: 1 } }}
                    >
                      <MoreHorizIcon fontSize='small' />
                    </IconButton>
                  </ListItemButton>
                ))}
              </Stack>
            </Box>
          ))}
          {!chatSearch.trim() && chatList.length > 15 && <Typography variant='caption' color='text.secondary' sx={{ display: 'block', px: 1.25, pt: 0.5 }}>Showing 15 recent chats. Search to find older chats.</Typography>}
        </Box>

        <Menu anchorEl={chatMenuAnchor} open={Boolean(chatMenuAnchor)} onClose={() => { setChatMenuAnchor(null); setChatMenuId(null) }}>
          <MenuItem onClick={() => chatMenuId && openRenameDialog(chatMenuId)}>Rename</MenuItem>
          <MenuItem sx={{ color: 'error.main' }} onClick={() => chatMenuId && void deleteChat(chatMenuId)}>Delete</MenuItem>
        </Menu>
      </Box>

      <Box
        onMouseDown={startSidebarDrag}
        role='separator'
        aria-orientation='vertical'
        title='Drag to resize'
        sx={{
          display: { xs: 'none', md: 'block' },
          width: 6,
          flexShrink: 0,
          cursor: 'col-resize',
          position: 'relative',
          backgroundColor: 'transparent',
          '&::after': { content: '""', position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', transform: 'translateX(-50%)', backgroundColor: 'divider' },
          '&:hover::after': { width: '3px', backgroundColor: 'primary.main' },
          '&:active::after': { width: '3px', backgroundColor: 'primary.main' },
        }}
      />
      <Box component='main' sx={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, md: 3 } }}>
      <Stack spacing={2.5}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant='h5' sx={{ fontWeight: 700 }}>Agentic Scripting</Typography>
          <Chip label={enabledModelCount ? `${enabledModelCount} model(s) in fallback chain` : 'No enabled models'} color={enabledModelCount ? 'primary' : 'warning'} />
        </Box>

        {storageError && <Typography variant='caption' color='error'>{storageError}</Typography>}

        {messages.length > 0 && (
          <Box aria-live='polite' sx={{ display: 'grid', gap: 1, maxHeight: 240, overflowY: 'auto' }}>
            {messages.map((message, index) => (
              <Box key={`${index}-${message.role}`} sx={theme => ({ justifySelf: message.role === 'user' ? 'end' : 'start', maxWidth: 'min(90%, 800px)', px: 1.5, py: 1, borderRadius: 1, backgroundColor: message.role === 'user' ? (theme.palette.mode === 'dark' ? 'rgba(91,143,212,0.2)' : '#e7f0fb') : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f4f6f8') })}>
                <Typography variant='caption' color='text.secondary'>{message.role === 'user' ? 'You' : 'Assistant'}</Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
          <TextField
            label='Describe the script or next change'
            value={prompt}
            inputRef={promptInputRef}
            onChange={event => setPrompt(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void handleGenerate()
              }
            }}
            multiline
            minRows={3}
            maxRows={10}
            fullWidth
            sx={{ '& .MuiOutlinedInput-root': { backgroundColor: 'action.hover' } }}
          />
          <IconButton
            aria-label='Send prompt'
            title='Send prompt'
            color='primary'
            onClick={() => void handleGenerate()}
            disabled={isGenerating || isHistoryLoading || !prompt.trim()}
            sx={{ width: 48, height: 48, flexShrink: 0, border: '1px solid', borderColor: 'primary.main' }}
          >
            {isGenerating ? <CircularProgress size={20} /> : <ArrowUpwardIcon />}
          </IconButton>
        </Box>

        {(suggestions.length > 0 || Boolean(generatedScript)) && <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <Typography variant='caption' color='text.secondary' sx={{ flex: 1 }}>Suggested next prompts</Typography>
            <Tooltip title='Show more suggestions'>
              <span>
                <IconButton
                  size='small'
                  aria-label='Show more suggestions'
                  disabled={isLoadingSuggestions || !generatedScript}
                  onClick={() => void fetchMoreSuggestions('append')}
                >
                  {isLoadingSuggestions ? <CircularProgress size={16} /> : <AddCircleOutlineIcon fontSize='small' />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title='Refresh suggestions'>
              <span>
                <IconButton
                  size='small'
                  aria-label='Refresh suggestions'
                  disabled={isLoadingSuggestions || !generatedScript}
                  onClick={() => void fetchMoreSuggestions('replace')}
                >
                  <AutorenewIcon fontSize='small' />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {suggestions.map((suggestion, index) => (
              <Chip key={`${index}-${suggestion}`} label={suggestion} variant='outlined' onClick={() => setPrompt(suggestion)} sx={{ backgroundColor: 'action.hover' }} />
            ))}
            {suggestions.length === 0 && (
              <Typography variant='caption' color='text.secondary'>No suggestions yet — use the buttons to generate some.</Typography>
            )}
          </Box>
        </Box>}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tooltip title='Copy script'>
            <span>
              <IconButton onClick={() => void copyScript()} disabled={!generatedScript} aria-label='copy script'
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, width: 40, height: 40 }}>
                <ContentCopyIcon fontSize='small' />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title='Save script'>
            <span>
              <IconButton onClick={() => void saveScript(false)} disabled={!generatedScript} aria-label='save script'
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, width: 40, height: 40 }}>
                <SaveAltIcon fontSize='small' />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title='Save script as new file'>
            <span>
              <IconButton onClick={() => void saveScript(true)} disabled={!generatedScript} aria-label='save script as new file'
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, width: 40, height: 40 }}>
                <SaveAltIcon fontSize='small' />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title='Test run script'>
            <span>
              <IconButton onClick={() => void testScript()} disabled={!generatedScript} aria-label='test run script'
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, width: 40, height: 40 }}>
                <PlayArrowIcon fontSize='small' />
              </IconButton>
            </span>
          </Tooltip>
          <TextField select size='small' label='Target device' value={effectiveTargetDeviceId} onChange={event => setTargetDeviceId(event.target.value)} sx={{ minWidth: 200 }}>
            {devices.map(device => <MenuItem key={device.id} value={device.id}>{device.name}</MenuItem>)}
          </TextField>
          <Tooltip title='Configure this script on the selected device'>
            <span>
              <IconButton color='primary' onClick={() => void addToConfiguration()} disabled={!generatedScript || devices.length === 0} aria-label='configure to device'
                sx={{ border: '1px solid', borderColor: 'primary.main', borderRadius: 1.5, width: 40, height: 40 }}>
                <PlaylistAddIcon fontSize='small' />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <Typography variant='caption' color='text.secondary'>{statusText}</Typography>

        {showTestOutput && testOutput && (
          <Accordion
            sx={{ width: '100%', my: 1 }}
            defaultExpanded
            disableGutters
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="panel1a-content"
              id="panel1a-header"
              sx={theme => ({
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                color: 'primary.main',
                '& .Mui-expanded': {
                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(91,143,212,0.16)' : '#f0f9ff',
                  color: 'primary.main'
                },
                minHeight: 48,
                '&:hover': { backgroundColor: theme.palette.mode === 'dark' ? 'rgba(91,143,212,0.12)' : '#f0f9ff' }
              })}
            >
              <Typography variant='subtitle2' sx={{ flex: 1 }}>Test Run Output</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 3, py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant='subtitle2' color='primary.main'>Test Run Output</Typography>
                <IconButton
                  aria-label='Close test output'
                  sx={{ padding: 0, margin: -4 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowTestOutput(false)
                  }}
                >
                  ✕
                </IconButton>
              </Box>
              {testOutput ? (
                <Box component='pre' sx={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: 'text.primary', lineHeight: 1.6 }}>{testOutput}</Box>
              ) : (
                <Typography variant='body2' color='text.secondary' sx={{ p: 1 }}>Running test…</Typography>
              )}
            </AccordionDetails>
          </Accordion>
        )}

        {!testOutput && showTestOutput && (
          <Typography variant='body2' color='text.secondary' sx={{ p: 1 }}>Running test…</Typography>
        )}

        <Divider />

        <TextField
          select
          size='small'
          label='Script results in this chat'
          value={generatedScript?.id ?? ''}
          onChange={event => {
            const selected = generatedScripts.find(script => script.id === event.target.value)
            if (!selected) return
            setGeneratedScript(selected)
            setScriptName(selected.name)
            setSavedPath(null)
          }}
          fullWidth
        >
          {generatedScripts.map((script, index) => (
            <MenuItem key={script.id} value={script.id}>{index + 1}. {script.name} · {script.modelName} · {shortHash(script.contentHash) || 'no hash'}</MenuItem>
          ))}
        </TextField>
        <Divider />

        <TextField
          label='Script name'
          value={scriptName}
          onChange={event => { setScriptName(event.target.value); setSavedPath(null); setLastChatActivityAt(new Date().toISOString()) }}
          size='small'
          fullWidth
        />
        {generatedScript && (generatedScript.summary?.trim() || (generatedScript.actionsRequired ?? []).length > 0) && (
          <Box sx={theme => ({ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1, backgroundColor: theme.palette.mode === 'dark' ? 'rgba(91,143,212,0.08)' : '#f0f6ff' })}>
            {generatedScript.summary?.trim() && (
              <Typography variant='body2' sx={{ fontWeight: 600, mb: (generatedScript.actionsRequired ?? []).length ? 0.5 : 0 }}>{generatedScript.summary.trim()}</Typography>
            )}
            {(generatedScript.actionsRequired ?? []).length > 0 && (
              <>
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>Actions required to use the script</Typography>
                <Box component='ol' sx={{ m: 0, pl: 2 }}>
                  {generatedScript.actionsRequired!.filter(item => item.trim()).map((item, index) => (
                    <Typography component='li' variant='body2' key={`${index}-${item}`}>{item}</Typography>
                  ))}
                </Box>
              </>
            )}
          </Box>
        )}
        <Box sx={{ border: '1px solid #26364d', borderRadius: 1, backgroundColor: '#0f172a', minHeight: 340, overflow: 'auto', '& .token.comment': { color: '#94a3b8', fontStyle: 'italic' }, '& .token.keyword': { color: '#f0abfc' }, '& .token.string': { color: '#bef264' }, '& .token.function': { color: '#67e8f9' }, '& .token.operator, & .token.punctuation': { color: '#cbd5e1' }, '& textarea': { outline: 'none' } }}>
          <CodeEditor
            value={generatedScript?.content ?? ''}
            onValueChange={updateScript}
            highlight={code => {
              const language = scriptName.toLowerCase().endsWith('.ps1') ? 'powershell' : 'bash'
              return Prism.highlight(code, Prism.languages[language], language)
            }}
            padding={18}
            textareaId='agentic-script-editor'
            textareaClassName='agentic-script-textarea'
            preClassName='agentic-script-pre'
            style={{ minHeight: 340, boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, lineHeight: 1.65, color: '#e2f3ff', tabSize: 2 }}
          />
        </Box>

      </Stack>
      </Box>
      <RunDialog open={runOpen} onClose={() => setRunOpen(false)} script={runScript} />
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Rename chat</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label='Chat name'
            value={renameDraft}
            onChange={event => setRenameDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void saveChatRename() }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button variant='contained' onClick={() => void saveChatRename()} disabled={!renameDraft.trim()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
