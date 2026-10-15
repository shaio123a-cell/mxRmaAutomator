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
  Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import AddIcon from '@mui/icons-material/Add'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import SearchIcon from '@mui/icons-material/Search'
import CodeEditor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-powershell'
import 'prismjs/themes/prism-tomorrow.css'
import { useAppDispatch, useAppSelector } from '../store/store'
import { addAgenticScript, addScript, setAiModels } from '../store/fbcskmSlice'
import { AiGenerationError, getActiveSystemPrompt, generateScriptFromPrompt, type AiGeneratedScript, type AiModelConfig, type AiSystemPrompt } from '../services/aiService'
import { deleteAgenticChat, listAgenticChats, loadAgenticChat, saveAgenticChat } from '../services/chatStorage'
import type { AgenticChatMessage, AgenticChatRecord } from '../utils/fileApi'

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
}: {
  models: AiModelConfig[]
  prompts: AiSystemPrompt[]
  activePromptId: string | null
  onAddToConfig?: (deviceId: string, scriptId: string) => void
}) {
  const dispatch = useAppDispatch()
  const devices = useAppSelector(state => state.fbcskm.devices)
  const [prompt, setPrompt] = useState('')
  const [scriptName, setScriptName] = useState('agent-script.sh')
  const [generatedScript, setGeneratedScript] = useState<AiGeneratedScript | null>(null)
  const [generatedScripts, setGeneratedScripts] = useState<AiGeneratedScript[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusText, setStatusText] = useState('Describe the script you want to create.')
  const [testOutput, setTestOutput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [targetDeviceId, setTargetDeviceId] = useState('')
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
      setMessages(current => [...current, {
        ...createChatMessage('assistant', `Script generated by ${result.modelName}${usedFallback ? ` after trying ${attemptedModels.join(' → ')}` : ''}. Review and edit the script below.`),
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
    }
  }

  const updateScript = (content: string) => {
    setLastChatActivityAt(new Date().toISOString())
    setSavedPath(null)
    setGeneratedScript(current => current ? { ...current, content } : current)
    setGeneratedScripts(current => generatedScript
      ? current.map(script => script.id === generatedScript.id ? { ...script, content } : script)
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

  const saveScript = async (): Promise<string | null> => {
    if (!generatedScript) return null
    const finalName = scriptName.trim() || generatedScript.name
    try {
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
    const deviceId = targetDeviceId || devices[0]?.id
    const device = devices.find(item => item.id === deviceId)
    if (!device) {
      setStatusText('Add a device in the main app before configuring this script.')
      return
    }
    const scriptPath = savedPath || await saveScript()
    if (!scriptPath) return

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
      },
    }))
    setStatusText(`Added ${instanceName} to ${device.name}.`)
    onAddToConfig?.(device.id, scriptId)
  }

  const testScript = async () => {
    if (!generatedScript) return
    if (!window.electronAPI.isElectron) {
      setTestOutput('Test execution is available in Electron mode. Save or download the script to run it in a local shell.')
      setLastChatActivityAt(new Date().toISOString())
      return
    }
    if (!window.confirm('Run this generated script on this computer? Review the script before continuing.')) return

    setLastChatActivityAt(new Date().toISOString())
    setTestOutput('Running script...')
    try {
      const result = await window.electronAPI.runCommand(generatedScript.content)
      setTestOutput(result.error
        ? `Error: ${result.error}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`
        : `Stdout:\n${result.stdout}\nStderr:\n${result.stderr}`)
      setStatusText('Script test run finished.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Script test failed.'
      setTestOutput(message)
      setStatusText(message)
    }
  }

  const enabledModelCount = models.filter(model => model.enabled).length

  return (
    <Paper sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: 'min(780px, calc(100vh - 140px))', overflow: 'hidden', background: '#ffffff', color: '#0f172a', border: '1px solid rgba(148,163,184,0.28)', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.07)' }}>
      <Box component='aside' sx={{ width: { xs: '100%', md: 290 }, flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#f7f9fb', borderRight: { xs: 0, md: '1px solid #e2e8f0' }, borderBottom: { xs: '1px solid #e2e8f0', md: 0 }, maxHeight: { xs: 300, md: 'none' } }}>
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
                    sx={{ minHeight: 38, py: 0.25, pl: 1.25, pr: 0.5, borderRadius: 1, '&.Mui-selected': { backgroundColor: '#e5edf5' }, '&.Mui-selected:hover': { backgroundColor: '#dce7f1' } }}
                  >
                    <ListItemText primary={chat.title || 'Untitled chat'} primaryTypographyProps={{ noWrap: true, variant: 'body2', fontWeight: chat.id === activeChatId ? 600 : 400 }} />
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
              <Box key={`${index}-${message.role}`} sx={{ justifySelf: message.role === 'user' ? 'end' : 'start', maxWidth: 'min(90%, 800px)', px: 1.5, py: 1, borderRadius: 1, backgroundColor: message.role === 'user' ? '#e7f0fb' : '#f4f6f8' }}>
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
            disabled={isGenerating || isHistoryLoading}
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
            sx={{ '& .MuiOutlinedInput-root': { backgroundColor: '#f8fafc', color: '#0f172a' } }}
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

        {suggestions.length > 0 && <Box>
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1 }}>Suggested next prompts</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {suggestions.map((suggestion, index) => (
              <Chip key={suggestion} label={suggestion} variant='outlined' onClick={() => setPrompt(suggestion)} sx={{ borderColor: '#cbd5e1', color: '#0f172a', background: '#f8fafc' }} />
            ))}
          </Box>
        </Box>}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant='outlined' onClick={() => void copyScript()} disabled={!generatedScript} startIcon={<ContentCopyIcon />}>Copy</Button>
          <Button variant='outlined' onClick={() => void saveScript()} disabled={!generatedScript} startIcon={<SaveAltIcon />}>Save As</Button>
          <Button variant='outlined' onClick={() => void testScript()} disabled={!generatedScript} startIcon={<PlayArrowIcon />}>Test Run</Button>
          <TextField select size='small' label='Target device' value={targetDeviceId || devices[0]?.id || ''} onChange={event => setTargetDeviceId(event.target.value)} sx={{ minWidth: 200 }}>
            {devices.map(device => <MenuItem key={device.id} value={device.id}>{device.name}</MenuItem>)}
          </TextField>
          <Button variant='outlined' onClick={() => void addToConfiguration()} disabled={!generatedScript || devices.length === 0}>Add to app config</Button>
        </Box>

        <Typography variant='caption' color='text.secondary'>{statusText}</Typography>
        {generatedScripts.length > 1 && (
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
              <MenuItem key={script.id} value={script.id}>{index + 1}. {script.name} · {script.modelName}</MenuItem>
            ))}
          </TextField>
        )}
        <Divider />

        <TextField
          label='Script name'
          value={scriptName}
          onChange={event => { setScriptName(event.target.value); setSavedPath(null); setLastChatActivityAt(new Date().toISOString()) }}
          size='small'
          fullWidth
        />
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

        {testOutput && (
          <Box sx={{ background: '#f8fafc', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 1, p: 2 }}>
            <Typography variant='subtitle2' sx={{ mb: 1, color: '#1d4ed8' }}>Test Run Output</Typography>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: '#0f172a', lineHeight: 1.6 }}>{testOutput}</pre>
          </Box>
        )}
      </Stack>
      </Box>
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
