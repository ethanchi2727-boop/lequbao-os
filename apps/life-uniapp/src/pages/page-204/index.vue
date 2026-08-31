<template>
<svg width="0" height="0" style="position:absolute"><defs>
<g id="cap-more"><circle cx="4.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19.5" cy="12" r="1.7"/></g>
<g id="cap-target"><circle cx="12" cy="12" r="6.4" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="2.4"/></g>
</defs></svg>
<view class="phone" :data-theme="isDark?'dark':''" style="--hd1:#009146;--hd2:#006b36;--bg:#f6f1e6" ref="phoneEl">
  <view class="scroll" style="--tint:#ffe9c2">
    <view class="statusbar"><text>9:41</text>
      <text style="display:flex;gap:5px;align-items:center">
        <svg width="16" height="11" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
        <svg width="23" height="11" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill="currentColor"/><path d="M23 4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </text>
    </view>
    <view class="pnav">
      <navigator class="back" id="bk" url="" open-type="navigateBack"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></navigator>
      <view class="ptitle">搜索</view>
      <view class="capsule">
        <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)"><use href="#cap-more"/></svg></view>
        <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)"><use href="#cap-target"/></svg></view>
      </view>
    </view>

    <view style="padding:0 14px">
      <navigator class="sbox fu" url="/pages/page-258/index">
        <text class="mai"><image src="/static/v63-icons/mai.png" alt="" /></text>
        <text class="sph">瑞幸生椰拿铁 ¥9.9 起</text>
        <text>搜索</text>
      </navigator>
    </view>
    <view class="card fu" style="margin-top:14px;background:linear-gradient(135deg,#0e3d2b,#0a2c1f);border:none;color:#fff;position:relative;overflow:hidden">
      <view style="position:absolute;right:-30px;top:-36px;width:120px;height:120px;border-radius:50%;background:rgba(0,220,150,.14)"></view>
      <view style="display:flex;align-items:center;gap:10px">
        <image src="/static/v63-icons/mai.png" style="width:38px;height:38px" alt="" />
        <view><text style="font-size:14.5px">问小满，一句话搞定</text><text style="font-size:10px;font-weight:700;opacity:.72;margin-top:2px">AI 直接组合 32 项生活能力帮你下单</text></view>
      </view>
      <view style="display:flex;flex-wrap:wrap;gap:7px;margin-top:11px">
        <navigator class="qa" url="/pages/page-258/index">周末带孩子出去玩</navigator>
        <navigator class="qa" url="/pages/page-258/index">充 100 话费怎么最省</navigator>
        <navigator class="qa" url="/pages/page-258/index">附近 3km 有什么好吃的</navigator>
        <navigator class="qa" url="/pages/page-258/index">帮我订今晚的电影票</navigator>
      </view>
    </view>
    <view class="sec fu"><text>搜索历史</text><navigator url="/pages/#/index" data-t="清空搜索历史">清空</navigator></view>
    <view class="chiprow fu"><navigator class="chip" url="/pages/page-224/index?b=luckin">瑞幸咖啡</navigator><navigator class="chip" url="/pages/page-209/index?id=d1">麻辣小龙虾</navigator><navigator class="chip" url="/pages/page-221/index?c=film">电影票</navigator><navigator class="chip" url="/pages/page-201/index?c=grocery">叮咚买菜</navigator></view>
    <view class="sec fu"><text>热门搜索</text><navigator url="/pages/#/index" data-t="每小时更新">每小时更新</navigator></view>
    <view class="card fu" style="padding-top:4px;padding-bottom:4px">
      <navigator class="hrow" url="/pages/page-224/index?b=luckin"><text class="rk r1">1</text><text>瑞幸生椰拿铁</text><text class="hot">热</text><text>券后 ¥9.9</text></navigator>
      <navigator class="hrow" url="/pages/page-209/index?id=d1"><text class="rk r2">2</text><text>麻辣小龙虾双人餐</text><text class="hot">热</text><text>已售 3200+</text></navigator>
      <navigator class="hrow" url="/pages/page-221/index?c=film"><text class="rk r3">3</text><text>万达影城通兑券</text><text class="new">新</text><text>¥59.9 双人</text></navigator>
      <navigator class="hrow" url="/pages/page-255/index"><text class="rk">4</text><text>话费充值 100 元</text><text>最高返 ¥100 券</text></navigator>
      <navigator class="hrow" url="/pages/page-218/index?s=0"><text class="rk">5</text><text>虾闹闹</text><text>480m</text></navigator>
      <navigator class="hrow" url="/pages/page-224/index?b=heytea"><text class="rk">6</text><text>喜茶多肉葡萄</text><text>买一送一券</text></navigator>
      <navigator class="hrow" url="/pages/page-201/index?c=seckill"><text class="rk">7</text><text>鲜活基围虾 500g</text><text class="hot">热</text><text>秒杀 ¥19.9</text></navigator>
      <navigator class="hrow" url="/pages/page-221/index?c=beauty"><text class="rk">8</text><text>总监洗剪吹</text><text>¥38</text></navigator>
    </view>
    <view class="sec fu"><text>猜你想买</text></view>
    <view class="grid2 fu" style="margin-bottom:4px">
      <navigator class="gcell" url="/pages/page-209/index?t=goods&id=g1"><image src="/static/v63-img/n-crayfish.jpg" alt="" /><view class="gt"><text>招牌麻辣小龙虾 2 斤装 蒜香/十三香</text><text class="gtag">小时达</text><view class="grow"><text class="gp">¥68<text>¥98</text></text><text class="gplus">+</text></view></view></navigator>
      <navigator class="gcell" url="/pages/page-209/index?t=goods&id=g2"><image src="/static/v63-img/s-cake.jpg" alt="" /><view class="gt"><text>6 寸动物奶油生日蛋糕 8 款可选</text><text class="gtag">4 小时预约</text><view class="grow"><text class="gp">¥88<text>¥158</text></text><text class="gplus">+</text></view></view></navigator>
    </view>
    <view style="height:26px"></view>
  </view>

  <navigator class="maifab" url="/pages/page-258/index"><image src="/static/v63-icons/mai.png" alt="小满" /><text>小满</text></navigator>
  <view id="toast"></view>
</view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeRetailProductCard from '../../components/LifeRetailProductCard.vue';
import LifeSurface from '../../components/LifeSurface.vue';
import { filterLifeDiscovery, normalizeLifeQuery } from '../../services/life-discovery.js';
import { lifeSession } from '../../services/life-session.js';
import { lifeSurfaceState } from '../../surface-contract.js';

const loading = ref(false);
const error = ref(null);
const query = ref('');
const activeTab = ref('all');
const products = ref([]);
const stores = ref([]);
const productResults = computed(() => filterLifeDiscovery(products.value, query.value));
const storeResults = computed(() => filterLifeDiscovery(stores.value, query.value));
const records = computed(() => [...productResults.value, ...storeResults.value]);
const state = computed(() =>
  lifeSurfaceState({ loading: loading.value, error: error.value, records: records.value }),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    [products.value, stores.value] = await Promise.all([
      lifeSession.request('/api/v1/life/discovery/products?limit=100'),
      lifeSession.request('/api/v1/life/discovery/stores?limit=100'),
    ]);
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

function submitSearch() {
  query.value = normalizeLifeQuery(query.value);
  if (!query.value) uni.navigateBack();
}

async function addToCart(product) {
  try {
    await lifeSession.request('/api/v1/life/cart/items', {
      method: 'PUT',
      data: {
        merchantTenantId: product.merchantTenantId,
        storeId: product.storeId,
        variantId: product.variantId,
        quantity: 1,
      },
    });
    uni.showToast({ title: '已加入购物车', icon: 'success' });
  } catch {
    uni.showToast({ title: '加入失败，请刷新结果后重试', icon: 'none' });
  }
}

function openStore(store) {
  uni.navigateTo({
    url: `/pages/page-201/index?storeId=${encodeURIComponent(store.id)}&storeName=${encodeURIComponent(store.name)}`,
  });
}

function openProduct(product) {
  uni.navigateTo({ url: `/pages/page-209/index?productId=${encodeURIComponent(product.id)}` });
}

onLoad((options) => {
  query.value = normalizeLifeQuery(options?.q);
  void load();
});


// 深色模式 + 返回
const isDark = ref(false);
function toggleTheme() { isDark.value = !isDark.value; }
function goBack() { uni.navigateBack({ delta: 1 }); }
</script>

<style scoped>*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  
  
  
  

  .phone{
    --hd1:#009146; --hd2:#006b36; --bg:#f6f1e6; --card:#ffffff; --ink:#16130f;
    --mut:#857c6d; --accent:#009146; --promo:#f03749; --hot:#eb6325; --yel:#fee600;
    --tabbar:#ffffff; --line:rgba(22,19,15,.08); --notice-bg:#e6f3ea; --notice-tx:#0b6b3d;
    --capsule-bg:rgba(255,255,255,.94); --capsule-line:rgba(22,19,15,.12); --capsule-ink:#16130f;
    --cnt-bg:#16130f; --cnt-tx:#fee600; --shadow:0 10px 26px rgba(22,19,15,.09);
  }
  .phone[data-theme="dark"]{
    --hd1:#10241a; --hd2:#0c1212; --bg:#0c1212; --card:#141d1d; --ink:#ffffff;
    --mut:#9fb0a8; --accent:#6ec726; --promo:#ff5d3d; --hot:#f7c400; --yel:#f7c400;
    --tabbar:#0a0f0f; --line:rgba(255,255,255,.08); --notice-bg:rgba(110,199,38,.13); --notice-tx:#8fe33f;
    --capsule-bg:rgba(12,18,18,.45); --capsule-line:rgba(255,255,255,.22); --capsule-ink:#ffffff;
    --cnt-bg:#0c1212; --cnt-tx:#6ec726; --shadow:0 10px 26px rgba(0,0,0,.4);
  }

  /* ===== 骨架 ===== */
  .phone{width:375px;height:760px;background:var(--bg);border-radius:44px;position:relative;overflow:hidden;display:flex;flex-direction:column;flex:none;color:var(--ink);box-shadow:0 30px 80px -20px rgba(0,0,0,.55),0 0 0 10px #141210;transition:background .5s}
  .scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;background:linear-gradient(180deg,var(--tint,#efe9db) 0px,var(--bg) 430px)}
  .scroll::-webkit-scrollbar{display:none}
  [data-theme="dark"] .scroll{background:var(--bg)}
  .statusbar{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;color:var(--ink);padding:14px 26px 0;position:relative;z-index:2}
  [data-theme="dark"] .statusbar{color:#fff}
  .pnav{display:flex;align-items:center;gap:10px;padding:10px 14px 12px;position:relative;z-index:2}
  .back{width:34px;height:34px;flex:none;border-radius:50%;background:var(--card);border:1px solid var(--line);display:grid;place-items:center;color:var(--ink);text-decoration:none;box-shadow:0 3px 10px rgba(22,19,15,.06);cursor:pointer}
  .ptitle{flex:1;min-width:0;font-size:16.5px;font-weight:900;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .capsule{width:87px;height:32px;flex:none;border-radius:16px;background:var(--capsule-bg);border:1px solid var(--capsule-line);display:flex;overflow:hidden;backdrop-filter:blur(8px)}
  .capsule .cell{flex:1;display:grid;place-items:center;height:100%}
  .capsule .cell:first-child{border-right:1px solid var(--capsule-line)}
  /* ===== 通用组件 ===== */
  .card{margin:12px 14px 0;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:14px;transition:background .5s}
  .sec{display:flex;align-items:baseline;justify-content:space-between;margin:18px 18px 10px}
  .sec b{font-size:15.5px;font-weight:900;letter-spacing:.02em}
  .sec a{font-size:11px;font-weight:800;color:var(--accent);text-decoration:none}
  .lrow{display:flex;align-items:center;gap:11px;padding:13px 2px;border-top:1px solid var(--line);text-decoration:none;color:var(--ink)}
  .lrow:first-child{border-top:none}
  .lrow .lic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#fff;flex:none}
  .lrow .ltx{flex:1;min-width:0}
  .lrow .ltx b{font-size:13.5px;font-weight:900;display:block}
  .lrow .ltx p{font-size:10.5px;font-weight:700;color:var(--mut);margin-top:2px}
  .lrow .lgo{flex:none;color:var(--mut);font-size:11px;font-weight:800}
  .chiprow{display:flex;gap:8px;padding:2px 14px 0;overflow-x:auto;scrollbar-width:none}
  .chiprow::-webkit-scrollbar{display:none}
  .chip{flex:none;font-size:11.5px;font-weight:800;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:8px 14px;text-decoration:none;transition:.3s}
  .chip.on{background:linear-gradient(120deg,#00a850,#007a3d);color:#fff;border-color:transparent;box-shadow:0 3px 8px rgba(0,145,70,.28)}
  /* 团购卡 */
  .deal{display:flex;gap:11px;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:11px;margin:10px 14px 0;text-decoration:none;color:var(--ink);transition:background .5s}
  .dimgbox{position:relative;width:96px;height:96px;flex:none}
  .dimgbox img{width:100%;height:100%;object-fit:cover;border-radius:12px}
  .dtag{position:absolute;left:5px;top:5px;background:linear-gradient(120deg,#ff5d3d,#f03749);color:#fff;font-size:8.5px;font-weight:900;border-radius:6px;padding:2px 6px}
  .dinfo{flex:1;min-width:0;display:flex;flex-direction:column}
  .dshop{font-size:12.5px;font-weight:900;display:flex;align-items:center;gap:6px}
  .dstar{font-size:10px;font-weight:900;color:#f7a800}
  .ddist{margin-left:auto;font-size:9.5px;font-weight:700;color:var(--mut)}
  .dtit{font-size:11px;font-weight:700;color:var(--mut);margin-top:3px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .drules{display:flex;gap:5px;margin-top:5px}
  .drules i{font-style:normal;font-size:8.5px;font-weight:800;color:var(--notice-tx);background:var(--notice-bg);border-radius:4px;padding:1.5px 5px}
  .drow{display:flex;align-items:flex-end;justify-content:space-between;margin-top:auto;padding-top:6px}
  .dprice{font-size:17px;font-weight:900;color:var(--promo)}
  .dprice s{font-size:10.5px;font-weight:700;color:var(--mut);margin-left:4px}
  .dsold{font-size:9.5px;font-weight:700;color:var(--mut)}
  .dbuy{font-size:11px;font-weight:900;color:#fff;background:linear-gradient(120deg,#ff6a3d,#f03749);border-radius:999px;padding:7px 13px;box-shadow:0 4px 10px rgba(240,55,73,.3)}
  /* 商品卡 */
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 14px 0}
  .gcell{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;text-decoration:none;color:var(--ink);box-shadow:var(--shadow);transition:background .5s}
  .gcell img{width:100%;height:118px;object-fit:cover;display:block}
  .gcell .gt{padding:9px 11px 11px}
  .gcell .gt b{font-size:12px;font-weight:800;display:block;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .gtag{display:inline-block;font-size:8.5px;font-weight:800;color:var(--notice-tx);background:var(--notice-bg);border-radius:4px;padding:1.5px 5px;margin-top:5px}
  .grow{display:flex;align-items:center;justify-content:space-between;margin-top:7px}
  .gp{font-size:15px;font-weight:900;color:var(--promo)}
  .gp s{font-size:9.5px;font-weight:700;color:var(--mut);margin-left:3px}
  .gplus{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#00c853,#009146);color:#fff;display:grid;place-items:center;box-shadow:0 3px 8px rgba(0,145,70,.35)}
  /* 底栏 */
  .bb{position:absolute;left:0;right:0;bottom:0;z-index:20;background:var(--card);border-top:1px solid var(--line);padding:10px 14px 16px;display:flex;align-items:center;gap:10px}
  .bb .bico{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:8.5px;font-weight:800;color:var(--mut);text-decoration:none;width:44px}
  .bb .bbtn{flex:1;height:44px;border:none;border-radius:22px;font-family:inherit;font-size:14px;font-weight:900;color:#fff;background:linear-gradient(120deg,#00c853,#009146);box-shadow:0 8px 18px rgba(0,145,70,.35);cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center}
  .bb .bbtn.hot{background:linear-gradient(120deg,#ff6a3d,#f03749);box-shadow:0 8px 18px rgba(240,55,73,.35)}
  /* 优惠券 */
  .cpn{display:flex;margin:10px 14px 0;border-radius:16px;overflow:hidden;box-shadow:var(--shadow);text-decoration:none;color:var(--ink)}
  .cpn .cl{width:104px;flex:none;background:linear-gradient(140deg,#ff8a5c,#f03749);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 6px}
  .cpn .cl b{font-size:24px;font-weight:900}
  .cpn .cl b i{font-style:normal;font-size:12px}
  .cpn .cl p{font-size:9px;font-weight:800;opacity:.9;margin-top:2px}
  .cpn .cr{flex:1;background:var(--card);border:1px solid var(--line);border-left:none;padding:11px 12px;position:relative}
  .cpn .cr b{font-size:12.5px;font-weight:900;display:block}
  .cpn .cr p{font-size:9.5px;font-weight:700;color:var(--mut);margin-top:3px}
  .cpn .cr .cuse{position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:900;color:var(--promo);border:1px solid var(--promo);border-radius:999px;padding:5px 11px}
  /* 提示条 */
  .ntc{margin:12px 14px 0;height:36px;border-radius:12px;background:var(--notice-bg);display:flex;align-items:center;gap:7px;padding:0 12px;font-size:10.5px;font-weight:800;color:var(--notice-tx)}
  /* 入场动画 */
  .fu{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s ease}
  .fu.in{opacity:1;transform:none}
  /* toast */
  #toast{position:absolute;left:50%;bottom:110px;transform:translateX(-50%) translateY(8px);max-width:300px;background:rgba(22,19,15,.92);color:#fff;font-size:11.5px;font-weight:700;border-radius:12px;padding:10px 14px;opacity:0;pointer-events:none;transition:.3s;z-index:60;line-height:1.5}
  #toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  /* 小满悬浮球 */
  .maifab{position:absolute;right:12px;bottom:92px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.96);border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.10);animation:maipulse 2.8s infinite;cursor:pointer;text-decoration:none;color:var(--ink)}
  .maifab img{width:31px;height:31px}
  .maifab em{font-style:normal;font-size:8.5px;font-weight:900;margin-top:-1px}
  [data-theme="dark"] .maifab{background:rgba(20,26,24,.94)}
  @keyframes maipulse{0%,100%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.10)}50%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 8px rgba(0,200,130,.04)}}
  


  .sbox{display:flex;align-items:center;gap:9px;height:42px;background:var(--card);border:1px solid var(--line);border-radius:21px;padding:0 6px 0 13px;box-shadow:var(--shadow);text-decoration:none;color:var(--ink)}
  .sbox .mai{width:26px;height:26px;border-radius:50%;overflow:hidden;flex:none}
  .sbox .mai img{width:100%;height:100%}
  .sbox .sph{flex:1;min-width:0;font-size:12.5px;font-weight:700;color:#9a938a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sbox b{flex:none;height:32px;padding:0 16px;border-radius:16px;background:linear-gradient(120deg,#00c853,#009146);color:#fff;font-size:12px;display:flex;align-items:center}
  .qa{font-size:10.5px;font-weight:800;color:#d8ffe9;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:6px 11px;text-decoration:none}
  .hrow{display:flex;align-items:center;gap:10px;padding:11px 2px;border-top:1px solid var(--line);text-decoration:none;color:var(--ink)}
  .hrow:first-child{border-top:none}
  .hrow .rk{font-style:normal;width:18px;height:18px;border-radius:6px;background:var(--notice-bg);color:var(--notice-tx);font-size:10.5px;font-weight:900;display:grid;place-items:center;flex:none}
  .hrow .r1{background:#ffe1d6;color:#f03749}.hrow .r2{background:#ffe9d1;color:#eb6325}.hrow .r3{background:#fff3c4;color:#c89100}
  [data-theme="dark"] .hrow .r1{background:rgba(255,93,61,.16)}[data-theme="dark"] .hrow .r2{background:rgba(235,99,37,.16)}[data-theme="dark"] .hrow .r3{background:rgba(247,196,0,.14)}
  .hrow b{flex:1;min-width:0;font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hrow em{font-style:normal;font-size:10px;font-weight:800;color:var(--mut);flex:none}
  .hrow .hot{font-size:8px;font-weight:900;color:#fff;background:linear-gradient(120deg,#ff5d3d,#f03749);border-radius:4px;padding:1.5px 4px;flex:none}
  .hrow .new{font-size:8px;font-weight:900;color:#fff;background:linear-gradient(120deg,#00c853,#009146);border-radius:4px;padding:1.5px 4px;flex:none}</style>
