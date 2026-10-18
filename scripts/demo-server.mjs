import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function send(response, status, message, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(message);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || host}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/') {
      response.writeHead(302, { Location: '/test/' });
      response.end();
      return;
    }
    if (pathname.endsWith('/')) {
      pathname += 'index.html';
    }

    const filePath = resolve(root, `.${pathname}`);
    const relativePath = relative(root, filePath);
    if (
      relativePath.startsWith('..') ||
      isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).includes('node_modules')
    ) {
      send(response, 403, 'Forbidden');
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      send(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath).toLowerCase()] ||
        'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      send(response, 404, 'Not found');
      return;
    }
    send(response, 500, 'Internal server error');
  }
});

server.listen(port, host, () => {
  const base = `http://${host}:${port}`;
  console.log('xqclip test pages:');
  console.log(`${base}/test/browser.html`);
  console.log(`${base}/test/esm.html`);
  console.log(`${base}/test/vue2.html`);
  console.log(`${base}/test/vue3.html`);
});
