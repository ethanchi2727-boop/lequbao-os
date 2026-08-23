import { describe, expect, it } from 'vitest';
import { inspectSourceSecrets, isSourceSecretTextFile } from './source-secret-policy.mjs';

describe('source secret policy', () => {
  it('detects current hosted-service token families without storing fixtures verbatim', () => {
    const samples = {
      classic: ['ghp', '_', 'a'.repeat(36)].join(''),
      fineGrained: ['github', '_pat_', 'A'.repeat(40)].join(''),
      npm: ['npm', '_', 'b'.repeat(36)].join(''),
      openai: ['sk', '-proj-', 'c'.repeat(40)].join(''),
    };
    expect(inspectSourceSecrets('fixture', Object.values(samples).join('\n'))).toEqual([
      'GITHUB_TOKEN:fixture',
      'GITHUB_FINE_GRAINED_TOKEN:fixture',
      'NPM_TOKEN:fixture',
      'OPENAI_API_KEY:fixture',
    ]);
  });

  it('detects private keys, URL credentials, AWS keys and JWT-shaped values', () => {
    const source = [
      ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
      ['AKIA', 'A'.repeat(16)].join(''),
      ['https://user', ':password@example.test'].join(''),
      ['eyJ', 'a'.repeat(20), '.', 'b'.repeat(20), '.', 'c'.repeat(10)].join(''),
    ].join('\n');
    expect(inspectSourceSecrets('fixture', source)).toEqual([
      'PRIVATE_KEY:fixture',
      'AWS_ACCESS_KEY:fixture',
      'URL_CREDENTIAL:fixture',
      'JWT:fixture',
    ]);
  });

  it('does not flag short placeholders or ordinary URLs', () => {
    expect(
      inspectSourceSecrets('fixture', 'ghp_REDACTED\nhttps://example.test\nsk-example'),
    ).toEqual([]);
  });

  it('includes container, environment and package-manager text files but excludes binaries', () => {
    for (const file of [
      'deploy/Dockerfile',
      'deploy/Dockerfile.worker',
      '.env.example',
      '.npmrc',
      '.github/workflows/ci.yml',
      'tooling/check.mjs',
    ])
      expect(isSourceSecretTextFile(file), file).toBe(true);
    for (const file of ['assets/logo.png', 'release/archive.tar.gz', 'dist/app.js.map'])
      expect(isSourceSecretTextFile(file), file).toBe(false);
  });
});
