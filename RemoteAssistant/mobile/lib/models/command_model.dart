class CommandMessage {
  final String id;
  final String type; // command, result, message, heartbeat
  final int timestamp;
  final Map<String, dynamic> payload;
  final bool isSent; // true = sent from mobile, false = received from desktop

  CommandMessage({
    required this.id,
    required this.type,
    required this.timestamp,
    required this.payload,
    this.isSent = true,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    'timestamp': timestamp,
    'payload': payload,
  };

  factory CommandMessage.fromJson(Map<String, dynamic> json, {bool isSent = false}) {
    return CommandMessage(
      id: json['id'] ?? '',
      type: json['type'] ?? 'message',
      timestamp: json['timestamp'] ?? DateTime.now().millisecondsSinceEpoch,
      payload: json['payload'] ?? {},
      isSent: isSent,
    );
  }

  DateTime get dateTime => DateTime.fromMillisecondsSinceEpoch(timestamp);

  String get displayText {
    if (payload.containsKey('text')) return payload['text'];
    if (payload.containsKey('command')) return payload['command'];
    if (payload.containsKey('stdout')) return payload['stdout'];
    if (payload.containsKey('message')) return payload['message'];
    return payload.toString();
  }
}

class PresetCommand {
  final String name;
  final String icon;
  final String type;
  final Map<String, dynamic> payload;

  const PresetCommand({
    required this.name,
    required this.icon,
    required this.type,
    required this.payload,
  });

  static List<PresetCommand> defaultPresets = [
    const PresetCommand(
      name: '系统信息',
      icon: '?',
      type: 'command',
      payload: {'type': 'system', 'action': 'info'},
    ),
    const PresetCommand(
      name: '启动OpenClaw',
      icon: '?',
      type: 'command',
      payload: {'type': 'openclaw', 'action': 'start'},
    ),
    const PresetCommand(
      name: '停止OpenClaw',
      icon: '??',
      type: 'command',
      payload: {'type': 'openclaw', 'action': 'stop'},
    ),
    const PresetCommand(
      name: 'OpenClaw状态',
      icon: '?',
      type: 'command',
      payload: {'type': 'openclaw', 'action': 'status'},
    ),
    const PresetCommand(
      name: '查看IP',
      icon: '?',
      type: 'command',
      payload: {'type': 'shell', 'command': 'ipconfig'},
    ),
    const PresetCommand(
      name: '查看主机名',
      icon: '??',
      type: 'command',
      payload: {'type': 'shell', 'command': 'hostname'},
    ),
  ];
}
