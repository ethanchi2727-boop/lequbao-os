import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { sourceSecretPatterns } from './source-secret-policy.mjs';

export const maximumControlledEvidenceBytes = 100 * 1024 * 1024;

const sensitivePatterns = [
  { label: 'Bearer credential', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/iu },
  {
    label: 'credentialed PostgreSQL URL',
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^@\s/]+@/iu,
  },
  { label: 'provider secret', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/u },
  {
    label: 'email address',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/iu,
  },
  {
    label: 'mainland China mobile number',
    pattern: /(?<![A-Za-z0-9])1[3-9]\d{9}(?![A-Za-z0-9])/u,
  },
];
const sourceSecretLabels = Object.freeze({
  PRIVATE_KEY: 'private key',
  GITHUB_TOKEN: 'GitHub token',
  GITHUB_FINE_GRAINED_TOKEN: 'fine-grained GitHub token',
  NPM_TOKEN: 'npm token',
  OPENAI_API_KEY: 'OpenAI API key',
  AWS_ACCESS_KEY: 'AWS access key',
  URL_CREDENTIAL: 'credentialed HTTP URL',
  JWT: 'JWT credential',
});

export async function inspectControlledEvidenceFile(file) {
  const failures = [];
  const metadata = await stat(file);
  if (!metadata.isFile()) failures.push('is not a regular file');
  if (metadata.size === 0) failures.push('is empty');
  if (metadata.size > maximumControlledEvidenceBytes)
    failures.push(`exceeds ${maximumControlledEvidenceBytes} bytes`);
  if (failures.length) return { failures };

  const content = await readFile(file);
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (content.includes(0)) failures.push('contains binary NUL bytes');
  const text = content.toString('utf8');
  const trimmed = text.trim();
  if (trimmed.length < 16) failures.push('contains less than 16 non-whitespace characters');
  if (/^(?:todo|tbd|placeholder|not[ -]?run|pending|pass|passed|success|ok)[.!]?$/iu.test(trimmed))
    failures.push('contains only a placeholder verdict');
  if (text.includes('\uFFFD')) failures.push('is not valid UTF-8 text');

  if (path.extname(file).toLowerCase() === '.json') {
    try {
      const parsed = JSON.parse(text);
      const populated = Array.isArray(parsed)
        ? parsed.length > 0
        : parsed !== null && typeof parsed === 'object' && Object.keys(parsed).length > 0;
      if (!populated) failures.push('JSON root must be a non-empty object or array');
    } catch {
      failures.push('contains invalid JSON');
    }
  }

  for (const { label, pattern } of sensitivePatterns)
    if (pattern.test(text)) failures.push(`contains an unredacted ${label}`);
  for (const [code, pattern] of sourceSecretPatterns)
    if (pattern.test(text)) failures.push(`contains an unredacted ${sourceSecretLabels[code]}`);
  return { failures, sha256, sizeBytes: metadata.size };
}
