# 2026-07-28 消费者端 E8 第三批交接

## 结论

本批“订座时间/人数可编辑 + 商家确认回执 + 消费者取消”已经完成并修绿。不要重做 E8 首页、城市、消息、家庭身份、搜索、AI 文本会话、真实商家推荐、订座草稿、明示提交或本批订座管理链路。

唯一完成度依据仍是 `docs/TRACEABILITY.md`；E8 总项保持部分完成，因为语音、图片、位置、方案/比价/地图、真实支付等仍未实现。

## 已完成能力

- 新增 `consumer.reservation.manage` 细粒度权限，并只授予消费者角色。
- `POST /api/v1/consumer/reservations/{draftId}/update`
- `POST /api/v1/consumer/reservations/{draftId}/cancel`
- `WAITING_CONFIRMATION` 草稿在提交前可修改 1–20 人及未来 90 天内的订座时间；写请求要求幂等键和草稿乐观版本。
- 草稿一旦提交并形成商户订单即禁止继续编辑，避免消费者草稿与权威订单发生分叉。
- 消费者订座读模型直接关联权威 `merchant_orders.status`，区分等待商家、商家已确认和已取消，不复制第二套订单状态。
- 经营宝既有订单确认动作在同一事务中追加消费者助手事件和交易消息，并推进草稿/会话版本；消费者刷新即可看到商家确认回执。
- 消费者可在服务开始前取消本人 `PENDING_CONFIRMATION` 或 `CONFIRMED` 的零支付订座；必须填写原因、提交 `confirmed: true`、幂等键和草稿乐观版本。
- 取消直接更新权威商户订单为 `CANCELLED`，并同步写入商户订单事件、消费者助手事件、交易消息、审计、埋点和 `consumer.reservation.cancelled.v1` Outbox。
- 已支付订座不会走本批取消通道，必须进入退款流程；本批未伪造支付或退款连接器。
- 助手页面新增人数步进、日期/时间编辑、商家回执、取消原因和二次确认面板；取消态明确显示 ¥0 和无退款事项。

## 主要文件

- `packages/auth/src/index.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/consumer-assistant-service.ts`
- `apps/api/src/merchant-operations-service.ts`
- `apps/api/src/consumer-assistant-service.test.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages/assistant/index.vue`
- `docs/TRACEABILITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`

## 最终验证

- OpenAPI：118 条路径、135 个 schema、783 个 `$ref`、0 个悬空引用。
- `npm.cmd run check`：退出码 0。
- 类型检查：9 个工作区全部通过。
- 测试：148 项全部通过，其中认证包 8 项、产品目录包 5 项、API 132 项、管理端 3 项。
- 本批 API 定向测试：消费者助手、经营宝订单与认证共 17 项通过；消费者助手与经营宝订单复验 12 项通过。
- 消费者 H5 正式构建：通过。
- 消费者微信小程序正式构建：通过。
- 全仓 API、移动端、四个独立 H5 与管理端正式构建：通过。
- 构建只有 DCloud/Sass `legacy-js-api` 上游弃用提示。

## 浏览器验收

- 375px：从首页新建订座草稿，进入编辑器后人数由 3 人调整为 4 人并成功保存；日期与时间编辑控件可见。
- 明确提交后显示“等待商家确认”和“订座请求已送达”的回执，支付仍为 ¥0。
- 经营宝权威订单由 `PENDING_CONFIRMATION v1` 确认为 `CONFIRMED v2` 后，消费者端刷新显示“商家已确认”和“已锁定履约时段”。
- 消费者填写“浏览器验收：家庭行程调整”，二次确认取消后显示“订座已取消”、¥0 和“没有支付或退款事项”。
- 375px：`documentElement.scrollWidth = clientWidth = 375`，无横向溢出。
- 1440px：header、会话区和 footer 均为 640px，左右边界 400/1040，同轴居中；页面无横向溢出。
- 控制台：0 error / warning。

浏览器验收在持久演示库留下了新的 AI 会话、订座草稿、已确认后取消的订单，以及双方事件、消息和 Outbox。这是有意保留的真实验收证据，不要把它们当成种子重复或测试泄漏。

## 当前运行环境提示

验收时 `127.0.0.1:8787` 和 `127.0.0.1:43216` 仍由既有开发进程提供服务。不要盲目终止这些进程；下次先检查端口、进程归属和当前页面是否仍需要。

## 下一批建议

优先从 E8 未完成项选择一个独立可验收切片，不要一次混做：

1. 位置授权 + 附近列表/地图 + 拒绝定位与无定位降级；或
2. 语音输入 + 明确转写确认 + 既有文本助手链路复用；或
3. 支付前结构化确认页 + 支付连接器接口、回调与退款边界；或
4. 图片输入 + 上传安全边界 + 明确识别结果确认。

推荐先做第 1 项，因为“附近”是消费者端一级入口，能够复用现有已授权门店搜索和城市上下文，同时可以独立验收授权、降级、列表与地图边界。

开始下一批前先运行：

```powershell
npm.cmd test --workspace @lequ/api -- consumer-assistant-service.test.ts consumer-home-service.test.ts merchant-operations-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
```
