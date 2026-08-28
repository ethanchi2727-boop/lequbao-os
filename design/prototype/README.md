# 乐趣生活 · 概念设计原型（concept-f）

乐趣生活微信小程序的高保真 HTML 概念原型，共 29 个页面，浅色/深色双主题。

## 入口

- `index.html` —— 预览落地页（内嵌手机壳 iframe）
- `concept-f/index.html` —— 首页（金刚位 + 三帧轮播 Banner + 顶部联动渐变）
- `concept-f/quan.html` —— 生活圈（团购套餐 / 附近商家）
- `concept-f/mall.html` / `cart.html` / `me.html` —— 商城 / 购物车 / 我的

## 代金券体系（对齐 tianxiasy.com 手机端）

- `concept-f/coupons.html` —— 我的代金券钱包（已到账 / 待到账 / 已失效）
- `concept-f/voucher-rule.html` —— 消费奖励说明（分 50 期发放逻辑）
- `concept-f/voucher-detail.html` —— 代金券明细（累计 / 获得记录）

## 预览参数

- `?snap=1` 关闭入场动画（截图用）
- `?theme=dark` 深色模式

本地预览：`python3 -m http.server 8901` 后访问 `http://localhost:8901/concept-f/index.html`
