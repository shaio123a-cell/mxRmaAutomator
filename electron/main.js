const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC handlers
ipcMain.handle('open-file', async (event, filter) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filter ? [filter] : [{ name: 'Text Files', extensions: ['txt', 'cfg', 'config'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-file', async (event, suggestedName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedName,
    filters: [{ name: 'Text Files', extensions: ['txt', 'cfg', 'config'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('read-file', async (event, filePath) => {
  return await fs.readFile(filePath, 'utf8');
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  await fs.writeFile(filePath, content, 'utf8');
  return true;
});

ipcMain.handle('rotate-backups', async (event, filePath) => {
  // Simple backup rotation: keep up to 30 backups
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const ext = path.extname(base);
  const name = base.slice(0, -ext.length);

  // List existing backups
  const files = await fs.readdir(dir);
  const backups = files
    .filter(f => f.startsWith(`${name}.bak`))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\.bak(\d+)$/)?.[1] || '0');
      const numB = parseInt(b.match(/\.bak(\d+)$/)?.[1] || '0');
      return numB - numA; // descending
    });

  // Rotate
  for (let i = backups.length; i >= 1; i--) {
    const oldPath = path.join(dir, backups[i - 1]);
    const newPath = path.join(dir, `${name}.bak${i + 1}`);
    if (i < 30) {
      try {
        await fs.rename(oldPath, newPath);
      } catch (e) {
        // ignore
      }
    } else {
      try {
        await fs.unlink(oldPath);
      } catch (e) {
        // ignore
      }
    }
  }

  // Create new backup
  const backupPath = path.join(dir, `${name}.bak1`);
  try {
    await fs.copyFile(filePath, backupPath);
  } catch (e) {
    // ignore if original doesn't exist
  }

  return true;
});

ipcMain.handle('run-command', async (event, command) => {
  const { exec } = require('child_process')
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: error.message, stdout, stderr })
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
})