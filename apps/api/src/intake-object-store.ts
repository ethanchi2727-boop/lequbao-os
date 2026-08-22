import { createHash, createHmac } from 'node:crypto';

export interface UploadAuthorization {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface DownloadAuthorization {
  downloadUrl: string;
  expiresAt: string;
}

export interface StoredObjectEvidence {
  sha256: string;
  sizeBytes: number;
  contentType: string;
}

export interface IntakeObjectStore {
  authorizePut(input: {
    objectKey: string;
    sha256: string;
    contentType: string;
    maxBytes: number;
    expiresAt: string;
  }): UploadAuthorization;
  authorizeGet(input: {
    objectKey: string;
    maxBytes: number;
    expiresAt: string;
  }): DownloadAuthorization;
  stat(objectKey: string): Promise<StoredObjectEvidence>;
  putText(input: { objectKey: string; content: string; sha256: string }): Promise<void>;
  getText(input: { objectKey: string; maxBytes: number }): Promise<string>;
}

const sign = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

export function createIntakeObjectStoreGateway(options: {
  baseUrl: string;
  signingSecret: string;
  fetch?: typeof globalThis.fetch;
}): IntakeObjectStore {
  if (!URL.canParse(options.baseUrl)) throw new Error('OBJECT_STORE_GATEWAY_URL must be absolute');
  if (Buffer.byteLength(options.signingSecret, 'utf8') < 32)
    throw new Error('OBJECT_STORE_SIGNING_SECRET must contain at least 32 bytes');
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  const request = options.fetch ?? globalThis.fetch;
  return {
    authorizePut(input) {
      const expires = Math.floor(new Date(input.expiresAt).getTime() / 1000);
      const canonical = [
        'PUT',
        input.objectKey,
        input.sha256,
        input.contentType,
        input.maxBytes,
        expires,
      ].join('\n');
      const signature = sign(options.signingSecret, canonical);
      return {
        uploadUrl: `${baseUrl}/v1/objects/${encodeURIComponent(input.objectKey)}?expires=${expires}&signature=${signature}`,
        headers: {
          'content-type': input.contentType,
          'x-content-sha256': input.sha256,
          'x-max-bytes': String(input.maxBytes),
        },
        expiresAt: input.expiresAt,
      };
    },
    authorizeGet(input) {
      if (
        !Number.isSafeInteger(input.maxBytes) ||
        input.maxBytes < 1 ||
        input.maxBytes > 52_428_800
      )
        throw new Error('object store download limit is invalid');
      const expires = Math.floor(new Date(input.expiresAt).getTime() / 1000);
      if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000))
        throw new Error('object store download expiry is invalid');
      const signature = sign(
        options.signingSecret,
        ['GET', input.objectKey, input.maxBytes, expires].join('\n'),
      );
      return {
        downloadUrl: `${baseUrl}/v1/objects/${encodeURIComponent(input.objectKey)}?expires=${expires}&max_bytes=${input.maxBytes}&signature=${signature}`,
        expiresAt: input.expiresAt,
      };
    },
    async stat(objectKey) {
      const expires = Math.floor(Date.now() / 1000) + 60;
      const signature = sign(options.signingSecret, ['HEAD', objectKey, expires].join('\n'));
      const response = await request(
        `${baseUrl}/v1/objects/${encodeURIComponent(objectKey)}?expires=${expires}&signature=${signature}`,
        { method: 'HEAD' },
      );
      if (!response.ok) throw new Error(`object store evidence unavailable: ${response.status}`);
      const sha256 = response.headers.get('x-content-sha256');
      const size = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      if (!sha256 || !/^[a-f0-9]{64}$/iu.test(sha256) || !size || !contentType)
        throw new Error('object store evidence headers are incomplete');
      const sizeBytes = Number(size);
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0)
        throw new Error('object store content length is invalid');
      return { sha256: sha256.toLowerCase(), sizeBytes, contentType };
    },
    async putText(input) {
      const expires = Math.floor(Date.now() / 1000) + 60;
      const contentType = 'text/plain; charset=utf-8';
      const sizeBytes = Buffer.byteLength(input.content, 'utf8');
      const canonical = [
        'PUT',
        input.objectKey,
        input.sha256,
        contentType,
        sizeBytes,
        expires,
      ].join('\n');
      const signature = sign(options.signingSecret, canonical);
      const response = await request(
        `${baseUrl}/v1/objects/${encodeURIComponent(input.objectKey)}?expires=${expires}&signature=${signature}`,
        {
          method: 'PUT',
          headers: {
            'content-type': contentType,
            'x-content-sha256': input.sha256,
            'x-max-bytes': String(sizeBytes),
          },
          body: input.content,
        },
      );
      if (!response.ok) throw new Error(`object store text write failed: ${response.status}`);
    },
    async getText(input) {
      if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 1_048_576)
        throw new Error('object store text read limit is invalid');
      const expires = Math.floor(Date.now() / 1000) + 60;
      const canonical = ['GET', input.objectKey, input.maxBytes, expires].join('\n');
      const signature = sign(options.signingSecret, canonical);
      const response = await request(
        `${baseUrl}/v1/objects/${encodeURIComponent(input.objectKey)}?expires=${expires}&max_bytes=${input.maxBytes}&signature=${signature}`,
        { method: 'GET' },
      );
      if (!response.ok) throw new Error(`object store text read failed: ${response.status}`);
      const content = await response.text();
      if (Buffer.byteLength(content, 'utf8') > input.maxBytes)
        throw new Error('object store text exceeded read limit');
      const expectedHash = response.headers.get('x-content-sha256');
      if (!expectedHash || !/^[a-f0-9]{64}$/iu.test(expectedHash))
        throw new Error('object store text evidence is missing');
      // SHA-256 is intentionally recomputed without trusting the gateway's metadata.
      const contentHash = createHash('sha256').update(content).digest('hex');
      if (contentHash !== expectedHash.toLowerCase())
        throw new Error('object store text evidence mismatch');
      return content;
    },
  };
}
