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

async function createSurfaceFixture(name, title) {
  const root = await mkdtemp(path.join(tmpdir(), `lequ-${name}-`));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), `<title>${title}</title>\n`);
  await writeFile(path.join(root, 'assets', 'app.js'), `document.title = '${title}';\n`);
  return root;
}

async function start(root = new URL('./src/', import.meta.url), surfaces = {}) {
  const lifeRoot = surfaces.lifeRoot ?? (await createSurfaceFixture('life', '乐趣生活 UniApp'));
  const baoMobileRoot =
    surfaces.baoMobileRoot ?? (await createSurfaceFixture('bao-mobile', '乐趣宝移动端'));
  const server = createWorkbenchProductionServer({ root, lifeRoot, baoMobileRoot });
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
    const life = await fetch(`${base}/life/mall`);
    expect(life.status).toBe(200);
    expect(await life.text()).toContain('<title>乐趣生活 UniApp</title>');
    expect((await fetch(`${base}/life/assets/app.js`)).status).toBe(200);
    const baoMobile = await fetch(`${base}/bao-mobile/`);
    expect(baoMobile.status).toBe(200);
    expect(await baoMobile.text()).toContain('<title>乐趣宝移动端</title>');
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
