export function decodeCanonicalBase64Url(value: string): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1)
    throw new Error('invalid base64url');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new Error('non-canonical base64url');
  return decoded;
}
