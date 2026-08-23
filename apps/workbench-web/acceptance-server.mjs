import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./src/', import.meta.url));
const port = Number(process.env.PORT ?? 4174);
const types = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
};
const opportunity = {
  id: '25000000-0000-4000-8000-000000000007',
  ownerUserId: '25000000-0000-4000-8000-000000000002',
  legalSubjectName: '验收餐饮有限公司',
  status: 'QUALIFIED',
  firstContactAt: '2026-08-18T00:00:00.000Z',
  nextAction: '签发报价',
  protectionUntil: '2026-11-18T00:00:00.000Z',
  hasEvidence: true,
  checks: [],
  quotes: [],
  contracts: [],
  version: 2,
  updatedAt: '2026-08-19T00:00:00.000Z',
};
const renewalPreview = {
  id: '25000000-0000-4000-8000-000000000020',
  subscriptionId: '25000000-0000-4000-8000-000000000013',
  reportMonth: '2026-08-01',
  metricsSnapshot: { PAID_ORDERS: 12, AI_SESSIONS: 6 },
  issueSnapshot: [],
  recommendedPlanCode: 'STANDARD_898_MONTH',
  recommendationReason: 'CONTINUE_CURRENT_PLAN',
  status: 'READY',
  dueAt: '2026-09-19T00:00:00.000Z',
  generatedAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/api/v1/')) {
    if (request.headers.authorization !== 'Bearer local-browser-acceptance')
      return sendJson(response, 401, { code: 'INVALID_SESSION' });
    if (request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      console.log(`ACCEPTANCE_POST ${url.pathname} ${JSON.stringify(body)}`);
      return sendJson(response, 200, {
        id: body.previewId ?? body.changeId ?? body.contractId ?? opportunity.id,
        status: 'ACCEPTED',
        ...body,
      });
    }
    if (url.pathname === '/api/v1/sales/opportunities')
      return sendJson(response, 200, [opportunity]);
    if (url.pathname.startsWith('/api/v1/sales/opportunities/'))
      return sendJson(response, 200, opportunity);
    if (url.pathname === '/api/v1/subscription-lifecycle/renewal-previews')
      return sendJson(response, 200, [renewalPreview]);
    if (url.pathname.startsWith('/api/v1/subscription-lifecycle/renewal-previews/'))
      return sendJson(response, 200, renewalPreview);
    if (url.pathname === '/api/v1/subscription-lifecycle/changes')
      return sendJson(response, 200, []);
    return sendJson(response, 404, { code: 'NOT_FOUND' });
  }

  const requested = decodeURIComponent(url.pathname);
  const isLifeRoute = requested.startsWith('/life/');
  const candidate = normalize(join(root, requested));
  let file = isLifeRoute
    ? join(root, 'life.html')
    : candidate.startsWith(root)
      ? candidate
      : join(root, 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = isLifeRoute ? join(root, 'life.html') : join(root, 'index.html');
  }
  if (file.endsWith('index.html')) {
    const html = (await readFile(file, 'utf8')).replace(
      '<script type="module" src="/app.js"></script>',
      '<script>sessionStorage.setItem("lequbao.employee-session","local-browser-acceptance")</script><script type="module" src="/app.js"></script>',
    );
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    return response.end(html);
  }
  response.setHeader('content-type', types[extname(file)] ?? 'text/plain; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () =>
  console.log(`乐趣宝 browser acceptance: http://127.0.0.1:${port}/bao/page-031`),
);
