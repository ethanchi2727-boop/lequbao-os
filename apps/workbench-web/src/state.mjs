import { workbenchPageById } from './page-contracts.mjs';

export const allowedPages = new Set(workbenchPageById.keys());

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
