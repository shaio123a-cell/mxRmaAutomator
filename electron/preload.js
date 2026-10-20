const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  tempDir: process.env.TEMP || process.env.TMP || '',
  openFile: (filter) => ipcRenderer.invoke('open-file', filter),
  saveFile: (suggested) => ipcRenderer.invoke('save-file', suggested),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content, options) => ipcRenderer.invoke('write-file', filePath, content, options),
  rotateBackups: (filePath) => ipcRenderer.invoke('rotate-backups', filePath),
  runCommand: (command) => ipcRenderer.invoke('run-command', command),
  selectPath: (options) => ipcRenderer.invoke('select-path', options),
  openInElectron: () => { },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  listAgenticChats: () => ipcRenderer.invoke('agentic-chats:list'),
  loadAgenticChat: (id) => ipcRenderer.invoke('agentic-chats:load', id),
  saveAgenticChat: (chat) => ipcRenderer.invoke('agentic-chats:save', chat),
  deleteAgenticChat: (id) => ipcRenderer.invoke('agentic-chats:delete', id),
  loadAiSettings: () => ipcRenderer.invoke('ai-settings:load'),
  saveAiSettings: (settings) => ipcRenderer.invoke('ai-settings:save'),
  encodeScript: (script) => ipcRenderer.invoke('encode-script', script),
  remote: {
    available: true,
    listInventory: () => ipcRenderer.invoke('remote:inventory:list'),
    saveHost: (host) => ipcRenderer.invoke('remote:host:save', host),
    deleteHost: (id) => ipcRenderer.invoke('remote:host:delete', id),
    saveProfile: (profile) => ipcRenderer.invoke('remote:profile:save', profile),
    deleteProfile: (id) => ipcRenderer.invoke('remote:profile:delete', id),
    setSecret: (profileId, secret) => ipcRenderer.invoke('remote:secret:set', profileId, secret),
    clearSecret: (profileId) => ipcRenderer.invoke('remote:secret:clear', profileId),
    testConnection: (input) => ipcRenderer.invoke('remote:test', input),
    run: (request) => ipcRenderer.invoke('remote:run', request),
    cancel: (runId) => ipcRenderer.invoke('remote:cancel', runId),
    onOutput: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on('remote:output', handler);
      return () => ipcRenderer.removeListener('remote:output', handler);
    },
    listAudit: () => ipcRenderer.invoke('remote:audit:list'),
  },
  isElectron: true,
});