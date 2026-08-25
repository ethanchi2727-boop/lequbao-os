import { describe, expect, it } from 'vitest';
import { loadWorkbenchPageExperience } from './experience-registry.mjs';
import { workbenchPageContracts } from './page-contracts.mjs';
import { renderBaoV62ExperiencePage } from './bao-v62-experience-page.mjs';

const specialized = new Set([
  'page-003',
  'page-004',
  'page-005',
  'page-006',
  'page-007',
  'page-009',
  'page-010',
  'page-011',
  'page-012',
  'page-014',
  'page-015',
  'page-016',
  'page-017',
  'page-018',
  'page-019',
  'page-175',
  'page-176',
  'page-177',
  'page-178',
]);

const escapeHtml = (value) => String(value).replaceAll('<', '&lt;');
const icon = (name) => `<svg data-icon="${name}"></svg>`;

describe('乐趣宝 V6.2 全量生产页面族', () => {
  it('为此前未设计的 116 个叶子页渲染正式共享布局', async () => {
    const targets = workbenchPageContracts.filter((page) => !specialized.has(page.id));
    expect(targets).toHaveLength(116);
    for (const contract of targets) {
      const experience = await loadWorkbenchPageExperience(contract.id);
      expect(experience, contract.id).toBeTruthy();
      const html = renderBaoV62ExperiencePage({
        experience,
        contract,
        liveData: null,
        liveRequestKind: null,
        demoMode: false,
        state: 'default',
        escapeHtml,
        icon,
        renderLiveData: () => '',
      });
      expect(html, contract.id).toContain(`data-page-id="${contract.id}"`);
      expect(html, contract.id).toContain('class="v62-page ');
      expect(html, contract.id).toContain('权威数据模式');
      expect(html, contract.id).toContain('服务端权限最终裁决');
      expect(html, contract.id).not.toContain('generic-page');
      expect(html, contract.id).not.toContain('dedicated-page');
    }
  });

  it.each([
    ['page-019', 5],
    ['page-020', 6],
    ['page-039', 5],
    ['page-040', 6],
    ['page-064', 5],
    ['page-065', 6],
    ['page-092', 5],
    ['page-093', 6],
    ['page-101', 5],
    ['page-102', 6],
    ['page-158', 5],
  ])('保留深层任务 %s 的 %i 级视觉控制', async (page, level) => {
    const contract = workbenchPageContracts.find((candidate) => candidate.id === page);
    const experience = await loadWorkbenchPageExperience(page);
    const html = renderBaoV62ExperiencePage({
      experience,
      contract,
      liveData: null,
      liveRequestKind: null,
      demoMode: false,
      state: 'default',
      escapeHtml,
      icon,
      renderLiveData: () => '',
    });
    expect(html).toContain(`data-level="${level}"`);
    expect(html).toContain('深层任务控制');
  });

  it('生产空态不渲染演示业务记录，真实数据仍交给权威渲染器', async () => {
    const contract = workbenchPageContracts.find((page) => page.id === 'page-026');
    const experience = await loadWorkbenchPageExperience(contract.id);
    const emptyHtml = renderBaoV62ExperiencePage({
      experience,
      contract,
      liveData: null,
      liveRequestKind: null,
      demoMode: false,
      state: 'default',
      escapeHtml,
      icon,
      renderLiveData: () => '',
    });
    expect(emptyHtml).toContain('等待权威业务数据');
    expect(emptyHtml).not.toContain('¥43,736');
    expect(emptyHtml).not.toContain('共 52 家');
    expect(emptyHtml).not.toContain('演示结构');

    const liveHtml = renderBaoV62ExperiencePage({
      experience,
      contract,
      liveData: [{ id: 'authoritative' }],
      liveRequestKind: 'sales-opportunities',
      demoMode: false,
      state: 'default',
      escapeHtml,
      icon,
      renderLiveData: (_data, kind) => `<div data-authority="${kind}">真实记录</div>`,
    });
    expect(liveHtml).toContain('data-authority="sales-opportunities"');
    expect(liveHtml).toContain('真实记录');
  });
});
