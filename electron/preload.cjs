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
  chatSend: body => ipcRenderer.invoke('chat:send', body),
  chatCancel: () => ipcRenderer.invoke('chat:cancel'),
  apiKeys: () => ipcRenderer.invoke('apikey:list'),
  apiKeyCreate: name => ipcRenderer.invoke('apikey:create', name),
  apiKeyRegenerate: id => ipcRenderer.invoke('apikey:regenerate', id),
  apiKeyDelete: id => ipcRenderer.invoke('apikey:delete', id),
  apiKeySetEnabled: (id, enabled) => ipcRenderer.invoke('apikey:setEnabled', id, enabled),
  sessions: () => ipcRenderer.invoke('session:list'),
  sessionDelete: (id, deleteWeb) => ipcRenderer.invoke('session:delete', id, deleteWeb),
  selfCheck: () => ipcRenderer.invoke('selfCheck:run'),

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