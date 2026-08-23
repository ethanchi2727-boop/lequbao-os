import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const assets = Object.freeze({
  javascript: [
    'app.js',
    'state.mjs',
    'api-client.js',
    'live-page-registry.mjs',
    'page-contracts.mjs',
    'production-ui-policy.mjs',
    'experience-registry.mjs',
  ],
  css: ['styles.css', 'product-tokens.css'],
  html: ['index.html'],
});

const routeExperienceGroups = Object.freeze([
  'page-experiences.mjs',
  'page-experiences-intake.mjs',
  'page-experiences-sales.mjs',
  'page-experiences-revenue.mjs',
  'page-experiences-delivery.mjs',
  'page-experiences-miniapp.mjs',
  'page-experiences-operations.mjs',
  'page-experiences-commerce.mjs',
  'page-experiences-service.mjs',
]);

export const workbenchPerformanceBudgets = Object.freeze({
  javascript: 230 * 1024,
  css: 32 * 1024,
  html: 2 * 1024,
  initialRouteTotal: 265 * 1024,
});

export async function verifyWorkbenchPerformanceBudget() {
  const sizes = {};
  for (const [kind, files] of Object.entries(assets)) {
    sizes[kind] = 0;
    for (const file of files) {
      const fileStat = await stat(new URL(`../apps/workbench-web/src/${file}`, import.meta.url));
      sizes[kind] += fileStat.size;
    }
    if (sizes[kind] > workbenchPerformanceBudgets[kind])
      throw new Error(
        `Workbench ${kind} budget exceeded: ${sizes[kind]} > ${workbenchPerformanceBudgets[kind]}`,
      );
  }
  const routeGroupSizes = {};
  for (const file of routeExperienceGroups) {
    const fileStat = await stat(new URL(`../apps/workbench-web/src/${file}`, import.meta.url));
    routeGroupSizes[file] = fileStat.size;
  }
  sizes.javascript += Math.max(...Object.values(routeGroupSizes));
  const initialRouteTotal = Object.values(sizes).reduce((total, size) => total + size, 0);
  if (initialRouteTotal > workbenchPerformanceBudgets.initialRouteTotal)
    throw new Error(
      `Workbench initial route budget exceeded: ${initialRouteTotal} > ${workbenchPerformanceBudgets.initialRouteTotal}`,
    );
  return {
    assets,
    routeGroupSizes,
    sizes,
    initialRouteTotal,
    budgets: workbenchPerformanceBudgets,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const report = await verifyWorkbenchPerformanceBudget();
  console.log(
    `Workbench performance budget passed: JS ${report.sizes.javascript} B, CSS ${report.sizes.css} B, HTML ${report.sizes.html} B, total ${report.initialRouteTotal} B.`,
  );
}
