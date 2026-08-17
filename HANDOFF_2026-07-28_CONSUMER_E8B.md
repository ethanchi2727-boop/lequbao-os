# 2026-07-28 消费者端 E8 第二批交接

## 结论

本批“AI 文本会话 + 真实商家推荐 + 订座草稿 + 明示确认”已经完成并修绿。不要重做 E8 首页、城市、消息、家庭身份、搜索或本批文本订座链路。

唯一完成度依据仍是 `docs/TRACEABILITY.md`；E8 总项保持部分完成，因为语音、图片、位置、方案/比价/地图、支付等仍未实现。

## 已完成能力

- 首页 AI 输入、快捷意图和底部“问乐趣”进入真实助手页；原全局搜索保留为显式工具入口。
- `GET /api/v1/consumer/assistant`
- `POST /api/v1/consumer/assistant/messages`
- `POST /api/v1/consumer/reservations/{draftId}/confirm`
- 文本请求严格绑定当前消费者 `SELF` 主体、城市和家庭成员上下文。
- 推荐只读取已发布、获 `PLATFORM_DISPLAY` 授权、营业中且目录有效的真实门店；最多 3 个，无竞价排名。
- 本批使用可重复验收的 `consumer-intent-local-v1`，不是生产大模型连接器。
- 包含订座意图时只创建 `WAITING_CONFIRMATION` 草稿；确认前不创建订单、不扣款、不占库存。
- 用户提交 `confirmed: true` 后创建 `SKILL / RESERVATION / PENDING_CONFIRMATION` 商户订单，`paid_amount_fen = 0`。
- 支持阿拉伯数字以及一、二、两、三至十的中文人数解析。
- 首次带 prompt 进入助手后会替换为无 prompt 地址；刷新只恢复会话，不重复发送或生成草稿。
- 会话消息和助手风险事件只追加；确认事务同步写入商户订单事件、消费者交易消息、审计、埋点和 `consumer.reservation.submitted.v1` Outbox。

## 主要文件

- `apps/api/src/consumer-assistant-service.ts`
- `apps/api/src/consumer-assistant-service.test.ts`
- `apps/api/src/database.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `packages/auth/src/index.ts`
- `packages/contracts/src/index.ts`
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages/assistant/index.vue`
- `apps/consumer-miniapp/src/pages/index/index.vue`
- `apps/consumer-miniapp/src/pages.json`
- `docs/TRACEABILITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`

## 最终验证

- OpenAPI：116 条路径、135 个 schema、771 个 `$ref`、0 个悬空引用。
- `npm.cmd run check`：退出码 0。
- 类型检查：9 个工作区全部通过。
- 测试：146 项全部通过，其中 API 130 项、本批定向 5 项。
- 消费者 H5 正式构建：通过。
- 消费者微信小程序正式构建：通过。
- 构建只有 DCloud/Sass `legacy-js-api` 上游弃用提示。

## 浏览器验收

- 375px：从首页发送中文文本，显示真实授权门店、推荐理由、价格、订座草稿、时间、中文人数、脱敏手机号和 ¥0。
- 明确确认后显示“已提交商家”，订单保持待商家确认，未扣款。
- 首发后 URL 不含 prompt；刷新前后消息数量不变。
- 375px：页面、header、footer 均无横向溢出。
- 1440px：header、会话内容和 footer 均为 640px 且同轴。
- 控制台：0 error / warning。

浏览器验收在持久演示库留下了多轮 AI 会话、若干订座草稿和已确认的待商家订单，这是有意保留的真实验收痕迹，不要把它们当成种子重复或测试泄漏。

## 当前运行环境提示

验收时 `127.0.0.1:8787` 和 `127.0.0.1:43216` 已被既有开发进程占用，且都能实时加载本批代码。不要盲目终止这些进程；下次先检查端口和当前页面是否仍需要。

## 下一批建议

优先从 E8 未完成项选择一个独立可验收切片，不要一次混做：

1. 位置授权 + 附近/地图 + 无定位降级；或
2. 语音输入 + 明确转写确认 + 文本链路复用；或
3. 订座时间/人数可编辑、商家确认回执与消费者取消；或
4. 支付前结构化确认页与支付连接器边界。

推荐先做第 3 项，因为它可继续复用当前订座草稿和经营宝订单状态机，又不需要引入生产地图、ASR 或支付供应商。

开始下一批前先运行：

```powershell
npm.cmd test --workspace @lequ/api -- consumer-assistant-service.test.ts consumer-home-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
```

