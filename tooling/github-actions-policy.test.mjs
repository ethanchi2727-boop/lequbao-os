import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { inspectGitHubActionPins, trustedActionPins } from './github-actions-policy.mjs';

describe('GitHub Actions supply-chain policy', () => {
  it('pins every repository workflow action to the approved full commit', async () => {
    const files = (await readdir('.github/workflows', { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name))
      .map((entry) => `.github/workflows/${entry.name}`)
      .sort();
    expect(files.length).toBeGreaterThan(0);
    const workflows = Object.fromEntries(
      await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')])),
    );
    expect(inspectGitHubActionPins(workflows)).toEqual([]);
  });

  it('rejects a movable version tag', () => {
    expect(
      inspectGitHubActionPins({ workflow: 'steps:\n  - uses: actions/checkout@v6\n' }),
    ).toEqual([expect.stringContaining('must use trusted commit')]);
  });

  it('rejects unknown actions even when they use a full SHA', () => {
    expect(
      inspectGitHubActionPins({
        workflow: `steps:\n  - uses: example/unknown@${'a'.repeat(40)}\n`,
      }),
    ).toEqual([expect.stringContaining('not in the trusted allowlist')]);
  });

  it('allows local actions and rejects a changed approved SHA', () => {
    expect(
      inspectGitHubActionPins({ workflow: 'steps:\n  - uses: ./actions/local-action\n' }),
    ).toEqual([]);
    expect(
      inspectGitHubActionPins({ workflow: 'steps:\n  - uses: ./actions/../outside\n' }),
    ).toEqual([expect.stringContaining('local action path is unsafe')]);
    expect(
      inspectGitHubActionPins({
        workflow: `steps:\n  - uses: actions/checkout@${'b'.repeat(40)}\n`,
      }),
    ).toEqual([expect.stringContaining(trustedActionPins['actions/checkout'])]);
  });
});
