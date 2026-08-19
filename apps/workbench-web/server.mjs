import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./src/', import.meta.url));
const types = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname);
  const candidate = normalize(join(root, requested));
  let file = candidate.startsWith(root) ? candidate : join(root, 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(root, 'index.html');
  }
  response.setHeader('content-type', types[extname(file)] ?? 'text/html; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  createReadStream(file).pipe(response);
});
server.listen(Number(process.env.PORT ?? 4173), process.env.HOST ?? '127.0.0.1', () =>
  console.log('乐趣宝 Web preview: http://127.0.0.1:4173/bao/page-014?demo=1'),
);
