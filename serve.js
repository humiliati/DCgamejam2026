#!/usr/bin/env node
/**
 * Tiny local HTTP server for Dungeon Gleaner development.
 * Bypasses file:// CORS restrictions so audio, JSON fetches, etc. all work.
 *
 * Usage:
 *     node serve.js          # serves on http://localhost:8080
 *     node serve.js 9000     # serves on http://localhost:9000
 *
 * Then open http://localhost:8080 in your browser.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',           '.css': 'text/css',
  '.js':   'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json',    '.png': 'image/png',
  '.jpg':  'image/jpeg',          '.gif': 'image/gif',
  '.svg':  'image/svg+xml',       '.webp': 'image/webp',
  '.webm': 'audio/webm',          '.opus': 'audio/opus',
  '.ogg':  'audio/ogg',           '.mp3': 'audio/mpeg',
  '.wav':  'audio/wav',           '.wasm': 'application/wasm',
};

http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  var file = path.join(ROOT, url);

  // Security: stay inside ROOT
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.stat(file, function (err, stat) {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    var ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, function () {
  console.log('Dungeon Gleaner dev server → http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop.\n');
});
