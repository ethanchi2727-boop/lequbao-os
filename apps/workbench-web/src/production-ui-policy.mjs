export function resolveWorkbenchShell(demoMode) {
  if (demoMode)
    return {
      recentServices: ['拾味小馆 · 交付中', '叶子花店 · 资料待确认', '七月永久收益月结'],
      identityInitial: '周',
      identityLabel: '周子涵',
      identityScope: '南京西路 · 仅授权范围',
      status: '演示模式 · 非真实业务数据',
      backgroundTaskCount: 2,
    };
  return {
    recentServices: [],
    identityInitial: '•',
    identityLabel: '当前已登录成员',
    identityScope: '身份、租户与门店范围由服务端裁决',
    status: '服务端权威数据',
    backgroundTaskCount: null,
  };
}

export function resolveIntakeProjection({ demoMode, session, demoFields }) {
  const fields = session?.fields ?? (demoMode ? demoFields : []);
  const missingItems = session?.missingItems ?? [];
  const total = fields.length + missingItems.length;
  const completeness = session
    ? total
      ? Math.round((fields.length / total) * 100)
      : 100
    : demoMode
      ? 82
      : 0;
  const sourceCount = session
    ? new Set(fields.map((field) => field.sourceAssetId).filter(Boolean)).size
    : demoMode
      ? 4
      : 0;
  return { fields, missingItems, completeness, sourceCount };
}

export function resolveIntakeMutationMode({ demoMode, serviceAvailable, sessionAvailable }) {
  if (demoMode) return 'simulate';
  return serviceAvailable && sessionAvailable ? 'live' : 'blocked';
}
