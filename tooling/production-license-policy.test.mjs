import { describe, expect, test } from 'vitest';
import { inspectProductionLicenseReport } from './production-license-policy.mjs';

const packageEntry = (name, license, versions = ['1.0.0']) => ({ name, license, versions });

describe('production license policy', () => {
  test('accepts approved permissive production licenses', () => {
    const result = inspectProductionLicenseReport({
      MIT: [packageEntry('mit-package', 'MIT')],
      'BSD-3-Clause': [packageEntry('bsd-package', 'BSD-3-Clause')],
      ISC: [packageEntry('isc-package', 'ISC')],
      'CC-BY-4.0': [packageEntry('attributed-data', 'CC-BY-4.0')],
      'CC0-1.0': [packageEntry('public-domain-data', 'CC0-1.0')],
      '(MIT AND Zlib)': [packageEntry('dual-permissive-package', '(MIT AND Zlib)')],
      'Apache 2.0': [packageEntry('legacy-apache-metadata', 'Apache 2.0')],
    });
    expect(result.failures).toEqual([]);
    expect(result.packageVersions).toBe(7);
    expect(result.licenses).toEqual([
      '(MIT AND Zlib)',
      'Apache 2.0',
      'BSD-3-Clause',
      'CC-BY-4.0',
      'CC0-1.0',
      'ISC',
      'MIT',
    ]);
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
