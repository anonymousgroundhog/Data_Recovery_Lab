// Data Recovery Lab static server: zero dependencies, serves ./public.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

async function resolveFile(pathname) {
  let file = resolve(join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null;
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  return info?.isFile() ? file : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const file = await resolveFile(decodeURIComponent(pathname));
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad request');
  }
});

// If the default port is busy, try the next few; an explicit PORT is honoured exactly.
const explicitPort = Boolean(process.env.PORT);
const MAX_TRIES = 20;
let port = PORT;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !explicitPort && port < PORT + MAX_TRIES) {
    console.log(`Port ${port} is in use, trying ${port + 1}…`);
    server.listen(++port, HOST);
    return;
  }
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Pick another one, e.g.  PORT=8080 npm start`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.on('listening', () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  const url = `http://${shown}:${server.address().port}`;
  console.log(`Data Recovery Lab running at ${url}`);
  console.log('Press Ctrl+C to stop.');
  if (process.argv.includes('--open')) openBrowser(url);
});

// Open the default browser on Windows, macOS or Linux.
function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => console.log(`Open ${url} in your browser.`)).unref();
  } catch {
    console.log(`Open ${url} in your browser.`);
  }
}

server.listen(port, HOST);
