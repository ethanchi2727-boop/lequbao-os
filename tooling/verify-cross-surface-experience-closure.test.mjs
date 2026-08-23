import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCrossSurfaceExperienceClosure } from './verify-cross-surface-experience-closure.mjs';

describe('cross-surface experience closure', () => {
  it('keeps all twenty merchant integration boundaries executable', async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const report = await verifyCrossSurfaceExperienceClosure(root);
    expect(report.merchantPages).toBe(24);
    expect(report.checks).toHaveLength(20);
  });
});
