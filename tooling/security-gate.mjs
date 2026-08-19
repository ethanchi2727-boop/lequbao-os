import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  encoding: 'utf8',
});
if (listed.status !== 0) throw new Error('git file inventory unavailable');
const files = listed.stdout
  .split('\0')
  .filter(Boolean)
  .filter(
    (file) =>
      !/(?:^|\/)(?:node_modules|dist|coverage)(?:\/|$)/u.test(file) &&
      /\.(?:[cm]?[jt]sx?|json|ya?ml|md|sql|env|toml|ini|properties|sh|ps1)$/iu.test(file),
  );
const patterns = [
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['GITHUB_TOKEN', /gh[pousr]_[A-Za-z0-9]{30,}/u],
  ['AWS_ACCESS_KEY', /AKIA[0-9A-Z]{16}/u],
  ['URL_CREDENTIAL', /https?:\/\/[^\s/:]+:[^\s/@]+@/u],
  ['JWT', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/u],
];
const failures = [];
for (const file of files) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  for (const [code, pattern] of patterns) {
    if (pattern.test(text)) failures.push(`${code}:${file}`);
  }
}
const lockText = await readFile('pnpm-lock.yaml', 'utf8'),
  lockHash = createHash('sha256').update(lockText).digest('hex'),
  sbom = JSON.parse(await readFile('docs/release/sbom.cdx.json', 'utf8'));
const recorded = sbom.metadata?.properties?.find(
  (item) => item.name === 'lequ:pnpm-lock-sha256',
)?.value;
if (recorded !== lockHash) failures.push('SBOM_LOCK_HASH_MISMATCH');
if (!Array.isArray(sbom.components) || sbom.components.length < 1) failures.push('SBOM_EMPTY');
if (failures.length) {
  for (const failure of failures) console.error(`Security gate failure: ${failure}`);
  process.exitCode = 1;
} else
  console.log(
    `Security gate verified ${files.length} text files and ${sbom.components.length} SBOM components; no embedded production secret patterns.`,
  );
