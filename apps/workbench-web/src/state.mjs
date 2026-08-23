import { workbenchPageById } from './page-contracts.mjs';

export const allowedPages = new Set(workbenchPageById.keys());

const primaryNavigationStarts = Object.freeze([
  ['page-137', 137],
  ['page-129', 129],
  ['page-126', 126],
  ['page-100', 100],
  ['page-079', 79],
  ['page-053', 53],
  ['page-026', 26],
  ['page-003', 0],
]);

const mobileNavigationPages = new Set(['page-003', 'page-026', 'page-004', 'page-009', 'page-012']);

export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character],
  );

export function resolvePage(pathname) {
  const page = pathname.split('/').filter(Boolean).at(-1) ?? 'page-014';
  return allowedPages.has(page) ? page : 'page-014';
}

export function viewFor(page, requestedState = 'default') {
  const contract = workbenchPageById.get(page) ?? workbenchPageById.get('page-014');
  const mobile = ['page-175', 'page-176', 'page-177', 'page-178'].includes(page);
  const aliases = { error: 'recoverable-failure' };
  const normalizedState = aliases[requestedState] ?? requestedState;
  const states = new Set([
    'default',
    'loading',
    'empty',
    'partial-error',
    'denied',
    'stopped',
    'success',
    'recoverable-failure',
  ]);
  return {
    page,
    contract,
    mobile,
    state: states.has(normalizedState) ? normalizedState : 'default',
    title:
      page === 'page-176'
        ? '拍照与文件'
        : page === 'page-177'
          ? '语音补充'
          : page === 'page-178'
            ? '识别确认'
            : (contract?.title ?? 'AI 对话建档'),
  };
}

export function primaryNavigationPage(page) {
  const pageNumber = Number.parseInt(page.replace('page-', ''), 10);
  if (pageNumber >= 175) return 'page-003';
  return primaryNavigationStarts.find(([, start]) => pageNumber >= start)?.[0] ?? 'page-003';
}

export function mobileNavigationPage(page) {
  return mobileNavigationPages.has(page) ? page : 'page-003';
}

export function statusAnnouncement(state) {
  const urgentStates = new Set(['partial-error', 'denied', 'stopped', 'recoverable-failure']);
  return urgentStates.has(state)
    ? { role: 'alert', live: 'assertive' }
    : { role: 'status', live: 'polite' };
}

export function searchWorkbenchPages(query, limit = 8) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalizedQuery) return [];
  return [...workbenchPageById.values()]
    .filter((page) =>
      [page.id, page.title, page.purpose, page.primaryRole]
        .join(' ')
        .toLocaleLowerCase('zh-CN')
        .includes(normalizedQuery),
    )
    .slice(0, limit)
    .map(({ id, title, purpose }) => ({ id, title, purpose }));
}

export function nextSearchResultIndex(currentIndex, resultCount, key) {
  if (resultCount <= 0) return -1;
  if (key === 'ArrowDown') return currentIndex < 0 ? 0 : (currentIndex + 1) % resultCount;
  if (key === 'ArrowUp')
    return currentIndex < 0 ? resultCount - 1 : (currentIndex - 1 + resultCount) % resultCount;
  return currentIndex;
}

const resultTabs = Object.freeze(['task', 'result', 'source']);

export function nextResultTab(currentTab, key) {
  const currentIndex = Math.max(0, resultTabs.indexOf(currentTab));
  if (key === 'Home') return resultTabs[0];
  if (key === 'End') return resultTabs.at(-1);
  if (key === 'ArrowRight') return resultTabs[(currentIndex + 1) % resultTabs.length];
  if (key === 'ArrowLeft')
    return resultTabs[(currentIndex - 1 + resultTabs.length) % resultTabs.length];
  return currentTab;
}

export function parseCommandInput(input, rawValue) {
  const value = rawValue.trim();
  if (!value)
    return input.required
      ? { ok: false, message: `请填写${input.label}` }
      : { ok: true, empty: true };
  if (input.type === 'number') {
    const number = Number(value);
    return Number.isSafeInteger(number)
      ? { ok: true, value: number }
      : { ok: false, message: `${input.label}必须是整数` };
  }
  if (input.type === 'datetime-local') {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? { ok: false, message: `请选择有效的${input.label}` }
      : { ok: true, value: date.toISOString() };
  }
  if (input.type === 'csv') {
    const values = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length
      ? { ok: true, value: values }
      : { ok: false, message: `${input.label}至少需要一项` };
  }
  if (input.type === 'json') {
    try {
      const object = JSON.parse(value);
      return object && !Array.isArray(object) && typeof object === 'object'
        ? { ok: true, value: object }
        : { ok: false, message: `${input.label}必须是 JSON 对象` };
    } catch {
      return { ok: false, message: `${input.label}不是有效的 JSON` };
    }
  }
  return { ok: true, value };
}

export function truncateLiveRecords(data, limit = 50) {
  const records = Array.isArray(data) ? data : [data];
  return {
    records: records.slice(0, limit),
    total: records.length,
    truncated: records.length > limit,
  };
}

export function canCommit(fields) {
  return (
    fields.every((field) => field.risk !== 'HIGH' || field.status === 'CONFIRMED') &&
    !fields.some((field) => field.status === 'CONFLICT')
  );
}

export function statusCopy(state, context = 'intake') {
  const generic = {
    loading: ['正在加载页面', '正在读取当前身份、租户范围和最新业务状态。'],
    empty: ['暂无可显示内容', '完成前置步骤、调整筛选或稍后刷新。'],
    'partial-error': ['部分内容暂时不可用', '已加载内容仍可查看；失败区域可以单独重试。'],
    denied: ['当前身份无权访问', '切换到获授权身份或向管理员申请最小必要权限。'],
    stopped: ['当前服务已停用', '历史数据保持只读，并显示续费、申诉或联系入口。'],
    success: ['操作已经完成', '结果、操作者、时间和追踪号已保存。'],
    'recoverable-failure': ['操作没有完成', '已提交内容和安全断点仍在，可修正后继续。'],
  };
  if (context === 'generic') return generic[state];
  return {
    loading: ['正在恢复建档会话', '原材料和处理进度仍保存在服务端。'],
    empty: ['从一张营业执照开始', '也可以直接输入商户名称和经营地址。'],
    'partial-error': generic['partial-error'],
    denied: ['当前身份没有建档权限', '切换到已授权的商务人员或商户管理员身份。'],
    stopped: ['当前组织已停用', '历史材料保持只读，请联系平台运营人员。'],
    success: ['资料已确认', '后续交付任务将在后台继续执行。'],
    'recoverable-failure': generic['recoverable-failure'],
  }[state];
}

export function updateResultPanel(panel, action, tab) {
  if (action === 'open') return { ...panel, open: true };
  if (action === 'close') return { ...panel, open: false };
  if (action === 'tab' && ['task', 'result', 'source'].includes(tab)) return { open: true, tab };
  return panel;
}

export function resultPanelFromStorage(value) {
  try {
    const parsed = JSON.parse(value ?? 'null');
    if (
      parsed &&
      typeof parsed.open === 'boolean' &&
      ['task', 'result', 'source'].includes(parsed.tab)
    )
      return { open: parsed.open, tab: parsed.tab };
  } catch {
    // Invalid browser UI preferences must fail back to the product default.
  }
  return { open: true, tab: 'result' };
}
