export const trustedContainerImages = Object.freeze({
  'docker/dockerfile:1.7':
    'sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e',
  'node:22.23.1-bookworm-slim':
    'sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3',
  'node:22.23.1-bookworm':
    'sha256:5647be709086c696ff32edaaf1c70cd26d1da6ab2b39c32f3c7b4c4a31957e37',
  'postgres:15': 'sha256:5f72c7b5bd616308ccfd2e74d6be16fb06364e5eecbb815fe9dc6ab9761d2111',
  'postgres:15-bookworm': 'sha256:cf7f8fb958c63e62875e30645dc4819ff0243a923f3c709e752b99dedd40bfcd',
});

function inspectReference(file, reference, failures) {
  const match = /^(?<tag>[^@\s]+)@(?<digest>sha256:[0-9a-f]{64})$/u.exec(reference);
  if (!match) {
    failures.push(`${file}: container image is not pinned by SHA-256: ${reference}`);
    return;
  }
  const { tag, digest } = match.groups;
  const trusted = trustedContainerImages[tag];
  if (!trusted) failures.push(`${file}: container image is not in the trusted allowlist: ${tag}`);
  else if (digest !== trusted)
    failures.push(`${file}: ${tag} must use trusted digest ${trusted}, received ${digest}`);
}

export function inspectContainerImagePins({ dockerfiles = {}, manifests = {} }) {
  const failures = [];
  for (const [file, source] of Object.entries(dockerfiles)) {
    for (const match of source.matchAll(/^#\s*syntax=(?<reference>\S+)\s*$/gimu))
      inspectReference(file, match.groups.reference, failures);
    const stages = new Set();
    for (const match of source.matchAll(
      /^FROM\s+(?<reference>\S+)(?:\s+AS\s+(?<stage>\S+))?/gimu,
    )) {
      const { reference, stage } = match.groups;
      if (!stages.has(reference)) inspectReference(file, reference, failures);
      if (stage) stages.add(stage);
    }
  }
  for (const [file, source] of Object.entries(manifests)) {
    let manifest;
    try {
      manifest = YAML.parse(source);
    } catch {
      failures.push(`${file}: container manifest is not valid YAML`);
      continue;
    }
    const visit = (value) => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) {
        if ((key === 'image' || key === 'container') && typeof nested === 'string')
          inspectReference(file, nested, failures);
        else visit(nested);
      }
    };
    visit(manifest);
  }
  return failures;
}
import YAML from 'yaml';
