import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyControlled300StageMap } from './verify-controlled-300-stage-map.mjs';

describe('controlled 300-stage execution map', () => {
  it('maps 281 through 300 without claiming unavailable external results', async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    await expect(verifyControlled300StageMap(root)).resolves.toEqual({
      failures: [],
      suites: 11,
      controls: 9,
      artifacts: 47,
    });
  });
});
