const { exec, spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Whitelist of allowed commands to prevent arbitrary command execution
const ALLOWED_COMMANDS = [
  'echo', 'date', 'whoami', 'hostname', 'ping',
  'ipconfig', 'ifconfig', 'systeminfo',
  'dir', 'ls', 'pwd', 'cat', 'type',
  'openclaw', 'ollama', 'docker',
  'python', 'python3', 'pip', 'pip3',
];

// Dangerous patterns that should never be executed
const BLOCKED_PATTERNS = [
  /rm\s+-rf/i, /del\s+\/[sfq]/i, /format\s+/i,
  /mkfs/i, /dd\s+if=/i, /shutdown/i, /reboot/i,
  /reg\s+(delete|add)/i, /net\s+user/i,
  /powershell.*-enc/i, /curl.*\|.*sh/i,
  /wget.*\|.*sh/i, />\s*\/dev\/sd/i,
];

class CommandExecutor {
  constructor() {
    this.runningProcesses = new Map();
  }

  async execute(msg) {
    const { payload } = msg;
    if (!payload) return { success: false, error: '无效的指令' };

    const commandType = payload.type || 'shell';

    switch (commandType) {
      case 'shell':
        return this._executeShell(payload.command);
      case 'openclaw':
        return this._executeOpenClaw(payload.action);
      case 'llm':
        return this._executeLLM(payload);
      case 'system':
        return this._executeSystem(payload.action);
      default:
        return { success: false, error: `未知的指令类型: ${commandType}` };
    }
  }

  async _executeShell(command) {
    if (!command || typeof command !== 'string') {
      return { success: false, error: '无效的命令' };
    }

    // Security check
    const cmd = command.trim().toLowerCase();

    // Check blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(cmd)) {
        return { success: false, error: '该命令已被安全策略禁止' };
      }
    }

    // Check first word against whitelist
    const firstWord = cmd.split(/\s+/)[0].replace(/^\.\//, '').replace(/\.exe$/, '');
    if (!ALLOWED_COMMANDS.includes(firstWord)) {
      return { success: false, error: `命令 "${firstWord}" 不在允许列表中。允许的命令: ${ALLOWED_COMMANDS.join(', ')}` };
    }

    return new Promise((resolve) => {
      const timeout = 30000; // 30s timeout
      const child = exec(command, {
        timeout,
        maxBuffer: 1024 * 1024,
        env: { ...process.env },
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message,
            stdout: stdout ? stdout.substring(0, 5000) : '',
            stderr: stderr ? stderr.substring(0, 5000) : '',
          });
        } else {
          resolve({
            success: true,
            stdout: stdout ? stdout.substring(0, 5000) : '',
            stderr: stderr ? stderr.substring(0, 5000) : '',
          });
        }
      });
    });
  }

  async _executeOpenClaw(action) {
    switch (action) {
      case 'start': return { success: true, message: '请通过OpenClaw管理面板启动' };
      case 'stop': return { success: true, message: '请通过OpenClaw管理面板停止' };
      case 'status': return { success: true, message: '请通过OpenClaw管理面板查看' };
      default: return { success: false, error: `未知的OpenClaw操作: ${action}` };
    }
  }

  async _executeLLM(payload) {
    return { success: true, message: '请通过大模型配置面板操作' };
  }

  async _executeSystem(action) {
    switch (action) {
      case 'info':
        return {
          success: true,
          data: {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            cpus: os.cpus().length,
            totalMemory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
            freeMemory: `${Math.round(os.freemem() / 1024 / 1024 / 1024)}GB`,
            uptime: `${Math.round(os.uptime() / 3600)}h`,
          }
        };
      default:
        return { success: false, error: `未知的系统操作: ${action}` };
    }
  }
}

module.exports = { CommandExecutor };
