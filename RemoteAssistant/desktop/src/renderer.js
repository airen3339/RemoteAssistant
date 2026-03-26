// ===== Tab Navigation =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`tab-${item.dataset.tab}`).classList.add('active');
  });
});

// ===== State =====
let messages = [];
let llmConfigs = [];
let editingLLMId = null;

// ===== Dashboard =====
async function loadDashboard() {
  // Load IPs
  const ips = await window.api.network.getLocalIP();
  const ipEl = document.getElementById('localIPs');
  ipEl.innerHTML = ips.map(ip => `${ip.address}`).join('<br>') || '未检测到网络';

  // Load port
  const port = await window.api.ws.getPort();
  document.getElementById('wsPortDisplay').textContent = `端口: ${port}`;
  document.getElementById('settingsPort').value = port;

  // WS status
  updateWSStatus();

  // OpenClaw status
  refreshOpenClawStatus();
}

async function updateWSStatus() {
  try {
    const status = await window.api.ws.getStatus();
    const dot = document.querySelector('#wsStatus .status-dot');
    const text = document.querySelector('#wsStatus span:last-child');
    if (status.running) {
      dot.className = 'status-dot online';
      text.textContent = `WebSocket: 运行中 (${status.clients}台设备)`;
    } else {
      dot.className = 'status-dot offline';
      text.textContent = 'WebSocket: 已停止';
    }
    document.getElementById('connectedClients').textContent = status.clients || 0;
  } catch {
    // Server not ready yet
  }
}

// ===== Messages =====
function addMessage(msg, direction) {
  messages.push({ ...msg, direction, time: new Date() });
  renderMessages();
  updateRecentCommands();
}

function renderMessages() {
  const list = document.getElementById('messageList');
  if (messages.length === 0) {
    list.innerHTML = '<div class="empty-state">等待手机端发送消息...</div>';
    return;
  }
  list.innerHTML = messages.map(m => {
    const cls = m.direction === 'received' ? 'received' : 'sent';
    const from = m.direction === 'received' ? '? 手机端' : '? 本机';
    const content = typeof m.payload === 'object' ? JSON.stringify(m.payload) : (m.payload || m.text || '');
    const time = m.time.toLocaleTimeString();
    return `<div class="message-item ${cls}">
      <div class="msg-from">${from}</div>
      <div>${sanitizeHTML(content)}</div>
      <div class="msg-time">${time}</div>
    </div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
}

function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateRecentCommands() {
  const recent = messages.filter(m => m.direction === 'received').slice(-5).reverse();
  const el = document.getElementById('recentCommands');
  if (recent.length === 0) {
    el.innerHTML = '暂无指令';
    return;
  }
  el.innerHTML = recent.map(m => {
    const content = typeof m.payload === 'object'
      ? (m.payload.command || m.payload.text || JSON.stringify(m.payload))
      : (m.payload || '');
    return `<div class="recent-item">${sanitizeHTML(content.substring(0, 50))}</div>`;
  }).join('');
}

// Mobile message listener
window.api.ws.onMobileMessage((msg) => {
  addMessage(msg, 'received');

  // Auto-execute commands
  if (msg.type === 'command' && msg.payload) {
    window.api.cmd.execute(msg).then(result => {
      addMessage({ type: 'result', payload: result }, 'sent');
    });
  }
});

// Send reply
document.getElementById('btnSendReply').addEventListener('click', () => {
  const input = document.getElementById('replyInput');
  const text = input.value.trim();
  if (!text) return;
  const msg = {
    type: 'message',
    timestamp: Date.now(),
    payload: { text }
  };
  window.api.ws.sendToAll(msg);
  addMessage(msg, 'sent');
  input.value = '';
});

document.getElementById('replyInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btnSendReply').click();
});

// ===== OpenClaw =====
async function refreshOpenClawStatus() {
  const status = await window.api.openclaw.getStatus();
  document.getElementById('ocInstallStatus').textContent = status.statusText;
  document.getElementById('openclawStatus').textContent = status.statusText;

  document.getElementById('btnInstallOC').disabled = status.installed;
  document.getElementById('btnStartOC').disabled = !status.installed || status.running;
  document.getElementById('btnStopOC').disabled = !status.running;
  document.getElementById('btnOpenOCUI').disabled = !status.running;
  document.getElementById('btnOpenclawQuick').textContent = status.installed
    ? (status.running ? '运行中' : '启动') : '一键安装';
}

document.getElementById('btnInstallOC').addEventListener('click', async () => {
  document.getElementById('ocProgressBar').style.display = 'block';
  document.getElementById('ocProgressText').style.display = 'block';
  appendLog('开始安装 OpenClaw...');
  const result = await window.api.openclaw.install();
  if (result.success) {
    appendLog('安装完成！');
  } else {
    appendLog(`安装失败: ${result.error}`);
  }
  refreshOpenClawStatus();
});

document.getElementById('btnStartOC').addEventListener('click', async () => {
  appendLog('正在启动 OpenClaw...');
  const result = await window.api.openclaw.start();
  appendLog(result.success ? 'OpenClaw 已启动' : `启动失败: ${result.error}`);
  refreshOpenClawStatus();
});

document.getElementById('btnStopOC').addEventListener('click', async () => {
  appendLog('正在停止 OpenClaw...');
  const result = await window.api.openclaw.stop();
  appendLog(result.success ? 'OpenClaw 已停止' : `停止失败: ${result.error}`);
  refreshOpenClawStatus();
});

document.getElementById('btnOpenOCUI').addEventListener('click', () => {
  window.api.openclaw.openUI();
});

document.getElementById('btnOpenclawQuick').addEventListener('click', async () => {
  const status = await window.api.openclaw.getStatus();
  if (!status.installed) {
    document.querySelector('[data-tab="openclaw"]').click();
    document.getElementById('btnInstallOC').click();
  } else if (!status.running) {
    await window.api.openclaw.start();
    refreshOpenClawStatus();
  }
});

window.api.openclaw.onProgress((progress) => {
  document.getElementById('ocProgressFill').style.width = `${progress.percent}%`;
  document.getElementById('ocProgressText').textContent = progress.message;
  if (progress.log) appendLog(progress.log);
});

function appendLog(text) {
  const log = document.getElementById('ocLog');
  const time = new Date().toLocaleTimeString();
  log.textContent += `[${time}] ${text}\n`;
  log.scrollTop = log.scrollHeight;
}

// ===== OpenClaw Connect Mode =====
async function loadOcConnectMode() {
  const mode = await window.api.openclaw.getConnectMode();
  document.getElementById('ocConnectMode').value = mode;
  updateOcConnectDisplay(mode);
}

function updateOcConnectDisplay(mode) {
  const urlEl = document.getElementById('ocConnectUrl');
  const guideEl = document.getElementById('ocConnectGuide');
  if (mode === 'http') {
    const port = document.getElementById('settingsHttpApiPort')?.value || '9602';
    urlEl.textContent = `http://localhost:${port}/api`;
    guideEl.textContent = `在 OpenClaw 设置中配置 HTTP API：
Base URL: http://localhost:${port}/api
方式: REST API (JSON)

调用示例:
  GET  /api/tools    → 列出所有可用 Skills
  POST /api/tools/:name → 调用指定 Skill`;
  } else {
    const port = document.getElementById('settingsMcpPort')?.value || '9601';
    urlEl.textContent = `http://localhost:${port}/sse`;
    guideEl.textContent = `在 OpenClaw 设置中添加 MCP Server：
类型: SSE
地址: http://localhost:${port}/sse

连接后 OpenClaw 可自动发现并调用所有 Skills。`;
  }
}

document.getElementById('ocConnectMode').addEventListener('change', (e) => {
  updateOcConnectDisplay(e.target.value);
});

document.getElementById('btnSaveOcMode').addEventListener('click', async () => {
  const mode = document.getElementById('ocConnectMode').value;
  await window.api.openclaw.setConnectMode(mode);
  appendLog(`OpenClaw 接入方式已切换为: ${mode === 'mcp' ? 'MCP (SSE)' : 'HTTP REST API'}`);
  alert(`接入方式已保存: ${mode === 'mcp' ? 'MCP (SSE)' : 'HTTP REST API'}`);
});

// ===== LLM Config =====
async function loadLLMConfigs() {
  llmConfigs = await window.api.llm.getConfigs();
  renderLLMList();
}

function renderLLMList() {
  const list = document.getElementById('llmList');
  if (llmConfigs.length === 0) {
    list.innerHTML = '<div class="empty-state">暂未配置大模型，点击"添加模型"或"加载预设"开始</div>';
    return;
  }
  list.innerHTML = llmConfigs.map(c => `
    <div class="llm-card ${c.enabled ? '' : 'disabled'}">
      <div class="llm-card-info">
        <h3>${sanitizeHTML(c.name)}</h3>
        <p>${sanitizeHTML(c.type)} | ${sanitizeHTML(c.model)} | ${sanitizeHTML(c.endpoint)}</p>
      </div>
      <div class="llm-card-actions">
        <button class="btn btn-secondary" onclick="editLLM('${c.id}')">编辑</button>
        <button class="btn btn-danger" onclick="deleteLLM('${c.id}')">删除</button>
      </div>
    </div>
  `).join('');
}

function updateUserIdVisibility() {
  const type = document.getElementById('llmType').value;
  document.getElementById('llmUserIdGroup').style.display = type === 'llmstudio' ? 'block' : 'none';
}

document.getElementById('btnAddLLM').addEventListener('click', () => {
  editingLLMId = null;
  document.getElementById('llmModalTitle').textContent = '添加大模型';
  document.getElementById('llmName').value = '';
  document.getElementById('llmType').value = 'openai';
  document.getElementById('llmEndpoint').value = '';
  document.getElementById('llmApiKey').value = '';
  document.getElementById('llmUserId').value = '';
  document.getElementById('llmModel').value = '';
  document.getElementById('llmEnabled').checked = true;
  updateUserIdVisibility();
  document.getElementById('llmModal').style.display = 'flex';
});

document.getElementById('btnCloseLLMModal').addEventListener('click', () => {
  document.getElementById('llmModal').style.display = 'none';
});

document.getElementById('btnSaveLLM').addEventListener('click', async () => {
  const config = {
    id: editingLLMId || `llm_${Date.now()}`,
    name: document.getElementById('llmName').value.trim(),
    type: document.getElementById('llmType').value,
    endpoint: document.getElementById('llmEndpoint').value.trim(),
    apiKey: document.getElementById('llmApiKey').value.trim(),
    userId: document.getElementById('llmUserId').value.trim(),
    model: document.getElementById('llmModel').value.trim(),
    enabled: document.getElementById('llmEnabled').checked,
  };
  if (!config.name || !config.endpoint) {
    alert('请填写名称和API地址');
    return;
  }
  await window.api.llm.saveConfig(config);
  document.getElementById('llmModal').style.display = 'none';
  loadLLMConfigs();
});

document.getElementById('btnTestLLM').addEventListener('click', async () => {
  const config = {
    type: document.getElementById('llmType').value,
    endpoint: document.getElementById('llmEndpoint').value.trim(),
    apiKey: document.getElementById('llmApiKey').value.trim(),
    userId: document.getElementById('llmUserId').value.trim(),
    model: document.getElementById('llmModel').value.trim(),
  };
  const btn = document.getElementById('btnTestLLM');
  btn.textContent = '测试中...';
  btn.disabled = true;
  const result = await window.api.llm.testConnection(config);
  btn.textContent = '测试连接';
  btn.disabled = false;
  alert(result.success ? '? 连接成功！' : `? 连接失败: ${result.error}`);
});

window.editLLM = function(id) {
  const c = llmConfigs.find(x => x.id === id);
  if (!c) return;
  editingLLMId = id;
  document.getElementById('llmModalTitle').textContent = '编辑大模型';
  document.getElementById('llmName').value = c.name;
  document.getElementById('llmType').value = c.type;
  document.getElementById('llmEndpoint').value = c.endpoint;
  document.getElementById('llmApiKey').value = c.apiKey || '';
  document.getElementById('llmUserId').value = c.userId || '';
  document.getElementById('llmModel').value = c.model;
  updateUserIdVisibility();
  document.getElementById('llmEnabled').checked = c.enabled;
  document.getElementById('llmModal').style.display = 'flex';
};

window.deleteLLM = async function(id) {
  if (!confirm('确定删除此模型配置？')) return;
  await window.api.llm.deleteConfig(id);
  loadLLMConfigs();
};

// Presets
document.getElementById('btnLoadPresets').addEventListener('click', async () => {
  const presets = await window.api.llm.getPresets();
  const list = document.getElementById('presetsList');
  list.innerHTML = presets.map(p => `
    <div class="preset-item" data-preset='${JSON.stringify(p).replace(/'/g, "&#39;")}'>
      <h4>${sanitizeHTML(p.name)}</h4>
      <p>${sanitizeHTML(p.type)} | ${sanitizeHTML(p.model)}</p>
    </div>
  `).join('');

  list.querySelectorAll('.preset-item').forEach(item => {
    item.addEventListener('click', () => {
      const preset = JSON.parse(item.dataset.preset);
      editingLLMId = null;
      document.getElementById('llmModalTitle').textContent = '添加大模型';
      document.getElementById('llmName').value = preset.name;
      document.getElementById('llmType').value = preset.type;
      document.getElementById('llmEndpoint').value = preset.endpoint;
      document.getElementById('llmApiKey').value = '';
      document.getElementById('llmModel').value = preset.model;
      document.getElementById('llmUserId').value = preset.userId || '';
      document.getElementById('llmEnabled').checked = true;
      updateUserIdVisibility();
      document.getElementById('presetsModal').style.display = 'none';
      document.getElementById('llmModal').style.display = 'flex';
    });
  });

  document.getElementById('presetsModal').style.display = 'flex';
});

document.getElementById('btnClosePresetsModal').addEventListener('click', () => {
  document.getElementById('presetsModal').style.display = 'none';
});

// ===== Settings =====
document.getElementById('btnSavePort').addEventListener('click', async () => {
  const port = parseInt(document.getElementById('settingsPort').value);
  if (port < 1024 || port > 65535) {
    alert('端口范围: 1024-65535');
    return;
  }
  await window.api.ws.setPort(port);
  alert('端口已更新，WebSocket服务已重启');
  loadDashboard();
});

// ===== LLM Type change auto-fill endpoint =====
document.getElementById('llmType').addEventListener('change', (e) => {
  const endpointMap = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ernie: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    ollama: 'http://localhost:11434/v1',
    lmstudio: 'http://localhost:1234/v1',
    llmstudio: 'http://localhost:8000/v1',
    custom: '',
  };
  updateUserIdVisibility();
  const modelMap = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
    google: 'gemini-pro',
    dashscope: 'qwen-turbo',
    ernie: 'ernie-4.0-8k',
    ollama: 'llama3',
    lmstudio: 'local-model',
    llmstudio: 'auto',
    custom: '',
  };
  const endpoint = document.getElementById('llmEndpoint');
  const model = document.getElementById('llmModel');
  if (!endpoint.value || Object.values(endpointMap).includes(endpoint.value)) {
    endpoint.value = endpointMap[e.target.value] || '';
  }
  if (!model.value || Object.values(modelMap).includes(model.value)) {
    model.value = modelMap[e.target.value] || '';
  }
});

// ===== MCP Server =====
async function loadMCPStatus() {
  try {
    const status = await window.api.mcp.getStatus();
    document.getElementById('mcpToolCount').textContent = status.tools || 0;

    const port = await window.api.mcp.getPort();
    document.getElementById('mcpPortDisplay').textContent = `端口: ${port}`;
    document.getElementById('settingsMcpPort').value = port;
    document.getElementById('mcpSSEUrl').textContent = `http://localhost:${port}/sse`;

    const tools = await window.api.mcp.getTools();
    const toolsList = document.getElementById('mcpToolsList');
    toolsList.innerHTML = tools.map(t =>
      `<div class="recent-item"><strong>${t.name}</strong> — ${sanitizeHTML(t.description).substring(0, 50)}</div>`
    ).join('');
  } catch {}
}

document.getElementById('btnSaveMcpPort').addEventListener('click', async () => {
  const port = parseInt(document.getElementById('settingsMcpPort').value);
  if (port < 1024 || port > 65535) {
    alert('端口范围: 1024-65535');
    return;
  }
  await window.api.mcp.setPort(port);
  alert('MCP端口已更新，服务已重启');
  loadMCPStatus();
});

// ===== HTTP API Server =====
async function loadHTTPApiStatus() {
  try {
    const status = await window.api.httpApi.getStatus();
    document.getElementById('httpApiEndpointCount').textContent = status.endpoints || 0;

    const port = await window.api.httpApi.getPort();
    document.getElementById('httpApiPortDisplay').textContent = `端口: ${port}`;
    document.getElementById('settingsHttpApiPort').value = port;
    document.getElementById('httpApiBaseUrl').textContent = `http://localhost:${port}/api`;
  } catch {}
}

document.getElementById('btnSaveHttpApiPort').addEventListener('click', async () => {
  const port = parseInt(document.getElementById('settingsHttpApiPort').value);
  if (port < 1024 || port > 65535) {
    alert('端口范围: 1024-65535');
    return;
  }
  await window.api.httpApi.setPort(port);
  alert('HTTP API 端口已更新，服务已重启');
  loadHTTPApiStatus();
});

// ===== Init =====
setInterval(updateWSStatus, 5000);
loadDashboard();
loadLLMConfigs();
loadMCPStatus();
loadHTTPApiStatus();
loadOcConnectMode();
