export const fileApi = {
  openFile: async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.json,.conf';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          const fileName = file.name;
          sessionStorage.setItem(`file:${fileName}`, content);
          resolve(fileName);
        };
        reader.readAsText(file);
      };
      input.click();
    });
  },

  saveFile: async (suggestedName: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = suggestedName;
      input.placeholder = 'Enter filename';

      const dialog = document.createElement('div');
      dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:10000;';
      dialog.innerHTML = `
        <label style="display:block;margin-bottom:10px;font-weight:bold;">Save as:</label>
      `;
      dialog.appendChild(input);

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'margin-top:15px;display:flex;gap:10px;justify-content:flex-end;';

      const okBtn = document.createElement('button');
      okBtn.textContent = 'Save';
      okBtn.style.cssText = 'padding:8px 16px;background:#1976d2;color:white;border:none;border-radius:4px;cursor:pointer;';
      okBtn.onclick = () => {
        const name = input.value.trim();
        document.body.removeChild(dialog);
        resolve(name || null);
      };

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'padding:8px 16px;background:#ccc;color:black;border:none;border-radius:4px;cursor:pointer;';
      cancelBtn.onclick = () => {
        document.body.removeChild(dialog);
        resolve(null);
      };

      buttonContainer.appendChild(okBtn);
      buttonContainer.appendChild(cancelBtn);
      dialog.appendChild(buttonContainer);
      document.body.appendChild(dialog);
      input.focus();

      input.onkeydown = (e) => {
        if (e.key === 'Enter') okBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
      };
    });
  },

  readFile: async (fileName: string): Promise<string> => {
    const content = sessionStorage.getItem(`file:${fileName}`);
    if (content === null) {
      throw new Error(`File not found: ${fileName}`);
    }
    return content;
  },

  writeFile: async (fileName: string, content: string, options?: { maxBackups?: number }): Promise<boolean> => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    sessionStorage.setItem(`file:${fileName}`, content);
    return true;
  },

  rotateBackups: async (fileName: string): Promise<boolean> => {
    const backupKey = `backup:${fileName}`;
    const backups = JSON.parse(localStorage.getItem(backupKey) || '[]') as { timestamp: number; content: string }[];

    const content = sessionStorage.getItem(`file:${fileName}`);
    if (content) {
      backups.unshift({ timestamp: Date.now(), content });
      if (backups.length > 30) {
        backups.pop();
      }
      localStorage.setItem(backupKey, JSON.stringify(backups));
    }
    return true;
  },
  runCommand: async (command: string): Promise<{ stdout: string; stderr: string; error?: string }> => {
    return { stdout: '', stderr: 'Dry run not available in web mode', error: 'Not available' };
  },
  openInElectron: async (): Promise<void> => {
    // Attempt to open the custom protocol link
    window.location.href = 'mxrma://open';
  },
  openExternal: async (url: string): Promise<void> => {
    window.open(url, '_blank');
  },
  isElectron: false,
  selectPath: async (options?: { directory?: boolean, file?: boolean, filters?: any[] }): Promise<string | null> => {
    // Basic web fallback - standard file input doesn't support folder selection easily across browsers
    // asking for 'directory' in web is not standard
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (options?.directory) {
        // webkitdirectory is non-standard but works in Chrome/FF
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');
      }
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        // In web, we can't get full system path due to security, so we might just return name
        // checking if user wants path or content. For settings, they want path.
        // Web security usually blocks full path. Return mock or warning.
        alert('Browser security prevents capturing full local paths. This feature works best in Electron.');
        resolve(file.name); // best effort
      };
      input.click();
    });
  }
};

declare global {
  interface Window {
    electronAPI: typeof fileApi;
  }
}

if (!window.electronAPI) {
  window.electronAPI = fileApi;
}
