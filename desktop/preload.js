const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdEff', {
  platform: process.platform,
  isElectron: true,

  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),

  // File dialogs
  openFileDialog: () => ipcRenderer.invoke('get-file-path'),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file', defaultName),

  // Notifications
  signComplete: (data) => ipcRenderer.send('sign-complete', data),
  verifyComplete: (data) => ipcRenderer.send('verify-complete', data),

  // Updates
  checkUpdates: () => ipcRenderer.send('check-updates'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, info) => callback(info)),
  installUpdate: () => ipcRenderer.send('install-update'),

  // Drag and drop
  getDroppedFiles: () => ipcRenderer.invoke('get-dropped-files'),
  clearDroppedFiles: () => ipcRenderer.send('clear-dropped-files'),
});
