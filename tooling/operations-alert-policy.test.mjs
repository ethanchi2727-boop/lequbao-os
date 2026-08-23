import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { inspectOperationsAlerts, requiredAlertCodes } from './operations-alert-policy.mjs';

async function alerts() {
  return parse(await readFile('ops/alerts.yaml', 'utf8'));
}

describe('operations alert policy', () => {
  it('requires all fourteen production alerts with exact rule fields', async () => {
    const document = await alerts();
    expect(requiredAlertCodes).toHaveLength(14);
    expect(document.rules).toHaveLength(14);
    expect(inspectOperationsAlerts(document)).toEqual([]);
  });

  it('rejects a missing privacy alert, duplicate code and malformed rule', async () => {
    const document = await alerts();
    document.rules = document.rules.filter((rule) => rule.code !== 'PRIVACY_DELETION_FAILED');
    document.rules.push({
      ...document.rules[0],
      severity: 'P2',
      metric: 'invalid metric',
      unexpected: true,
    });
    expect(inspectOperationsAlerts(document)).toEqual(
      expect.arrayContaining([
        'missing alert PRIVACY_DELETION_FAILED',
        'duplicate alert code AUTH_ANOMALY',
        expect.stringContaining('severity must be P0 or P1'),
        expect.stringContaining('metric must be an identifier'),
        expect.stringContaining('undeclared fields'),
      ]),
    );
  });
});
