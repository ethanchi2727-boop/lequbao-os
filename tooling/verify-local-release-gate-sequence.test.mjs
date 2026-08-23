import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLocalReleaseGateSequence } from './verify-local-release-gate-sequence.mjs';

describe('local release gate sequence', () => {
  it('locks thirteen ordered local gates and excludes controlled evidence capture', async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const report = await verifyLocalReleaseGateSequence(root);
    expect(report.sequence).toHaveLength(13);
    expect(report.checks).toHaveLength(14);
    expect(report.checks.every((check) => check.passed)).toBe(true);
    expect(report.checks.at(-1).name).toBe('controlled-gates-excluded');
  });
});
