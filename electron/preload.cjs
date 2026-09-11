// DeepSeekWeb2API - 桌面客户端 preload：通过 contextBridge 暴露安全的 IPC 接口
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  start: () => ipcRenderer.invoke('app:start'),
  stop: () => ipcRenderer.invoke('app:stop'),
  restart: () => ipcRenderer.invoke('app:restart'),
  login: () => ipcRenderer.invoke('app:login'),
  loginDone: () => ipcRenderer.invoke('app:loginDone'),
  getState: () => ipcRenderer.invoke('app:getState'),
  openApi: () => ipcRenderer.invoke('app:openApi'),
  openLoginPage: () => ipcRenderer.invoke('app:openLoginPage'),
  openConfigDir: () => ipcRenderer.invoke('app:openConfigDir'),
  openConfigFile: () => ipcRenderer.invoke('app:openConfigFile'),

  onLog: cb => {
    const listener = (_event, line) => cb(line);
    ipcRenderer.on('app:log', listener);
    return () => ipcRenderer.removeListener('app:log', listener);
  },
  onState: cb => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on('app:state', listener);
    return () => ipcRenderer.removeListener('app:state', listener);
  }
});