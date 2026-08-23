import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkbenchDevelopmentServer } from './server.mjs';

const servers = [];
const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function surfaceFixture(name, title) {
  const root = await mkdtemp(path.join(tmpdir(), `lequ-preview-${name}-`));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), `<title>${title}</title>\n`);
  await writeFile(path.join(root, 'assets', 'app.js'), `document.title = '${title}';\n`);
  return root;
}

async function listen(server) {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server address unavailable');
  return `http://127.0.0.1:${address.port}`;
}

async function requestWithHost(base, pathname, host) {
  const target = new URL(pathname, base);
  return await new Promise((resolve, reject) => {
    const outgoing = request(target, { headers: { host } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

describe('Workbench development server', () => {
  it('proxies same-origin API calls without inventing a response', async () => {
    let observed;
    const upstream = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      observed = {
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        forwardedFor: request.headers['x-forwarded-for'],
        body: Buffer.concat(chunks).toString('utf8'),
      };
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end('{"accepted":true}');
    });
    const upstreamUrl = await listen(upstream);
    const development = await listen(createWorkbenchDevelopmentServer({ apiBaseUrl: upstreamUrl }));
    const response = await fetch(`${development}/api/v1/example?mode=test`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer development',
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.250',
      },
      body: '{"value":1}',
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accepted: true });
    expect(observed).toEqual({
      method: 'POST',
      url: '/api/v1/example?mode=test',
      authorization: 'Bearer development',
      forwardedFor: undefined,
      body: '{"value":1}',
    });
  });

  it('creates a browser-local session only through the opted-in development identity flow', async () => {
    const upstream = createServer(async (request, response) => {
      expect(request.url).toBe('/api/v1/auth/sessions/exchange');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ accessToken: 'development-access-token-value' }));
    });
    const upstreamUrl = await listen(upstream);
    const development = await listen(
      createWorkbenchDevelopmentServer({
        apiBaseUrl: upstreamUrl,
        developmentMock: true,
      }),
    );
    const response = await fetch(`${development}/__development/login`);
    const html = await response.text();
    expect(response.headers.get('x-lequ-data-source')).toBe('development-mock');
    expect(html).toContain("sessionStorage.setItem('lequbao.employee-session'");
    expect(html).toContain('development-access-token-value');
    expect(html).toContain("location.replace('/bao/page-014')");
  });

  it('does not expose the development login without explicit mock mode', async () => {
    const development = await listen(
      createWorkbenchDevelopmentServer({ apiBaseUrl: 'http://127.0.0.1:3000' }),
    );
    expect((await fetch(`${development}/__development/login`)).status).toBe(404);
  });

  it('binds the public preview to the configured host and separates life from employee entry', async () => {
    const lifeRoot = await surfaceFixture('life', '乐趣生活 UniApp');
    const baoMobileRoot = await surfaceFixture('bao-mobile', '乐趣宝移动端');
    const development = await listen(
      createWorkbenchDevelopmentServer({
        apiBaseUrl: 'http://127.0.0.1:3000',
        developmentMock: true,
        publicPreview: true,
        publicHostname: 'bao.lequ.com',
        lifeRoot,
        baoMobileRoot,
      }),
    );
    const entry = await requestWithHost(development, '/', 'bao.lequ.com');
    expect(entry.status).toBe(302);
    expect(entry.headers.location).toBe('/life?demo=1');
    expect(entry.headers['x-robots-tag']).toContain('noindex');
    expect(entry.headers['x-lequ-environment']).toBe('development-mock-preview');

    const employeeEntry = await requestWithHost(development, '/bao', 'bao.lequ.com');
    expect(employeeEntry.status).toBe(302);
    expect(employeeEntry.headers.location).toBe('/__development/login');

    const life = await requestWithHost(development, '/life?demo=1', 'bao.lequ.com');
    expect(life.status).toBe(200);
    expect(life.body).toContain('<title>乐趣生活 UniApp</title>');

    const baoMobile = await requestWithHost(development, '/bao-mobile/', 'bao.lequ.com');
    expect(baoMobile.status).toBe(200);
    expect(baoMobile.body).toContain('<title>乐趣宝移动端</title>');

    const mismatch = await requestWithHost(development, '/bao/page-014', 'other.example');
    expect(mismatch.status).toBe(421);
    expect(JSON.parse(mismatch.body)).toEqual({ code: 'PREVIEW_HOST_MISMATCH' });
    expect((await fetch(`${development}/health`)).status).toBe(200);
  });
});
