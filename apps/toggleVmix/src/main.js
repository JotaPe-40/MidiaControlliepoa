const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const { createApiServer } = require('./api-server');
const { createHolyricsAdapter } = require('./holyrics-adapter');
const { getDefaultState, loadState, saveState } = require('./trigger-state');
const { loadConfig } = require('./config');

const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 230;
const MARGIN = 16;

let mainWindow;
let allowClose = false;
let config;
let currentState;
let apiServer;
let holyricsAdapter;
let shuttingDown = false;

function log(...args) {
  if (!config?.logging) {
    return;
  }

  console.log(new Date().toISOString(), '-', ...args);
}

function getWindowBounds() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  return {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: x + width - WINDOW_WIDTH - MARGIN,
    y: y + height - WINDOW_HEIGHT - MARGIN,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...getWindowBounds(),
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#101114',
    title: 'Toggle vMix',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));

  mainWindow.on('close', (event) => {
    if (allowClose) {
      return;
    }

    event.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Fechar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Fechar Toggle vMix',
      message: 'Deseja fechar o Toggle vMix?',
      detail: 'O app sera encerrado e o estado da integracao sera preservado.',
    });

    if (choice === 0) {
      allowClose = true;
      app.quit();
    }
  });

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });
}

function setIntegrationEnabled(enabled) {
  currentState = {
    ...currentState,
    integrationEnabled: enabled,
    updatedAt: new Date().toISOString(),
  };

  saveState(currentState);
  return currentState;
}

app.whenReady().then(async () => {
  config = loadConfig();
  currentState = loadState(config) || getDefaultState(config);
  holyricsAdapter = createHolyricsAdapter(config);
  apiServer = createApiServer({
    config,
    getIntegrationEnabled: () => currentState.integrationEnabled,
    setLastAction: (lastAction) => {
      currentState = {
        ...currentState,
        lastAction,
        updatedAt: new Date().toISOString(),
      };
      saveState(currentState);
    },
    log,
  });

  await apiServer.listen();
  log(`API escutando em http://${config.api.host}:${config.api.port}`);
  createWindow();

  ipcMain.handle('toggle:get-state', () => currentState);
  ipcMain.handle('toggle:set-state', async (_event, enabled) => setIntegrationEnabled(Boolean(enabled)));
  ipcMain.handle('toggle:refresh-topmost', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.focus();
    }

    return true;
  });
  ipcMain.handle('toggle:test-vmix', async (_event, target) => {
    if (target === 'vmix-2') {
      return holyricsAdapter.remove();
    }

    return holyricsAdapter.project();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (shuttingDown || !apiServer) {
    return;
  }

  event.preventDefault();
  shuttingDown = true;

  apiServer.close().finally(() => {
    app.exit(0);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
