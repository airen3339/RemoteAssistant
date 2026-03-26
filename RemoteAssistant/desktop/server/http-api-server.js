/**
 * HTTP REST API Server for RemoteAssistant
 *
 * Provides a standard RESTful API for third-party clients, scripts, or web apps to
 * interact with the same capabilities that the MCP Server exposes.
 *
 * Default port: 9602
 *
 * Endpoints:
 *   GET    /api/health                - Health check
 *   GET    /api/tools                 - List all available tools/skills
 *   POST   /api/tools/:name           - Call a specific tool by name
 *
 *   GET    /api/devices               - Connected mobile devices
 *   POST   /api/devices/send          - Send message to mobile devices
 *
 *   GET    /api/system/info           - System info
 *   POST   /api/system/command        - Run safe command
 *
 *   GET    /api/llm/configs           - List LLM configurations
 *   POST   /api/llm/chat              - Call LLM for chat completion
 *   PUT    /api/llm/configs/:id       - Enable/disable a model config
 *
 *   GET    /api/llm-studio/status     - LLM-Studio health
 *   POST   /api/llm-studio/chat       - LLM-Studio chat
 *
 *   GET    /api/files                 - List directory
 *   GET    /api/files/read            - Read file content
 *
 *   GET    /api/openclaw/status       - OpenClaw status
 *   POST   /api/openclaw/start        - Start OpenClaw
 *   POST   /api/openclaw/stop         - Stop OpenClaw
 */

const http = require('http');
const { URL } = require('url');

class HTTPAPIServer {
  constructor(port, services, mcpServer) {
    this.port = port;
    this.services = services; // { wsServer, llmConfig, commandExecutor, openclawManager, store }
    this.mcpServer = mcpServer; // Reference to MCPServer for reusing tool handlers
    this.server = null;
    this._routes = this._buildRoutes();
  }

  // ===== Route definitions =====

  _buildRoutes() {
    return [
      // Health & Tools
      { method: 'GET',  path: '/api/health',         handler: (q) => this._health() },
      { method: 'GET',  path: '/api/tools',          handler: (q) => this._listTools() },

      // Device Control
      { method: 'GET',  path: '/api/devices',        handler: (q) => this._callTool('get_connected_devices', {}) },
      { method: 'POST', path: '/api/devices/send',   handler: (q, body) => this._callTool('send_to_mobile', body) },

      // System
      { method: 'GET',  path: '/api/system/info',    handler: (q) => this._callTool('get_system_info', {}) },
      { method: 'POST', path: '/api/system/command',  handler: (q, body) => this._callTool('run_safe_command', body) },

      // LLM
      { method: 'GET',  path: '/api/llm/configs',    handler: (q) => this._callTool('list_llm_configs', {}) },
      { method: 'POST', path: '/api/llm/chat',       handler: (q, body) => this._callTool('call_llm', body) },

      // LLM-Studio
      { method: 'GET',  path: '/api/llm-studio/status', handler: (q) => this._callTool('llm_studio_status', q) },
      { method: 'POST', path: '/api/llm-studio/chat',   handler: (q, body) => this._callTool('llm_studio_chat', body) },

      // Files
      { method: 'GET',  path: '/api/files',          handler: (q) => this._callTool('list_directory', q) },
      { method: 'GET',  path: '/api/files/read',     handler: (q) => this._callTool('read_file', q) },

      // OpenClaw
      { method: 'GET',  path: '/api/openclaw/status', handler: (q) => this._callTool('openclaw_status', {}) },
      { method: 'POST', path: '/api/openclaw/start',  handler: (q) => this._callTool('openclaw_start', {}) },
      { method: 'POST', path: '/api/openclaw/stop',   handler: (q) => this._callTool('openclaw_stop', {}) },
    ];
  }

  // ===== Server lifecycle =====

  start() {
    this.server = http.createServer((req, res) => this._handleRequest(req, res));

    this.server.listen(this.port, () => {
      console.log(`HTTP API Server started on port ${this.port}`);
      console.log(`  Base URL:  http://localhost:${this.port}/api`);
      console.log(`  Health:    http://localhost:${this.port}/api/health`);
      console.log(`  Docs:      http://localhost:${this.port}/api/tools`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('HTTP API Server stopped');
    }
  }

  // ===== Request handling =====

  async _handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = url.pathname.replace(/\/+$/, ''); // strip trailing slash

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API key authentication (optional, checked against store)
    const apiKeyRequired = this.services.store.get('httpApiAuth', false);
    if (apiKeyRequired && pathname !== '/api/health') {
      const expectedKey = this.services.store.get('httpApiKey', '');
      const providedKey = req.headers['x-api-key'] || url.searchParams.get('api_key');
      if (expectedKey && providedKey !== expectedKey) {
        return this._sendJSON(res, 401, { error: 'Unauthorized', message: 'Invalid or missing X-API-Key' });
      }
    }

    // Match route - handle dynamic PUT /api/llm/configs/:id
    if (req.method === 'PUT' && pathname.startsWith('/api/llm/configs/')) {
      const id = pathname.split('/').pop();
      const body = await this._readBody(req);
      try {
        const result = await this._callTool('switch_llm', { model_id: id, ...body });
        return this._sendJSON(res, 200, result);
      } catch (e) {
        return this._sendJSON(res, 500, { error: e.message });
      }
    }

    // Match POST /api/tools/:name (generic tool call)
    if (req.method === 'POST' && pathname.startsWith('/api/tools/')) {
      const toolName = pathname.replace('/api/tools/', '');
      const body = await this._readBody(req);
      try {
        const result = await this._callTool(toolName, body);
        return this._sendJSON(res, 200, result);
      } catch (e) {
        return this._sendJSON(res, 500, { error: e.message });
      }
    }

    // Match static routes
    const route = this._routes.find(r => r.method === req.method && r.path === pathname);
    if (!route) {
      return this._sendJSON(res, 404, {
        error: 'Not Found',
        message: `${req.method} ${pathname} is not a valid endpoint`,
        hint: 'GET /api/tools for a list of available endpoints',
      });
    }

    try {
      const query = Object.fromEntries(url.searchParams.entries());
      const body = (req.method === 'POST' || req.method === 'PUT') ? await this._readBody(req) : {};
      const result = await route.handler(query, body);
      this._sendJSON(res, 200, result);
    } catch (e) {
      this._sendJSON(res, 500, { error: 'Internal Server Error', message: e.message });
    }
  }

  // ===== Core implementations =====

  _health() {
    return {
      status: 'ok',
      server: 'RemoteAssistant HTTP API',
      version: '1.0.0',
      port: this.port,
      tools: Object.keys(this.mcpServer.tools).length,
      uptime: process.uptime(),
    };
  }

  _listTools() {
    const tools = Object.entries(this.mcpServer.tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const endpoints = this._routes.map(r => ({
      method: r.method,
      path: r.path,
    }));

    // Add dynamic routes
    endpoints.push(
      { method: 'PUT',  path: '/api/llm/configs/:id' },
      { method: 'POST', path: '/api/tools/:name' },
    );

    return { tools, endpoints };
  }

  async _callTool(name, args) {
    const tool = this.mcpServer.tools[name];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await tool.handler(args || {});
  }

  // ===== Helpers =====

  _readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;
      const MAX_BODY = 1024 * 1024; // 1MB limit

      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          req.destroy();
          reject(new Error('Request body too large (max 1MB)'));
          return;
        }
        body += chunk;
      });

      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON in request body'));
        }
      });

      req.on('error', reject);
    });
  }

  _sendJSON(res, statusCode, data) {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  getStatus() {
    return {
      running: this.server !== null,
      port: this.port,
      tools: Object.keys(this.mcpServer.tools).length,
      endpoints: this._routes.length + 2, // +2 for dynamic routes
    };
  }
}

module.exports = { HTTPAPIServer };
