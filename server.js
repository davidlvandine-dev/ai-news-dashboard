const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PORT = parseInt(process.env.AI_NEWS_PORT || '8765', 10);
const HOST = process.env.AI_NEWS_HOST || '0.0.0.0';
const ROOT = __dirname;
const UPDATE_SCRIPT = path.join(ROOT, 'update-with-codex.sh');
const LOCK_FILE = path.join(ROOT, '.update-with-codex.lock');
const DATA_DIR = path.join(ROOT, 'data');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// --- SSE ---

const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(msg);
}

// Notify connected browsers when index.json changes (new snapshot written)
if (fs.existsSync(DATA_DIR)) {
  fs.watch(DATA_DIR, (_, filename) => {
    if (filename === 'index.json') broadcast('snapshot', { ts: Date.now() });
  });
}

// --- Update state ---

let updateRunning = false;

function isLocked(callback) {
  // Try to acquire flock non-blocking; if it fails, the update script holds the lock
  execFile('flock', ['--nonblock', LOCK_FILE, 'true'], (err) => callback(!!err));
}

// --- Static file serving ---

function serveFile(req, res) {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const filePath = path.resolve(ROOT, rel);

  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const isData = urlPath.startsWith('/data/');
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// --- Request router ---

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  // Browser subscribes to live updates
  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache',
      'Connection':      'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':ok\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Is an update currently running?
  if (pathname === '/api/status' && req.method === 'GET') {
    isLocked((locked) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ running: locked || updateRunning }));
    });
    return;
  }

  // Trigger a manual update
  if (pathname === '/api/refresh' && req.method === 'POST') {
    isLocked((locked) => {
      if (locked || updateRunning) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Update already in progress' }));
      }

      updateRunning = true;
      broadcast('status', { running: true });

      const proc = spawn('/bin/bash', [UPDATE_SCRIPT], {
        detached: true,
        stdio: 'ignore',
        cwd: ROOT,
      });

      proc.on('error', (err) => {
        updateRunning = false;
        broadcast('status', { running: false, error: err.message });
      });

      proc.on('close', (code) => {
        updateRunning = false;
        broadcast('status', { running: false, exitCode: code });
      });

      proc.unref();

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ started: true }));
    });
    return;
  }

  serveFile(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`AI News Dashboard running at http://localhost:${PORT}`);
});
