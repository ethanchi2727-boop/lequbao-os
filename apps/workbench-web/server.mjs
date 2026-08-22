import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('./src/', import.meta.url));
const types = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
};

const writeJson = (response, statusCode, body) => {
  const content = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': content.length,
    'cache-control': 'no-store',
  });
  response.end(content);
};

async function requestBody(request, maximumBytes = 64 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error('development proxy body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyRequest(request, response, apiBaseUrl, fetchImpl) {
  const requested = new URL(request.url ?? '/', 'http://development-workbench.local');
  const target = new URL(`${requested.pathname}${requested.search}`, apiBaseUrl);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (
      !value ||
      [
        'connection',
        'content-length',
        'forwarded',
        'host',
        'x-forwarded-for',
        'x-forwarded-host',
        'x-forwarded-proto',
        'x-real-ip',
      ].includes(name)
    )
      continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  const method = request.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await requestBody(request);
  const upstream = await fetchImpl(target, { method, headers, ...(body ? { body } : {}) });
  response.statusCode = upstream.status;
  for (const [name, value] of upstream.headers) {
    if (['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(name))
      continue;
    response.setHeader(name, value);
  }
  response.setHeader('cache-control', 'no-store');
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

async function developmentLogin(response, apiBaseUrl, fetchImpl) {
  const exchange = await fetchImpl(new URL('/api/v1/auth/sessions/exchange', apiBaseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-trace-id': 'development-mock-login' },
    body: JSON.stringify({
      provider: 'PHONE_OTP',
      assertion: 'development-mock-assertion-for-local-workspace',
      deviceId: 'development-mock-workbench-device',
    }),
  });
  if (!exchange.ok) {
    const summary = (await exchange.text()).slice(0, 500);
    return writeJson(response, 502, {
      code: 'DEVELOPMENT_LOGIN_FAILED',
      upstreamStatus: exchange.status,
      summary,
    });
  }
  const result = await exchange.json();
  if (typeof result.accessToken !== 'string' || result.accessToken.length < 16)
    return writeJson(response, 502, { code: 'DEVELOPMENT_LOGIN_RESPONSE_INVALID' });
  const token = JSON.stringify(result.accessToken).replaceAll('<', '\\u003c');
  const content = Buffer.from(`<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>开发模拟登录</title>
<body><p>正在建立 development-mock 会话；该会话不可用于生产。</p>
<script>sessionStorage.setItem('lequbao.employee-session', ${token});location.replace('/bao/page-014');</script>
</body></html>`);
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': content.length,
    'cache-control': 'no-store',
    'x-lequ-data-source': 'development-mock',
  });
  response.end(content);
}

export function createWorkbenchDevelopmentServer({
  root = defaultRoot,
  apiBaseUrl,
  developmentMock = false,
  publicPreview = false,
  publicHostname,
  fetchImpl = fetch,
} = {}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://local');
      if (publicPreview) {
        response.setHeader('x-robots-tag', 'noindex, nofollow, noarchive');
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('x-frame-options', 'DENY');
        response.setHeader('referrer-policy', 'no-referrer');
        response.setHeader('x-lequ-environment', 'development-mock-preview');
      }
      if (request.method === 'GET' && url.pathname === '/health')
        return writeJson(response, 200, { status: 'ok', version: '6.1.0-development' });
      if (publicPreview && publicHostname) {
        const requestHostname = (request.headers.host ?? '').split(':')[0]?.toLowerCase();
        if (requestHostname !== publicHostname.toLowerCase())
          return writeJson(response, 421, { code: 'PREVIEW_HOST_MISMATCH' });
      }
      if (publicPreview && developmentMock && request.method === 'GET' && url.pathname === '/') {
        response.statusCode = 302;
        response.setHeader('location', '/__development/login');
        return response.end();
      }
      if (url.pathname === '/__development/login') {
        if (!developmentMock || !apiBaseUrl) return writeJson(response, 404, { code: 'NOT_FOUND' });
        if (request.method !== 'GET')
          return writeJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
        return await developmentLogin(response, apiBaseUrl, fetchImpl);
      }
      if (apiBaseUrl && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/internal/')))
        return await proxyRequest(request, response, apiBaseUrl, fetchImpl);

      const requested = decodeURIComponent(url.pathname);
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
    } catch (error) {
      writeJson(response, 502, {
        code: 'DEVELOPMENT_SERVER_ERROR',
        summary: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createWorkbenchDevelopmentServer({
    apiBaseUrl: process.env.WORKBENCH_API_PROXY_URL,
    developmentMock: process.env.LEQU_DEVELOPMENT_MOCKS === '1',
    publicPreview: process.env.LEQU_PUBLIC_PREVIEW === '1',
    publicHostname: process.env.LEQU_PREVIEW_HOSTNAME,
  });
  const port = Number(process.env.PORT ?? 4173);
  server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
    const entry =
      process.env.LEQU_DEVELOPMENT_MOCKS === '1' ? '/__development/login' : '/bao/page-014?demo=1';
    console.log(`乐趣宝 Web preview: http://127.0.0.1:${port}${entry}`);
  });
}
