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
  {
    pages: new Set([
      'page-216',
      'page-218',
      'page-219',
      'page-221',
      'page-224',
      'page-227',
      'page-228',
      'page-229',
      'page-231',
      'page-232',
    ]),
    load: () => import('./life-experiences-checkout.mjs'),
  },
];
export async function loadLifePageExperience(page) {
  const group = groups.find((item) => item.pages.has(page));
  if (!group) return null;
  const module = await group.load();
  return (
    module.lifeDiscoveryExperienceById?.get(page) ??
    module.lifeCheckoutExperienceById?.get(page) ??
    null
  );
}
