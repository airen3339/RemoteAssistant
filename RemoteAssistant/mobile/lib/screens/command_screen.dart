import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/websocket_service.dart';
import '../models/command_model.dart';

class CommandScreen extends StatefulWidget {
  const CommandScreen({super.key});

  @override
  State<CommandScreen> createState() => _CommandScreenState();
}

class _CommandScreenState extends State<CommandScreen> {
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  String _commandType = 'shell';

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _send(WebSocketService ws) {
    final text = _inputController.text.trim();
    if (text.isEmpty || !ws.isConnected) return;

    switch (_commandType) {
      case 'shell':
        ws.sendCommand({'type': 'shell', 'command': text});
        break;
      case 'message':
        ws.sendTextMessage(text);
        break;
      case 'openclaw':
        ws.sendCommand({'type': 'openclaw', 'action': text});
        break;
    }

    _inputController.clear();
    _scrollToBottom();
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('指令终端'),
        actions: [
          Consumer<WebSocketService>(
            builder: (_, ws, __) => TextButton.icon(
              onPressed: ws.messages.isEmpty ? null : ws.clearMessages,
              icon: const Icon(Icons.clear_all, size: 18),
              label: const Text('清空'),
            ),
          ),
        ],
      ),
      body: Consumer<WebSocketService>(
        builder: (context, ws, _) {
          if (!ws.isConnected) {
            return const Center(
              child: Text('未连接到电脑', style: TextStyle(color: Colors.grey)),
            );
          }

          return Column(
            children: [
              // Message list
              Expanded(
                child: ws.messages.isEmpty
                    ? const Center(
                        child: Text('发送指令或消息到电脑端', style: TextStyle(color: Colors.grey)),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(12),
                        itemCount: ws.messages.length,
                        itemBuilder: (_, i) => _buildMessageBubble(ws.messages[i]),
                      ),
              ),

              // Command type selector
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: Color(0xFF334155))),
                ),
                child: Row(
                  children: [
                    _buildTypeChip('Shell', 'shell'),
                    const SizedBox(width: 8),
                    _buildTypeChip('消息', 'message'),
                    const SizedBox(width: 8),
                    _buildTypeChip('OpenClaw', 'openclaw'),
                  ],
                ),
              ),

              // Input area
              Container(
                padding: const EdgeInsets.all(12),
                decoration: const BoxDecoration(
                  color: Color(0xFF1E293B),
                ),
                child: SafeArea(
                  top: false,
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _inputController,
                          decoration: InputDecoration(
                            hintText: _getHint(),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                            ),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                            filled: true,
                            fillColor: const Color(0xFF0F172A),
                          ),
                          onSubmitted: (_) => _send(ws),
                        ),
                      ),
                      const SizedBox(width: 10),
                      FloatingActionButton.small(
                        onPressed: () => _send(ws),
                        child: const Icon(Icons.send),
                      ),
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

  String _getHint() {
    switch (_commandType) {
      case 'shell':
        return '输入Shell命令...';
      case 'message':
        return '输入消息...';
      case 'openclaw':
        return '输入操作 (start/stop/status)...';
      default:
        return '输入内容...';
    }
  }

  Widget _buildTypeChip(String label, String value) {
    final selected = _commandType == value;
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      selected: selected,
      onSelected: (_) => setState(() => _commandType = value),
      selectedColor: Theme.of(context).colorScheme.primary,
      labelStyle: TextStyle(color: selected ? Colors.white : Colors.grey),
      visualDensity: VisualDensity.compact,
    );
  }

  Widget _buildMessageBubble(CommandMessage msg) {
    final isSent = msg.isSent;
    return Align(
      alignment: isSent ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.8,
        ),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSent ? const Color(0xFF312E81) : const Color(0xFF1E3A5F),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  isSent ? Icons.phone_android : Icons.computer,
                  size: 14,
                  color: isSent ? Colors.purpleAccent : Colors.blueAccent,
                ),
                const SizedBox(width: 4),
                Text(
                  isSent ? '手机' : '电脑',
                  style: TextStyle(
                    fontSize: 11,
                    color: isSent ? Colors.purpleAccent : Colors.blueAccent,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  _formatTime(msg.dateTime),
                  style: const TextStyle(fontSize: 10, color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 6),
            SelectableText(
              msg.displayText,
              style: const TextStyle(fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')}';
  }
}
