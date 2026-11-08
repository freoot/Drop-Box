// Simple static file server for development preview
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const root = process.cwd();
const port = 8770;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);
  if (pathname === '/') pathname = '/index.html';
  const fp = path.join(root, pathname);

  // Prevent path traversal
  if (!fp.startsWith(root)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('Not found: ' + pathname); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(d);
  });
}).listen(port, () => console.log('Dev server on port ' + port));
