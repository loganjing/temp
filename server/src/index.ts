import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { AppContext } from './context';
import { registerRoutes } from './routes';
import { BackgroundServices } from './background';
import { closeDatabase } from './db/database';

const PORT = parseInt(process.env.PORT || '3000', 10);

function main() {
  const ctx = new AppContext();
  const app = new Hono();

  // Register all REST API routes
  registerRoutes(app, ctx);

  // Start the HTTP + WebSocket server
  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[server] Warehouse transport API listening on http://localhost:${PORT}`);
  });

  // Attach WebSocket server to the HTTP server
  ctx.ws.attach(server as unknown as Server);

  // Start background services
  const bg = new BackgroundServices(ctx);
  bg.start();

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[server] Shutting down...');
    bg.stop();
    server.close();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
