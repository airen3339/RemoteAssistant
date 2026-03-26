import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsService extends ChangeNotifier {
  late SharedPreferences _prefs;

  String _lastServerIP = '';
  int _lastServerPort = 9600;
  bool _autoConnect = false;

  String get lastServerIP => _lastServerIP;
  int get lastServerPort => _lastServerPort;
  bool get autoConnect => _autoConnect;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    _lastServerIP = _prefs.getString('lastServerIP') ?? '';
    _lastServerPort = _prefs.getInt('lastServerPort') ?? 9600;
    _autoConnect = _prefs.getBool('autoConnect') ?? false;
  }

  Future<void> setLastServer(String ip, int port) async {
    _lastServerIP = ip;
    _lastServerPort = port;
    await _prefs.setString('lastServerIP', ip);
    await _prefs.setInt('lastServerPort', port);
    notifyListeners();
  }

  Future<void> setAutoConnect(bool value) async {
    _autoConnect = value;
    await _prefs.setBool('autoConnect', value);
    notifyListeners();
  }
}
