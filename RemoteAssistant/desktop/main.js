const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { WebSocketServer } = require('./server/websocket-server');
const { OpenClawManager } = require('./server/openclaw-manager');
const { LLMConfigManager } = require('./server/llm-config');
const { CommandExecutor } = require('./server/command-executor');
const { MCPServer } = require('./server/mcp-server');
const { HTTPAPIServer } = require('./server/http-api-server');

const store = new Store();
let mainWindow;
let wsServer;
let openclawManager;
let llmConfig;
let commandExecutor;
let mcpServer;
let httpApiServer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'RemoteAssistant - Ô¶³ÌÖúÊÖ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initServices() {
  llmConfig = new LLMConfigManager(store);
  openclawManager = new OpenClawManager(store);
  commandExecutor = new CommandExecutor();

  // Start WebSocket server
  const port = store.get('wsPort', 9600);
  wsServer = new WebSocketServer(port, (msg) => {
    // Forward messages to renderer
    if (mainWindow) {
      mainWindow.webContents.send('mobile-message', msg);
    }
  });
  wsServer.start();

  // Start MCP server
  const mcpPort = store.get('mcpPort', 9601);
  mcpServer = new MCPServer(mcpPort, {
    wsServer,
    llmConfig,
    commandExecutor,
    openclawManager,
    store,
  });
  mcpServer.start();

  // Start HTTP API server
  const httpApiPort = store.get('httpApiPort', 9602);
  httpApiServer = new HTTPAPIServer(httpApiPort, {
    wsServer,
    llmConfig,
    commandExecutor,
    openclawManager,
    store,
  }, mcpServer);
  httpApiServer.start();
}

// ===== IPC Handlers =====

// WebSocket
ipcMain.handle('ws:getStatus', () => wsServer.getStatus());
ipcMain.handle('ws:getPort', () => wsServer.port);
ipcMain.handle('ws:setPort', async (_, port) => {
  store.set('wsPort', port);
  wsServer.restart(port);
  return { success: true };
});
ipcMain.handle('ws:getClients', () => wsServer.getClients());
ipcMain.handle('ws:sendToAll', (_, message) => {
  wsServer.broadcast(message);
  return { success: true };
});

// Command Execution
ipcMain.handle('cmd:execute', async (_, command) => {
  const result = await commandExecutor.execute(command);
  // Send result back to mobile
  wsServer.broadcast({
    type: 'result',
    id: command.id,
    timestamp: Date.now(),
    payload: result
  });
  return result;
});

// OpenClaw Management
ipcMain.handle('openclaw:getStatus', () => openclawManager.getStatus());
ipcMain.handle('openclaw:install', async () => {
  const onProgress = (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('openclaw-progress', progress);
    }
  };
  return await openclawManager.install(onProgress);
});
ipcMain.handle('openclaw:start', async () => openclawManager.start());
ipcMain.handle('openclaw:stop', async () => openclawManager.stop());
ipcMain.handle('openclaw:openUI', () => {
  const url = openclawManager.getUIUrl();
  if (url) shell.openExternal(url);
});
ipcMain.handle('openclaw:getConnectMode', () => store.get('openclawConnectMode', 'mcp'));
ipcMain.handle('openclaw:setConnectMode', (_, mode) => {
  store.set('openclawConnectMode', mode);
  return { success: true, mode };
});

// LLM Config
ipcMain.handle('llm:getConfigs', () => llmConfig.getAll());
ipcMain.handle('llm:saveConfig', (_, config) => llmConfig.save(config));
ipcMain.handle('llm:deleteConfig', (_, id) => llmConfig.remove(id));
ipcMain.handle('llm:testConnection', async (_, config) => llmConfig.testConnection(config));
ipcMain.handle('llm:getPresets', () => llmConfig.getPresets());

// MCP Server
ipcMain.handle('mcp:getStatus', () => mcpServer.getStatus());
ipcMain.handle('mcp:getPort', () => mcpServer.port);
ipcMain.handle('mcp:setPort', async (_, port) => {
  store.set('mcpPort', port);
  mcpServer.stop();
  mcpServer.port = port;
  mcpServer.start();
  return { success: true };
});
ipcMain.handle('mcp:getTools', () => {
  return Object.entries(mcpServer.tools).map(([name, tool]) => ({
    name,
    description: tool.description,
  }));
});

// HTTP API Server
ipcMain.handle('httpApi:getStatus', () => httpApiServer.getStatus());
ipcMain.handle('httpApi:getPort', () => httpApiServer.port);
ipcMain.handle('httpApi:setPort', async (_, port) => {
  store.set('httpApiPort', port);
  httpApiServer.stop();
  httpApiServer.port = port;
  httpApiServer.start();
  return { success: true };
});

// Network
ipcMain.handle('network:getLocalIP', () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  initServices();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (wsServer) wsServer.stop();
  if (mcpServer) mcpServer.stop();
  if (httpApiServer) httpApiServer.stop();
  if (openclawManager) openclawManager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (wsServer) wsServer.stop();
  if (mcpServer) mcpServer.stop();
  if (httpApiServer) httpApiServer.stop();
  if (openclawManager) openclawManager.stop();
});
