const { app, BrowserWindow, dialog, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const net = require('net');
const http = require('http');

let mainWindow;
let splashWindow;
let backendProcess;
const PORT = 8765;
const BACKEND_TIMEOUT = 15000; // 15s max wait for backend

// ─── Splash Screen ───────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
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
        .logo { font-size: 48px; margin-bottom: 16px; }
        h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.5px; }
        p { font-size: 13px; color: #a0aec0; margin-bottom: 24px; }
        .spinner {
          width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.15);
          border-top-color: #60a5fa; border-radius: 50%;
          animation: spin 0.8s linear infinite; margin: 0 auto 12px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status { font-size: 12px; color: #718096; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">🔐</div>
        <h1>pd-eff</h1>
        <p>PDF Digital Signing</p>
        <div class="spinner"></div>
        <div class="status" id="status">Starting backend...</div>
      </div>
    </body>
    </html>
  `);
}

// ─── Check if port is in use ──────────────────────────────────────────
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port);
  });
}

// ─── Wait for backend to be ready ─────────────────────────────────────
function waitForBackend(timeout = BACKEND_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeout) {
        reject(new Error('Backend startup timeout'));
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
}

// ─── Start Backend ────────────────────────────────────────────────────
async function startBackend() {
  const alreadyRunning = await isPortInUse(PORT);
  if (alreadyRunning) {
    console.log(`Port ${PORT} already in use, assuming backend is running`);
    return;
  }

  const isDev = !app.isPackaged;
  let command, args, cwd;

  if (isDev) {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    command = pythonCmd;
    args = [path.join(__dirname, '..', 'backend', 'run.py')];
    cwd = path.join(__dirname, '..', 'backend');
  } else {
    // Production: bundled PyInstaller executable
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
  console.log(`Working directory: ${cwd}`);
  console.log(`Port: ${PORT}`);

  backendProcess = spawn(command, args, { cwd, env, stdio: 'pipe' });

  backendProcess.stdout?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[backend] ${line}`);
    if (splashWindow) {
      splashWindow.webContents.executeJavaScript(
        `document.getElementById('status').textContent = '${line.substring(0, 60)}'`
      );
    }
  });

  backendProcess.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[backend] ${line}`);
  });

  backendProcess.on('error', (err) => {
    console.error('Backend spawn error:', err);
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    backendProcess = null;
  });
}

// ─── Main Window ──────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'pd-eff — PDF Digital Signing',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
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
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About pd-eff', click: () => showAbout() },
        { label: 'API Docs', click: () => shell.openExternal(`http://localhost:${PORT}/docs`) },
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
    detail: `Version: ${app.getVersion()}\nPlatform: ${process.platform} ${process.arch}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\n\nSecure offline PDF signing with USB key support.`,
  });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────
ipcMain.handle('get-version', () => app.getVersion());

// ─── App Lifecycle ────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();

  try {
    // Start backend
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = 'Starting backend server...'`
    );
    await startBackend();

    // Wait for backend to be ready
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = 'Waiting for server...'`
    );
    await waitForBackend();

    // Create main window
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = 'Loading interface...'`
    );
    createMainWindow();
  } catch (err) {
    console.error('Startup error:', err);
    if (splashWindow) splashWindow.close();
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start pd-eff:\n\n${err.message}\n\nMake sure port ${PORT} is available.`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopBackend();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

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
