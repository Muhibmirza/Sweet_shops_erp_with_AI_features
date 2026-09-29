const electron = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const waitOn = require('wait-on');
const os = require('os');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { autoUpdater } = require('electron-updater');

if (!electron.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'ignore', env }).unref();
  process.exit(0);
}

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = electron;

let mainWindow;
let serverProcess;
let tray;
let isQuitting = false;
let updateProgressWindow = null;
let updateCheckInProgress = false;
let backendStarting = false;
let healthTimer = null;
let consecutiveHealthFailures = 0;

const PREFERRED_SERVER_PORT = Number(process.env.PORT || 5000);
let SERVER_PORT = PREFERRED_SERVER_PORT;
let SERVER_URL = `http://localhost:${SERVER_PORT}`;
let logFile = '';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.disableDifferentialDownload = true;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  checkBackendHealth().then((ok) => {
    if (!ok) {
      writeLog('Second launch detected a stopped backend; restarting it');
      startBackendServer();
      waitForBackendAndLoad();
    }
  });
});

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  if (logFile) fs.appendFileSync(logFile, line);
}

function showStartupStatus(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('startup-status', message);
  }
}

function resourcePath(...parts) {
  return app.isPackaged ? path.join(process.resourcesPath, ...parts) : path.join(__dirname, '..', ...parts);
}

function runtimePath(...parts) {
  return path.join(app.getPath('userData'), 'runtime', ...parts);
}

function legacyRuntimePath(...parts) {
  const appData = process.env.APPDATA || app.getPath('appData');
  return path.join(appData, `Eastern Sweets ${'ER'}${'P'}`, 'runtime', ...parts);
}

function syncDirectory(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) syncDirectory(sourcePath, targetPath);
    else fs.copyFileSync(sourcePath, targetPath);
  }
}

function prepareRuntime() {
  const runtimeRoot = runtimePath();
  const legacyRuntimeRoot = legacyRuntimePath();
  if (!fs.existsSync(runtimeRoot) && fs.existsSync(legacyRuntimeRoot)) {
    syncDirectory(legacyRuntimeRoot, runtimeRoot);
  }
  const runtimeServer = runtimePath('server');
  fs.mkdirSync(runtimeServer, { recursive: true });
  fs.mkdirSync(path.join(runtimeServer, 'data'), { recursive: true });
  fs.mkdirSync(runtimePath('uploads'), { recursive: true });
  syncDirectory(resourcePath('server', 'prisma'), path.join(runtimeServer, 'prisma'));
  return runtimeServer;
}

function appDatabasePath() {
  const dataDir = runtimePath('server', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'eastern-sweets.db');
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size === 0) fs.unlinkSync(dbPath);
  return dbPath;
}

function migrationDatabaseUrl() {
  appDatabasePath();
  return 'file:../data/eastern-sweets.db';
}

function serverDatabaseUrl() {
  return `file:${appDatabasePath().replace(/\\/g, '/')}`;
}

function serverSecrets() {
  const envPath = runtimePath('server', '.env');
  const dotenv = require(resourcePath('server', 'node_modules', 'dotenv'));
  const values = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SEED_ADMIN_PASSWORD', 'SEED_CASHIER_PASSWORD', 'SEED_PRODUCTION_PASSWORD']) {
    if (process.env[key]) values[key] = process.env[key];
    if (!values[key]) values[key] = key === 'SEED_ADMIN_PASSWORD' ? 'Admin@123' : require('crypto').randomBytes(key.startsWith('JWT_') ? 48 : 24).toString('hex');
  }
  values.DATABASE_URL = serverDatabaseUrl();
  values.CLIENT_URL = SERVER_URL;
  values.AI_PROVIDER = 'groq';
  if (process.env.GROQ_API_KEY) values.GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!values.GROQ_CHAT_MODEL) values.GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b';
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  return values;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();
    tester.once('error', () => resolve(false));
    tester.listen({ host: '127.0.0.1', port }, () => tester.close(() => resolve(true)));
  });
}

async function selectServerPort() {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = PREFERRED_SERVER_PORT + offset;
    if (await isPortAvailable(candidate)) {
      SERVER_PORT = candidate;
      SERVER_URL = `http://localhost:${candidate}`;
      writeLog(`Selected local server port ${candidate}`);
      return;
    }
  }
  throw new Error(`No free local server port found from ${PREFERRED_SERVER_PORT} to ${PREFERRED_SERVER_PORT + 19}`);
}

function checkBackendHealth(timeoutMs = 2500) {
  return new Promise((resolve) => {
    const request = http.get(`${SERVER_URL}/api/health`, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function checkFrontendReady(timeoutMs = 3500) {
  return new Promise((resolve) => {
    const request = http.get(`${SERVER_URL}/`, { timeout: timeoutMs }, (response) => {
      const contentType = String(response.headers['content-type'] || '');
      response.resume();
      resolve(response.statusCode === 200 && contentType.includes('text/html'));
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForBackendAndLoad() {
  try {
    await waitOn({ resources: [`${SERVER_URL}/api/health`], timeout: 45000 });
    if (!(await checkFrontendReady())) throw new Error('Frontend files are not being served by the local backend');
    writeLog('Eastern Sweets server is ready');
    showStartupStatus('Opening Eastern Sweets...');
    if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(SERVER_URL);
    consecutiveHealthFailures = 0;
  } catch (error) {
    writeLog(`Server failed to start in time: ${error.message}`);
    showStartupStatus(`Server failed to start. Retrying... Log file: ${logFile}`);
    scheduleBackendRestart('startup timeout');
  }
}

function scheduleBackendRestart(reason) {
  if (isQuitting || backendStarting) return;
  writeLog(`Scheduling backend restart: ${reason}`);
  showStartupStatus('Eastern Sweets server reconnecting...');
  setTimeout(async () => {
    if (isQuitting || backendStarting) return;
    if (serverProcess && !serverProcess.killed) {
      try { serverProcess.kill(); } catch {}
    } else {
      startBackendServer();
      await waitForBackendAndLoad();
    }
  }, 1500);
}

function startBackendServer() {
  if (backendStarting || (serverProcess && !serverProcess.killed)) return;
  backendStarting = true;
  const serverPath = resourcePath('server', 'dist', 'index.js');
  const serverDir = prepareRuntime();
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(SERVER_PORT),
      ...serverSecrets(),
      CLIENT_URL: SERVER_URL,
      DATABASE_URL: serverDatabaseUrl(),
      UPLOAD_DIR: runtimePath('uploads'),
    },
    windowsHide: true
  });

  serverProcess.stdout.on('data', (data) => writeLog(`Server: ${data}`));
  serverProcess.stderr.on('data', (data) => writeLog(`Server Error: ${data}`));
  serverProcess.on('spawn', () => {
    backendStarting = false;
    writeLog(`Backend server process started with pid ${serverProcess.pid}`);
  });
  serverProcess.on('error', (error) => {
    backendStarting = false;
    writeLog(`Backend server process error: ${error.message}`);
    scheduleBackendRestart('process error');
  });
  serverProcess.on('close', (code) => {
    backendStarting = false;
    serverProcess = null;
    writeLog(`Backend server exited with code ${code}`);
    if (!isQuitting) {
      showStartupStatus(`Backend server restarted automatically. Log: ${logFile}`);
      scheduleBackendRestart('process exit');
    }
  });
}

function startHealthMonitor() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(async () => {
    if (isQuitting || backendStarting) return;
    const ok = await checkBackendHealth();
    if (ok) {
      consecutiveHealthFailures = 0;
      return;
    }
    consecutiveHealthFailures += 1;
    writeLog(`Backend health check failed (${consecutiveHealthFailures})`);
    if (consecutiveHealthFailures >= 3) {
      consecutiveHealthFailures = 0;
      if (serverProcess && !serverProcess.killed) {
        writeLog('Backend appears stuck. Restarting process.');
        try { serverProcess.kill(); } catch {}
      } else {
        startBackendServer();
        waitForBackendAndLoad();
      }
    }
  }, 15000);
}

function runMigrations() {
  return new Promise((resolve) => {
    const serverDir = prepareRuntime();
    const prismaCli = resourcePath('server', 'node_modules', 'prisma', 'build', 'index.js');
    const prismaProcess = spawn(process.execPath, [prismaCli, 'db', 'push', '--accept-data-loss', '--skip-generate', '--schema', 'prisma/schema.prisma'], {
      cwd: serverDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: migrationDatabaseUrl()
      },
      windowsHide: true
    });
    prismaProcess.stdout.on('data', (data) => writeLog(`Prisma: ${data}`));
    prismaProcess.stderr.on('data', (data) => writeLog(`Prisma Error: ${data}`));
    prismaProcess.on('close', (code) => {
      writeLog(`Prisma migrations finished with code ${code}`);
      resolve();
    });
  });
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function getNetworkInfo() {
  const localIP = getLocalIP();
  return {
    port: SERVER_PORT,
    localIP,
    localUrl: `http://${localIP}:${SERVER_PORT}`,
    desktopUrl: SERVER_URL,
    remoteAccessNote: 'Same WiFi devices can use the local URL. Mobile data or outside internet requires router port forwarding, static IP/DDNS, or a secure tunnel to this computer.'
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Eastern Sweets',
    autoHideMenuBar: true,
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: true
  });

  mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  const networkInfo = getNetworkInfo();
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Eastern Sweets', click: () => mainWindow?.show() },
    { label: `Network Address: ${networkInfo.localUrl}`, enabled: false },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setToolTip('Eastern Sweets');
  tray.setContextMenu(contextMenu);
}

function showUpdateProgressWindow() {
  if (updateProgressWindow && !updateProgressWindow.isDestroyed()) {
    updateProgressWindow.show();
    return;
  }
  updateProgressWindow = new BrowserWindow({
    width: 420,
    height: 190,
    parent: mainWindow || undefined,
    modal: Boolean(mainWindow),
    resizable: false,
    autoHideMenuBar: true,
    title: 'Updating Eastern Sweets',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  updateProgressWindow.setMenuBarVisibility(false);
  updateProgressWindow.loadFile(path.join(__dirname, 'update-progress.html'));
  updateProgressWindow.webContents.once('did-finish-load', () => {
    updateProgressWindow?.webContents.send('update-status', 'Connecting to update server...');
    updateProgressWindow?.webContents.send('update-progress', 1);
  });
  updateProgressWindow.on('closed', () => {
    updateProgressWindow = null;
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    writeLog('Auto updater skipped in development mode');
    return;
  }

  autoUpdater.on('checking-for-update', () => {
    updateCheckInProgress = true;
    writeLog('Checking for updates');
  });

  autoUpdater.on('update-available', (info) => {
    updateCheckInProgress = false;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) of Eastern Sweets is available.`,
      detail: 'Your shop database and data will not be affected. Download and install now?',
      buttons: ['Download & Install', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        showUpdateProgressWindow();
        updateCheckInProgress = true;
        setTimeout(() => {
          if (updateProgressWindow && !updateProgressWindow.isDestroyed()) {
            updateProgressWindow.webContents.send('update-status', 'Downloading update. Please keep the app open...');
          }
        }, 800);
        autoUpdater.downloadUpdate().catch((error) => {
          updateCheckInProgress = false;
          writeLog(`Update download failed: ${error.message || error}`);
          if (updateProgressWindow && !updateProgressWindow.isDestroyed()) updateProgressWindow.close();
          dialog.showErrorBox(
            'Update Download Failed',
            `The update could not be downloaded.\n\n${error.message || error}\n\nPlease upload the installer, blockmap, and latest.yml again, then retry.`
          );
        });
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    updateCheckInProgress = false;
    writeLog('App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (updateProgressWindow && !updateProgressWindow.isDestroyed()) {
      updateProgressWindow.webContents.send('update-progress', progress.percent || 0);
      const transferred = progress.transferred && progress.total
        ? `${Math.round(progress.transferred / 1024 / 1024)} MB / ${Math.round(progress.total / 1024 / 1024)} MB`
        : 'Downloading update...';
      updateProgressWindow.webContents.send('update-status', transferred);
    }
  });

  autoUpdater.on('update-downloaded', () => {
    updateCheckInProgress = false;
    if (updateProgressWindow && !updateProgressWindow.isDestroyed()) updateProgressWindow.close();
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully.',
      detail: 'The app will restart now to apply the update. Your data is safe.',
      buttons: ['Restart Now']
    }).then(() => {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (error) => {
    updateCheckInProgress = false;
    writeLog(`Auto-update error: ${error.message || error}`);
  });

  setTimeout(() => autoUpdater.checkForUpdates().catch((error) => writeLog(`Update check failed: ${error.message}`)), 5000);
  setInterval(() => {
    if (!updateCheckInProgress) autoUpdater.checkForUpdates().catch((error) => writeLog(`Update check failed: ${error.message}`));
  }, 4 * 60 * 60 * 1000);
}

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.filePaths[0];
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-network-info', () => getNetworkInfo());

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { skipped: true, message: 'Updates are available only in the installed app.' };
  if (updateCheckInProgress) return { skipped: true, message: 'Update check is already running.' };
  await autoUpdater.checkForUpdates();
  return { success: true };
});

ipcMain.handle('silent-print-html', async (_event, htmlContent) => {
  const printWindow = new BrowserWindow({
    width: 320,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  const tempPrintFile = path.join(app.getPath('temp'), `eastern-sweets-print-${Date.now()}.html`);
  const printHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <base href="${SERVER_URL}/">
        <style>
          @media print { @page { margin: 0; size: 80mm auto; } body { margin: 0; padding: 0; } }
          html, body { margin: 0; padding: 0; background: #fff; color: #000; width: 80mm; max-width: 80mm; font-family: "Courier New", monospace, Arial, sans-serif; font-weight: 900; }
          * { box-sizing: border-box; color: #000 !important; box-shadow: none !important; text-shadow: none !important; font-weight: 800 !important; }
          .thermal-print { width: 70mm; max-width: 70mm; margin: 0; padding: 0 0.25mm; font-size: 9pt; line-height: 1.2; overflow: hidden; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border-bottom: 1px dashed #000; padding: 2px 0; overflow-wrap: anywhere; word-break: break-word; font-size: 8.8pt; }
          .print-center { text-align: center; }
          .print-center img { width: 112px !important; height: 112px !important; object-fit: contain; filter: grayscale(1) contrast(2.1) brightness(0.72); }
          .print-line { border-top: 1px dashed #000; margin: 5px 0; }
          .print-row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
          .print-total { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 0; font-size: 13pt; }
        </style>
      </head>
      <body>${htmlContent}</body>
    </html>`;
  fs.writeFileSync(tempPrintFile, printHtml, 'utf8');
  await printWindow.loadFile(tempPrintFile);
  await printWindow.webContents.executeJavaScript(`
    Promise.all(Array.from(document.images || []).map(function(img) {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      if (img.decode) return img.decode().catch(function() {});
      return new Promise(function(resolve) {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 1800);
      });
    }))
  `).catch((error) => writeLog('Print image wait failed: ' + error.message));
  const printers = await printWindow.webContents.getPrintersAsync().catch(() => []);
  const defaultPrinter = printers.find((printer) => printer.isDefault);
  const basePrintOptions = {
    silent: true,
    printBackground: true,
    margins: { marginType: 'none' },
    pageSize: { width: 80000, height: 297000 }
  };
  const printOnce = (options) => new Promise((resolve) => {
    printWindow.webContents.print(options, (success, failureReason) => resolve({ success, failureReason }));
  });
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      let result = await printOnce(defaultPrinter ? { ...basePrintOptions, deviceName: defaultPrinter.name } : basePrintOptions);
      if (!result.success) {
        writeLog(`Silent print first attempt failed: ${result.failureReason || 'unknown printer error'}`);
        result = await printOnce(basePrintOptions);
      }
      printWindow.close();
      fs.unlink(tempPrintFile, () => undefined);
      if (!result.success) {
        writeLog(`Silent print failed: ${result.failureReason || 'unknown printer error'}`);
        reject(new Error(result.failureReason || 'Print failed. Please set a Windows default printer.'));
      } else {
        resolve({ success: true });
      }
    }, 350);
  });
});

app.whenReady().then(async () => {
  logFile = path.join(app.getPath('userData'), 'startup.log');
  writeLog('Eastern Sweets starting');
  try {
    await selectServerPort();
  } catch (error) {
    writeLog(`Port selection failed: ${error.message}`);
    dialog.showErrorBox('Eastern Sweets could not start', `${error.message}\n\nPlease restart Windows and try again.`);
    app.quit();
    return;
  }
  createWindow();
  createTray();
  setupAutoUpdater();

  showStartupStatus('Preparing local database...');
  await runMigrations();
  showStartupStatus('Starting Eastern Sweets server...');
  startBackendServer();
  await waitForBackendAndLoad();
  startHealthMonitor();
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  isQuitting = true;
  if (healthTimer) clearInterval(healthTimer);
  if (serverProcess) serverProcess.kill();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
  else mainWindow.show();
});
