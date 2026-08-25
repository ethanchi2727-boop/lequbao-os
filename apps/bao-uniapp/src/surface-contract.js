export const baoMobileSurfaceContract = Object.freeze({
  workbench: Object.freeze({ read: ['/api/v1/operational-home/today'] }),
  merchants: Object.freeze({
    read: [
      '/api/v1/merchant-operations/profile',
      '/api/v1/merchant-operations/stores',
      '/api/v1/revenue-operations/summary',
    ],
  }),
  orders: Object.freeze({
    read: ['/api/v1/merchant-operations/orders', '/api/v1/merchant-operations/refunds'],
  }),
  service: Object.freeze({
    read: ['/api/v1/customer-service/conversations', '/api/v1/customer-service-operations/tasks'],
    write: [
      '/api/v1/customer-service/conversations/{conversationId}/actions/accept',
      '/api/v1/customer-service-operations/tasks/{taskId}/actions/complete',
    ],
  }),
  me: Object.freeze({ read: ['/api/v1/context'] }),
});

export function mobileActionPolicy({ permission, resourceInScope, mfaRequired, mfaReady }) {
  if (!permission || !resourceInScope) return 'forbidden';
  if (mfaRequired && !mfaReady) return 'requires-mfa';
  return 'enabled';
}
