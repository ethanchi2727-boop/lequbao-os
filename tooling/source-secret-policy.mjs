export const sourceSecretPatterns = Object.freeze([
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['GITHUB_TOKEN', /gh[pousr]_[A-Za-z0-9]{30,}/u],
  ['GITHUB_FINE_GRAINED_TOKEN', /github_pat_[A-Za-z0-9_]{20,}/u],
  ['NPM_TOKEN', /npm_[A-Za-z0-9]{30,}/u],
  ['OPENAI_API_KEY', /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/u],
  ['AWS_ACCESS_KEY', /AKIA[0-9A-Z]{16}/u],
  ['URL_CREDENTIAL', /https?:\/\/[^\s/:]+:[^\s/@]+@/u],
  ['JWT', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/u],
]);

export function isSourceSecretTextFile(file) {
  const name = file.split('/').at(-1) ?? '';
  return (
    /\.(?:[cm]?[jt]sx?|json|ya?ml|md|sql|env|toml|ini|properties|sh|ps1)$/iu.test(file) ||
    /^(?:Dockerfile(?:\..+)?|Makefile|\.env(?:\..+)?|\.npmrc|\.yarnrc(?:\.yml)?|\.pnpmfile\.cjs)$/iu.test(
      name,
    )
  );
}

export function inspectSourceSecrets(file, source) {
  return sourceSecretPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([code]) => `${code}:${file}`);
}
