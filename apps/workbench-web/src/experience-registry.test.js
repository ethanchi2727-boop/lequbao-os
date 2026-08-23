import { describe, expect, it } from 'vitest';
import { loadWorkbenchPageExperience } from './experience-registry.mjs';

describe('乐趣宝专属页面按需加载', () => {
  it('只为已产品化页面加载体验模块', async () => {
    await expect(loadWorkbenchPageExperience('page-003')).resolves.toMatchObject({
      layout: 'conversation-start',
    });
    await expect(loadWorkbenchPageExperience('page-016')).resolves.toMatchObject({
      layout: 'recognition-review',
    });
    await expect(loadWorkbenchPageExperience('page-026')).resolves.toMatchObject({
      layout: 'opportunity-list',
    });
    await expect(loadWorkbenchPageExperience('page-039')).resolves.toMatchObject({
      layout: 'direct-costs',
    });
    await expect(loadWorkbenchPageExperience('page-053')).resolves.toMatchObject({
      layout: 'delivery-detail',
    });
    await expect(loadWorkbenchPageExperience('page-063')).resolves.toMatchObject({
      layout: 'review-release',
    });
    await expect(loadWorkbenchPageExperience('page-066')).resolves.toBeNull();
  });
});
