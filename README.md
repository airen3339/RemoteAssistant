# 📡 RemoteAssistant — 远程助手

> 用手机控制电脑，一键管理 AI Agent 和大模型

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)](.)
[![Mobile](https://img.shields.io/badge/Mobile-iOS%20%7C%20Android%20%7C%20HarmonyOS-orange)](.)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![Flutter](https://img.shields.io/badge/Flutter-%3E%3D3.16-02569B?logo=flutter)](https://flutter.dev)

---

**RemoteAssistant** 是一套开源的跨平台远程控制与 AI 助手管理工具。  
手机端通过局域网 WebSocket 向电脑端发送指令，电脑端接收执行；同时集成 **OpenClaw 一键安装**、**10+ 主流大模型对接**、**MCP Server (14 Skills)**  和 **HTTP REST API** 双协议接入，让 AI Agent 能够操控你的电脑。

### ✨ 核心特性

| 特性 | 说明 |
|------|------|
| 📱 **手机遥控** | Flutter 跨端 APP，支持 iOS / Android / HarmonyOS，预设快捷指令一键发送 |
| 💻 **桌面执行** | Electron 跨平台桌面端，接收指令并安全执行，白名单命令保护 |
| 🤖 **OpenClaw 一键部署** | 自动检测 Docker 环境，一键安装启动 OpenClaw AI Agent 平台 |
| 🧠 **10+ 大模型管理** | 统一配置 OpenAI / Claude / Gemini / 通义千问 / DeepSeek / Ollama / LLM-Studio 等 |
| 🔌 **MCP Server** | 内置 14 个 Skills，OpenClaw 通过 SSE 自动发现调用（端口 9601） |
| 🌐 **HTTP REST API** | 17 个 REST 端点，供脚本 / Web 应用 / 自动化流程集成（端口 9602） |
| 🔒 **安全机制** | 命令白名单、路径访问控制、可选 API Key 认证 |

### 🏗️ 架构总览

```
┌──────────────────────────────────────────────────────────┐
│                    电脑端 (Electron)                       │
│                                                           │
│   WebSocket :9600    MCP :9601 (SSE)    HTTP API :9602    │
│   ┌─────────────┐   ┌──────────────┐   ┌─────────────┐   │
│   │ 手机指令收发  │   │ 14 Skills    │   │ 17 REST端点  │   │
│   └──────┬──────┘   └──────────────┘   └─────────────┘   │
│          │                                                │
│   ┌──────┴──────┐   ┌──────────────┐   ┌─────────────┐   │
│   │ 安全命令执行  │   │ OpenClaw管理  │   │ 大模型配置   │   │
│   └─────────────┘   └──────────────┘   └─────────────┘   │
└──────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
    WebSocket            MCP SSE             REST API
    手机APP连接         OpenClaw/Agent       脚本/Web应用
```

## 📂 项目架构

```
RemoteAssistant/
├── desktop/                    # Electron 桌面端
│   ├── main.js                 # 主进程
│   ├── preload.js              # 安全桥接
│   ├── src/                    # 前端 UI
│   └── server/                 # 后端服务
│       ├── websocket-server.js # WebSocket 服务
│       ├── mcp-server.js       # MCP Server (14 Skills)
│       ├── http-api-server.js  # HTTP REST API
│       ├── openclaw-manager.js # OpenClaw 管理
│       ├── llm-config.js       # 大模型配置
│       └── command-executor.js # 安全命令执行
├── mobile/                     # Flutter 移动端
│   └── lib/
│       ├── screens/            # UI 页面
│       ├── services/           # WebSocket / 设置服务
│       └── models/             # 数据模型
└── docs/                       # 文档
    ├── 功能说明.md
    ├── 环境安装说明.md
    └── 编译说明.md
```

## ✨ 功能特性

### 📱 手机端（Flutter）
- 连接局域网内的电脑端（自动发现或手动输入 IP）
- 发送文本指令、预设命令到电脑执行
- 实时查看电脑端执行结果
- 支持 iOS / Android / HarmonyOS（鸿蒙）

### 💻 电脑端（Electron）
- 接收手机端指令并安全执行（白名单保护）
- 一键安装运行 OpenClaw AI Agent 平台
- 统一配置管理 10+ 主流 & 本地大模型
- **MCP Server** — 14 个 Skills，OpenClaw 通过 SSE 自动发现调用
- **HTTP REST API** — 17 个端点，供脚本、Web 应用、自动化流程集成
- **OpenClaw 接入方式可切换** — 支持 MCP（默认）或 HTTP API
- WebSocket 服务器，支持多台手机同时连接
- 跨平台：Windows / macOS / Linux

## 📡 通信协议

手机与电脑通过 **WebSocket** 通信（局域网内），消息格式：

```json
{
  "type": "command | result | heartbeat | config",
  "id": "uuid",
  "timestamp": 1234567890,
  "payload": { ... }
}
```

## 🚀 快速开始

### 电脑端

```bash
cd desktop
npm install
npm start          # 开发模式运行
npm run build      # 打包（自动检测当前系统）
```

### 手机端

```bash
cd mobile
flutter pub get
flutter run                    # 运行到已连接设备
flutter build apk             # Android APK
flutter build ios              # iOS
flutter build apk --target-platform android-arm64  # 指定架构
```

### 鸿蒙（HarmonyOS）

参见 `mobile/harmony/README.md` 的适配说明。

## ⚙️ 环境要求

- **电脑端**: Node.js >= 18
- **手机端**: Flutter >= 3.16, Dart >= 3.2
- **鸿蒙端**: DevEco Studio >= 4.0, ArkTS

## 🧠 大模型配置支持

| 大模型 | 类型 | API格式 |
|--------|------|---------|
| OpenAI (GPT-4/4o) | 云端 | OpenAI API |
| Anthropic Claude | 云端 | Anthropic API |
| Google Gemini | 云端 | Google AI API |
| 通义千问 | 云端 | DashScope API |
| 文心一言 | 云端 | ERNIE API |
| DeepSeek | 云端 | OpenAI兼容 |
| Ollama | 本地 | OpenAI兼容 |
| LM Studio | 本地 | OpenAI兼容 |
| **LLM-Studio** | **本地** | **FastAPI (X-API-Key认证)** |
| LocalAI | 本地 | OpenAI兼容 |

## 🔌 MCP Server (Skills)

内置 MCP (Model Context Protocol) 服务，默认端口 `9601`，供 OpenClaw 或其他 MCP Client 调用。

### OpenClaw 配置方式

在电脑端 OpenClaw 管理页面可选择接入方式（默认 MCP）：

| 模式 | 地址 | 说明 |
|------|------|------|
| **MCP (SSE，默认)** | `http://localhost:9601/sse` | OpenClaw 自动发现并调用所有 Skills |
| HTTP REST API | `http://localhost:9602/api` | 通过标准 REST 接口调用 |

### 可用 Skills 列表

| Skill | 说明 |
|-------|------|
| `send_to_mobile` | 向已连接的手机发送消息或指令 |
| `get_connected_devices` | 获取当前已连接的手机设备列表 |
| `get_system_info` | 获取电脑系统信息（OS/CPU/内存等） |
| `run_safe_command` | 执行白名单内的安全命令 |
| `list_llm_configs` | 列出所有已配置的大模型 |
| `call_llm` | 调用指定大模型进行对话推理 |
| `switch_llm` | 启用或禁用指定模型配置 |
| `llm_studio_status` | 查询本地 LLM-Studio 运行状态 |
| `llm_studio_chat` | 调用 LLM-Studio 对话接口 |
| `read_file` | 读取电脑上指定文件的内容 |
| `list_directory` | 列出指定目录的文件和子目录 |
| `openclaw_status` | 获取 OpenClaw 运行状态 |
| `openclaw_start` | 启动 OpenClaw |
| `openclaw_stop` | 停止 OpenClaw |

## 🌐 HTTP REST API

内置 HTTP REST API 服务，默认端口 `9602`，供第三方脚本、Web 应用或自动化流程调用。与 MCP Server 共享相同的底层 Skill 能力。

### Base URL

```
http://localhost:9602/api
```

### API 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查，返回服务状态 |
| GET | `/api/tools` | 列出所有可用工具和端点 |
| POST | `/api/tools/:name` | 通用工具调用（按名称） |
| GET | `/api/devices` | 获取已连接的手机设备列表 |
| POST | `/api/devices/send` | 向手机发送消息或指令 |
| GET | `/api/system/info` | 获取电脑系统信息 |
| POST | `/api/system/command` | 执行白名单安全命令 |
| GET | `/api/llm/configs` | 列出所有大模型配置 |
| POST | `/api/llm/chat` | 调用大模型对话推理 |
| PUT | `/api/llm/configs/:id` | 启用/禁用指定模型 |
| GET | `/api/llm-studio/status` | 查询 LLM-Studio 状态 |
| POST | `/api/llm-studio/chat` | 调用 LLM-Studio 对话 |
| GET | `/api/files` | 列出目录内容 |
| GET | `/api/files/read` | 读取文件内容 |
| GET | `/api/openclaw/status` | 获取 OpenClaw 状态 |
| POST | `/api/openclaw/start` | 启动 OpenClaw |
| POST | `/api/openclaw/stop` | 停止 OpenClaw |

### 调用示例

```bash
# 健康检查
curl http://localhost:9602/api/health

# 获取系统信息
curl http://localhost:9602/api/system/info

# 调用大模型对话
curl -X POST http://localhost:9602/api/llm/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "你好", "max_tokens": 256}'

# 通用 Skill 调用
curl -X POST http://localhost:9602/api/tools/get_system_info \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 认证（可选）

可在设置中启用 API Key 认证，启用后所有请求需携带 `X-API-Key` 请求头：

```bash
curl -H "X-API-Key: your-key" http://localhost:9602/api/system/info
```

## 📄 文档

| 文档 | 说明 |
|------|------|
| [功能说明](docs/功能说明.md) | 全部功能详细介绍，包含电脑端、手机端、MCP、HTTP API 等 |
| [环境安装说明](docs/环境安装说明.md) | Node.js、Flutter、Docker、鸿蒙等开发环境配置 |
| [编译说明](docs/编译说明.md) | 各平台打包构建步骤及 CI/CD 配置 |

## 📃 License

MIT

---

## 🏢 关于我们

<p align="center">
  <a href="http://www.net188.net">
    <img src="http://www.net188.net/images/logo1.png" alt="Net188 Logo" width="200" />
  </a>
</p>

<p align="center">
  <strong>Net188 · 互联网技术服务</strong>
</p>

<p align="center">
  专注于跨平台应用开发、AI Agent 集成与大模型应用落地。<br/>
  提供从产品设计、开发实施到部署运维的全栈技术解决方案。
</p>

<p align="center">
  🌐 <a href="http://www.net188.net"><strong>www.net188.net</strong></a>
</p>

---

<p align="center">
  <sub>Built with ❤️ using Electron + Flutter</sub><br/>
  <sub>Copyright © 2025-2026 <a href="http://www.net188.net">Net188</a>. All rights reserved.</sub>
</p>
