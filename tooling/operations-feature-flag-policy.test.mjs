import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { inspectOperationsFeatureFlags } from './operations-feature-flag-policy.mjs';

async function featureFlags() {
  return parse(await readFile('ops/feature-flags.yaml', 'utf8'));
}

describe('operations feature flag policy', () => {
  it('keeps every launch-sensitive capability disabled with exact prerequisites', async () => {
    expect(inspectOperationsFeatureFlags(await featureFlags())).toEqual([]);
  });

  it('rejects enabled defaults, weakened requirements and undeclared flags', async () => {
    const document = await featureFlags();
    document.defaults.consumer_payments = true;
    document.requirements.consumer_payments = ['payment_sandbox_passed'];
    document.defaults.undeclared_launch = false;
    document.requirements.undeclared_launch = ['approval'];
    expect(inspectOperationsFeatureFlags(document)).toEqual(
      expect.arrayContaining([
        'feature flag consumer_payments must default to false',
        'feature flag consumer_payments requirements do not match policy',
        'feature flags defaults is undeclared: undeclared_launch',
        'feature flags requirements is undeclared: undeclared_launch',
      ]),
    );
  });
});
