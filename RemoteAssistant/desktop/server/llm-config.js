const https = require('https');
const http = require('http');

class LLMConfigManager {
  constructor(store) {
    this.store = store;
  }

  getAll() {
    return this.store.get('llmConfigs', []);
  }

  save(config) {
    const configs = this.getAll();
    const idx = configs.findIndex(c => c.id === config.id);
    if (idx >= 0) {
      configs[idx] = config;
    } else {
      configs.push(config);
    }
    this.store.set('llmConfigs', configs);
    return { success: true };
  }

  remove(id) {
    const configs = this.getAll().filter(c => c.id !== id);
    this.store.set('llmConfigs', configs);
    return { success: true };
  }

  async testConnection(config) {
    try {
      switch (config.type) {
        case 'openai':
        case 'dashscope':
        case 'ollama':
        case 'lmstudio':
        case 'custom':
          return await this._testOpenAICompatible(config);
        case 'llmstudio':
          return await this._testLLMStudio(config);
        case 'anthropic':
          return await this._testAnthropic(config);
        case 'google':
          return await this._testGoogle(config);
        case 'ernie':
          return await this._testERNIE(config);
        default:
          return await this._testOpenAICompatible(config);
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async _testOpenAICompatible(config) {
    const url = new URL(config.endpoint);
    const modelsPath = url.pathname.replace(/\/$/, '') + '/models';

    return new Promise((resolve) => {
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: modelsPath,
        method: 'GET',
        headers: {
          'Authorization': config.apiKey ? `Bearer ${config.apiKey}` : undefined,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, message: `连接成功 (HTTP ${res.statusCode})` });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.substring(0, 200)}` });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ success: false, error: `连接失败: ${e.message}` });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: '连接超时' });
      });

      req.end();
    });
  }

  async _testAnthropic(config) {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        model: config.model || 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      });

      const url = new URL(config.endpoint);
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname.replace(/\/$/, '') + '/messages',
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // 200 or 400 (bad request but connects) both mean connection works
          if (res.statusCode < 500) {
            resolve({ success: true, message: `连接成功 (HTTP ${res.statusCode})` });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.substring(0, 200)}` });
          }
        });
      });

      req.on('error', (e) => resolve({ success: false, error: `连接失败: ${e.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '连接超时' }); });
      req.write(body);
      req.end();
    });
  }

  async _testGoogle(config) {
    return new Promise((resolve) => {
      const url = new URL(config.endpoint);
      const testPath = `${url.pathname.replace(/\/$/, '')}/models?key=${config.apiKey}`;

      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: testPath,
        method: 'GET',
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode < 400) {
            resolve({ success: true, message: `连接成功 (HTTP ${res.statusCode})` });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.substring(0, 200)}` });
          }
        });
      });

      req.on('error', (e) => resolve({ success: false, error: `连接失败: ${e.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '连接超时' }); });
      req.end();
    });
  }

  async _testERNIE(config) {
    // ERNIE requires access_token, simplified test
    return new Promise((resolve) => {
      const url = new URL(config.endpoint);
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }, (res) => {
        if (res.statusCode < 500) {
          resolve({ success: true, message: `连接成功 (HTTP ${res.statusCode})` });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });

      req.on('error', (e) => resolve({ success: false, error: `连接失败: ${e.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '连接超时' }); });
      req.write('{}');
      req.end();
    });
  }

  async _testLLMStudio(config) {
    const url = new URL(config.endpoint);
    const healthPath = url.pathname.replace(/\/v1\/?$/, '').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '') + '/health';

    return new Promise((resolve) => {
      const client = url.protocol === 'https:' ? https : http;
      const headers = { 'Content-Type': 'application/json' };
      if (config.apiKey) {
        headers['X-API-Key'] = config.apiKey;
        headers['X-User-ID'] = config.userId || 'admin';
      }

      const req = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: healthPath,
        method: 'GET',
        headers,
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve({ success: true, message: `LLM-Studio 连接成功 (HTTP ${res.statusCode})` });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.substring(0, 200)}` });
          }
        });
      });

      req.on('error', (e) => resolve({ success: false, error: `连接失败: ${e.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '连接超时' }); });
      req.end();
    });
  }

  getPresets() {
    return [
      { name: 'OpenAI GPT-4o', type: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o' },
      { name: 'OpenAI GPT-4o-mini', type: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      { name: 'Anthropic Claude Sonnet', type: 'anthropic', endpoint: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
      { name: 'Google Gemini Pro', type: 'google', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-pro' },
      { name: '通义千问 Turbo', type: 'dashscope', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
      { name: '通义千问 Max', type: 'dashscope', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max' },
      { name: 'DeepSeek Chat', type: 'openai', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      { name: 'DeepSeek Coder', type: 'openai', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-coder' },
      { name: '文心一言 ERNIE 4.0', type: 'ernie', endpoint: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop', model: 'ernie-4.0-8k' },
      { name: 'Ollama (本地)', type: 'ollama', endpoint: 'http://localhost:11434/v1', model: 'llama3' },
      { name: 'LM Studio (本地)', type: 'lmstudio', endpoint: 'http://localhost:1234/v1', model: 'local-model' },
      { name: 'LocalAI (本地)', type: 'custom', endpoint: 'http://localhost:8080/v1', model: 'gpt-4' },
      { name: 'LLM-Studio (本地)', type: 'llmstudio', endpoint: 'http://localhost:8000/v1', model: 'auto', userId: 'admin' },
    ];
  }
}

module.exports = { LLMConfigManager };
