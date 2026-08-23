import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildSbomDocument } from './generate-sbom.mjs';

describe('deterministic CycloneDX SBOM', () => {
  it('matches every component and field generated from the current lockfile', async () => {
    const lockText = await readFile('pnpm-lock.yaml', 'utf8');
    const recorded = JSON.parse(await readFile('docs/release/sbom.cdx.json', 'utf8'));
    const expected = buildSbomDocument(lockText);
    expect(recorded).toEqual(expected);
    expect(new Set(recorded.components.map((component) => component['bom-ref'])).size).toBe(
      recorded.components.length,
    );
  });

  it('does not accept a component-deleted document as the canonical SBOM', async () => {
    const expected = buildSbomDocument(await readFile('pnpm-lock.yaml', 'utf8'));
    const tampered = { ...expected, components: expected.components.slice(1) };
    expect(tampered).not.toEqual(expected);
  });
});
