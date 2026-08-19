import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkbenchProductionServer, resolveStaticRequest } from './production-server.mjs';

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))),
  );
});

async function start() {
  const server = createWorkbenchProductionServer({ root: new URL('./src/', import.meta.url) });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

describe('Workbench production static server', () => {
  it('serves health and SPA routes with hardened browser headers', async () => {
    const base = await start();
    const health = await fetch(`${base}/health`);
    expect(await health.json()).toEqual({ status: 'ok', version: '6.1.0' });
    const page = await fetch(`${base}/bao/page-014`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns 404 for missing assets and rejects resolved traversal', async () => {
    const base = await start();
    expect((await fetch(`${base}/missing.js`)).status).toBe(404);
    expect(resolveStaticRequest('C:\\safe-root', '/../outside.txt')).toEqual({ status: 400 });
  });

  it('allows only GET and HEAD', async () => {
    const base = await start();
    const response = await fetch(`${base}/`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});
