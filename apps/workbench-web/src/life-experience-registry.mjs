const groups = [
  {
    pages: new Set([
      'page-198',
      'page-200',
      'page-201',
      'page-203',
      'page-204',
      'page-207',
      'page-209',
      'page-210',
      'page-211',
      'page-213',
    ]),
    load: () => import('./life-experiences-discovery.mjs'),
  },
];
export async function loadLifePageExperience(page) {
  const group = groups.find((item) => item.pages.has(page));
  if (!group) return null;
  const module = await group.load();
  return module.lifeDiscoveryExperienceById?.get(page) ?? null;
}
