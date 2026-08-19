import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const maximumControlledEvidenceBytes = 100 * 1024 * 1024;

const sensitivePatterns = [
  { label: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
  { label: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u },
  { label: 'Bearer credential', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/iu },
  {
    label: 'credentialed PostgreSQL URL',
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^@\s/]+@/iu,
  },
  { label: 'provider secret', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/u },
];

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
  return { failures, sha256, sizeBytes: metadata.size };
}
