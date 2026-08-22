import assert from 'node:assert/strict';

const tenantId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const storeId = '10000000-0000-4000-8000-000000000003';

async function json(url, init) {
  const response = await fetch(url, init);
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}`);
  return { response, body: await response.json() };
}

const mock = await json('http://127.0.0.1:3399/health');
assert.equal(mock.response.headers.get('x-lequ-data-source'), 'development-mock');
assert.deepEqual(mock.body, { status: 'ok', dataSource: 'development-mock' });

const ready = await json('http://127.0.0.1:3000/ready');
assert.equal(ready.body.status, 'ready');

const login = await fetch('http://127.0.0.1:4173/__development/login');
assert.equal(login.ok, true, `development login returned HTTP ${login.status}`);
assert.equal(login.headers.get('x-lequ-data-source'), 'development-mock');
const html = await login.text();
const encodedToken = html.match(
  /sessionStorage\.setItem\('lequbao\.employee-session',\s*("(?:[^"\\]|\\.)*")\)/u,
)?.[1];
assert.ok(encodedToken, 'development login did not emit a browser-local session token');
const accessToken = JSON.parse(encodedToken);

const context = await json('http://127.0.0.1:4173/api/v1/context', {
  headers: { authorization: `Bearer ${accessToken}` },
});
assert.equal(context.body.tenantId, tenantId);
assert.equal(context.body.userId, userId);
assert.deepEqual(context.body.storeIds, [storeId]);
assert.equal(context.body.roleCodes.length, 12);
assert.ok(context.body.roleCodes.includes('MERCHANT_OWNER'));
assert.ok(context.body.roleCodes.includes('PLATFORM_FINANCE'));

const page = await fetch('http://127.0.0.1:4173/bao/page-014');
assert.equal(page.ok, true, `Workbench page returned HTTP ${page.status}`);
assert.match(await page.text(), /<div id="app"><\/div>/u);

console.log(
  'Development stack smoke passed with PostgreSQL-backed identity and same-origin API proxy.',
);
