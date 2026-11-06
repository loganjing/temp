import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8090;
const BACKEND = 'http://localhost:3000';

const server = createServer(async (req, res) => {
  // Proxy /api and /health to backend
  if (req.url.startsWith('/api') || req.url.startsWith('/health')) {
    const proxyReq = httpRequest(BACKEND + req.url, {
      method: req.method,
      headers: { ...req.headers, host: 'localhost:3000' },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.writeHead(502);
      res.end('Backend unavailable');
    });
    req.pipe(proxyReq);
    return;
  }

  // Serve test HTML page
  try {
    const html = await readFile(join(__dirname, 'visitor-test-page.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Test server running at http://127.0.0.1:${PORT}/`);
});
