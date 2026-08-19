import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('protected controlled-release verification workflow', () => {
  it('uses trusted main policy, exact candidates and the protected environment', async () => {
    const source = await readFile('.github/workflows/verify-controlled-release.yml', 'utf8');
    const workflow = parse(source);
    expect(workflow.permissions).toMatchObject({
      contents: 'read',
      checks: 'read',
      'id-token': 'write',
      attestations: 'write',
      'artifact-metadata': 'write',
    });
    expect(workflow.jobs.verify.environment).toBe('controlled-preproduction');
    expect(workflow.jobs.verify.if).toContain("github.ref == 'refs/heads/main'");
    expect(source).toContain('ref: ${{ github.sha }}');
    expect(source).toContain('ref: ${{ inputs.candidate_commit }}');
    expect(source).toContain('persist-credentials: false');
    expect(source).toContain('test "$(git -C trusted rev-parse HEAD)" = "$GITHUB_SHA"');
    expect(source).toContain('test "$(git -C candidate rev-parse HEAD)" = "$CANDIDATE_COMMIT"');
  });

  it('accepts only a candidate-bound draft release and safely validates its archive', async () => {
    const source = await readFile('.github/workflows/verify-controlled-release.yml', 'utf8');
    expect(source).toContain('.isDraft == true');
    expect(source).toContain('.targetCommitish == $candidate');
    expect(source).toContain('--pattern controlled-evidence.tar.gz');
    expect(source).toContain('len(members) > 256');
    expect(source).toContain("'..' in candidate.parts");
    expect(source).toContain('member.size > 104857600');
    expect(source).toContain('links and special archive entries are forbidden');
    expect(source).toContain("name == 'results.json'");
    expect(source).toContain('--no-same-owner --no-same-permissions');
  });

  it('executes only trusted verifier code and attests the protected result', async () => {
    const source = await readFile('.github/workflows/verify-controlled-release.yml', 'utf8');
    for (const check of ['code-quality', 'postgres-contract', 'container-build'])
      expect(source).toContain(check);
    expect(source).toContain('node ../trusted/tooling/controlled-evidence-package.mjs');
    expect(source).toContain('--verify-package=${{ github.workspace }}/evidence');
    expect(source).toContain('node ../trusted/tooling/verify-acceptance-evidence.mjs --launch');
    expect(source).toContain(
      'CONTROLLED_RESULTS_FILE: ${{ github.workspace }}/evidence/results.json',
    );
    expect(source).toContain('uses: actions/attest@v4');
    expect(source).toContain('subject-path: verified-controlled-release.json');
    expect(source).toContain('uses: actions/upload-artifact@v7');
  });
});
