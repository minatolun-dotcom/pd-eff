const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdEff', {
  platform: process.platform,
  isElectron: true,
  
  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // Update notifications
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_, info) => callback(info));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_, info) => callback(info));
  },
  installUpdate: () => ipcRenderer.send('install-update'),
});
