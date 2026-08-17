# 2026-07-29 消费者端 E8 第五批交接

## 结论

本批“支付前结构化确认 + 支付连接器契约/签名回调/幂等 + 退款审批边界”已经完成并修绿。不要重做 E8 首页、城市、消息、家庭身份、搜索、AI 文本会话、订座管理、附近能力，或本批支付边界。

唯一完成度依据仍是 `docs/TRACEABILITY.md`。E8 总项保持部分完成：真实微信支付商户连接器、语音、图片、生产地图/导航、门店详情与团购仍未实现。

## 已完成能力

- 新增 `consumer.payment.manage`，仅授予消费者角色并维持 `SELF` 数据范围。
- 商家确认订座后，消费者必须再次核对结构化金额和风险说明，才能生成 `PENDING_PROVIDER` 支付意图。
- 生成支付意图不修改订单实收，不伪造扣款成功；当前 `livePaymentConnectorAvailable=false`。
- 微信连接器回调免 Bearer 仅限精确路径，但强制 HMAC 签名；金额、币种、意图状态和业务归属必须一致。
- `providerEventId` 与请求幂等键共同防止回调重放和重复入账；支付事件数据库只追加。
- 成功回调才更新权威订单 `paid_amount_fen`；失败回调只关闭意图，不增加实收。
- 已支付订座禁止直接取消，只能由消费者提交退款申请。
- 消费者退款进入 `REFUND_REQUESTED`；经营宝 L2 强确认审批后仍为待渠道处理，并写入连接器 Outbox；只有签名退款成功回调才进入 `REFUNDED`。
- 支付金额为零时取消订座会原子关闭仍在等待渠道的支付意图、追加取消事件并拒绝迟到支付成功回调。
- 消费者助手页面新增金额、支付状态、连接器边界、支付前确认和退款申请面板。

## 主要文件

- `.env.example`
- `packages/auth/src/index.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/database.ts`
- `apps/api/src/consumer-payment-service.ts`
- `apps/api/src/consumer-payment-service.test.ts`
- `apps/api/src/consumer-assistant-service.ts`
- `apps/api/src/consumer-assistant-service.test.ts`
- `apps/api/src/merchant-operations-service.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages/assistant/index.vue`
- `docs/TRACEABILITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`

## 最终验证

- OpenAPI：122 条路径、138 个 schema、809 个 `$ref`、0 个悬空引用。
- `npm.cmd run check`：退出码 0。
- 类型检查：9 个工作区全部通过。
- 测试：160 项全部通过，其中认证包 8 项、产品目录包 5 项、API 144 项、管理端 3 项。
- 本批支付 API：7 项通过。
- 支付、消费者助手与经营宝订单兼容复验：19 项通过。
- 全仓 API、通用移动端、四个独立 H5 与管理端正式构建：通过。
- 构建只有 DCloud/Sass `legacy-js-api` 上游弃用提示。

## 浏览器验收

- 真实创建一笔 ¥628 订座，消费者明确提交后由经营宝权威订单确认。
- 商家确认后页面显示权威金额、`NOT_STARTED` 和支付前风险说明；点击“我已核对，生成支付请求”后只进入 `PENDING_PROVIDER`。
- 页面明确说明：未收到签名成功回调前不会显示已支付，也没有修改权威实收。
- 在实收仍为 ¥0 时执行消费者取消，页面正确显示无需退款并回到未支付展示。
- 待支付意图原子关闭以及迟到支付成功回调拒绝由新增 API 测试复验。
- 1280px 桌面页面视觉正常；新标签控制台 0 error/warning。
- 没有真实微信商户凭据，因此未执行或宣称真实扣款/退款；签名支付成功、回调重放、退款审批和签名退款成功由 7 项 API 测试覆盖。

## 当前运行环境提示

验收时 API 开发服务运行于 `127.0.0.1:8787`，消费者 H5 运行于 `127.0.0.1:43216`，且 H5 通过 `VITE_API_BASE_URL=http://127.0.0.1:8787/api/v1` 访问 API。演示数据库保留本次 ¥628 订座、订单、支付意图和取消证据。不要盲目终止进程；下次先检查端口、进程归属和页面是否仍需要。

## 未完成边界

- 真实微信支付下单、商户凭据、证书轮换、平台证书验签和渠道对账。
- 语音输入、转写与用户明确确认。
- 图片上传、恶意内容/类型/尺寸校验、识别与用户明确确认。
- 生产地图、导航和实时路线连接器。
- 门店详情、团购方案、库存、价格和有效期闭环。

## 下一批建议

推荐先做“语音输入 + 明确转写确认 + 复用既有文本助手链路”。真实支付连接器需要外部微信商户凭据与生产权限，本批已经把不依赖外部权限的内部状态机、安全回调和退款边界做完。

开始下一批前先运行：

```powershell
npm.cmd test --workspace @lequ/api -- consumer-payment-service.test.ts consumer-assistant-service.test.ts merchant-operations-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
```
