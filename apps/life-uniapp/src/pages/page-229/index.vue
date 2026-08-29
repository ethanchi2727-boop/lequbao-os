<template>
<svg width="0" height="0" style="position:absolute"><defs>
<g id="cap-more"><circle cx="4.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19.5" cy="12" r="1.7"/></g>
<g id="cap-target"><circle cx="12" cy="12" r="6.4" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="2.4"/></g>
</defs></svg>
<view class="phone" :data-theme="isDark?'dark':''" style="--hd1:#009146;--hd2:#006b36;--bg:#f6f1e6" ref="phoneEl">
  <view class="scroll" style="--tint:#e8f3ea">
    <view class="statusbar"><text>9:41</text>
      <text style="display:flex;gap:5px;align-items:center">
        <svg width="16" height="11" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
        <svg width="23" height="11" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill="currentColor"/><path d="M23 4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </text>
    </view>
    <view class="pnav">
      <navigator class="back" id="bk" url="" open-type="navigateBack"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></navigator>
      <view class="ptitle">确认订单</view>
      <view class="capsule">
        <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)"><use href="#cap-more"/></svg></view>
        <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)"><use href="#cap-target"/></svg></view>
      </view>
    </view>

    <navigator class="card fu addr" url="/pages/page-248/index">
      <text class="a-ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M12 21s-6.5-5.4-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/></svg></text>
      <view style="flex:1;min-width:0"><text style="font-size:13.5px">王女士 138****8876</text><text style="font-size:11px;font-weight:700;color:var(--mut);margin-top:3px">杭州市西湖区文三路 100 号 · 幸福里 3 幢 2 单元</text></view>
      <text style="color:var(--mut);font-weight:800">›</text>
    </navigator>
    <view class="card fu">
      <view style="display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--line)">
        <image src="/static/v63-img/n-crayfish.jpg" style="width:22px;height:22px;border-radius:7px;object-fit:cover" alt="" />
        <text style="font-size:12.5px">虾闹闹 · 麻辣小龙虾</text>
        <text style="margin-left:auto;font-size:10px;font-weight:800;color:var(--accent)">到店核销</text>
      </view>
      <view style="display:flex;gap:11px;padding-top:12px">
        <image src="/static/v63-img/n-crayfish.jpg" style="width:72px;height:72px;border-radius:12px;object-fit:cover;flex:none" alt="" />
        <view style="flex:1;min-width:0">
          <text style="font-size:13px">【双人餐】招牌麻辣小龙虾 2 斤 + 配菜双拼 + 饮品</text>
          <text style="font-size:10px;font-weight:700;color:var(--mut);margin-top:4px">随时退 · 过期自动退 · 免预约</text>
          <view style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
            <text class="dprice">¥98<text>¥168</text></text>
            <text class="stepper"><text id="st-m">−</text><text id="st-n">1</text><text id="st-p">＋</text></text>
          </view>
        </view>
      </view>
    </view>
    <view class="card fu">
      <view style="display:flex;align-items:center;gap:7px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f03749" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5V8a1 1 0 0 1 1-1z"/><path d="M13 7v2m0 4v2m0 4v2"/></svg>
        <text style="font-size:14.5px;font-weight:900">代金券抵扣</text>
        <text style="margin-left:auto;font-size:10.5px;font-weight:700;color:var(--mut)">2 张可用</text>
      </view>
      <button class="vopt" data-amt="5.20" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);margin-top:10px;cursor:pointer;font-family:inherit;text-align:left">
        <text style="flex:1;min-width:0"><text style="font-size:12.5px;font-weight:900;color:var(--ink);display:block">通用代金券 ¥5.20</text><text style="font-size:9.5px;font-weight:700;color:var(--mut);margin-top:2px">无门槛 · 第 12 期到账</text></text>
        <text style="font-size:11px;font-weight:900;color:var(--mut)">选择</text>
      </button>
      <button class="vopt" data-amt="10.40" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);margin-top:8px;cursor:pointer;font-family:inherit;text-align:left">
        <text style="flex:1;min-width:0"><text style="font-size:12.5px;font-weight:900;color:var(--ink);display:block">通用代金券 ¥10.40</text><text style="font-size:9.5px;font-weight:700;color:var(--mut);margin-top:2px">无门槛 · 第 12 期到账</text></text>
        <text style="font-size:11px;font-weight:900;color:var(--mut)">选择</text>
      </button>
    </view>
    <view class="card fu" style="padding-top:6px;padding-bottom:6px">
      <navigator class="lrow" url="/pages/#/index" data-t="预约到店时间：今天 17:30（免预约可随时到店）"><text class="lic" style="background:linear-gradient(135deg,#4a9eff,#1a6fc4)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg></text><view class="ltx"><text>预约时间</text><text>免预约 · 高峰期建议预约</text></view><text class="lgo">今天 17:30 ›</text></navigator>
      <navigator class="lrow" url="/pages/#/index" data-t="备注：口味偏好、发票需求等"><text class="lic" style="background:linear-gradient(135deg,#8a5cf6,#6d3fd4)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M4 20h4l11-11-4-4L4 16v4z"/></svg></text><view class="ltx"><text>订单备注</text><text>微辣 / 不要香菜…</text></view><text class="lgo">选填 ›</text></navigator>
    </view>
    <view class="card fu">
      <view class="pr-row"><text>套餐金额</text><text>¥98.00</text></view>
      <view class="pr-row" id="ck-cpnrow" v-if="false"><text>代金券抵扣</text><text style="color:var(--promo)" id="ck-vamt">−¥5.20</text></view>
      <view class="pr-row"><text>会员折扣</text><text style="color:var(--promo)">−¥2.00</text></view>
      <view class="pr-row" style="border-top:1px dashed var(--line);padding-top:11px;margin-top:4px"><text style="font-weight:900;color:var(--ink)">实付款</text><text style="font-size:17px;color:var(--promo)" id="ck-total">¥96.00</text></view>
    </view>
    <view class="fu" style="display:flex;align-items:center;gap:6px;margin:12px 18px 0;font-size:9.5px;font-weight:700;color:var(--mut)"><text style="width:14px;height:14px;border-radius:50%;background:var(--notice-bg);color:var(--notice-tx);display:grid;place-items:center;font-size:9px;font-weight:900">✓</text>已阅读并同意《团购服务协议》· 支持随时退 / 过期自动退</view>
    <view style="height:96px"></view>
  </view>
  <view class="bb">
    <navigator class="bico" url="/pages/page-218/index?s=0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 10 5.5 4h13L20 10M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9zM9.5 14h5"/></svg>店铺</navigator>
    <navigator class="bico" url="/pages/page-258/index"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-5 4V6z"/></svg>客服</navigator>
    <view style="flex:1;text-align:right;padding-right:4px"><text style="font-size:10px;font-weight:800;color:var(--mut)">合计</text><view style="font-size:19px;font-weight:900;color:var(--promo)" id="bb-total">¥96.00</view></view>
    <navigator class="bbtn hot" url="/pages/page-231/index" style="flex:none;width:128px">提交订单</navigator>
  </view>
  <navigator class="maifab" url="/pages/page-258/index"><image src="/static/v63-icons/mai.png" alt="小满" /><text>小满</text></navigator>
  <view id="toast"></view>
</view>
</template>

<script setup>import { ref } from 'vue';

import LifeJourneyPage from '../../components/LifeJourneyPage.vue';


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
  


  .addr{display:flex;align-items:center;gap:11px;text-decoration:none;color:var(--ink)}
  .a-ic{width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,#00c853,#009146);display:grid;place-items:center;flex:none}
  .stepper{display:flex;align-items:center;gap:2px;background:var(--bg);border-radius:999px;padding:3px}
  [data-theme="dark"] .stepper{background:rgba(255,255,255,.08)}
  .stepper i{font-style:normal;width:24px;height:24px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 2px 5px rgba(22,19,15,.08)}
  .stepper b{width:30px;text-align:center;font-size:13px;font-weight:900}
  .pr-row{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--mut);font-weight:700;padding:5px 0}
  .pr-row b{color:var(--ink);font-weight:900}</style>
