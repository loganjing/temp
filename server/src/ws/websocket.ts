import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import type { WSMessage, WSMessageType } from '../../../shared/types';

interface ClientInfo {
  ws: WebSocket;
  subscribedTypes: Set<WSMessageType> | null; // null = subscribe to all
}

/**
 * Manages WebSocket connections on /ws/monitoring.
 * Tracks per-client subscriptions and broadcasts server-pushed messages.
 */
export class WSManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientInfo> = new Map();

  attach(server: Server): void {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req: IncomingMessage, socket, head) => {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/ws/monitoring') {
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.wss!.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.set(ws, { ws, subscribedTypes: null });

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe' && Array.isArray(msg.payload?.types)) {
            const info = this.clients.get(ws);
            if (info) {
              info.subscribedTypes = new Set(msg.payload.types as WSMessageType[]);
            }
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', payload: {} }));
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Broadcasts a typed message to all connected clients subscribed to that type.
   */
  broadcast<T>(type: WSMessageType, payload: T): void {
    const msg: WSMessage<T> = { type, payload };
    const data = JSON.stringify(msg);
    for (const [, info] of this.clients) {
      if (info.ws.readyState === WebSocket.OPEN) {
        // Send if client has no filter (subscribes to all) or subscribes to this type
        if (info.subscribedTypes === null || info.subscribedTypes.has(type)) {
          info.ws.send(data);
        }
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
