<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeVoucherNav from '../../../components/LifeVoucherNav.vue';

const amount = ref('98.00');

const steps = Object.freeze([
  {
    key: 'order',
    title: '下单消费',
    desc: '购买本商品确认收货后即可开始获得代金券',
    bg: '#e6f3ea',
    fg: '#0b6b3d',
  },
  {
    key: 'phases',
    title: '分期发放',
    desc: '共50期发放完毕，每期金额不同，累计最高可获订单金额',
    bg: '#ffe9e6',
    fg: '#f03749',
  },
  {
    key: 'arrive',
    title: '确认到账',
    desc: '每期代金券在确认收货后自动到账，到账即可使用',
    bg: '#e3ecff',
    fg: '#1a6fc4',
  },
  {
    key: 'deduct',
    title: '抵扣使用',
    desc: '已到账的代金券可在下单时直接抵扣订单金额',
    bg: '#fff3df',
    fg: '#d48806',
  },
  {
    key: 'void',
    title: '失效规则',
    desc: '退款时代金券将按规则失效，已使用的从资金池扣回',
    bg: '#eee',
    fg: '#857c6d',
  },
]);

onLoad((query) => {
  const raw = Number(query?.amt);
  if (Number.isFinite(raw) && raw > 0) amount.value = raw.toFixed(2);
});
</script>

<template>
  <view class="voucher-rule">
    <scroll-view scroll-y class="scroll" enhanced :show-scrollbar="false">
      <LifeVoucherNav title="消费奖励说明" />

      <view class="vr-hero">
        <text class="vr-hero-amount">本商品最高可获 ¥{{ amount }} 元代金券</text>
        <text class="vr-hero-sub">与人民币1:1等值，下单可直接抵扣</text>
      </view>

      <view class="card">
        <view v-for="step in steps" :key="step.key" class="vr">
          <view class="vic" :style="{ background: step.bg, color: step.fg }">
            <view class="vic-dot" :style="{ borderColor: step.fg }"></view>
          </view>
          <view class="vr-copy">
            <text class="vr-title">{{ step.title }}</text>
            <text class="vr-desc">{{ step.desc }}</text>
          </view>
        </view>
      </view>

      <text class="vfootnote">代金券与人民币 1:1 等值 · 不可提现 · 可抵扣订单</text>
      <view class="vbottom-safe"></view>
    </scroll-view>
  </view>
</template>

<style scoped>
.voucher-rule {
  --bg: #f6f1e6;
  --card: #ffffff;
  --ink: #16130f;
  --mut: #857c6d;
  --line: rgba(22, 19, 15, 0.08);
  --shadow: 0 10px 26px rgba(22, 19, 15, 0.09);
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}
.scroll {
  height: 100vh;
  background: linear-gradient(180deg, #ffe4e0 0px, var(--bg) 430px);
  box-sizing: border-box;
}
.vr-hero {
  margin: 14px 14px 0;
  border-radius: 20px;
  padding: 22px 18px;
  background: linear-gradient(135deg, #fff1f0, #ffe4e0);
  border: 1px solid #ffd5cf;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
}
.vr-hero-amount {
  font-size: 17px;
  font-weight: 900;
  color: var(--ink);
}
.vr-hero-sub {
  font-size: 11px;
  font-weight: 700;
  color: var(--mut);
  margin-top: 6px;
}
.card {
  margin: 12px 14px 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
  padding: 4px 14px;
}
.vr {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 0;
  border-top: 1px solid var(--line);
}
.vr:first-child {
  border-top: none;
}
.vic {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  flex: none;
}
.vic-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2.2px solid;
  box-sizing: border-box;
}
.vr-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.vr-title {
  font-size: 13.5px;
  font-weight: 900;
}
.vr-desc {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--mut);
  margin-top: 2px;
  line-height: 1.45;
}
.vfootnote {
  display: block;
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--mut);
  margin-top: 18px;
}
.vbottom-safe {
  height: 26px;
}
</style>
