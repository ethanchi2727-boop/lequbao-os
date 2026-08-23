import { describe, expect, it } from 'vitest';
import { verifyLife300Checkpoints } from './verify-life-300-checkpoint.mjs';

describe('Life 300-checkpoint closure ledger', () => {
  it('keeps exactly 300 executable route, state, contract and evidence checkpoints green', async () => {
    await expect(verifyLife300Checkpoints()).resolves.toHaveLength(300);
  });
});
