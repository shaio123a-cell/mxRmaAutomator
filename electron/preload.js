const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
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
  isElectron: true,
});