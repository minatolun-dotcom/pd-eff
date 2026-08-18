/**
 * pd-eff Auto-Updater
 * Checks GitHub releases for new versions and prompts user to update.
 */

const { app, dialog, shell, BrowserWindow } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs');

const GITHUB_REPO = 'minatolun-dotcom/pdf-eff';
const CURRENT_VERSION = app.getVersion() || '1.0.0';

function checkForUpdates(mainWindow) {
  return new Promise((resolve) => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

    https.get(url, { headers: { 'User-Agent': 'pd-eff-updater' } }, (res) => {
      let data = '';

      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = release.tag_name?.replace('v', '') || '0.0.0';

          if (isNewerVersion(latestVersion, CURRENT_VERSION)) {
            promptUpdate(mainWindow, release);
          }
          resolve({ updated: false, latestVersion });
        } catch (e) {
          console.log('Update check failed:', e.message);
          resolve({ updated: false, error: e.message });
        }
      });
    }).on('error', (e) => {
      console.log('Update check network error:', e.message);
      resolve({ updated: false, error: e.message });
    });
  });
}

function isNewerVersion(newVersion, currentVersion) {
  const newParts = newVersion.split('.').map(Number);
  const currentParts = currentVersion.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if ((newParts[i] || 0) > (currentParts[i] || 0)) return true;
    if ((newParts[i] || 0) < (currentParts[i] || 0)) return false;
  }
  return false;
}

function promptUpdate(mainWindow, release) {
  const releaseUrl = release.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;
  const changes = release.body?.substring(0, 500) || 'No details available';

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `pd-eff ${release.tag_name} is available!`,
    detail: `Current version: ${CURRENT_VERSION}\nLatest: ${release.tag_name}\n\nChanges:\n${changes}`,
    buttons: ['Download Update', 'Later'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) {
      shell.openExternal(releaseUrl);
    }
  });
}

function startPeriodicCheck(mainWindow, intervalMs = 3600000) {
  // Check every hour
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      checkForUpdates(mainWindow);
    }
  }, intervalMs);

  // Also check on startup (after 5 seconds)
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      checkForUpdates(mainWindow);
    }
  }, 5000);
}

module.exports = { checkForUpdates, startPeriodicCheck };
