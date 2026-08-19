import { describe, expect, it } from 'vitest';
import { UI_STATES, canRetry, cartSummary, paymentOutcome } from './experience-model.js';

describe('consumer mini-program state contract', () => {
  it('UI-002 exposes all eight frozen states and only failed states retry', () => {
    expect(UI_STATES).toEqual([
      '默认',
      '加载中',
      '空数据',
      '局部错误',
      '无权限',
      '停用',
      '成功',
      '可恢复失败',
    ]);
    expect(UI_STATES.filter(canRetry)).toEqual(['局部错误', '可恢复失败']);
  });

  it('keeps logistics and store-use groups explainable while totaling exact cents', () => {
    expect(
      cartSummary([
        { kind: 'DELIVERY', items: [{ priceCents: 1290, quantity: 2 }] },
        { kind: 'STORE_USE', items: [{ priceCents: 3980, quantity: 1 }] },
      ]),
    ).toEqual({ itemCount: 3, payableCents: 6560 });
  });

  it('never treats the provider client result as payment success', () => {
    expect(
      paymentOutcome({ providerAccepted: true, serverPaymentStatus: 'PROCESSING' }).state,
    ).toBe('加载中');
    expect(paymentOutcome({ providerAccepted: true, serverPaymentStatus: 'SUCCEEDED' }).state).toBe(
      '成功',
    );
  });
});
