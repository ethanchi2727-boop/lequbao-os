import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const merchantFiles = [
  'apps/merchant-miniapp/src/generated/merchant-experiences-commerce.json',
  'apps/merchant-miniapp/src/generated/merchant-experiences-transactions.json',
  'apps/merchant-miniapp/src/generated/merchant-experiences-service.json',
];

const requiredMerchantIds = [
  267, 269, 270, 273, 274, 276, 277, 280, 282, 284, 285, 288, 289, 290, 291, 293, 294, 297, 298,
  299, 302, 304, 305, 307,
].map((id) => `PAGE-${id}`);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export async function verifyCrossSurfaceExperienceClosure(root) {
  const [completion, ...groups] = await Promise.all([
    readFile(join(root, 'docs/release/frontend-page-completion.json'), 'utf8').then(JSON.parse),
    ...merchantFiles.map((file) => readFile(join(root, file), 'utf8').then(JSON.parse)),
  ]);
  const experiences = groups.flat();
  const entries = completion.pages.filter((item) => item.product === '商家独立小程序模板实例');
  const byId = new Map(experiences.map((item) => [item.id, item]));
  const contractedRoutes = new Set(entries.map((item) => item.route));
  const checks = [
    ['merchant-experience-count', experiences.length === 24],
    ['merchant-required-page-set', requiredMerchantIds.every((id) => byId.has(id))],
    ['merchant-page-id-unique', byId.size === experiences.length],
    ['merchant-layout-unique', new Set(experiences.map((item) => item.layout)).size === 24],
    ['merchant-completion-count', entries.length === 24],
    ['merchant-contract-connected', entries.every((item) => item.contracted && item.connected)],
    ['merchant-designed-recorded', entries.every((item) => item.designed)],
    ['merchant-interactive-recorded', entries.every((item) => item.interactive)],
    ['merchant-acceptance-controlled', entries.every((item) => !item.accepted)],
    ['merchant-four-fact-architecture', experiences.every((item) => item.facts.length === 4)],
    ['merchant-dual-actions', experiences.every((item) => item.actions.length === 2)],
    [
      'merchant-action-targets-contracted',
      experiences.every((item) =>
        item.actions.every((action) => contractedRoutes.has(action.route)),
      ),
    ],
    [
      'merchant-guardrails-explicit',
      experiences.every((item) => /不|不能|不得|必须/u.test(item.guardrail)),
    ],
    ['checkout-server-reprice', byId.get('PAGE-282').guardrail.includes('重新报价')],
    ['payment-server-truth', byId.get('PAGE-284').guardrail.includes('服务端')],
    ['refund-no-duplicate', byId.get('PAGE-291').guardrail.includes('不得重复')],
    ['voucher-short-lived', byId.get('PAGE-293').guardrail.includes('短时')],
    ['ai-identity-disclosed', byId.get('PAGE-298').guardrail.includes('AI 不得冒充人工')],
    ['human-handoff-stops-ai', byId.get('PAGE-298').guardrail.includes('停止自动回复')],
    ['privacy-withdrawal-durable', byId.get('PAGE-307').guardrail.includes('不得继续推断')],
  ];
  const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
  assert(failures.length === 0, `Cross-surface experience closure failed: ${failures.join(', ')}`);
  return { checks: checks.map(([name]) => name), merchantPages: experiences.length };
}

const invokedPath = process.argv[1]
  ? fileURLToPath(new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`))
  : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const report = await verifyCrossSurfaceExperienceClosure(root);
  console.log(
    `Cross-surface experience closure passed: ${report.checks.length} checks, ${report.merchantPages} merchant pages.`,
  );
}
