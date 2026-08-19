const jsonHeaders = (token, idempotencyKey) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
});

export class ApiError extends Error {
  constructor(status, code) {
    super(code || `HTTP_${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || `HTTP_${status}`;
  }
}

export function createMerchantIntakeApi(options) {
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  const request = options.fetch ?? globalThis.fetch;
  const key = options.idempotencyKey ?? (() => crypto.randomUUID());

  const json = async (path, init = {}) => {
    const response = await request(`${baseUrl}${path}`, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, body.code);
    return body;
  };

  return {
    createSession(channel) {
      return json('/api/v1/merchant-intake/sessions', {
        method: 'POST',
        headers: jsonHeaders(options.token, key()),
        body: JSON.stringify({ channel }),
      });
    },
    getSession(sessionId) {
      return json(`/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}`, {
        headers: jsonHeaders(options.token),
      });
    },
    addMessage(sessionId, content, sourceMessageId = null) {
      return json(`/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        headers: jsonHeaders(options.token, key()),
        body: JSON.stringify({ content, sourceMessageId }),
      });
    },
    async upload(sessionId, file) {
      const allowedContentTypes = new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'audio/mpeg',
        'audio/wav',
        'audio/mp4',
        'audio/amr',
      ]);
      if (!allowedContentTypes.has(file.type) || file.size < 1)
        throw new ApiError(400, 'UNSUPPORTED_FILE_TYPE');
      const bytes = await file.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
      const ticket = await json(
        `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}/uploads`,
        {
          method: 'POST',
          headers: jsonHeaders(options.token, key()),
          body: JSON.stringify({
            assetType: file.type.startsWith('image/')
              ? 'IMAGE'
              : file.type.startsWith('audio/')
                ? 'AUDIO'
                : 'DOCUMENT',
            sha256,
            contentType: file.type,
            maxBytes: file.size,
          }),
        },
      );
      const uploadResponse = await request(ticket.uploadUrl, {
        method: 'PUT',
        headers: ticket.headers,
        body: bytes,
      });
      if (!uploadResponse.ok) throw new ApiError(uploadResponse.status, 'OBJECT_UPLOAD_FAILED');
      return json(
        `/api/v1/merchant-intake/uploads/${encodeURIComponent(ticket.id)}/actions/complete`,
        {
          method: 'POST',
          headers: jsonHeaders(options.token, key()),
          body: JSON.stringify({}),
        },
      );
    },
    confirm(sessionId, input) {
      return json(
        `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}/confirmations`,
        {
          method: 'POST',
          headers: jsonHeaders(options.token, key()),
          body: JSON.stringify(input),
        },
      );
    },
    commit(sessionId, expectedVersion) {
      return json(
        `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}/actions/commit`,
        {
          method: 'POST',
          headers: jsonHeaders(options.token, key()),
          body: JSON.stringify({ expectedVersion }),
        },
      );
    },
  };
}

export function createWorkbenchApi(options) {
  const baseUrl = options.baseUrl.replace(/\/$/u, '');
  const request = options.fetch ?? globalThis.fetch;
  const key = options.idempotencyKey ?? (() => crypto.randomUUID());
  return {
    async get(path) {
      if (!path.startsWith('/api/v1/')) throw new ApiError(400, 'UNSAFE_API_PATH');
      const response = await request(`${baseUrl}${path}`, {
        headers: jsonHeaders(options.token),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(response.status, body.code);
      return body;
    },
    async post(path, body) {
      if (!path.startsWith('/api/v1/')) throw new ApiError(400, 'UNSAFE_API_PATH');
      const response = await request(`${baseUrl}${path}`, {
        method: 'POST',
        headers: jsonHeaders(options.token, key()),
        body: JSON.stringify(body ?? {}),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(response.status, responseBody.code);
      return responseBody;
    },
  };
}
