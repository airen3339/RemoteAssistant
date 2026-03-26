const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // WebSocket
  ws: {
    getStatus: () => ipcRenderer.invoke('ws:getStatus'),
    getPort: () => ipcRenderer.invoke('ws:getPort'),
    setPort: (port) => ipcRenderer.invoke('ws:setPort', port),
    getClients: () => ipcRenderer.invoke('ws:getClients'),
    sendToAll: (msg) => ipcRenderer.invoke('ws:sendToAll', msg),
    onMobileMessage: (callback) => ipcRenderer.on('mobile-message', (_, msg) => callback(msg)),
  },

  // Command
  cmd: {
    execute: (command) => ipcRenderer.invoke('cmd:execute', command),
  },

  // OpenClaw
  openclaw: {
    getStatus: () => ipcRenderer.invoke('openclaw:getStatus'),
    install: () => ipcRenderer.invoke('openclaw:install'),
    start: () => ipcRenderer.invoke('openclaw:start'),
    stop: () => ipcRenderer.invoke('openclaw:stop'),
    openUI: () => ipcRenderer.invoke('openclaw:openUI'),
    getConnectMode: () => ipcRenderer.invoke('openclaw:getConnectMode'),
    setConnectMode: (mode) => ipcRenderer.invoke('openclaw:setConnectMode', mode),
    onProgress: (callback) => ipcRenderer.on('openclaw-progress', (_, progress) => callback(progress)),
  },

  // LLM Config
  llm: {
    getConfigs: () => ipcRenderer.invoke('llm:getConfigs'),
    saveConfig: (config) => ipcRenderer.invoke('llm:saveConfig', config),
    deleteConfig: (id) => ipcRenderer.invoke('llm:deleteConfig', id),
    testConnection: (config) => ipcRenderer.invoke('llm:testConnection', config),
    getPresets: () => ipcRenderer.invoke('llm:getPresets'),
  },

  // MCP Server
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:getStatus'),
    getPort: () => ipcRenderer.invoke('mcp:getPort'),
    setPort: (port) => ipcRenderer.invoke('mcp:setPort', port),
    getTools: () => ipcRenderer.invoke('mcp:getTools'),
  },

  // HTTP API Server
  httpApi: {
    getStatus: () => ipcRenderer.invoke('httpApi:getStatus'),
    getPort: () => ipcRenderer.invoke('httpApi:getPort'),
    setPort: (port) => ipcRenderer.invoke('httpApi:setPort', port),
  },

  // Network
  network: {
    getLocalIP: () => ipcRenderer.invoke('network:getLocalIP'),
  },
});
