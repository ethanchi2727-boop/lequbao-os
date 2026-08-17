import { createHmac } from 'node:crypto';

export interface UploadAuthorization {
  uploadUrl: string;
  headers: Record<string, string>;
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
  stat(objectKey: string): Promise<StoredObjectEvidence>;
  putText(input: { objectKey: string; content: string; sha256: string }): Promise<void>;
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
  };
}
