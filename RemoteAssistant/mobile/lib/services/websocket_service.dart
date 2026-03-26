import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:uuid/uuid.dart';
import '../models/command_model.dart';

class WebSocketService extends ChangeNotifier {
  WebSocketChannel? _channel;
  bool _isConnected = false;
  String _serverAddress = '';
  int _serverPort = 9600;
  String? _clientId;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  bool _autoReconnect = true;

  final List<CommandMessage> _messages = [];
  final _uuid = const Uuid();

  // Getters
  bool get isConnected => _isConnected;
  String get serverAddress => _serverAddress;
  int get serverPort => _serverPort;
  String? get clientId => _clientId;
  List<CommandMessage> get messages => List.unmodifiable(_messages);

  /// Connect to desktop WebSocket server
  Future<bool> connect(String address, int port) async {
    _serverAddress = address;
    _serverPort = port;

    try {
      final uri = Uri.parse('ws://$address:$port');
      _channel = WebSocketChannel.connect(uri);

      await _channel!.ready;

      _isConnected = true;
      notifyListeners();

      // Listen for messages
      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
      );

      // Start heartbeat
      _startHeartbeat();

      return true;
    } catch (e) {
      debugPrint('WebSocket connect error: $e');
      _isConnected = false;
      notifyListeners();
      return false;
    }
  }

  /// Disconnect from server
  void disconnect() {
    _autoReconnect = false;
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    _clientId = null;
    notifyListeners();
  }

  /// Send a command to desktop
  void sendCommand(Map<String, dynamic> payload) {
    final msg = CommandMessage(
      id: _uuid.v4(),
      type: 'command',
      timestamp: DateTime.now().millisecondsSinceEpoch,
      payload: payload,
      isSent: true,
    );
    _send(msg);
    _messages.add(msg);
    notifyListeners();
  }

  /// Send a text message
  void sendTextMessage(String text) {
    final msg = CommandMessage(
      id: _uuid.v4(),
      type: 'message',
      timestamp: DateTime.now().millisecondsSinceEpoch,
      payload: {'text': text},
      isSent: true,
    );
    _send(msg);
    _messages.add(msg);
    notifyListeners();
  }

  /// Send a preset command
  void sendPresetCommand(PresetCommand preset) {
    sendCommand(preset.payload);
  }

  void clearMessages() {
    _messages.clear();
    notifyListeners();
  }

  // Private methods

  void _send(CommandMessage msg) {
    if (_channel != null && _isConnected) {
      _channel!.sink.add(jsonEncode(msg.toJson()));
    }
  }

  void _onMessage(dynamic data) {
    try {
      final json = jsonDecode(data.toString()) as Map<String, dynamic>;
      final type = json['type'] as String?;

      if (type == 'welcome') {
        _clientId = json['payload']?['clientId'];
        notifyListeners();
        return;
      }

      if (type == 'heartbeat') return;

      final msg = CommandMessage.fromJson(json, isSent: false);
      _messages.add(msg);
      notifyListeners();
    } catch (e) {
      debugPrint('Parse message error: $e');
    }
  }

  void _onError(dynamic error) {
    debugPrint('WebSocket error: $error');
    _isConnected = false;
    notifyListeners();
    _scheduleReconnect();
  }

  void _onDone() {
    debugPrint('WebSocket closed');
    _isConnected = false;
    _channel = null;
    notifyListeners();
    _scheduleReconnect();
  }

  void _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_isConnected && _channel != null) {
        _channel!.sink.add(jsonEncode({
          'type': 'heartbeat',
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }));
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  void _scheduleReconnect() {
    if (!_autoReconnect || _serverAddress.isEmpty) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      if (!_isConnected && _serverAddress.isNotEmpty) {
        debugPrint('Attempting reconnect...');
        connect(_serverAddress, _serverPort);
      }
    });
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
