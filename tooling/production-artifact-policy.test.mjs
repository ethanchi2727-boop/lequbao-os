import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { inspectProductionArtifacts } from './production-artifact-policy.mjs';

const temporaryDirectories = [];

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lequ-production-artifacts-'));
  temporaryDirectories.push(root);
  const roots = Object.fromEntries(
    await Promise.all(
      ['api', 'worker', 'web', 'lifeWeb', 'baoMobile'].map(async (name) => {
        const directory = path.join(root, name);
        await mkdir(directory);
        return [name, directory];
      }),
    ),
  );
  await Promise.all([
    writeFile(path.join(roots.api, 'server.js'), 'console.log("api");\n'),
    writeFile(path.join(roots.worker, 'main.js'), 'console.log("worker");\n'),
    writeFile(path.join(roots.web, 'index.html'), '<main>乐趣宝</main>\n'),
    writeFile(path.join(roots.web, 'app.js'), 'document.body.dataset.ready = "true";\n'),
    writeFile(path.join(roots.lifeWeb, 'index.html'), '<main>乐趣生活</main>\n'),
    writeFile(path.join(roots.baoMobile, 'index.html'), '<main>乐趣宝移动端</main>\n'),
  ]);
  return {
    roots,
    manifests: { api: { files: ['dist'] }, worker: { files: ['dist'] } },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('production artifact policy', () => {
  test('accepts minimal runtime-only API, Worker and Web artifacts', async () => {
    const result = await inspectProductionArtifacts(await fixture());
    expect(result.failures).toEqual([]);
    expect(result.stats).toMatchObject({
      api: { files: 1 },
      worker: { files: 1 },
      web: { files: 2 },
      lifeWeb: { files: 1 },
      baoMobile: { files: 1 },
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  test('rejects source maps, declarations, tests and source-map references', async () => {
    const input = await fixture();
    await Promise.all([
      writeFile(path.join(input.roots.api, 'server.js.map'), '{}\n'),
      writeFile(path.join(input.roots.worker, 'main.d.ts'), 'export {};\n'),
      writeFile(path.join(input.roots.web, 'app.test.js'), 'throw new Error();\n'),
      writeFile(path.join(input.roots.api, 'extra.js'), '//# sourceMappingURL=extra.js.map\n'),
    ]);
    expect((await inspectProductionArtifacts(input)).failures).toEqual(
      expect.arrayContaining([
        'api:server.js.map has forbidden extension .map',
        'worker:main.d.ts has forbidden extension .ts',
        'web:app.test.js is a hidden or test artifact',
        'api:extra.js references a source map',
      ]),
    );
  });

  test('rejects missing entrypoints and a package boundary broader than dist', async () => {
    const input = await fixture();
    await rm(path.join(input.roots.worker, 'main.js'));
    input.manifests.api.files = ['dist', 'src'];
    expect((await inspectProductionArtifacts(input)).failures).toEqual(
      expect.arrayContaining([
        'worker entrypoint main.js is missing',
        'api package files must equal ["dist"]',
      ]),
    );
  });

  test('rejects secret-shaped values in otherwise allowed files', async () => {
    const input = await fixture();
    const credential = ['https://runtime-user:', 'runtime-password@example.invalid'].join('');
    await writeFile(
      path.join(input.roots.api, 'server.js'),
      `const credential = '${credential}';\n`,
    );
    expect((await inspectProductionArtifacts(input)).failures).toContain(
      'api:server.js contains a secret-shaped value',
    );
  });
});
