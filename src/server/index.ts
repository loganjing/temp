import { serve } from '@hono/node-server';
import { initDb } from './db.js';
import { runMigrations } from './migrate.js';
import { seedIfEmpty } from './seed.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 8787;
const dbPath = process.env.DB_PATH || './data/ticket.sqlite';

// Initialize database
initDb(dbPath);
runMigrations();

// Seed demo data on first start
if (process.env.SEED_ON_START !== 'false') {
  seedIfEmpty();
}

// Create Hono app
const app = createApp();

// Start server
console.log(`Ticket system starting on port ${port} (DB: ${dbPath})`);
serve({
  fetch: app.fetch,
  port,
});

console.log(`Ticket system listening on http://localhost:${port}`);
