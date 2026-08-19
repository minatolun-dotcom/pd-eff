const { app, BrowserWindow, dialog, Menu, shell, ipcMain, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');
const fs = require('fs');

// ─── Single Instance Lock ─────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
let mainWindow;
let splashWindow;
let backendProcess;
let tray;
const PORT = 8765;
const BACKEND_TIMEOUT = 20000;

// Window state persistence
const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { width: 1280, height: 860, x: undefined, y: undefined, maximized: false };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const state = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: mainWindow.isMaximized(),
  };
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

if (!gotTheLock) {
  app.quit();
}

// ─── Splash Screen ────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false },
  });

  splashWindow.loadURL(`data:text/html,
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex; justify-content: center; align-items: center;
          height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          color: white;
          border-radius: 16px;
          overflow: hidden;
        }
        .container { text-align: center; }
        .logo { font-size: 48px; margin-bottom: 16px; animation: pulse 2s ease-in-out infinite; }
        h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.5px; }
        p { font-size: 13px; color: #a0aec0; margin-bottom: 24px; }
        .spinner {
          width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.15);
          border-top-color: #60a5fa; border-radius: 50%;
          animation: spin 0.8s linear infinite; margin: 0 auto 12px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .status { font-size: 12px; color: #718096; transition: all 0.3s; }
        .progress-bar {
          width: 200px; height: 3px; background: rgba(255,255,255,0.1);
          border-radius: 3px; margin: 16px auto 0; overflow: hidden;
        }
        .progress-fill {
          height: 100%; background: linear-gradient(90deg, #60a5fa, #a78bfa);
          border-radius: 3px; width: 0%; transition: width 0.5s ease;
          animation: progress 3s ease-in-out infinite;
        }
        @keyframes progress { 0% { width: 0%; } 50% { width: 70%; } 100% { width: 95%; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">🔐</div>
        <h1>pd-eff</h1>
        <p>PDF Digital Signing</p>
        <div class="spinner"></div>
        <div class="status" id="status">Starting...</div>
        <div class="progress-bar"><div class="progress-fill"></div></div>
      </div>
    </body>
    </html>
  `);
}

// ─── Port & Backend ───────────────────────────────────────────────────
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => { server.close(); resolve(false); })
      .listen(port);
  });
}

function waitForBackend(timeout = BACKEND_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeout) reject(new Error('Backend startup timeout'));
      else setTimeout(check, 500);
    };
    check();
  });
}

async function startBackend() {
  const alreadyRunning = await isPortInUse(PORT);
  if (alreadyRunning) {
    console.log(`Port ${PORT} already in use — reusing existing backend`);
    return;
  }

  const isDev = !app.isPackaged;
  let command, args, cwd;

  if (isDev) {
    const backendDir = path.join(__dirname, '..', 'backend');
    if (process.platform === 'win32') {
      command = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
    } else {
      command = path.join(backendDir, 'venv', 'bin', 'python');
    }
    args = [path.join(backendDir, 'run.py')];
    cwd = backendDir;
  } else {
    const exeName = process.platform === 'win32' ? 'pd-eff-api.exe' : 'pd-eff-api';
    const resourcesPath = process.resourcesPath || path.join(__dirname);
    command = path.join(resourcesPath, 'python', exeName);
    args = [];
    cwd = resourcesPath;
  }

  const env = {
    ...process.env,
    PORT: PORT.toString(),
    PYTHONPATH: isDev ? path.join(__dirname, '..', 'backend') : cwd,
  };

  console.log(`Starting backend: ${command} ${args.join(' ')}`);

  backendProcess = spawn(command, args, { cwd, env, stdio: 'pipe' });

  backendProcess.stdout?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[backend] ${line}`);
    if (splashWindow && !splashWindow.isDestroyed()) {
      try {
        splashWindow.webContents.executeJavaScript(
          `document.getElementById('status').textContent = '${line.substring(0, 60).replace(/'/g, "\\'").replace(/\\/g, '\\\\')}'`
        );
      } catch (e) { /* splash already closed */ }
    }
  });

  backendProcess.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[backend] ${line}`);
  });

  backendProcess.on('error', (err) => console.error('Backend error:', err));
  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    try {
      const kill = require('tree-kill');
      kill(backendProcess.pid);
    } catch (e) {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
  }
}

// ─── System Tray ──────────────────────────────────────────────────────
function createTray() {
  // Create a simple 16x16 tray icon
  const iconSize = 16;
  const canvas = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 16 16">
      <rect width="16" height="16" rx="3" fill="#1a1a2e"/>
      <text x="8" y="12" text-anchor="middle" font-size="10" fill="#60a5fa">P</text>
    </svg>`;

  // Use nativeImage for tray
  const trayIcon = nativeImage.createFromBuffer(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#1a1a2e"/>
      <text x="16" y="23" text-anchor="middle" font-size="18" font-weight="bold" fill="#60a5fa" font-family="sans-serif">P</text>
    </svg>`),
    { width: 32, height: 32 }
  );

  tray = new Tray(trayIcon);
  tray.setToolTip('pd-eff — PDF Digital Signing');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open pd-eff', click: () => showMainWindow(), type: 'normal' },
    { type: 'separator' },
    { label: 'Sign PDF', click: () => { showMainWindow(); mainWindow?.loadURL(`http://localhost:${PORT}`); } },
    { label: 'Verify PDF', click: () => { showMainWindow(); mainWindow?.loadURL(`http://localhost:${PORT}/verify`); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { stopBackend(); app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => showMainWindow());
}

function showMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// ─── Main Window ──────────────────────────────────────────────────────
function createMainWindow(openFile) {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    title: 'pd-eff — PDF Digital Signing',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (state.maximized) mainWindow.maximize();

  mainWindow.loadURL(`http://localhost:${PORT}${openFile ? `/?file=${encodeURIComponent(openFile)}` : ''}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('close', () => saveWindowState());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.on('minimize', (e) => {
    // Minimize to tray instead of taskbar
    if (process.platform !== 'linux') {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Build application menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Sign PDF', accelerator: 'CmdOrCtrl+1', click: () => mainWindow.loadURL(`http://localhost:${PORT}`) },
        { label: 'Verify PDF', accelerator: 'CmdOrCtrl+2', click: () => mainWindow.loadURL(`http://localhost:${PORT}/verify`) },
        { label: 'Certificates', accelerator: 'CmdOrCtrl+3', click: () => mainWindow.loadURL(`http://localhost:${PORT}/certificates`) },
        { label: 'Audit Log', accelerator: 'CmdOrCtrl+4', click: () => mainWindow.loadURL(`http://localhost:${PORT}/audit`) },
        { type: 'separator' },
        { label: 'Check for Updates...', click: () => ipcMain.emit('check-updates') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About pd-eff', click: () => showAbout() },
        { label: 'API Docs', click: () => shell.openExternal(`http://localhost:${PORT}/docs`) },
        { label: 'GitHub', click: () => shell.openExternal('https://github.com/minatolun-dotcom/pdf-eff') },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// ─── About Dialog ─────────────────────────────────────────────────────
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About pd-eff',
    message: 'pd-eff — PDF Digital Signing',
    detail: `Version: ${app.getVersion()}\nPlatform: ${process.platform} ${process.arch}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\n\nSecure offline PDF signing with USB key support.\n© 2026 pd-eff`,
  });
}

// ─── Auto-Updater ─────────────────────────────────────────────────────
const GITHUB_REPO = 'minatolun-dotcom/pdf-eff';

function checkForUpdates(silent = false) {
  const https = require('https');
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  https.get(url, { headers: { 'User-Agent': 'pd-eff-updater' } }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const release = JSON.parse(data);
        const latestVersion = release.tag_name?.replace('v', '') || '0.0.0';
        if (isNewerVersion(latestVersion, app.getVersion())) {
          promptDownloadUpdate(release);
        } else if (!silent) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'No Updates',
            message: 'You are running the latest version.',
            detail: `Current: v${app.getVersion()}\nLatest: v${latestVersion}`,
          });
        }
      } catch (e) {
        if (!silent) console.log('Update check failed:', e.message);
      }
    });
  }).on('error', (e) => {
    if (!silent) console.log('Update check network error:', e.message);
  });
}

function isNewerVersion(newV, currentV) {
  const n = newV.split('.').map(Number);
  const c = currentV.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((n[i] || 0) > (c[i] || 0)) return true;
    if ((n[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function promptDownloadUpdate(release) {
  const releaseUrl = release.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;

  // Find platform-appropriate asset
  const assets = release.assets || [];
  let downloadUrl = releaseUrl;
  let assetName = '';

  if (process.platform === 'win32') {
    const installer = assets.find(a => a.name.includes('setup') || a.name.includes('portable'));
    if (installer) { downloadUrl = installer.browser_download_url; assetName = installer.name; }
  } else if (process.platform === 'linux') {
    const appimage = assets.find(a => a.name.includes('AppImage'));
    if (appimage) { downloadUrl = appimage.browser_download_url; assetName = appimage.name; }
  }

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `pd-eff ${release.tag_name} is available!`,
    detail: `Current: v${app.getVersion()}\nLatest: ${release.tag_name}\n\n${release.body?.substring(0, 400) || ''}`,
    buttons: ['Download', 'Later'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) {
      // Download to user's Downloads folder
      const downloadsDir = app.getPath('downloads');
      const filePath = path.join(downloadsDir, assetName || `pd-eff-${release.tag_name}.update`);

      if (assetName) {
        notify('Download Started', `Downloading ${assetName}...`);
        downloadFile(downloadUrl, filePath, () => {
          notify('Download Complete', `${assetName} saved to Downloads folder`);
          // Offer to open the file location
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Downloaded',
            message: `${assetName} has been downloaded.`,
            detail: `Saved to: ${filePath}\n\nPlease install manually.`,
            buttons: ['Open Folder', 'OK'],
          }).then(({ response: r }) => {
            if (r === 0) shell.showItemInFolder(filePath);
          });
        });
      } else {
        shell.openExternal(downloadUrl);
      }
    }
  });
}

function downloadFile(url, dest, callback) {
  const https = require('https');
  const file = fs.createWriteStream(dest);

  https.get(url, { headers: { 'User-Agent': 'pd-eff-updater' } }, (response) => {
    // Follow redirects
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      file.close();
      fs.unlinkSync(dest);
      downloadFile(response.headers.location, dest, callback);
      return;
    }

    const totalBytes = parseInt(response.headers['content-length'], 10);
    let downloaded = 0;

    response.on('data', (chunk) => {
      downloaded += chunk.length;
      if (totalBytes) {
        const pct = Math.round((downloaded / totalBytes) * 100);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.setProgressBar(downloaded / totalBytes);
        }
        if (pct % 25 === 0) {
          notify('Downloading...', `${pct}% complete`);
        }
      }
    });

    response.pipe(file);
    file.on('finish', () => {
      file.close();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.setProgressBar(-1); // remove progress bar
      }
      callback();
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    console.error('Download error:', err);
  });
}

// ─── OS Notifications ─────────────────────────────────────────────────
function notify(title, body, silent = false) {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body, silent, icon: path.join(__dirname, 'icon.png') });
    notification.show();
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('get-file-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select PDF',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-file', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF',
    defaultPath: defaultName || 'signed.pdf',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.on('sign-complete', (event, data) => {
  notify('Sign Complete', `PDF signed successfully: ${data.filename || 'document.pdf'}`);
});

ipcMain.on('verify-complete', (event, data) => {
  const status = data.valid ? '✅ Valid' : data.intact ? '⚠️ Untusted' : '❌ Invalid';
  notify('Verification Complete', `${status} — ${data.filename || 'document.pdf'}`);
});

ipcMain.on('check-updates', () => checkForUpdates(false));

// ─── File Drop Handling ───────────────────────────────────────────────
// Expose to renderer via preload
ipcMain.handle('get-dropped-files', () => {
  return global._droppedFiles || [];
});

ipcMain.on('clear-dropped-files', () => {
  global._droppedFiles = [];
});

// ─── App Lifecycle ────────────────────────────────────────────────────
let pendingFile = null;

// Handle --file argument from command line
const fileArg = process.argv.find(arg => arg.endsWith('.pdf'));
if (fileArg && fs.existsSync(fileArg)) {
  pendingFile = path.resolve(fileArg);
}

app.whenReady().then(async () => {
  // Set app user model id for Windows notifications
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.pdeff.app');
  }

  // Register .pdf file association (Windows/macOS)
  if (process.platform === 'win32') {
    app.setAsDefaultProtocolClient('pd-eff', process.execPath, ['--']);
  }

  createSplash();

  const updateSplash = (msg) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      try { splashWindow.webContents.executeJavaScript(`document.getElementById('status').textContent = '${msg}'`); } catch (e) {}
    }
  };

  try {
    updateSplash('Starting backend server...');
    await startBackend();
    updateSplash('Waiting for server...');
    await waitForBackend();
    updateSplash('Loading interface...');

    createMainWindow(pendingFile);
    createTray();

    // Check for updates silently on startup
    setTimeout(() => checkForUpdates(true), 5000);
  } catch (err) {
    console.error('Startup error:', err);
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start pd-eff:\n\n${err.message}\n\nMake sure port ${PORT} is available.`
    );
    app.quit();
  }
});

// Handle PDF file opened via OS (double-click .pdf)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.loadURL(`http://localhost:${PORT}/?file=${encodeURIComponent(filePath)}`);
  } else {
    pendingFile = filePath;
  }
});

// Handle protocol URLs (pd-eff://...)
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.loadURL(`http://localhost:${PORT}${url.replace('pd-eff://', '/')}`);
  }
});

app.on('window-all-closed', () => {
  stopBackend();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  } else {
    showMainWindow();
  }
});

app.on('before-quit', () => {
  saveWindowState();
  stopBackend();
  if (tray) { tray.destroy(); tray = null; }
});
