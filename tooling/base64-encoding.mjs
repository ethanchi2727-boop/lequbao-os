const canonicalBase64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export function isCanonicalBase64ByteLength(value, expectedBytes) {
  if (
    typeof value !== 'string' ||
    !Number.isInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    !canonicalBase64Pattern.test(value)
  )
    return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === expectedBytes && decoded.toString('base64') === value;
}
