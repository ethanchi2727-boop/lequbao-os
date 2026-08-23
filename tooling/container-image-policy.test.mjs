import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { inspectContainerImagePins, trustedContainerImages } from './container-image-policy.mjs';

describe('container image supply-chain policy', () => {
  it('pins production, CI and development images to approved manifest digests', async () => {
    const [production, development, compose, workflow] = await Promise.all([
      readFile('deploy/Dockerfile', 'utf8'),
      readFile('.devcontainer/Dockerfile', 'utf8'),
      readFile('.devcontainer/compose.yaml', 'utf8'),
      readFile('.github/workflows/ci.yml', 'utf8'),
    ]);
    expect(
      inspectContainerImagePins({
        dockerfiles: { 'deploy/Dockerfile': production, '.devcontainer/Dockerfile': development },
        manifests: { '.devcontainer/compose.yaml': compose, '.github/workflows/ci.yml': workflow },
      }),
    ).toEqual([]);
  });

  it('rejects mutable image tags', () => {
    expect(
      inspectContainerImagePins({ dockerfiles: { Dockerfile: 'FROM node:22.23.1-bookworm\n' } }),
    ).toEqual([expect.stringContaining('not pinned by SHA-256')]);
  });

  it('rejects a movable external Dockerfile frontend', () => {
    expect(
      inspectContainerImagePins({
        dockerfiles: {
          Dockerfile: `# syntax=docker/dockerfile:1.7\nFROM node:22.23.1-bookworm@${trustedContainerImages['node:22.23.1-bookworm']}\n`,
        },
      }),
    ).toEqual([expect.stringContaining('docker/dockerfile:1.7')]);
  });

  it('rejects unknown images even when digest-pinned', () => {
    expect(
      inspectContainerImagePins({
        manifests: {
          compose: `services:\n  db:\n    image: example/db:1@sha256:${'a'.repeat(64)}\n`,
        },
      }),
    ).toEqual([expect.stringContaining('not in the trusted allowlist')]);
  });

  it('rejects mutable scalar job containers and malformed YAML', () => {
    expect(
      inspectContainerImagePins({
        manifests: { workflow: 'jobs:\n  verify:\n    container: node:latest\n' },
      }),
    ).toEqual([expect.stringContaining('not pinned by SHA-256')]);
    expect(inspectContainerImagePins({ manifests: { workflow: 'jobs: [\n' } })).toEqual([
      expect.stringContaining('not valid YAML'),
    ]);
  });

  it('allows internal Docker stages and rejects changed approved digests', () => {
    const trusted = trustedContainerImages['node:22.23.1-bookworm-slim'];
    expect(
      inspectContainerImagePins({
        dockerfiles: {
          Dockerfile: `FROM node:22.23.1-bookworm-slim@${trusted} AS source\nFROM source AS build\n`,
        },
      }),
    ).toEqual([]);
    expect(
      inspectContainerImagePins({
        dockerfiles: {
          Dockerfile: `FROM node:22.23.1-bookworm-slim@sha256:${'b'.repeat(64)}\n`,
        },
      }),
    ).toEqual([expect.stringContaining(trusted)]);
  });
});
