/**
 * MCP (Model Context Protocol) Server for RemoteAssistant
 *
 * Implements MCP over SSE (Server-Sent Events) transport.
 * OpenClaw or any MCP Client connects via HTTP to discover and call tools.
 *
 * Endpoints:
 *   GET  /sse          - SSE stream for server→client messages
 *   POST /messages     - Client→server JSON-RPC requests
 *   GET  /health       - Health check
 */

const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

class MCPServer {
  constructor(port, services) {
    this.port = port;
    this.services = services; // { wsServer, llmConfig, commandExecutor, openclawManager, store }
    this.server = null;
    this.sseClients = new Map(); // id -> response
    this.tools = this._registerTools();
  }

  _registerTools() {
    return {
      // ===== Device Control =====
      send_to_mobile: {
        description: '向已连接的手机设备发送消息或指令',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '要发送的消息内容' },
            type: { type: 'string', enum: ['message', 'command'], default: 'message', description: '消息类型' },
          },
          required: ['message'],
        },
        handler: async (args) => {
          const { wsServer } = this.services;
          const msg = {
            type: args.type || 'message',
            id: uuidv4(),
            timestamp: Date.now(),
            payload: args.type === 'command'
              ? { type: 'shell', command: args.message }
              : { text: args.message },
          };
          wsServer.broadcast(msg);
          const clientCount = wsServer.getStatus().clients;
          return { success: true, sentTo: clientCount, message: `已发送到 ${clientCount} 台设备` };
        },
      },

      get_connected_devices: {
        description: '获取当前已连接的手机设备列表',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const { wsServer } = this.services;
          return {
            devices: wsServer.getClients(),
            count: wsServer.getStatus().clients,
          };
        },
      },

      // ===== System Info =====
      get_system_info: {
        description: '获取电脑的系统信息（操作系统、CPU、内存、主机名等）',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const os = require('os');
          return {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            release: os.release(),
            cpus: os.cpus().length,
            cpuModel: os.cpus()[0]?.model || 'unknown',
            totalMemoryGB: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
            freeMemoryGB: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
            uptimeHours: Math.round(os.uptime() / 3600 * 10) / 10,
            homeDir: os.homedir(),
            tempDir: os.tmpdir(),
            networkInterfaces: this._getNetworkIPs(),
          };
        },
      },

      run_safe_command: {
        description: '在电脑上执行白名单内的安全命令（echo, date, hostname, ping, ipconfig, dir, ls, docker, python 等）',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的命令' },
          },
          required: ['command'],
        },
        handler: async (args) => {
          const { commandExecutor } = this.services;
          return await commandExecutor.execute({
            payload: { type: 'shell', command: args.command },
          });
        },
      },

      // ===== LLM Management =====
      list_llm_configs: {
        description: '列出所有已配置的大模型（包含名称、类型、API地址、启用状态等）',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const { llmConfig } = this.services;
          const configs = llmConfig.getAll();
          return {
            count: configs.length,
            models: configs.map(c => ({
              id: c.id,
              name: c.name,
              type: c.type,
              endpoint: c.endpoint,
              model: c.model,
              enabled: c.enabled,
            })),
          };
        },
      },

      call_llm: {
        description: '调用指定的大模型进行对话推理。支持 OpenAI 兼容格式（包括 Ollama、LM Studio、通义千问、DeepSeek 等）和 LLM-Studio',
        inputSchema: {
          type: 'object',
          properties: {
            model_id: { type: 'string', description: '模型配置ID（从 list_llm_configs 获取），不传则使用第一个启用的模型' },
            prompt: { type: 'string', description: '用户消息内容' },
            system_prompt: { type: 'string', description: '系统提示词（可选）' },
            max_tokens: { type: 'number', description: '最大生成token数', default: 1024 },
            temperature: { type: 'number', description: '温度参数', default: 0.7 },
          },
          required: ['prompt'],
        },
        handler: async (args) => {
          const { llmConfig } = this.services;
          const configs = llmConfig.getAll();

          let config;
          if (args.model_id) {
            config = configs.find(c => c.id === args.model_id);
            if (!config) return { error: `未找到模型配置: ${args.model_id}` };
          } else {
            config = configs.find(c => c.enabled);
            if (!config) return { error: '没有启用的模型配置，请先在大模型配置中添加' };
          }

          return await this._callLLMAPI(config, args);
        },
      },

      switch_llm: {
        description: '启用或禁用指定的大模型配置',
        inputSchema: {
          type: 'object',
          properties: {
            model_id: { type: 'string', description: '模型配置ID' },
            enabled: { type: 'boolean', description: '是否启用' },
          },
          required: ['model_id', 'enabled'],
        },
        handler: async (args) => {
          const { llmConfig } = this.services;
          const configs = llmConfig.getAll();
          const config = configs.find(c => c.id === args.model_id);
          if (!config) return { error: `未找到模型配置: ${args.model_id}` };
          config.enabled = args.enabled;
          llmConfig.save(config);
          return { success: true, name: config.name, enabled: config.enabled };
        },
      },

      // ===== LLM Studio =====
      llm_studio_status: {
        description: '查询本地 LLM-Studio 服务的运行状态和健康信息',
        inputSchema: {
          type: 'object',
          properties: {
            endpoint: { type: 'string', description: 'LLM-Studio 地址', default: 'http://localhost:8000' },
          },
        },
        handler: async (args) => {
          const endpoint = args.endpoint || 'http://localhost:8000';
          return await this._httpGet(`${endpoint}/health`);
        },
      },

      llm_studio_chat: {
        description: '调用本地 LLM-Studio 的对话接口进行推理',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '用户消息' },
            system_prompt: { type: 'string', description: '系统提示词' },
            endpoint: { type: 'string', description: 'LLM-Studio API地址', default: 'http://localhost:8000/v1' },
            user_id: { type: 'string', description: 'User ID', default: 'admin' },
            api_key: { type: 'string', description: 'API Key' },
            model: { type: 'string', description: '模型名称（必填，LLM-Studio 要求指定模型路径）', default: 'auto' },
          },
          required: ['prompt'],
        },
        handler: async (args) => {
          const endpoint = (args.endpoint || 'http://localhost:8000/v1').replace(/\/$/, '');
          const messages = [];
          if (args.system_prompt) messages.push({ role: 'system', content: args.system_prompt });
          messages.push({ role: 'user', content: args.prompt });

          const headers = { 'Content-Type': 'application/json' };
          if (args.user_id) headers['X-User-ID'] = args.user_id;
          if (args.api_key) headers['X-API-Key'] = args.api_key;

          const body = { messages, model: args.model || 'auto' };

          return await this._httpPost(`${endpoint}/chat/completions`, body, headers);
        },
      },

      // ===== File Operations =====
      read_file: {
        description: '读取电脑上指定路径的文件内容（仅限安全路径）',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            encoding: { type: 'string', description: '编码格式', default: 'utf-8' },
            max_bytes: { type: 'number', description: '最大读取字节数', default: 102400 },
          },
          required: ['path'],
        },
        handler: async (args) => {
          const fs = require('fs');
          const filePath = require('path').resolve(args.path);

          if (!this._isPathSafe(filePath)) {
            return { error: '访问被拒绝：路径不在允许范围内' };
          }

          try {
            const stats = fs.statSync(filePath);
            if (stats.size > (args.max_bytes || 102400)) {
              return { error: `文件过大 (${stats.size} bytes)，超出限制 ${args.max_bytes || 102400} bytes` };
            }
            const content = fs.readFileSync(filePath, args.encoding || 'utf-8');
            return { path: filePath, size: stats.size, content };
          } catch (e) {
            return { error: `读取失败: ${e.message}` };
          }
        },
      },

      list_directory: {
        description: '列出电脑上指定目录的文件和子目录（仅限安全路径）',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径' },
          },
          required: ['path'],
        },
        handler: async (args) => {
          const fs = require('fs');
          const pathMod = require('path');
          const dirPath = pathMod.resolve(args.path);

          if (!this._isPathSafe(dirPath)) {
            return { error: '访问被拒绝：路径不在允许范围内' };
          }

          try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            return {
              path: dirPath,
              count: entries.length,
              entries: entries.slice(0, 200).map(e => ({
                name: e.name,
                type: e.isDirectory() ? 'directory' : 'file',
              })),
            };
          } catch (e) {
            return { error: `读取失败: ${e.message}` };
          }
        },
      },

      // ===== OpenClaw Management =====
      openclaw_status: {
        description: '获取 OpenClaw 的安装和运行状态',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const { openclawManager } = this.services;
          return openclawManager.getStatus();
        },
      },

      openclaw_start: {
        description: '启动 OpenClaw 服务',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const { openclawManager } = this.services;
          return await openclawManager.start();
        },
      },

      openclaw_stop: {
        description: '停止 OpenClaw 服务',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const { openclawManager } = this.services;
          return await openclawManager.stop();
        },
      },
    };
  }

  // ===== Transport: SSE over HTTP =====

  start() {
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${this.port}`);

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sse') {
        this._handleSSE(req, res);
      } else if (req.method === 'POST' && url.pathname === '/messages') {
        this._handleMessage(req, res);
      } else if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', tools: Object.keys(this.tools).length }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.server.listen(this.port, () => {
      console.log(`MCP Server started on port ${this.port}`);
      console.log(`  SSE endpoint:     http://localhost:${this.port}/sse`);
      console.log(`  Message endpoint: http://localhost:${this.port}/messages`);
      console.log(`  Tools available:  ${Object.keys(this.tools).length}`);
    });
  }

  stop() {
    if (this.server) {
      this.sseClients.forEach((res) => { try { res.end(); } catch {} });
      this.sseClients.clear();
      this.server.close();
      this.server = null;
      console.log('MCP Server stopped');
    }
  }

  _handleSSE(req, res) {
    const clientId = uuidv4();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send the message endpoint URI as first event
    res.write(`event: endpoint\ndata: /messages?sessionId=${clientId}\n\n`);

    this.sseClients.set(clientId, res);

    req.on('close', () => {
      this.sseClients.delete(clientId);
    });
  }

  _sendSSEMessage(clientId, jsonRpcResponse) {
    const res = this.sseClients.get(clientId);
    if (res) {
      res.write(`event: message\ndata: ${JSON.stringify(jsonRpcResponse)}\n\n`);
    }
  }

  async _handleMessage(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const sessionId = url.searchParams.get('sessionId');

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        const response = await this._processJsonRpc(request);

        // Send via SSE if client is connected
        if (sessionId && this.sseClients.has(sessionId)) {
          this._sendSSEMessage(sessionId, response);
        }

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'accepted' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
      }
    });
  }

  // ===== JSON-RPC Processing =====

  async _processJsonRpc(request) {
    const { id, method, params } = request;

    switch (method) {
      case 'initialize':
        return this._rpcResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'RemoteAssistant MCP Server', version: '1.0.0' },
        });

      case 'tools/list':
        return this._rpcResult(id, {
          tools: Object.entries(this.tools).map(([name, tool]) => ({
            name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const tool = this.tools[toolName];

        if (!tool) {
          return this._rpcError(id, -32601, `未知工具: ${toolName}`);
        }

        try {
          const result = await tool.handler(toolArgs);
          return this._rpcResult(id, {
            content: [{
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            }],
          });
        } catch (e) {
          return this._rpcResult(id, {
            content: [{ type: 'text', text: `执行失败: ${e.message}` }],
            isError: true,
          });
        }
      }

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null; // No response for notifications

      default:
        return this._rpcError(id, -32601, `未知方法: ${method}`);
    }
  }

  _rpcResult(id, result) {
    return { jsonrpc: '2.0', id, result };
  }

  _rpcError(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }

  // ===== Helpers =====

  _getNetworkIPs() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const result = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          result.push({ name, address: iface.address });
        }
      }
    }
    return result;
  }

  _isPathSafe(filePath) {
    const os = require('os');
    const pathMod = require('path');
    const resolved = pathMod.resolve(filePath);

    // Block system-critical directories
    const blocked = [
      '/etc/shadow', '/etc/passwd',
      'C:\\Windows\\System32',
      'C:\\Windows\\SysWOW64',
    ];
    for (const b of blocked) {
      if (resolved.toLowerCase().startsWith(b.toLowerCase())) return false;
    }

    // Block hidden/system files on Windows
    if (process.platform === 'win32') {
      const parts = resolved.split(pathMod.sep);
      if (parts.some(p => p.startsWith('$') || p === 'System Volume Information')) return false;
    }

    return true;
  }

  async _callLLMAPI(config, args) {
    const messages = [];
    if (args.system_prompt) messages.push({ role: 'system', content: args.system_prompt });
    messages.push({ role: 'user', content: args.prompt });

    if (config.type === 'llmstudio') {
      const headers = { 'Content-Type': 'application/json' };
      if (config.userId) headers['X-User-ID'] = config.userId;
      if (config.apiKey) headers['X-API-Key'] = config.apiKey;

      const body = {
        messages,
        model: config.model || 'auto',
        max_tokens: args.max_tokens || 2048,
        temperature: args.temperature || 0.7,
      };

      const endpoint = config.endpoint.replace(/\/$/, '');
      return await this._httpPost(`${endpoint}/chat/completions`, body, headers);
    }

    if (config.type === 'anthropic') {
      const body = {
        model: config.model,
        max_tokens: args.max_tokens || 1024,
        messages,
      };
      if (args.system_prompt) {
        body.system = args.system_prompt;
        body.messages = [{ role: 'user', content: args.prompt }];
      }
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      };
      const endpoint = config.endpoint.replace(/\/$/, '');
      return await this._httpPost(`${endpoint}/messages`, body, headers);
    }

    // Default: OpenAI-compatible (OpenAI, DashScope, Ollama, LM Studio, DeepSeek, etc.)
    const body = {
      model: config.model,
      messages,
      max_tokens: args.max_tokens || 1024,
      temperature: args.temperature || 0.7,
    };
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const endpoint = config.endpoint.replace(/\/$/, '');
    return await this._httpPost(`${endpoint}/chat/completions`, body, headers);
  }

  _httpGet(urlStr) {
    return new Promise((resolve) => {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? require('https') : require('http');

      const req = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ status: res.statusCode, body: data.substring(0, 2000) }); }
        });
      });

      req.on('error', (e) => resolve({ error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ error: '请求超时' }); });
      req.end();
    });
  }

  _httpPost(urlStr, body, headers = {}) {
    return new Promise((resolve) => {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? require('https') : require('http');
      const data = JSON.stringify(body);

      const req = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
        timeout: 60000,
      }, (res) => {
        let resData = '';
        res.on('data', chunk => resData += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(resData)); }
          catch { resolve({ status: res.statusCode, body: resData.substring(0, 2000) }); }
        });
      });

      req.on('error', (e) => resolve({ error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ error: '请求超时' }); });
      req.write(data);
      req.end();
    });
  }

  getStatus() {
    return {
      running: this.server !== null,
      port: this.port,
      sseClients: this.sseClients.size,
      tools: Object.keys(this.tools).length,
    };
  }
}

module.exports = { MCPServer };
