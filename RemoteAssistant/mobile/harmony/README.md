# HarmonyOS（鸿蒙）适配说明

## 方案一：Flutter 鸿蒙适配（推荐）

华为 OpenHarmony 已支持 Flutter 适配，通过 `flutter_harmony` 插件可以将现有 Flutter 项目编译到鸿蒙设备。

### 环境准备

1. **安装 DevEco Studio** >= 4.0
   - 下载地址：https://developer.huawei.com/consumer/cn/deveco-studio/
   
2. **安装 HarmonyOS SDK**
   - 通过 DevEco Studio 的 SDK Manager 安装

3. **Flutter 鸿蒙适配插件**
   ```bash
   # 关注 Flutter 官方鸿蒙适配进展
   # https://gitee.com/openharmony-sig/flutter_flutter
   ```

### 适配步骤

1. 克隆鸿蒙版 Flutter Engine：
   ```bash
   git clone https://gitee.com/openharmony-sig/flutter_flutter.git
   ```

2. 在现有 Flutter 项目中添加鸿蒙平台：
   ```bash
   flutter create --platforms ohos .
   ```

3. 依赖适配：
   - `web_socket_channel` - 鸿蒙原生支持 WebSocket, 无需改动
   - `shared_preferences` - 需要鸿蒙适配插件
   - `connectivity_plus` - 需要鸿蒙适配插件

4. 编译运行：
   ```bash
   flutter run -d ohos
   ```

### 注意事项

- 鸿蒙设备的网络权限需要在 `module.json5` 中声明
- WebSocket 在鸿蒙上的行为与 Android 一致
- UI 组件使用 Material Design 3 在鸿蒙上正常渲染

---

## 方案二：原生 ArkTS 开发

如需更深度的鸿蒙适配，可用 ArkTS 重写手机端。

### 项目结构

```
harmony/
├── entry/src/main/
│   ├── ets/
│   │   ├── entryability/
│   │   │   └── EntryAbility.ets
│   │   ├── pages/
│   │   │   ├── Index.ets
│   │   │   ├── ConnectPage.ets
│   │   │   ├── CommandPage.ets
│   │   │   └── SettingsPage.ets
│   │   ├── services/
│   │   │   └── WebSocketService.ets
│   │   └── model/
│   │       └── Command.ets
│   └── resources/
└── oh-package.json5
```

### WebSocket 核心代码（ArkTS）

```typescript
// WebSocketService.ets
import webSocket from '@ohos.net.webSocket';

class WebSocketService {
  private ws: webSocket.WebSocket | null = null;
  private serverUrl: string = '';

  async connect(ip: string, port: number): Promise<boolean> {
    this.serverUrl = `ws://${ip}:${port}`;
    this.ws = webSocket.createWebSocket();

    this.ws.on('open', () => {
      console.info('WebSocket connected');
    });

    this.ws.on('message', (err, data) => {
      if (!err) {
        const msg = JSON.parse(data as string);
        // Handle message
      }
    });

    this.ws.on('close', () => {
      console.info('WebSocket closed');
    });

    try {
      await this.ws.connect(this.serverUrl);
      return true;
    } catch (e) {
      return false;
    }
  }

  send(message: object): void {
    this.ws?.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
```

### 权限配置

在 `module.json5` 中添加：

```json
{
  "module": {
    "requestPermissions": [
      {
        "name": "ohos.permission.INTERNET"
      },
      {
        "name": "ohos.permission.GET_WIFI_INFO"
      }
    ]
  }
}
```

---

## 推荐路径

| 场景 | 推荐方案 |
|------|---------|
| 快速上线 | 方案一（Flutter 鸿蒙适配）—— 一套代码三端运行 |
| 深度适配 | 方案二（ArkTS 原生）—— 最佳鸿蒙体验 |
| 长期维护 | 两者并行 —— Flutter 为主，关键功能用原生增强 |
