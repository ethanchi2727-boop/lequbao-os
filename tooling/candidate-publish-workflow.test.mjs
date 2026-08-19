import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const source = await readFile('.github/workflows/publish-candidate-images.yml', 'utf8');
const workflow = YAML.parse(source);
const publish = workflow.jobs.publish;
const steps = publish.steps;

describe('candidate image publication workflow', () => {
  it('runs only from trusted main with review and least required permissions', () => {
    expect(workflow.on.workflow_dispatch.inputs.candidate_commit.required).toBe(true);
    expect(workflow.permissions).toEqual({ contents: 'read', checks: 'read', packages: 'write' });
    expect(publish.if).toBe("${{ github.ref == 'refs/heads/main' }}");
    expect(publish.environment).toBe('controlled-preproduction');
    expect(
      steps.filter((step) => step.uses?.startsWith('actions/checkout@')).map((step) => step.with),
    ).toEqual([
      expect.objectContaining({
        ref: '${{ github.sha }}',
        path: 'trusted',
        'persist-credentials': false,
      }),
      expect.objectContaining({ path: 'candidate', 'persist-credentials': false }),
    ]);
  });

  it('requires all candidate checks before publishing the three hardened targets', () => {
    const verification = steps.find(
      (step) => step.name === 'Verify resolved candidate and required checks',
    );
    expect(verification.run).toContain('verify-candidate-check-provenance.mjs');
    expect(verification.run).toContain('test "$(git -C trusted rev-parse HEAD)" = "$GITHUB_SHA"');
    const builds = steps.filter((step) => step.uses?.startsWith('docker/build-push-action@'));
    expect(builds.map((step) => step.with.target).sort()).toEqual(['api', 'web', 'worker']);
    for (const build of builds) {
      expect(build.with).toMatchObject({
        push: true,
        provenance: 'mode=max',
        sbom: true,
      });
      expect(build.with.tags).not.toMatch(/latest/iu);
      expect(build.with.labels).toContain('${{ inputs.candidate_commit }}');
    }
  });

  it('uses unique run tags and retains only digest-bound deployment coordinates', () => {
    const coordinates = steps.find((step) => step.name === 'Prepare unique image coordinates');
    expect(coordinates.run).toContain('$GITHUB_RUN_ID');
    expect(coordinates.run).toContain('$GITHUB_RUN_ATTEMPT');
    const manifest = steps.find((step) => step.name === 'Record immutable image digests');
    expect(manifest.run).toContain("'^sha256:[0-9a-f]{64}$'");
    expect(manifest.run).toContain('@${API_DIGEST}');
    const artifact = steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(artifact.with).toMatchObject({
      path: 'candidate-image-digests.json',
      'if-no-files-found': 'error',
      'retention-days': 90,
    });
  });
});
