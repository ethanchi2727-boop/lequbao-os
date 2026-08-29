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
      <view class="ptitle">团购套餐</view>
      <view class="capsule">
        <view class="cell"><svg width="20" height="20" viewBox="0 0 24 24" fill="var(--capsule-ink)"><use href="#cap-more"/></svg></view>
        <view class="cell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--capsule-ink)"><use href="#cap-target"/></svg></view>
      </view>
    </view>
    <view class="ntc fu">爆款套餐 5 折起 · 全部支持随时退 / 过期自动退</view>
    <view class="chiprow fu" id="dcats" style="margin-top:12px"><navigator class="chip on" url="/pages/page-221/index?c=all" data-c="all">全部</navigator><navigator class="chip" url="/pages/page-221/index?c=food" data-c="food">美食</navigator><navigator class="chip" url="/pages/page-221/index?c=drink" data-c="drink">奶茶饮品</navigator><navigator class="chip" url="/pages/page-221/index?c=film" data-c="film">电影演出</navigator><navigator class="chip" url="/pages/page-221/index?c=hotel" data-c="hotel">酒店民宿</navigator><navigator class="chip" url="/pages/page-221/index?c=ktv" data-c="ktv">KTV</navigator><navigator class="chip" url="/pages/page-221/index?c=tour" data-c="tour">周边游</navigator><navigator class="chip" url="/pages/page-221/index?c=beauty" data-c="beauty">丽人</navigator><navigator class="chip" url="/pages/page-221/index?c=kids" data-c="kids">亲子</navigator></view>
    <view id="dwrap">
      <navigator class="deal fu" url="/pages/page-209/index?id=d1" data-cat="food">
        <view class="dimgbox"><image src="/static/v63-img/n-crayfish.jpg" alt="" /><text class="dtag">团购</text></view>
        <view class="dinfo">
          <view class="dshop">虾闹闹 · 麻辣小龙虾<text class="dstar">★4.8</text><text class="ddist">480m</text></view>
          <view class="dtit">【双人餐】招牌麻辣小龙虾 2 斤 + 配菜双拼 + 饮品</view>
          <view class="drules"><text>随时退</text><text>过期自动退</text><text>免预约</text></view>
          <view class="drow"><view><text class="dprice">¥98<text>¥168</text></text><text class="dsold">　已售 3200+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator class="deal fu" url="/pages/page-209/index?id=d2" data-cat="food">
        <view class="dimgbox"><image src="/static/v63-img/n-skewer.jpg" alt="" /><text class="dtag">团购</text></view>
        <view class="dinfo">
          <view class="dshop">串局 · 东北烧烤<text class="dstar">★4.7</text><text class="ddist">650m</text></view>
          <view class="dtit">【四人撸串套餐】牛羊肉串 40 串 + 烤翅 + 扎啤 4 杯</view>
          <view class="drules"><text>随时退</text><text>过期自动退</text></view>
          <view class="drow"><view><text class="dprice">¥128<text>¥228</text></text><text class="dsold">　已售 2100+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator class="deal fu" url="/pages/page-209/index?id=d3" data-cat="beauty">
        <view class="dimgbox"><image src="/static/v63-img/p-barber.jpg" alt="" /><text class="dtag">丽人</text></view>
        <view class="dinfo">
          <view class="dshop">型格美发 · 银泰店<text class="dstar">★4.9</text><text class="ddist">320m</text></view>
          <view class="dtit">【总监洗剪吹】含头皮检测 + 造型，周末通用</view>
          <view class="drules"><text>随时退</text><text>需预约</text></view>
          <view class="drow"><view><text class="dprice">¥38<text>¥88</text></text><text class="dsold">　已售 8600+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator class="deal fu" url="/pages/page-209/index?id=d4" data-cat="food">
        <view class="dimgbox"><image src="/static/v63-img/s-cake.jpg" alt="" /><text class="dtag">团购</text></view>
        <view class="dinfo">
          <view class="dshop">甜屿 · 手作蛋糕<text class="dstar">★4.8</text><text class="ddist">1.2km</text></view>
          <view class="dtit">【6 寸生日蛋糕】动物奶油，8 款可选，需提前 4 小时预约</view>
          <view class="drules"><text>随时退</text><text>过期自动退</text></view>
          <view class="drow"><view><text class="dprice">¥88<text>¥158</text></text><text class="dsold">　已售 1500+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator class="deal fu" url="/pages/page-209/index?id=d5" data-cat="film">
        <view class="dimgbox"><image src="/static/v63-img/s-film.jpg" alt="" /><text class="dtag">通兑</text></view>
        <view class="dinfo">
          <view class="dshop">万达影城 · 西湖店<text class="dstar">★4.9</text><text class="ddist">900m</text></view>
          <view class="dtit">【双人观影通兑券】2D/3D 全场次通用，含 2 杯可乐</view>
          <view class="drules"><text>随时退</text><text>全场次通用</text></view>
          <view class="drow"><view><text class="dprice">¥59.9<text>¥160</text></text><text class="dsold">　已售 5.2万</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator class="deal fu" url="/pages/page-209/index?id=d6" data-cat="food">
        <view class="dimgbox"><image src="/static/v63-img/n-melon.jpg" alt="" /><text class="dtag">自提</text></view>
        <view class="dinfo">
          <view class="dshop">果然鲜 · 精品水果<text class="dstar">★4.6</text><text class="ddist">210m</text></view>
          <view class="dtit">【麒麟西瓜 3 斤】现切现装，到店自提/小时达</view>
          <view class="drules"><text>随时退</text><text>坏果包赔</text></view>
          <view class="drow"><view><text class="dprice">¥15.9<text>¥25</text></text><text class="dsold">　已售 8900+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator class="deal fu" url="/pages/page-209/index?id=d7" data-cat="ktv">
        <view class="dimgbox"><image src="/static/v63-img/s-live.jpg" alt="" /><text class="dtag">团购</text></view>
        <view class="dinfo">
          <view class="dshop">麦乐迪 KTV · 湖滨店<text class="dstar">★4.7</text><text class="ddist">1.5km</text></view>
          <view class="dtit">【欢唱 3 小时】小包厢 + 果盘 + 茶水，黄金档通用</view>
          <view class="drules"><text>随时退</text><text>需预约</text></view>
          <view class="drow"><view><text class="dprice">¥39<text>¥128</text></text><text class="dsold">　已售 4200+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
      <navigator class="deal fu" url="/pages/page-209/index?id=d8" data-cat="hotel">
        <view class="dimgbox"><image src="/static/v63-img/s-scene.jpg" alt="" /><text class="dtag">酒店</text></view>
        <view class="dinfo">
          <view class="dshop">云栖民宿 · 山景大床房<text class="dstar">★4.8</text><text class="ddist">3.2km</text></view>
          <view class="dtit">【住宿套餐】山景房 1 晚 + 双早 + 下午茶</view>
          <view class="drules"><text>随时退</text><text>周末可用</text></view>
          <view class="drow"><view><text class="dprice">¥199<text>¥399</text></text><text class="dsold">　已售 960+</text></view><text class="dbuy">马上抢</text></view>
        </view>
      </navigator>
    </view>
    <view class="fu" style="text-align:center;font-size:10px;font-weight:700;color:var(--mut);margin-top:16px">— 附近 3km · 共 328 家商家 —</view>
    <view style="height:26px"></view>
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
  @keyframes maipulse{0%,100%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 4px rgba(0,200,130,.10)}50%{box-shadow:0 8px 20px rgba(22,19,15,.16),0 0 0 8px rgba(0,200,130,.04)}}</style>
