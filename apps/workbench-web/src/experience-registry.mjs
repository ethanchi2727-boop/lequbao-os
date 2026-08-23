const experienceGroups = [
  {
    pages: new Set([
      'page-003',
      'page-004',
      'page-005',
      'page-006',
      'page-007',
      'page-009',
      'page-010',
      'page-011',
      'page-012',
    ]),
    load: () => import('./page-experiences.mjs'),
  },
  {
    pages: new Set([
      'page-015',
      'page-016',
      'page-017',
      'page-018',
      'page-019',
      'page-020',
      'page-021',
      'page-024',
    ]),
    load: () => import('./page-experiences-intake.mjs'),
  },
  {
    pages: new Set([
      'page-026',
      'page-027',
      'page-028',
      'page-030',
      'page-031',
      'page-033',
      'page-034',
      'page-035',
    ]),
    load: () => import('./page-experiences-sales.mjs'),
  },
  {
    pages: new Set(['page-037', 'page-038', 'page-039', 'page-040']),
    load: () => import('./page-experiences-revenue.mjs'),
  },
  {
    pages: new Set([
      'page-041',
      'page-042',
      'page-043',
      'page-045',
      'page-046',
      'page-049',
      'page-050',
      'page-052',
      'page-053',
      'page-054',
    ]),
    load: () => import('./page-experiences-delivery.mjs'),
  },
  {
    pages: new Set([
      'page-055',
      'page-057',
      'page-058',
      'page-059',
      'page-060',
      'page-061',
      'page-062',
      'page-063',
      'page-064',
      'page-065',
    ]),
    load: () => import('./page-experiences-miniapp.mjs'),
  },
  {
    pages: new Set([
      'page-066',
      'page-068',
      'page-069',
      'page-070',
      'page-072',
      'page-073',
      'page-075',
      'page-076',
      'page-079',
      'page-081',
    ]),
    load: () => import('./page-experiences-operations.mjs'),
  },
  {
    pages: new Set([
      'page-082',
      'page-083',
      'page-084',
      'page-086',
      'page-087',
      'page-088',
      'page-090',
      'page-091',
      'page-092',
      'page-093',
    ]),
    load: () => import('./page-experiences-commerce.mjs'),
  },
  {
    pages: new Set([
      'page-094',
      'page-095',
      'page-096',
      'page-099',
      'page-100',
      'page-101',
      'page-102',
      'page-103',
      'page-105',
      'page-106',
    ]),
    load: () => import('./page-experiences-service.mjs'),
  },
  {
    pages: new Set([
      'page-107',
      'page-109',
      'page-110',
      'page-112',
      'page-113',
      'page-116',
      'page-118',
      'page-119',
      'page-122',
      'page-124',
    ]),
    load: () => import('./page-experiences-engagement.mjs'),
  },
  {
    pages: new Set([
      'page-125',
      'page-126',
      'page-129',
      'page-130',
      'page-132',
      'page-134',
      'page-137',
      'page-138',
      'page-140',
      'page-141',
    ]),
    load: () => import('./page-experiences-controls.mjs'),
  },
];

export async function loadWorkbenchPageExperience(page) {
  const group = experienceGroups.find((candidate) => candidate.pages.has(page));
  if (!group) return null;
  const module = await group.load();
  return (
    module.workbenchPageExperienceById?.get(page) ??
    module.workbenchIntakeExperienceById?.get(page) ??
    module.workbenchSalesExperienceById?.get(page) ??
    module.workbenchRevenueExperienceById?.get(page) ??
    module.workbenchDeliveryExperienceById?.get(page) ??
    module.workbenchMiniappExperienceById?.get(page) ??
    module.workbenchOperationsExperienceById?.get(page) ??
    module.workbenchCommerceExperienceById?.get(page) ??
    module.workbenchServiceExperienceById?.get(page) ??
    module.workbenchEngagementExperienceById?.get(page) ??
    module.workbenchControlExperienceById?.get(page) ??
    null
  );
}
