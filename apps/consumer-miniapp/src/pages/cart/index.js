const { commerceApi } = require('../../lib/api.js');

function presentCart(cart) {
  const groups = cart.groups || [];
  const totalCents = groups.reduce((total, group) => total + group.subtotalCents, 0);
  return {
    ...cart,
    groups,
    totalPrice: (totalCents / 100).toFixed(2),
    hasUnavailable: groups.some((group) => group.items.some((item) => !item.available)),
  };
}

Page({
  data: { state: '加载中', cart: null, addresses: [], quoteKey: null },
  onShow() {
    this.loadCart();
  },
  async loadCart() {
    this.setData({ state: '加载中' });
    try {
      const [rawCart, addresses] = await Promise.all([
        commerceApi.getCart(),
        commerceApi.listAddresses(),
      ]);
      const cart = presentCart(rawCart);
      this.setData({ cart, addresses, state: cart.itemCount ? '默认' : '空数据' });
    } catch {
      this.setData({ cart: null, state: '可恢复失败' });
    }
  },
  async changeQuantity(event) {
    const { merchantTenantId, storeId, variantId, quantity, delta } = event.currentTarget.dataset;
    const nextQuantity = Number(quantity) + Number(delta);
    if (nextQuantity < 1) return;
    this.setData({ state: '加载中' });
    try {
      const cart = presentCart(
        await commerceApi.setCartItem({
          merchantTenantId,
          storeId,
          variantId,
          quantity: nextQuantity,
        }),
      );
      this.setData({ cart, state: cart.itemCount ? '默认' : '空数据' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async removeItem(event) {
    this.setData({ state: '加载中' });
    try {
      const cart = presentCart(
        await commerceApi.removeCartItem(event.currentTarget.dataset.itemId),
      );
      this.setData({ cart, state: cart.itemCount ? '默认' : '空数据' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
  async beginCheckout() {
    if (!this.data.cart?.itemCount || this.data.cart.hasUnavailable) return;
    const quoteKey =
      this.data.quoteKey ||
      `life-quote-${this.data.cart.id}-${this.data.cart.version}-${Date.now()}`;
    this.setData({ state: '加载中', quoteKey });
    try {
      const checkout = await commerceApi.quoteCheckout(
        {
          cartVersion: this.data.cart.version,
          fulfillmentChoices: this.data.cart.groups.flatMap((group) => {
            const productTypes = [...new Set(group.items.map((item) => item.productType))];
            const address =
              this.data.addresses.find((item) => item.isDefault) || this.data.addresses[0];
            return productTypes.map((productType) => ({
              merchantTenantId: group.merchantTenantId,
              storeId: group.storeId,
              productType,
              orderType:
                productType === 'PHYSICAL'
                  ? address
                    ? 'PHYSICAL_DELIVERY'
                    : 'STORE_PICKUP'
                  : productType === 'GROUP_BUY'
                    ? 'GROUP_BUY'
                    : 'SERVICE_APPOINTMENT',
              ...(productType === 'PHYSICAL' && address ? { addressId: address.id } : {}),
            }));
          }),
        },
        quoteKey,
      );
      wx.navigateTo({
        url: `/pages/route/index?route=%2Flife%2Fpage-229&checkoutId=${encodeURIComponent(checkout.id)}`,
      });
      this.setData({ state: '默认' });
    } catch {
      this.setData({ state: '可恢复失败' });
    }
  },
});
