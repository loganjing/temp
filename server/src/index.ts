import { serve } from '@hono/node-server';
import { getApp } from './app';

const port = parseInt(process.env.PORT || '3000', 10);
const app = getApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
