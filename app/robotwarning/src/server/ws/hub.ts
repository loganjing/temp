import { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'

export class WsHub {
  private wss: WebSocketServer
  private clients = new Set<WebSocket>()

  constructor() {
    this.wss = new WebSocketServer({ noServer: true })
  }

  handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.clients.add(ws)
      ws.on('message', () => {
        // Client may send alert:subscribe; no response required per contract
      })
      ws.on('close', () => { this.clients.delete(ws) })
      ws.on('error', () => { this.clients.delete(ws) })
    })
  }

  broadcast(message: object): void {
    const text = JSON.stringify(message)
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(text)
    }
  }
}
