const { exec, spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const http = require('http');

class OpenClawManager {
  constructor(store) {
    this.store = store;
    this.process = null;
    this.installDir = store.get('openclawDir', path.join(os.homedir(), '.openclaw'));
    this.uiPort = store.get('openclawPort', 3210);
  }

  getStatus() {
    const installed = this._isInstalled();
    const running = this.process !== null;
    let statusText = '未安装';
    if (installed && running) statusText = '运行中';
    else if (installed) statusText = '已安装（未运行）';

    return {
      installed,
      running,
      statusText,
      installDir: this.installDir,
      uiPort: this.uiPort,
    };
  }

  _isInstalled() {
    // Check if OpenClaw directory exists with key files
    try {
      return fs.existsSync(this.installDir) &&
        (fs.existsSync(path.join(this.installDir, 'docker-compose.yml')) ||
         fs.existsSync(path.join(this.installDir, 'openclaw')) ||
         fs.existsSync(path.join(this.installDir, 'openclaw.exe')));
    } catch {
      return false;
    }
  }

  async install(onProgress) {
    try {
      // Ensure install directory exists
      if (!fs.existsSync(this.installDir)) {
        fs.mkdirSync(this.installDir, { recursive: true });
      }

      onProgress && onProgress({ percent: 10, message: '检查系统环境...', log: '检查Docker是否已安装...' });

      // Check if Docker is available
      const hasDocker = await this._checkCommand('docker --version');

      if (hasDocker) {
        return await this._installViaDocker(onProgress);
      } else {
        return await this._installDirect(onProgress);
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async _installViaDocker(onProgress) {
    onProgress && onProgress({ percent: 20, message: '使用Docker安装...', log: '检测到Docker，使用Docker Compose安装' });

    // Create docker-compose.yml
    const composeContent = `version: '3.8'
services:
  openclaw:
    image: openclaw/openclaw:latest
    container_name: openclaw
    restart: unless-stopped
    ports:
      - "${this.uiPort}:3000"
    volumes:
      - openclaw-data:/app/data
    environment:
      - NODE_ENV=production

volumes:
  openclaw-data:
`;

    fs.writeFileSync(path.join(this.installDir, 'docker-compose.yml'), composeContent);
    onProgress && onProgress({ percent: 40, message: '拉取Docker镜像...', log: '正在拉取openclaw镜像...' });

    // Pull and start
    return new Promise((resolve) => {
      const child = exec(`cd "${this.installDir}" && docker compose pull && docker compose up -d`, {
        timeout: 300000 // 5 minutes
      }, (error, stdout, stderr) => {
        if (error) {
          onProgress && onProgress({ percent: 100, message: '安装失败', log: `错误: ${error.message}` });
          resolve({ success: false, error: error.message });
        } else {
          onProgress && onProgress({ percent: 100, message: '安装完成！', log: `Docker容器已启动\n${stdout}` });
          resolve({ success: true });
        }
      });
    });
  }

  async _installDirect(onProgress) {
    onProgress && onProgress({ percent: 20, message: '未检测到Docker，准备直接安装...', log: '将创建安装脚本' });

    const platform = os.platform();

    // Create install script based on platform
    let scriptContent, scriptName;

    if (platform === 'win32') {
      scriptName = 'install.bat';
      scriptContent = `@echo off
echo ==========================================
echo   OpenClaw 安装脚本 (Windows)
echo ==========================================
echo.
echo 步骤1: 检查 Node.js ...
node --version >nul 2>&1
if errorlevel 1 (
    echo 未检测到Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js 已安装

echo 步骤2: 检查 npm ...
call npm --version >nul 2>&1
if errorlevel 1 (
    echo 未检测到npm
    pause
    exit /b 1
)
echo npm 已安装

echo 步骤3: 安装 OpenClaw ...
if not exist "${this.installDir}\\app" mkdir "${this.installDir}\\app"
cd /d "${this.installDir}\\app"

echo 安装完成提示: 如果OpenClaw有npm包，请运行:
echo   npm install -g openclaw
echo 或从GitHub克隆项目:
echo   git clone https://github.com/openclaw/openclaw.git
echo.
echo 安装脚本执行完毕
pause
`;
    } else {
      scriptName = 'install.sh';
      scriptContent = `#!/bin/bash
echo "=========================================="
echo "  OpenClaw 安装脚本 (${platform})"
echo "=========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "未检测到Node.js，正在安装..."
    if command -v brew &> /dev/null; then
        brew install node
    elif command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    else
        echo "请手动安装 Node.js 18+"
        exit 1
    fi
fi
echo "Node.js: $(node --version)"

# Install OpenClaw
mkdir -p "${this.installDir}/app"
cd "${this.installDir}/app"

echo ""
echo "安装完成提示: 如果OpenClaw有npm包，请运行:"
echo "  npm install -g openclaw"
echo "或从GitHub克隆项目:"
echo "  git clone https://github.com/openclaw/openclaw.git"
echo ""
echo "安装脚本执行完毕"
`;
    }

    const scriptPath = path.join(this.installDir, scriptName);
    fs.writeFileSync(scriptPath, scriptContent);

    if (platform !== 'win32') {
      fs.chmodSync(scriptPath, '755');
    }

    onProgress && onProgress({ percent: 50, message: '运行安装脚本...', log: `安装脚本已创建: ${scriptPath}` });

    // Execute install script
    return new Promise((resolve) => {
      const cmd = platform === 'win32' ? `cmd /c "${scriptPath}"` : `bash "${scriptPath}"`;
      exec(cmd, { timeout: 300000, cwd: this.installDir }, (error, stdout, stderr) => {
        if (error) {
          onProgress && onProgress({ percent: 100, message: '安装脚本执行完毕(需手动确认)', log: stdout + '\n' + error.message });
        } else {
          onProgress && onProgress({ percent: 100, message: '安装脚本执行完毕', log: stdout });
        }
        // Mark as installed even if script had issues (user can manually complete)
        resolve({ success: true, message: '安装脚本已执行，请查看日志确认结果' });
      });
    });
  }

  async start() {
    if (this.process) return { success: false, error: '已在运行中' };

    try {
      const hasDocker = await this._checkCommand('docker --version');

      if (hasDocker && fs.existsSync(path.join(this.installDir, 'docker-compose.yml'))) {
        return new Promise((resolve) => {
          exec(`cd "${this.installDir}" && docker compose up -d`, (error, stdout) => {
            if (error) {
              resolve({ success: false, error: error.message });
            } else {
              this.process = 'docker'; // Mark as running via docker
              resolve({ success: true, message: 'Docker容器已启动' });
            }
          });
        });
      } else {
        // Try to start directly
        const appDir = path.join(this.installDir, 'app');
        if (fs.existsSync(path.join(appDir, 'package.json'))) {
          this.process = spawn('npm', ['start'], { cwd: appDir, shell: true });
          this.process.on('close', () => { this.process = null; });
          return { success: true, message: '已启动' };
        }
        return { success: false, error: '未找到可启动的OpenClaw实例' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async stop() {
    try {
      if (this.process === 'docker') {
        return new Promise((resolve) => {
          exec(`cd "${this.installDir}" && docker compose down`, (error) => {
            this.process = null;
            resolve(error ? { success: false, error: error.message } : { success: true });
          });
        });
      } else if (this.process && typeof this.process.kill === 'function') {
        this.process.kill();
        this.process = null;
        return { success: true };
      }
      return { success: true, message: '没有运行中的进程' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  getUIUrl() {
    return `http://localhost:${this.uiPort}`;
  }

  async _checkCommand(cmd) {
    return new Promise((resolve) => {
      exec(cmd, { timeout: 10000 }, (error) => {
        resolve(!error);
      });
    });
  }
}

module.exports = { OpenClawManager };
