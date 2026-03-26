const WebSocket = require('ws');

class WebSocketServer {
  constructor(port, onMessage) {
    this.port = port;
    this.onMessage = onMessage;
    this.wss = null;
    this.clients = new Map(); // ws -> { id, name, connectedAt }
    this.clientIdCounter = 0;
  }

  start() {
    if (this.wss) this.stop();

    this.wss = new WebSocket.Server({ port: this.port });
    console.log(`WebSocket server started on port ${this.port}`);

    this.wss.on('connection', (ws, req) => {
      const clientId = `client_${++this.clientIdCounter}`;
      const clientIP = req.socket.remoteAddress;
      this.clients.set(ws, {
        id: clientId,
        ip: clientIP,
        connectedAt: new Date().toISOString(),
        name: `Éè±¸ ${this.clientIdCounter}`
      });

      console.log(`Client connected: ${clientId} from ${clientIP}`);

      // Send welcome
      ws.send(JSON.stringify({
        type: 'welcome',
        timestamp: Date.now(),
        payload: { clientId, serverName: 'RemoteAssistant' }
      }));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const client = this.clients.get(ws);
          msg._from = client ? client.id : 'unknown';

          // Handle heartbeat internally
          if (msg.type === 'heartbeat') {
            ws.send(JSON.stringify({
              type: 'heartbeat',
              timestamp: Date.now()
            }));
            return;
          }

          // Forward to handler
          if (this.onMessage) {
            this.onMessage(msg);
          }
        } catch (e) {
          console.error('Invalid message:', e.message);
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error(`Client error: ${clientId}`, err.message);
        this.clients.delete(ws);
      });
    });

    this.wss.on('error', (err) => {
      console.error('WebSocket server error:', err.message);
    });
  }

  stop() {
    if (this.wss) {
      this.clients.forEach((_, ws) => {
        try { ws.close(); } catch {}
      });
      this.clients.clear();
      this.wss.close();
      this.wss = null;
      console.log('WebSocket server stopped');
    }
  }

  restart(newPort) {
    this.stop();
    if (newPort) this.port = newPort;
    this.start();
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    if (this.wss) {
      this.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    }
  }

  sendTo(clientId, message) {
    const data = JSON.stringify(message);
    for (const [ws, info] of this.clients) {
      if (info.id === clientId && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        return true;
      }
    }
    return false;
  }

  getStatus() {
    return {
      running: this.wss !== null,
      port: this.port,
      clients: this.clients.size
    };
  }

  getClients() {
    const result = [];
    this.clients.forEach((info) => {
      result.push({ ...info });
    });
    return result;
  }
}

module.exports = { WebSocketServer };
