import { describe, expect, it } from 'vitest';
import { UI_STATES, aiDisclosure, paymentPresentation, refundAction } from './journey.js';

describe('merchant template journeys', () => {
  it('UI-002 carries all eight states', () => expect(UI_STATES).toHaveLength(8));
  it('discloses AI identity and blocks order query until identity is bound', () => {
    expect(aiDisclosure({ identityBound: false, requestedHuman: false })).toMatchObject({
      label: 'AI 店员',
      mayQueryOrder: false,
    });
    expect(aiDisclosure({ identityBound: true, requestedHuman: true }).route).toBe('HUMAN_QUEUE');
  });
  it('uses server payment truth and does not duplicate pending aftercare', () => {
    expect(paymentPresentation(true, 'PROCESSING')).toBe('加载中');
    expect(refundAction('PROCESSING')).toBe('查看进度');
    expect(refundAction('FAILED')).toBe('安全重试');
  });
});
