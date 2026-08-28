const experience = {
  page: 'page-195',
  layout: 'mobile-identity-permissions',
  kicker: '我的 · 身份与权限',
  headline: '查看当前身份、租户、门店范围、角色能力和安全状态',
  description: '所有范围由服务端裁决，移动端不能切换到未授权租户或门店。',
  panels: [
    ['当前身份', '展示员工、租户、角色、登录方式和会话状态'],
    ['门店范围', '展示可见门店、临时范围、到期和不可用原因'],
    ['权限摘要', '展示可查看、可处理、需 二次验证 和明确禁止的动作'],
    ['安全与会话', '展示 二次验证、设备、最近活动、临时支持和退出入口'],
  ],
  actions: [
    ['返回今日待办', 'page-173'],
    ['查看内部通知', 'page-193'],
  ],
  guardrail: '客户端不得自行扩展租户、门店或角色范围，停用身份必须立即失效。',
};
export const workbenchIdentityExperiences = Object.freeze([experience]);
export const workbenchIdentityExperienceById = new Map([[experience.page, experience]]);
