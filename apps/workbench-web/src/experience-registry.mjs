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
];

export async function loadWorkbenchPageExperience(page) {
  const group = experienceGroups.find((candidate) => candidate.pages.has(page));
  if (!group) return null;
  const module = await group.load();
  return (
    module.workbenchPageExperienceById?.get(page) ??
    module.workbenchIntakeExperienceById?.get(page) ??
    null
  );
}
