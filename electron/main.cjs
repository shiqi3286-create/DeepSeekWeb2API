// DeepSeekWeb2API - Electron 桌面客户端（主进程）
// 以子进程方式启动后端服务：与 01启动.bat 相同，运行 node src/index.js。
// 使用随包内置的 node.exe（extraResources 的 node/node.exe），并把可写目录
// 重定向到当前用户的应用数据目录，避免写入安装位置失败。

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const isPackaged = app.isPackaged;

// ---- 路径 ----------------------------------------------------------------
const appDir = app.getAppPath(); // 开发时=仓库根目录；打包后=resources/app
const appName = 'DeepSeekWeb2API';

let nodeExe = path.join(appDir, 'build', 'node', 'node.exe');
if (isPackaged) {
  // extraResources -> resources/node/node.exe
  nodeExe = path.join(process.resourcesPath, 'node', 'node.exe');
}

// 可写用户数据目录（所有配置文件、浏览器登录态、临时文件都放在这里）
const userDataRoot = app.getPath('userData');
const configFile = path.join(userDataRoot, 'config.json');
const serverEnv = {
  CONFIG_PATH: configFile,
  USER_DATA_DIR: path.join(userDataRoot, 'data', 'user-data'),
  TEMP_DIR: path.join(userDataRoot, 'tmp')
};

// 首次运行：把内置 config.json 模板复制到可写用户目录
function ensureConfig() {
  try {
    if (!fs.existsSync(userDataRoot)) fs.mkdirSync(userDataRoot, { recursive: true });
    if (!fs.existsSync(configFile)) {
      const template = isPackaged
        ? path.join(process.resourcesPath, 'app', 'config.json')
        : path.join(appDir, 'config.json');
      if (fs.existsSync(template)) fs.copyFileSync(template, configFile);
    }
  } catch (err) {
    console.error('ensureConfig failed:', err);
  }
}

function readUserConfig() {
  try {
    if (!fs.existsSync(configFile)) return {};
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return {};
  }
}

// ---- 子进程管理 -----------------------------------------------------------
let serverProc = null; // API 服务进程
let loginProc = null; // 登录进程
let mainWindow = null;

function nodeExeAvailable() {
  if (!fs.existsSync(nodeExe)) return false;
  return nodeExe.endsWith('node.exe') ? true : fs.existsSync(path.join(path.dirname(nodeExe), 'node.exe'));
}

function resolveNode() {
  if (fs.existsSync(nodeExe)) return nodeExe;
  // 开发模式下允许回退到系统 node
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function buildEnv() {
  return { ...process.env, ...serverEnv };
}

function pushLog(line) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app:log', String(line));
}

function wireChild(child) {
  child.stdout?.on('data', chunk => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) pushLog(line);
    }
  });
  child.stderr?.on('data', chunk => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) pushLog(line);
    }
  });
}

function emitState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app:state', currentState());
}

function currentState() {
  const cfg = readUserConfig();
  const port = cfg?.server?.port ?? 3000;
  const host = cfg?.server?.host ?? '127.0.0.1';
  return {
    serverRunning: !!serverProc,
    loginRunning: !!loginProc,
    port,
    host,
    publicBaseUrl: cfg?.server?.publicBaseUrl || `http://${host}:${port}`,
    apiKeyConfigured: Boolean(cfg?.server?.apiKey),
    nodePath: nodeExe,
    configPath: configFile,
    userDataDir: serverEnv.USER_DATA_DIR,
    appDir,
    version: app.getVersion()
  };
}

function startServer() {
  if (serverProc && !serverProc.killed) {
    pushLog('[app] 服务已在运行');
    return currentState();
  }
  const node = resolveNode();
  pushLog(`[app] 启动服务  node=${node}`);
  pushLog(`[app] 配置文件  ${configFile}`);
  serverProc = spawn(node, ['src/index.js'], {
    cwd: appDir,
    env: buildEnv(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  wireChild(serverProc);
  serverProc.on('exit', (code, signal) => {
    pushLog(`[app] 服务进程退出 code=${code} signal=${signal}`);
    serverProc = null;
    emitState();
  });
  emitState();
  return currentState();
}

function stopServer() {
  if (!serverProc) {
    pushLog('[app] 服务未在运行');
    return currentState();
  }
  const proc = serverProc;
  serverProc = null;
  try { proc.kill(); } catch { /* ignore */ }
  pushLog('[app] 已请求停止服务');
  emitState();
  return currentState();
}

function restartServer() {
  stopServer();
  setTimeout(startServer, 300);
  return currentState();
}

function startLogin() {
  if (loginProc && !loginProc.killed) {
    pushLog('[app] 登录进程已在运行');
    return currentState();
  }
  if (serverProc && !serverProc.killed) {
    pushLog('[app] 请先停止服务，再进行登录（两者共用一个浏览器登录态）');
    return currentState();
  }
  const node = resolveNode();
  pushLog('[app] 打开 DeepSeek 登录浏览器，完成登录后点击“完成登录”');
  loginProc = spawn(node, ['src/index.js', '--login'], {
    cwd: appDir,
    env: buildEnv(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  wireChild(loginProc);
  loginProc.on('exit', (code, signal) => {
    pushLog(`[app] 登录进程退出 code=${code}`);
    loginProc = null;
    emitState();
  });
  emitState();
  return currentState();
}

function finishLogin() {
  if (loginProc) {
    const proc = loginProc;
    loginProc = null;
    try { proc.kill(); } catch { /* ignore */ }
    pushLog('[app] 已关闭登录浏览器，登录态已保存');
  } else {
    pushLog('[app] 没有正在运行的登录进程');
  }
  emitState();
  return currentState();
}

function shutdown() {
  try { serverProc?.kill(); } catch { /* ignore */ }
  try { loginProc?.kill(); } catch { /* ignore */ }
  serverProc = null;
  loginProc = null;
}

// ---- 窗口 ----------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 700,
    minHeight: 480,
    title: `${appName} 客户端`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- IPC ----------------------------------------------------------------
ipcMain.handle('app:start', () => startServer());
ipcMain.handle('app:stop', () => stopServer());
ipcMain.handle('app:restart', () => restartServer());
ipcMain.handle('app:login', () => startLogin());
ipcMain.handle('app:loginDone', () => finishLogin());
ipcMain.handle('app:getState', () => currentState());
ipcMain.handle('app:openApi', async () => {
  const s = currentState();
  await shell.openExternal(s.publicBaseUrl || `http://${s.host}:${s.port}`);
  return s;
});
ipcMain.handle('app:openLoginPage', async () => {
  const cfg = readUserConfig();
  await shell.openExternal(cfg?.deepseek?.url || 'https://chat.deepseek.com/');
  return currentState();
});
ipcMain.handle('app:openConfigDir', async () => {
  await shell.openPath(userDataRoot);
  return currentState();
});
ipcMain.handle('app:openConfigFile', async () => {
  ensureConfig();
  await shell.openPath(configFile);
  return currentState();
});

// ---- 生命周期 ------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('ready', () => {
    ensureConfig();
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', shutdown);
  app.on('will-quit', shutdown);
}