import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('乐趣宝 UniApp 架构', () => {
  it('用一份移动源码输出 H5 和微信小程序', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
    expect(pkg.scripts['build:h5']).toBe('uni build');
    expect(pkg.scripts['build:mp-weixin']).toContain('mp-weixin');
  });

  it('uses revocable employee sessions and authoritative mobile reads', async () => {
    const [session, app, surface, pages, workbench, merchants, orders, service] = await Promise.all(
      [
        'services/bao-session.js',
        'App.vue',
        'components/BaoSurface.vue',
        'pages.json',
        'pages/workbench/index.vue',
        'pages/merchants/index.vue',
        'pages/orders/index.vue',
        'pages/service/index.vue',
      ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
    );
    expect(session).toContain('/api/v1/auth/sessions/refresh');
    expect(session).toContain('/api/v1/auth/sessions/revoke');
    expect(workbench).toContain('/api/v1/operational-home/today');
    expect(merchants).toContain('/api/v1/merchant-operations/profile');
    expect(merchants).toContain('/api/v1/revenue-operations/summary');
    expect(orders).toContain('/api/v1/merchant-operations/orders?limit=30');
    expect(service).toContain('/api/v1/customer-service/conversations?status=HUMAN_QUEUED');
    expect(service).toContain('/actions/accept');
    expect(service).toContain('/actions/complete');
    expect(service).toContain('expectedVersion: task.version');
    expect(service).toContain('确认已完成实际处理');
    expect(service).toContain("'Idempotency-Key'");
    expect(`${workbench}${merchants}${orders}${service}`).not.toContain('¥12,680');
    expect(app).toContain('--bao-mobile-gradient-brand');
    expect(surface).toContain('class="mobile-top"');
    expect(workbench).toContain('class="m-agent"');
    expect(workbench).toContain('class="m-context"');
    expect(merchants).toContain('class="income-hero"');
    expect(JSON.parse(pages).tabBar.list.map((item) => item.text)).toEqual([
      '对话',
      '工作',
      '任务',
      '消息',
      '我的',
    ]);
    for (const item of JSON.parse(pages).tabBar.list) {
      expect(item.iconPath).toContain('static/v62-tabs/');
      expect(item.selectedIconPath).toContain('static/v62-tabs/');
    }
    for (const page of JSON.parse(pages).pages) expect(page.style.navigationStyle).toBe('custom');
  });
});
