import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const policies = {
  api: {
    entry: 'server.js',
    allowedExtensions: new Set(['.js']),
    maximumFiles: 100,
    maximumBytes: 5 * 1024 * 1024,
  },
  worker: {
    entry: 'main.js',
    allowedExtensions: new Set(['.js']),
    maximumFiles: 50,
    maximumBytes: 2 * 1024 * 1024,
  },
  web: {
    entry: 'index.html',
    allowedExtensions: new Set([
      '.css',
      '.html',
      '.ico',
      '.jpeg',
      '.jpg',
      '.js',
      '.mjs',
      '.png',
      '.svg',
      '.webp',
    ]),
    maximumFiles: 250,
    maximumBytes: 8 * 1024 * 1024,
  },
  lifeWeb: {
    entry: 'index.html',
    allowedExtensions: new Set(['.css', '.html', '.js', '.png', '.svg', '.webp']),
    maximumFiles: 250,
    maximumBytes: 8 * 1024 * 1024,
  },
  baoMobile: {
    entry: 'index.html',
    allowedExtensions: new Set(['.css', '.html', '.js', '.png', '.svg', '.webp']),
    maximumFiles: 250,
    maximumBytes: 8 * 1024 * 1024,
  },
};

async function walk(root, relative = '') {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      files.push({ relative: next, symbolicLink: true });
      continue;
    }
    if (entry.isDirectory()) files.push(...(await walk(root, next)));
    else if (entry.isFile()) files.push({ relative: next, symbolicLink: false });
    else files.push({ relative: next, special: true, symbolicLink: false });
  }
  return files;
}

const normalized = (value) => value.split(path.sep).join('/');

export async function inspectProductionArtifacts({ roots, manifests }) {
  const failures = [];
  const stats = {};
  const aggregate = createHash('sha256');
  for (const [name, policy] of Object.entries(policies)) {
    const root = roots[name];
    let files;
    try {
      files = await walk(root);
    } catch {
      failures.push(`${name} artifact directory is missing or unreadable`);
      continue;
    }
    let totalBytes = 0;
    const normalizedFiles = files.map((file) => ({ ...file, relative: normalized(file.relative) }));
    if (!normalizedFiles.some((file) => file.relative === policy.entry))
      failures.push(`${name} entrypoint ${policy.entry} is missing`);
    if (normalizedFiles.length > policy.maximumFiles)
      failures.push(
        `${name} contains ${normalizedFiles.length} files, maximum ${policy.maximumFiles}`,
      );
    for (const file of normalizedFiles) {
      const prefix = `${name}:${file.relative}`;
      if (file.symbolicLink || file.special) {
        failures.push(`${prefix} must be a regular file`);
        continue;
      }
      const extension = path.posix.extname(file.relative).toLowerCase();
      if (!policy.allowedExtensions.has(extension))
        failures.push(`${prefix} has forbidden extension ${extension || '<none>'}`);
      if (/(?:^|\/)(?:\.|.*(?:\.test|\.spec)\.)/iu.test(file.relative))
        failures.push(`${prefix} is a hidden or test artifact`);
      const physical = path.join(root, ...file.relative.split('/'));
      const metadata = await stat(physical);
      totalBytes += metadata.size;
      if (metadata.size > 2 * 1024 * 1024) failures.push(`${prefix} exceeds the 2 MiB file limit`);
      const bytes = await readFile(physical);
      const digest = createHash('sha256').update(bytes).digest('hex');
      aggregate.update(`${name}/${file.relative}\0${metadata.size}\0${digest}\n`);
      if (['.css', '.html', '.js', '.mjs'].includes(extension)) {
        const source = bytes.toString('utf8');
        if (/sourceMappingURL=/u.test(source)) failures.push(`${prefix} references a source map`);
        if (
          /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|https?:\/\/[^\s/:]+:[^\s/@]+@/u.test(
            source,
          )
        )
          failures.push(`${prefix} contains a secret-shaped value`);
      }
    }
    if (totalBytes > policy.maximumBytes)
      failures.push(`${name} totals ${totalBytes} bytes, maximum ${policy.maximumBytes}`);
    stats[name] = { files: normalizedFiles.length, bytes: totalBytes };
  }
  for (const name of ['api', 'worker']) {
    const manifest = manifests[name];
    if (!manifest || JSON.stringify(manifest.files) !== JSON.stringify(['dist']))
      failures.push(`${name} package files must equal ["dist"]`);
  }
  return { failures: [...new Set(failures)], stats, sha256: aggregate.digest('hex') };
}

async function main() {
  const result = await inspectProductionArtifacts({
    roots: {
      api: 'apps/api/dist',
      worker: 'apps/worker/dist',
      web: 'apps/workbench-web/dist',
      lifeWeb: 'apps/life-uniapp/dist/build/h5',
      baoMobile: 'apps/bao-uniapp/dist/build/h5',
    },
    manifests: {
      api: JSON.parse(await readFile('apps/api/package.json', 'utf8')),
      worker: JSON.parse(await readFile('apps/worker/package.json', 'utf8')),
    },
  });
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`Production artifact failure: ${failure}`);
    process.exitCode = 1;
    return;
  }
  const summary = Object.entries(result.stats)
    .map(([name, value]) => `${name} ${value.files} files/${value.bytes} bytes`)
    .join(', ');
  console.log(`Production artifacts verified: ${summary}; manifest ${result.sha256.slice(0, 16)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
