import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/websocket_service.dart';
import '../services/settings_service.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: Consumer2<SettingsService, WebSocketService>(
        builder: (context, settings, ws, _) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Connection status
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('连接状态', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Icon(
                            ws.isConnected ? Icons.check_circle : Icons.cancel,
                            color: ws.isConnected ? Colors.greenAccent : Colors.redAccent,
                          ),
                          const SizedBox(width: 10),
                          Text(ws.isConnected
                              ? '已连接 ${ws.serverAddress}:${ws.serverPort}'
                              : '未连接'),
                        ],
                      ),
                      if (ws.isConnected) ...[
                        const SizedBox(height: 8),
                        OutlinedButton(
                          onPressed: ws.disconnect,
                          child: const Text('断开连接'),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Saved server
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('上次连接', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      const SizedBox(height: 8),
                      Text(
                        settings.lastServerIP.isNotEmpty
                            ? '${settings.lastServerIP}:${settings.lastServerPort}'
                            : '无记录',
                        style: const TextStyle(fontFamily: 'monospace', color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Auto-connect
              Card(
                child: SwitchListTile(
                  title: const Text('自动连接'),
                  subtitle: const Text('启动时自动连接上次的服务器'),
                  value: settings.autoConnect,
                  onChanged: settings.setAutoConnect,
                ),
              ),
              const SizedBox(height: 24),

              // About
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text('关于', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      SizedBox(height: 8),
                      Text('RemoteAssistant Mobile v1.0.0', style: TextStyle(color: Colors.grey)),
                      SizedBox(height: 4),
                      Text('跨平台远程控制与AI助手管理', style: TextStyle(color: Colors.grey, fontSize: 13)),
                      SizedBox(height: 4),
                      Text('支持: iOS / Android / HarmonyOS', style: TextStyle(color: Colors.grey, fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
