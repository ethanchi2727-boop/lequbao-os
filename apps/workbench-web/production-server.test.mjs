import { once } from 'node:events';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkbenchProductionServer, resolveStaticRequest } from './production-server.mjs';

const servers = [];
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))),
  );
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function start(root = new URL('./src/', import.meta.url)) {
  const server = createWorkbenchProductionServer({ root });
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
    expect(page.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(page.headers.get('x-permitted-cross-domain-policies')).toBe('none');
    expect(page.headers.get('cache-control')).toBe('no-store');
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
    expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(405);
    const head = await fetch(`${base}/health`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('fails health when the immutable entrypoint is missing', async () => {
    const empty = await mkdtemp(path.join(tmpdir(), 'lequ-web-empty-'));
    temporaryDirectories.push(empty);
    const base = await start(empty);
    expect((await fetch(`${base}/health`)).status).toBe(503);
    expect((await fetch(`${base}/bao/page-014`)).status).toBe(503);
  });

  it('does not follow a static-root junction outside the deployed artifact', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lequ-web-root-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'lequ-web-outside-'));
    temporaryDirectories.push(root, outside);
    await writeFile(path.join(root, 'index.html'), '<main>safe</main>\n');
    await writeFile(path.join(outside, 'secret.txt'), 'outside\n');
    const escape = path.join(root, 'escape');
    await mkdir(path.dirname(escape), { recursive: true });
    await symlink(outside, escape, 'junction');
    const base = await start(root);
    expect((await fetch(`${base}/escape/secret.txt`)).status).toBe(404);
  });
});
