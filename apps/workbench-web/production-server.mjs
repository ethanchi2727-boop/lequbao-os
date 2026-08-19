import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function resolveStaticRequest(rootInput, pathname) {
  const root = resolve(rootInput);
  let requested;
  try {
    requested = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }
  const candidate = resolve(root, `.${requested}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return { status: 400 };
  return { status: 200, candidate, root };
}

const securityHeaders = {
  'content-security-policy':
    "default-src 'self'; base-uri 'none'; connect-src 'self' https:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
};

async function resolveRealStaticFile(root, candidate) {
  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
    if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${sep}`)) return null;
    if (!(await stat(realCandidate)).isFile()) return null;
    return realCandidate;
  } catch {
    return null;
  }
}

export function createWorkbenchProductionServer(options = {}) {
  const rootInput =
    options.root ??
    process.env.WORKBENCH_STATIC_ROOT ??
    fileURLToPath(new URL('./dist/', import.meta.url));
  const root = resolve(rootInput instanceof URL ? fileURLToPath(rootInput) : rootInput);
  return createServer(async (request, response) => {
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
    response.setHeader('cache-control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.statusCode = 405;
      response.setHeader('allow', 'GET, HEAD');
      return response.end();
    }
    if (request.url === '/health') {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      const ready = await resolveRealStaticFile(root, resolve(root, 'index.html'));
      if (!ready) {
        response.statusCode = 503;
        return request.method === 'HEAD'
          ? response.end()
          : response.end('{"status":"unavailable","version":"6.1.0"}\n');
      }
      return request.method === 'HEAD'
        ? response.end()
        : response.end('{"status":"ok","version":"6.1.0"}\n');
    }
    const url = new URL(request.url ?? '/', 'http://local');
    const resolved = resolveStaticRequest(root, url.pathname);
    if (resolved.status !== 200) {
      response.statusCode = resolved.status;
      return response.end();
    }
    let file = resolved.candidate;
    let found;
    try {
      const metadata = await stat(file);
      if (metadata.isDirectory()) file = resolve(file, 'index.html');
      found = (await stat(file)).isFile();
    } catch {
      found = false;
    }
    const fallback = !found && !extname(url.pathname);
    if (!found) {
      if (extname(url.pathname)) {
        response.statusCode = 404;
        return response.end();
      }
      file = resolve(root, 'index.html');
    }
    const realFile = await resolveRealStaticFile(root, file);
    if (!realFile) {
      response.statusCode = fallback ? 503 : 404;
      return response.end();
    }
    response.setHeader('content-type', types[extname(realFile)] ?? 'application/octet-stream');
    if (request.method === 'HEAD') return response.end();
    createReadStream(realFile)
      .on('error', () => response.destroy())
      .pipe(response);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = createWorkbenchProductionServer();
  server.listen(port, host, () => console.log(`乐趣宝 Web listening on ${host}:${port}`));
  const close = () => server.close(() => process.exit(0));
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
