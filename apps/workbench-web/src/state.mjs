export const allowedPages = new Set(['page-014', 'page-175', 'page-176', 'page-177', 'page-178']);

export function resolvePage(pathname) {
  const page = pathname.split('/').filter(Boolean).at(-1) ?? 'page-014';
  return allowedPages.has(page) ? page : 'page-014';
}

export function viewFor(page, requestedState = 'default') {
  const mobile = page !== 'page-014';
  const states = new Set(['default', 'loading', 'empty', 'error', 'denied', 'stopped', 'success']);
  return {
    page,
    mobile,
    state: states.has(requestedState) ? requestedState : 'default',
    title:
      page === 'page-176'
        ? '拍照与文件'
        : page === 'page-177'
          ? '语音补充'
          : page === 'page-178'
            ? '识别确认'
            : 'AI 对话建档',
  };
}

export function canCommit(fields) {
  return (
    fields.every((field) => field.risk !== 'HIGH' || field.status === 'CONFIRMED') &&
    !fields.some((field) => field.status === 'CONFLICT')
  );
}

export function statusCopy(state) {
  return {
    loading: ['正在恢复建档会话', '原材料和处理进度仍保存在服务端。'],
    empty: ['从一张营业执照开始', '也可以直接输入商户名称和经营地址。'],
    error: ['识别服务暂时不可用', '原材料已保留，可稍后重试，不需要重新上传。'],
    denied: ['当前身份没有建档权限', '切换到已授权的商务人员或商户管理员身份。'],
    stopped: ['当前组织已停用', '历史材料保持只读，请联系平台运营人员。'],
    success: ['资料已确认', '后续交付任务将在后台继续执行。'],
  }[state];
}
