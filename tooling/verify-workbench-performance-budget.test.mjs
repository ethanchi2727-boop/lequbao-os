import { describe, expect, it } from 'vitest';
import {
  verifyWorkbenchPerformanceBudget,
  workbenchPerformanceBudgets,
} from './verify-workbench-performance-budget.mjs';

describe('乐趣宝 PC 初始路由资源预算', () => {
  it('原始生产资源保持在显式预算内', async () => {
    const report = await verifyWorkbenchPerformanceBudget();
    expect(report.sizes.javascript).toBeLessThanOrEqual(workbenchPerformanceBudgets.javascript);
    expect(report.sizes.css).toBeLessThanOrEqual(workbenchPerformanceBudgets.css);
    expect(report.sizes.html).toBeLessThanOrEqual(workbenchPerformanceBudgets.html);
    expect(report.initialRouteTotal).toBeLessThanOrEqual(
      workbenchPerformanceBudgets.initialRouteTotal,
    );
  });

  it('预算资产清单没有重复计数', async () => {
    const report = await verifyWorkbenchPerformanceBudget();
    const files = Object.values(report.assets).flat();
    expect(new Set(files).size).toBe(files.length);
  });
});
