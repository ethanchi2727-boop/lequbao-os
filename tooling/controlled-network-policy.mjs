import { isIP } from 'node:net';

export function isForbiddenLocalHostname(hostname) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.$/u, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::' ||
    normalized === '::1'
  )
    return true;
  if (isIP(normalized) === 4) {
    const firstOctet = Number(normalized.split('.')[0]);
    return firstOctet === 0 || firstOctet === 127;
  }
  const mapped = /^::ffff:([0-9a-f]{1,4}):/u.exec(normalized);
  if (!mapped) return false;
  const firstMappedHextet = Number.parseInt(mapped[1], 16);
  return firstMappedHextet === 0 || (firstMappedHextet >= 0x7f00 && firstMappedHextet <= 0x7fff);
}
