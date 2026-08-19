import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
const lockText = await readFile('pnpm-lock.yaml', 'utf8'),
  lock = parse(lockText),
  lockHash = createHash('sha256').update(lockText).digest('hex');
const components = Object.keys(lock.snapshots ?? {})
  .sort()
  .map((key) => {
    const match = /^(?:@([^/]+)\/)?([^@/]+)@(.+)$/u.exec(key);
    const scope = match?.[1],
      name = match?.[2] ?? key,
      version = (match?.[3] ?? 'unknown').split('(')[0];
    return {
      type: 'library',
      ...(scope ? { group: `@${scope}` } : {}),
      name,
      version,
      'bom-ref': `pkg:npm/${scope ? `%40${scope}%2F` : ''}${name}@${version}`,
    };
  });
const document = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${lockHash.slice(0, 8)}-${lockHash.slice(8, 12)}-4${lockHash.slice(13, 16)}-8${lockHash.slice(17, 20)}-${lockHash.slice(20, 32)}`,
  version: 1,
  metadata: {
    component: { type: 'application', name: 'lequbao-v6-platform', version: '6.1.0' },
    properties: [{ name: 'lequ:pnpm-lock-sha256', value: lockHash }],
  },
  components,
};
await mkdir('docs/release', { recursive: true });
await writeFile('docs/release/sbom.cdx.json', `${JSON.stringify(document, null, 2)}\n`);
console.log(
  `SBOM generated: ${components.length} pinned components, lock ${lockHash.slice(0, 12)}.`,
);
