import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';

const baseUrl = process.env.LEQU_PREVIEW_SMOKE_URL ?? 'http://127.0.0.1:8080';
const previewHost = process.env.LEQU_PREVIEW_SMOKE_HOST ?? 'bao.lequ.com';
const hostHeaders = { host: previewHost };

function request(path, init = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      new URL(path, baseUrl),
      {
        method: init.method ?? 'GET',
        headers: { ...hostHeaders, ...init.headers },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            headers: { get: (name) => response.headers[name.toLowerCase()] ?? null },
            text: async () => body,
            json: async () => JSON.parse(body),
          });
        });
      },
    );
    request.on('error', reject);
    if (init.body) request.write(init.body);
    request.end();
  });
}

async function json(path, init = {}) {
  const response = await request(path, init);
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
  return { response, body: await response.json() };
}

const login = await request('/__development/login');
assert.equal(login.ok, true, `preview login returned HTTP ${login.status}`);
assert.equal(login.headers.get('x-lequ-data-source'), 'development-mock');
const html = await login.text();
const encodedToken = html.match(
  /sessionStorage\.setItem\('lequbao\.employee-session',\s*("(?:[^"\\]|\\.)*")\)/u,
)?.[1];
assert.ok(encodedToken, 'preview login did not emit a browser-local employee session');
const accessToken = JSON.parse(encodedToken);
const employeeHeaders = {
  authorization: `Bearer ${accessToken}`,
  'content-type': 'application/json',
};

const context = await json('/api/v1/context', { headers: employeeHeaders });
assert.ok(context.body.roleCodes.includes('MERCHANT_OWNER'));

const intake = await json('/api/v1/merchant-intake/sessions', {
  method: 'POST',
  headers: { ...employeeHeaders, 'idempotency-key': 'preview-stack-intake-v1' },
  body: JSON.stringify({ channel: 'WEB' }),
});
assert.equal(intake.response.status, 201);
assert.equal(intake.body.status, 'COLLECTING');

const message = await json(
  `/api/v1/merchant-intake/sessions/${encodeURIComponent(intake.body.id)}/messages`,
  {
    method: 'POST',
    headers: { ...employeeHeaders, 'idempotency-key': 'preview-stack-intake-message-v1' },
    body: JSON.stringify({
      content: '预览栈 PC 建档烟测：门店营业时间为每天十点到二十二点。',
      sourceMessageId: 'preview-stack-message-v1',
    }),
  },
);
assert.equal(message.response.status, 202);
assert.equal(message.body.sessionId, intake.body.id);
assert.equal(message.body.processingStatus, 'QUEUED');

console.log('Preview stack PC intake smoke passed through the same-origin deployment topology.');
