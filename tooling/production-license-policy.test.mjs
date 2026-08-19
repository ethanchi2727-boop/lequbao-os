import { describe, expect, test } from 'vitest';
import { inspectProductionLicenseReport } from './production-license-policy.mjs';

const packageEntry = (name, license, versions = ['1.0.0']) => ({ name, license, versions });

describe('production license policy', () => {
  test('accepts approved permissive production licenses', () => {
    const result = inspectProductionLicenseReport({
      MIT: [packageEntry('mit-package', 'MIT')],
      'BSD-3-Clause': [packageEntry('bsd-package', 'BSD-3-Clause')],
      ISC: [packageEntry('isc-package', 'ISC')],
    });
    expect(result.failures).toEqual([]);
    expect(result.packageVersions).toBe(3);
    expect(result.licenses).toEqual(['BSD-3-Clause', 'ISC', 'MIT']);
  });

  test('rejects copyleft, source-available, unknown and unlicensed groups', () => {
    for (const license of ['GPL-3.0-only', 'AGPL-3.0-only', 'SSPL-1.0', 'UNKNOWN', 'UNLICENSED'])
      expect(
        inspectProductionLicenseReport({
          [license]: [packageEntry('unsafe-package', license)],
        }).failures,
      ).toContain(`${license} is not an approved production license`);
  });

  test('rejects empty, malformed and internally contradictory reports', () => {
    expect(inspectProductionLicenseReport({}).failures).toContain(
      'license report must not be empty',
    );
    expect(
      inspectProductionLicenseReport({ MIT: [null], ISC: [packageEntry('valid', 'MIT', [])] })
        .failures,
    ).toEqual(
      expect.arrayContaining([
        'MIT[0] must be an object',
        'ISC[0].versions must not be empty',
        'ISC[0].license must equal ISC',
      ]),
    );
  });

  test('rejects one package version reported under conflicting licenses', () => {
    expect(
      inspectProductionLicenseReport({
        MIT: [packageEntry('duplicate', 'MIT')],
        ISC: [packageEntry('duplicate', 'ISC')],
      }).failures,
    ).toContain('duplicate@1.0.0 is reported under both MIT and ISC');
  });
});
