import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkbenchDevelopmentServer } from './server.mjs';

const servers = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function listen(server) {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server address unavailable');
  return `http://127.0.0.1:${address.port}`;
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
        body: Buffer.concat(chunks).toString('utf8'),
      };
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end('{"accepted":true}');
    });
    const upstreamUrl = await listen(upstream);
    const development = await listen(createWorkbenchDevelopmentServer({ apiBaseUrl: upstreamUrl }));
    const response = await fetch(`${development}/api/v1/example?mode=test`, {
      method: 'POST',
      headers: { authorization: 'Bearer development', 'content-type': 'application/json' },
      body: '{"value":1}',
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accepted: true });
    expect(observed).toEqual({
      method: 'POST',
      url: '/api/v1/example?mode=test',
      authorization: 'Bearer development',
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
});
