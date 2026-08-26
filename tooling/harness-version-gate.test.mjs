import { describe, expect, it } from 'vitest';

import { verifyHarnessVersionGate } from './harness-version-gate.mjs';

describe('Harness 版本与多模态门禁', () => {
  it('锁定 0.1.1-rc.2 (b150a55)、多模态、16 标准事件、Adapter 契约与降级路径', async () => {
    const failures = await verifyHarnessVersionGate();
    expect(failures).toEqual([]);
  });
});
