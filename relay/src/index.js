// Kater relay: UDP in (game telemetry) -> normalized frame -> WebSocket out.
// Also serves ../dashboard over plain HTTP so a phone on the LAN can just open
// http://<pc-ip>:8080 (an https page can't talk to a ws:// relay, so we serve it from here).
//
// Usage:
//   node src/index.js            listen for F1 (20777) + Forza (5300)
//   node src/index.js --sim      fake data, no game needed
// Env: HTTP_PORT (8080), F1_PORT (20777), FORZA_PORT (5300), HOST (0.0.0.0)

import dgram from 'node:dgram';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

import { emptyFrame } from './schema.js';
import { createF1Adapter } from './adapters/f1.js';
import { createForzaAdapter } from './adapters/forza.js';
import { createSim } from './sim.js';

const HTTP_PORT = Number(process.env.HTTP_PORT || 8080);
const F1_PORT = Number(process.env.F1_PORT || 20777);
const FORZA_PORT = Number(process.env.FORZA_PORT || 5300);
const HOST = process.env.HOST || '0.0.0.0';
const BROADCAST_HZ = 30;
const STALE_MS = 3000;

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.resolve(here, '../../dashboard');

// One live frame per game; the dashboard follows whichever is actively sending.
const frames = new Map();
let activeGame = null;
let dirty = false;
const lastSeen = new Map();

function getFrame(game) {
  if (!frames.has(game)) frames.set(game, emptyFrame(game));
  return frames.get(game);
}

function touch(game) {
  activeGame = game;
  lastSeen.set(game, Date.now());
  dirty = true;
}

// ---- static dashboard -------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(dashboardDir, rel));
    if (!file.startsWith(dashboardDir + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

// ---- websocket --------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', app: 'kater', hz: BROADCAST_HZ }));
  if (activeGame) ws.send(JSON.stringify({ type: 'frame', frame: getFrame(activeGame) }));
});

setInterval(() => {
  if (!activeGame) return;
  if (!dirty) {
    // game stopped sending: tell clients once
    if (Date.now() - (lastSeen.get(activeGame) || 0) > STALE_MS && !staleSent) {
      staleSent = true;
      broadcast({ type: 'stale', game: activeGame });
    }
    return;
  }
  staleSent = false;
  dirty = false;
  const frame = getFrame(activeGame);
  frame.ts = Date.now();
  broadcast({ type: 'frame', frame });
}, 1000 / BROADCAST_HZ);
let staleSent = false;

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

// ---- udp listeners ----------------------------------------------------------
function listenUdp(port, adapter) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('message', (buf) => {
    const frame = getFrame(adapter.game);
    try {
      if (adapter.handle(buf, frame)) touch(adapter.game);
    } catch (err) {
      console.warn(`[${adapter.game.toLowerCase()}] bad packet (${buf.length} B): ${err.message}`);
    }
  });
  sock.on('error', (err) => console.error(`[udp ${port}] ${err.message}`));
  sock.bind(port, HOST, () => console.log(`  UDP ${port}  <- ${adapter.game}`));
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

// ---- boot -------------------------------------------------------------------
server.listen(HTTP_PORT, HOST, () => {
  console.log('Kater relay up');
  for (const ip of lanAddresses()) console.log(`  Dashboard   http://${ip}:${HTTP_PORT}`);
  console.log(`  Dashboard   http://localhost:${HTTP_PORT}`);

  if (process.argv.includes('--sim')) {
    console.log('  SIM mode, no UDP listeners');
    const tick = createSim(getFrame('SIM'));
    setInterval(() => tick() && touch('SIM'), 1000 / BROADCAST_HZ);
  } else {
    listenUdp(F1_PORT, createF1Adapter());
    listenUdp(FORZA_PORT, createForzaAdapter());
  }
});
