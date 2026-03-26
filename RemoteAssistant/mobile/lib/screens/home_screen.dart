import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/websocket_service.dart';
import '../services/settings_service.dart';
import '../models/command_model.dart';
import 'connect_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('远程助手'),
        actions: [
          Consumer<WebSocketService>(
            builder: (_, ws, __) => IconButton(
              icon: Icon(
                ws.isConnected ? Icons.link : Icons.link_off,
                color: ws.isConnected ? Colors.greenAccent : Colors.redAccent,
              ),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ConnectScreen()),
              ),
            ),
          ),
        ],
      ),
      body: Consumer<WebSocketService>(
        builder: (context, ws, _) {
          if (!ws.isConnected) {
            return _buildDisconnected(context);
          }
          return _buildConnected(context, ws);
        },
      ),
    );
  }

  Widget _buildDisconnected(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.computer, size: 80, color: Colors.grey),
            const SizedBox(height: 24),
            const Text(
              '未连接到电脑',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            const Text(
              '请确保电脑端已运行RemoteAssistant，\n然后点击下方按钮连接',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ConnectScreen()),
              ),
              icon: const Icon(Icons.wifi),
              label: const Text('连接电脑'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConnected(BuildContext context, WebSocketService ws) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Connection info card
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.greenAccent, size: 40),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('已连接', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      Text(
                        '${ws.serverAddress}:${ws.serverPort}',
                        style: const TextStyle(color: Colors.grey, fontFamily: 'monospace'),
                      ),
                      if (ws.clientId != null)
                        Text('ID: ${ws.clientId}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: ws.disconnect,
                  child: const Text('断开', style: TextStyle(color: Colors.redAccent)),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Quick commands
        const Text('快捷指令', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 3,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.1,
          children: PresetCommand.defaultPresets.map((preset) {
            return _buildPresetCard(context, preset, ws);
          }).toList(),
        ),
        const SizedBox(height: 20),

        // Quick send text
        const Text('发送消息', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        _buildQuickSend(context, ws),

        const SizedBox(height: 20),

        // Recent messages
        if (ws.messages.isNotEmpty) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('最近消息', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              TextButton(
                onPressed: ws.clearMessages,
                child: const Text('清空'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...ws.messages.reversed.take(10).map((msg) => _buildMessageItem(msg)),
        ],
      ],
    );
  }

  Widget _buildPresetCard(BuildContext context, PresetCommand preset, WebSocketService ws) {
    return Card(
      child: InkWell(
        onTap: () {
          ws.sendPresetCommand(preset);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('已发送: ${preset.name}'), duration: const Duration(seconds: 1)),
          );
        },
        borderRadius: BorderRadius.circular(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(preset.icon, style: const TextStyle(fontSize: 28)),
            const SizedBox(height: 8),
            Text(
              preset.name,
              style: const TextStyle(fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickSend(BuildContext context, WebSocketService ws) {
    final controller = TextEditingController();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                decoration: const InputDecoration(
                  hintText: '输入消息...',
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
                onSubmitted: (text) {
                  if (text.trim().isNotEmpty) {
                    ws.sendTextMessage(text.trim());
                    controller.clear();
                  }
                },
              ),
            ),
            const SizedBox(width: 10),
            IconButton.filled(
              onPressed: () {
                if (controller.text.trim().isNotEmpty) {
                  ws.sendTextMessage(controller.text.trim());
                  controller.clear();
                }
              },
              icon: const Icon(Icons.send),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageItem(CommandMessage msg) {
    final isReceived = !msg.isSent;
    return Card(
      color: isReceived ? const Color(0xFF1A2744) : null,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isReceived ? Icons.computer : Icons.phone_android,
                  size: 16,
                  color: isReceived ? Colors.blue : Colors.green,
                ),
                const SizedBox(width: 6),
                Text(
                  isReceived ? '电脑端' : '手机端',
                  style: TextStyle(
                    fontSize: 12,
                    color: isReceived ? Colors.blue : Colors.green,
                  ),
                ),
                const Spacer(),
                Text(
                  '${msg.dateTime.hour.toString().padLeft(2, '0')}:${msg.dateTime.minute.toString().padLeft(2, '0')}:${msg.dateTime.second.toString().padLeft(2, '0')}',
                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              msg.displayText,
              style: const TextStyle(fontSize: 14),
              maxLines: 5,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
