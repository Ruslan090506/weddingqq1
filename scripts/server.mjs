import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import api from '../api/index.js';
import telegram from '../api/telegram.js';
import cron from '../api/cron.js';
const port = Number(process.env.PORT || 3000), root = path.resolve('public');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/index') return api(req, res);
  if (url.pathname === '/api/telegram') return telegram(req, res);
  if (url.pathname === '/api/cron') return cron(req, res);
  try {
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end('Forbidden'); }
    const data = await fs.readFile(file);
    const ext = path.extname(file); res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' })[ext] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(data);
  } catch { res.statusCode = 404; res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Friends Included: http://localhost:${port} (${process.env.DATA_MODE || 'supabase'} mode)`));
