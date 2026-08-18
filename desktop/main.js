const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const kill = require('tree-kill');

let mainWindow;
let backendProcess;
const PORT = 8765;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'pd-eff — PDF Digital Signing',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the backend URL
  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    const backendDir = path.join(__dirname, '..', 'backend');
    const scriptPath = path.join(backendDir, 'run.py');

    console.log(`Starting backend: ${scriptPath}`);
    console.log(`Port: ${PORT}`);
    console.log(`Dev mode: ${isDev}`);

    const env = {
      ...process.env,
      PORT: PORT.toString(),
      PYTHONPATH: backendDir,
    };

    if (isDev) {
      // Development: use Python directly
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      backendProcess = spawn(pythonCmd, [scriptPath], { cwd: backendDir, env });
    } else {
      // Production: use PyInstaller executable
      const exeName = process.platform === 'win32' ? 'pd-eff-api.exe' : 'pd-eff-api';
      const exePath = path.join(process.resourcesPath, 'python', exeName);
      backendProcess = spawn(exePath, [], { cwd: process.resourcesPath, env });
    }

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Backend: ${output}`);
      if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.log(`Backend: ${data.toString()}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Backend error:', err);
      reject(err);
    });

    setTimeout(resolve, 4000);
  });
}

function stopBackend() {
  if (backendProcess) {
    kill(backendProcess.pid);
    backendProcess = null;
  }
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to start: ${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopBackend();
  app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});
