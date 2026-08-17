# 乐趣生活 V5.0 — 消费者端 E8 交接（2026-07-28）

> 给新 Codex 对话：请从本文件继续，不要重做已完成内容。当前工作区没有检测到 Git 元数据；修改均已直接写入本地文件。  
> 项目根目录：`D:\ChatGPT\乐趣生活\lequ-life-platform`

## 1. 当前目标

按原始产品资料逐批开发最终版。本批是消费者端 E8 的第一段真实垂直切片：

- 首页城市切换
- 消息中心
- 家庭身份切换
- 全局搜索
- SELF 数据隔离、展示授权、审计、幂等、隐私
- 乐趣生活小程序高保真首页/消息页/搜索页

这不是整个消费者端最终完成；AI 对话、语音/图片理解、订座下单支付全链路仍属于后续批次。

## 2. 本批使用的原始资料

- `乐趣生活_V5.0_产品内容加UI完整开发总包/02_各系统完整PRD/01_消费者端完整PRD.md`
- `乐趣生活_V5.0_产品内容加UI完整开发总包/05_UI_UX与高保真原型/02_页面级规格/01_消费者端_AI首页.md`
- 同一资料包内的数据归属/授权与角色权限矩阵

已落实的关键约束：

- 首屏 AI 原生、极简，不做 KPI 堆叠或商城瀑布流。
- 首页顶部必须有城市、消息、家庭身份、搜索。
- 最近服务最多 5 个。
- 消费者数据范围是独立 `SELF`，家庭身份是显式上下文，不是新的登录身份。
- 搜索仅展示 `PUBLISHED + PLATFORM_DISPLAY + OPEN + ACTIVE catalog/SPU/SKU` 的真实内容。
- 原始搜索词只写用户私有历史；审计/埋点只写 SHA-256 摘要；不进入 Outbox。
- 未接通的语音、图片、位置、扫码在 UI 中明确提示“后续 AI 助手批次接通”，不伪造结果。

## 3. 已完成代码

### 3.1 权限和契约

文件：

- `packages/auth/src/index.ts`
- `packages/auth/src/index.test.ts`
- `packages/contracts/src/index.ts`

变更：

- 新增角色 `CONSUMER`
- 新增数据范围 `SELF`
- 新增权限：
  - `consumer.home.read`
  - `consumer.context.manage`
  - `consumer.message.read`
  - `consumer.message.manage`
  - `consumer.search`
- `ResourceScope` 新增 `userId`
- `SELF` 只能访问 `resource.userId === principal.subject`
- 新增消费者首页、城市、家庭成员、消息、搜索结果等共享契约
- 新增策略版本：
  - `consumer-home-policy-v1`
  - `consumer-message-policy-v1`
  - `consumer-search-policy-v1`

### 3.2 数据库和演示数据

文件：`apps/api/src/database.ts`

新增表：

- `consumer_cities`
- `consumer_households`
- `consumer_household_members`
- `consumer_profiles`
- `consumer_store_publications`
- `consumer_messages`
- `consumer_household_tasks`
- `consumer_entitlements`
- `consumer_recent_services`
- `consumer_search_history`
- `consumer_context_events`

新增约束/触发器：

- 家庭成员版本化，不允许直接更新/删除
- 消息内容不可篡改，消息不可删除；只允许已读状态和版本变化
- 搜索历史只追加
- 家庭上下文事件只追加

新增消费者身份：

- 用户：`user-demo-consumer`
- 姓名：陈知夏
- Token：`dev-consumer-2026`
- 角色：`CONSUMER`
- 数据范围：`SELF`

演示数据：

- 上海、杭州、苏州
- “知夏一家”：本人知夏、女儿安安、母亲陈阿姨
- 云和里静安店的平台展示授权快照
- 4 条消息（初始 3 条未读）
- 家庭待办、即将过期权益、4 个最近服务

### 3.3 API 和领域服务

文件：

- `apps/api/src/auth-service.ts`
- `apps/api/src/auth-service.test.ts`
- `apps/api/src/app.ts`
- `apps/api/src/consumer-home-service.ts`
- `apps/api/src/consumer-home-service.test.ts`

新增 API：

- `GET /api/v1/consumer/home`
- `POST /api/v1/consumer/context`
- `GET /api/v1/consumer/messages`
- `POST /api/v1/consumer/messages/:messageId/read`
- `POST /api/v1/consumer/search`

领域行为：

- 首页按当前城市和家庭身份返回动态意图、为你准备、真实进行中订单、最近服务和未读数。
- 城市/家庭身份切换使用乐观锁、幂等记录、审计、埋点、Outbox。
- 消息按本人/分类/未读过滤，已读使用版本锁与幂等，消息正文不可改。
- 搜索不做付费排名；匹配发布授权、门店营业状态和有效目录；原始查询不外泄到审计/埋点/Outbox。

### 3.4 消费者小程序

文件：

- `apps/consumer-miniapp/package.json`（新增 `@lequ/contracts`）
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages.json`
- `apps/consumer-miniapp/src/pages/index/index.vue`
- `apps/consumer-miniapp/src/pages/messages/index.vue`
- `apps/consumer-miniapp/src/pages/search/index.vue`

页面：

1. 首页
   - 城市选择 Bottom Sheet
   - 家庭身份选择 Bottom Sheet
   - 真实消息未读数
   - AI 风格搜索输入
   - 家庭身份动态意图
   - 真实“正在进行”
   - “为你准备”横滑卡片
   - 最近服务
   - 5 项底部导航
   - Loading/Error/空状态

2. 消息中心
   - 全部/交易/服务/家庭/系统分类
   - 只看未读
   - 已读状态真实写回
   - 操作目标跳转
   - 空状态、错误状态、隐私说明

3. 搜索
   - 当前城市和家庭身份上下文
   - 推荐词/最近搜索
   - 全部/门店/服务/商品筛选
   - 评分、距离、价格、授权徽标、推荐理由
   - 无结果时明确不伪造数据
   - 隐私与无竞价说明

## 4. 最后一次验证状态（必须先续跑）

### 已确认

- `npm.cmd run typecheck --workspace @lequ/api`：通过（消费者服务加入后跑过）。
- 旧版 `auth-service.test.ts`：4 项通过（新增消费者会话测试后尚未重跑）。
- E8 领域测试第一次运行：6 项中 4 项通过；2 项是测试夹具预期问题，不是业务错误。

### 已修复但因 Codex 执行通道断线尚未重跑

E8 测试最后两个问题已改：

1. 同一测试先执行了一次“发布暂停时搜索”，因此搜索历史应为 2 条，不是 1 条。
2. 只追加触发器测试之前没有成功搜索记录可更新；已先加入一次成功搜索作为夹具。

消费者类型检查最后三个问题已改：

1. 进行中金额允许 `null`，`formatFen` 已处理为“待确认”。
2. `exactOptionalPropertyTypes` 下消息分类不再显式传 `undefined`。
3. 消息分类兜底数组项已加非空断言。

### 新对话第一步：按顺序运行

```powershell
cd "D:\ChatGPT\乐趣生活\lequ-life-platform"

npm.cmd test --workspace @lequ/api -- consumer-home-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
npm.cmd test --workspace @lequ/auth
```

若以上全绿，再运行：

```powershell
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run build:h5 --workspace @lequ/consumer-miniapp
npm.cmd run build:mp-weixin --workspace @lequ/consumer-miniapp
```

最后运行全仓门禁：

```powershell
npm.cmd run check
```

不要因为命令耗时直接宣布完成；需要记录最终测试数、构建结果和任何 warning。

## 5. 仍需完成

按优先级：

1. 跑完并修绿上述定向测试和消费者类型检查。
2. 跑消费者 H5、微信构建并修复平台差异。
3. 更新 OpenAPI：
   - 5 条消费者路径
   - 消费者首页/消息/搜索相关 schemas
   - 更新实际 path/schema 数量
4. 更新文档：
   - `docs/TRACEABILITY.md`
     - E8 “首页城市、消息、家庭身份、搜索”完成后改为 `[x]`
     - “AI 原生首页与订座垂直切片”继续保留 `[-]`，因为语音/多模态/订座支付未完成
   - `docs/ARCHITECTURE.md` 补消费者 SELF、家庭上下文、展示授权和搜索隐私
   - `docs/DELIVERY.md` 写入本批实际测试数、构建结果
5. 运行 `npm.cmd run check` 全仓质量门。
6. 启动 API 和消费者 H5，做浏览器视觉与交互验收：
   - 首页加载
   - 城市切换
   - 家庭身份切换
   - 进入消息中心并标记已读
   - 搜索“晚餐”
   - 检查 Console 0 error
   - 检查 375px/390px 手机宽度和桌面居中效果

## 6. 需要重点复核的实现细节

- `apps/consumer-miniapp/src/services/consumer.ts` 的搜索幂等键目前包含 `Date.now()`。
  - 这样每次主动搜索都是新请求，符合新增历史的需求；
  - 但网络级自动重试不能复用同一 key。建议把 key 在一次 UI 搜索动作开始时生成并传入，重试复用，下一次主动搜索再生成。
- 总部超级管理员拥有通配权限，会先进入消费者服务，再由 `requireConsumer` 返回 `consumer_identity_required`；测试已按实际行为断言。若希望路由层直接 `access_denied`，需要改变 HQ 通配权限语义，影响面更大，不建议在本批随意改。
- 搜索“暂停发布”测试也会写一条私人搜索历史，这是领域设计（搜索行为仍发生），所以同一测试最终历史数为 2。
- 消息已读后如果当前在分类/未读视图，会重新请求过滤后的列表。
- 首页语音/图片/位置/扫码暂时只显示真实未开放提示，不能在文档里写成已完成功能。
- 本项目路径下未检测到 `.git`，不要执行依赖 Git 的清理、回滚或提交命令，除非先找到真正仓库位置。

## 7. 新对话建议开场提示

复制下面这段给新 Codex：

> 继续开发 `D:\ChatGPT\乐趣生活\lequ-life-platform`。先完整阅读根目录 `HANDOFF_2026-07-28_CONSUMER_E8.md`，不要重做已完成代码。按交接第 4 节先恢复消费者 E8 的定向测试和类型检查，全部修绿后完成 H5/微信构建、OpenAPI、TRACEABILITY/ARCHITECTURE/DELIVERY、全仓 `npm run check`，最后做浏览器视觉与交互验收。保持原始 PRD约束：SELF 数据隔离、家庭身份显式上下文、搜索只展示已授权发布内容、原始查询不进入审计/埋点/Outbox；没有接通的多模态能力不得伪装完成。

