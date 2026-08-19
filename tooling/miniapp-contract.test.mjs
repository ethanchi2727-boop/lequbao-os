import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isSafeMiniappOutput } from './miniapp-contract.mjs';

describe('mini-program build output boundary', () => {
  const appRoot = join(process.cwd(), 'apps', 'consumer-miniapp');

  it('accepts only the app-local dist directory on the current platform', () => {
    expect(isSafeMiniappOutput(appRoot, join(appRoot, 'dist'))).toBe(true);
    expect(isSafeMiniappOutput(appRoot, appRoot)).toBe(false);
    expect(isSafeMiniappOutput(appRoot, join(appRoot, '..', 'dist'))).toBe(false);
  });
});
