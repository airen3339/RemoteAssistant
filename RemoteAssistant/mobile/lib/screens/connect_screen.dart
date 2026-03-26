import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/websocket_service.dart';
import '../services/settings_service.dart';

class ConnectScreen extends StatefulWidget {
  const ConnectScreen({super.key});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final _ipController = TextEditingController();
  final _portController = TextEditingController(text: '9600');
  bool _connecting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final settings = context.read<SettingsService>();
    if (settings.lastServerIP.isNotEmpty) {
      _ipController.text = settings.lastServerIP;
      _portController.text = settings.lastServerPort.toString();
    }
  }

  @override
  void dispose() {
    _ipController.dispose();
    _portController.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    final ip = _ipController.text.trim();
    final port = int.tryParse(_portController.text.trim()) ?? 9600;

    if (ip.isEmpty) {
      setState(() => _error = '请输入电脑IP地址');
      return;
    }

    // Basic IP validation
    final ipPattern = RegExp(r'^(\d{1,3}\.){3}\d{1,3}$');
    if (!ipPattern.hasMatch(ip)) {
      setState(() => _error = 'IP地址格式不正确');
      return;
    }

    setState(() {
      _connecting = true;
      _error = null;
    });

    final ws = context.read<WebSocketService>();
    final success = await ws.connect(ip, port);

    if (mounted) {
      if (success) {
        // Save connection info
        context.read<SettingsService>().setLastServer(ip, port);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('连接成功！'), backgroundColor: Colors.green),
        );
      } else {
        setState(() {
          _connecting = false;
          _error = '连接失败，请检查IP和端口是否正确，电脑端是否已启动';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('连接电脑')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.wifi_tethering, size: 64, color: Colors.blueAccent),
            const SizedBox(height: 24),
            const Text(
              '输入电脑端显示的IP地址和端口',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 32),

            // IP Input
            TextField(
              controller: _ipController,
              decoration: const InputDecoration(
                labelText: 'IP 地址',
                hintText: '例: 192.168.1.100',
                prefixIcon: Icon(Icons.computer),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.all(Radius.circular(12)),
                ),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 16),

            // Port Input
            TextField(
              controller: _portController,
              decoration: const InputDecoration(
                labelText: '端口',
                hintText: '默认 9600',
                prefixIcon: Icon(Icons.lan),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.all(Radius.circular(12)),
                ),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 8),

            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.redAccent, fontSize: 14),
                ),
              ),

            const SizedBox(height: 24),

            FilledButton(
              onPressed: _connecting ? null : _connect,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _connecting
                  ? const SizedBox(
                      height: 20, width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('连接', style: TextStyle(fontSize: 16)),
            ),

            const SizedBox(height: 32),

            // Help text
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text('连接说明', style: TextStyle(fontWeight: FontWeight.bold)),
                    SizedBox(height: 8),
                    Text('1. 确保手机和电脑在同一局域网', style: TextStyle(fontSize: 13, color: Colors.grey)),
                    Text('2. 在电脑端查看IP地址和端口号', style: TextStyle(fontSize: 13, color: Colors.grey)),
                    Text('3. 输入IP和端口后点击连接', style: TextStyle(fontSize: 13, color: Colors.grey)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
