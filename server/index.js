import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import GameRoom from './game-room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.resolve(__dirname, '..', 'client');
const SHARED_DIR = path.resolve(__dirname, '..', 'shared');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;

  // Strip query strings
  const qIdx = urlPath.indexOf('?');
  if (qIdx !== -1) urlPath = urlPath.slice(0, qIdx);

  // Serve shared/ files
  let filePath;
  if (urlPath.startsWith('/shared/')) {
    filePath = path.join(SHARED_DIR, urlPath.replace('/shared/', ''));
  } else {
    filePath = path.join(CLIENT_DIR, urlPath);
  }

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(CLIENT_DIR) && !resolvedPath.startsWith(SHARED_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  const ext = path.extname(resolvedPath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const gameRoom = new GameRoom();

wss.on('connection', (ws) => {
  gameRoom.addClient(ws);
  console.log(`Player connected (${gameRoom.clients.size}/2)`);

  ws.on('message', (raw) => {
    try {
      gameRoom.handleMessage(ws, raw.toString());
    } catch (e) {
      console.error('Message error:', e);
    }
  });

  ws.on('close', () => {
    console.log('Player disconnected');
    gameRoom.removeClient(ws);
  });
});

server.listen(PORT, () => {
  console.log(`listening on :${PORT}`);
});
