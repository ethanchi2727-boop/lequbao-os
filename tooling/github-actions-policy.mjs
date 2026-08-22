export const trustedActionPins = Object.freeze({
  'actions/checkout': 'd23441a48e516b6c34aea4fa41551a30e30af803',
  'actions/setup-node': '249970729cb0ef3589644e2896645e5dc5ba9c38',
  'actions/upload-artifact': '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  'actions/attest': '1e69f48acb82d1966a394da916b4c1698aa569d6',
  'docker/setup-buildx-action': '37fe631027851001ddb9b187196cc803df7f5f0e',
  'docker/login-action': 'dbcb813823bdd20940b903addbd779551569679f',
  'docker/build-push-action': '53b7df96c91f9c12dcc8a07bcb9ccacbed38856a',
});

export function inspectGitHubActionPins(workflows) {
  const failures = [];
  for (const [file, source] of Object.entries(workflows)) {
    for (const match of source.matchAll(/\buses:\s*([^\s#]+)/gu)) {
      const reference = match[1];
      if (reference.startsWith('./')) continue;
      const separator = reference.lastIndexOf('@');
      if (separator < 1) {
        failures.push(`${file}: action reference has no immutable revision: ${reference}`);
        continue;
      }
      const action = reference.slice(0, separator);
      const revision = reference.slice(separator + 1);
      const trusted = trustedActionPins[action];
      if (!trusted) failures.push(`${file}: action is not in the trusted allowlist: ${action}`);
      else if (revision !== trusted)
        failures.push(
          `${file}: ${action} must use trusted commit ${trusted}, received ${revision}`,
        );
    }
  }
  return failures;
}
