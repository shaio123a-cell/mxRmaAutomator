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
  isElectron: true,
});