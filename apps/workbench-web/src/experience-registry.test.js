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
    await expect(loadWorkbenchPageExperience('page-066')).resolves.toMatchObject({
      layout: 'version-rollback',
    });
    await expect(loadWorkbenchPageExperience('page-081')).resolves.toMatchObject({
      layout: 'merchant-data-conversation',
    });
    await expect(loadWorkbenchPageExperience('page-082')).resolves.toMatchObject({
      layout: 'ai-organized-record',
    });
    await expect(loadWorkbenchPageExperience('page-093')).resolves.toMatchObject({
      layout: 'partial-refund-detail',
    });
    await expect(loadWorkbenchPageExperience('page-094')).resolves.toMatchObject({
      layout: 'redemption-workbench',
    });
    await expect(loadWorkbenchPageExperience('page-106')).resolves.toMatchObject({
      layout: 'continuous-customer-profile',
    });
    await expect(loadWorkbenchPageExperience('page-107')).resolves.toMatchObject({
      layout: 'customer-segments-tasks',
    });
    await expect(loadWorkbenchPageExperience('page-124')).resolves.toMatchObject({
      layout: 'sales-redemption-analytics',
    });
    await expect(loadWorkbenchPageExperience('page-125')).resolves.toMatchObject({
      layout: 'service-conversion-analytics',
    });
    await expect(loadWorkbenchPageExperience('page-141')).resolves.toMatchObject({
      layout: 'tenant-audit-log',
    });
    await expect(loadWorkbenchPageExperience('page-143')).resolves.toMatchObject({
      layout: 'data-export-deletion',
    });
    await expect(loadWorkbenchPageExperience('page-157')).resolves.toMatchObject({
      layout: 'monthly-close-batches',
    });
    await expect(loadWorkbenchPageExperience('page-158')).resolves.toMatchObject({
      layout: 'settlement-difference-resolution',
    });
    await expect(loadWorkbenchPageExperience('page-173')).resolves.toMatchObject({
      layout: 'mobile-today-tasks',
    });
    await expect(loadWorkbenchPageExperience('page-180')).resolves.toMatchObject({
      layout: 'mobile-delivery-progress',
    });
    await expect(loadWorkbenchPageExperience('page-193')).resolves.toMatchObject({
      layout: 'mobile-internal-notifications',
    });
    await expect(loadWorkbenchPageExperience('page-195')).resolves.toMatchObject({
      layout: 'mobile-identity-permissions',
    });
    await expect(loadWorkbenchPageExperience('page-198')).resolves.toBeNull();
  }, 15_000);
});
