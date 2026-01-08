const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('mxrma', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('mxrma')
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(createWindow)
}

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

// Removed default app.whenReady call since it is handled inside single instance lock block
ipcMain.handle('open-external', async (event, url) => {
  const { shell } = require('electron');
  return await shell.openExternal(url);
});

// Start the app

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

ipcMain.handle('write-file', async (event, filePath, content, options) => {
  const maxBackups = options?.maxBackups ?? 0;

  if (maxBackups > 0) {
    try {
      // Check if original file exists
      await fs.access(filePath);

      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      const ext = path.extname(base);
      const name = base.slice(0, -ext.length);

      const backupDir = path.join(dir, 'backups');

      // Ensure backup directory exists
      await fs.mkdir(backupDir, { recursive: true });

      // Get original file's modification time for the timestamp
      const stats = await fs.stat(filePath);
      const mtime = stats.mtime;

      const timestamp = mtime.getFullYear().toString() +
        (mtime.getMonth() + 1).toString().padStart(2, '0') +
        mtime.getDate().toString().padStart(2, '0') + '-' +
        mtime.getHours().toString().padStart(2, '0') +
        mtime.getMinutes().toString().padStart(2, '0') +
        mtime.getSeconds().toString().padStart(2, '0');

      const backupName = `${name}_${timestamp}${ext}`;
      const backupPath = path.join(backupDir, backupName);

      // Copy original to backup
      await fs.copyFile(filePath, backupPath);

      // Rotate: List existing backups for this file
      const files = await fs.readdir(backupDir);
      const backupPattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d{8}-\\d{6}${ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

      const backups = files
        .filter(f => backupPattern.test(f))
        .map(f => ({ name: f, time: f.match(/_(\d{8}-\d{6})/)?.[1] || '' }))
        .sort((a, b) => b.time.localeCompare(a.time)); // Descending by timestamp string (YYYYMMDD-HHmmss sorts correctly)

      // Keep 'maxBackups'
      if (backups.length > maxBackups) {
        const toDelete = backups.slice(maxBackups);
        for (const b of toDelete) {
          try {
            await fs.unlink(path.join(backupDir, b.name));
          } catch (e) { console.error('Failed to delete old backup', b.name, e); }
        }
      }

    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('Backup failed', e);
      }
      // If original doesn't exist (new file), skip backup
    }
  }

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

ipcMain.handle('select-path', async (event, options) => {
  const properties = []
  if (options?.directory) properties.push('openDirectory')
  if (options?.file) properties.push('openFile')
  if (properties.length === 0) properties.push('openFile') // default

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: properties,
    filters: options?.filters || []
  })
  return result.canceled ? null : result.filePaths[0];
})