# 2026-08-02 消费者端 E8 第九批（E8I）交接

## 结论

本批“套餐草稿强确认 + 不可变价格/规则/预约槽位快照 + 有限库存或预约容量原子占用 + 零支付/待支付分流 + 待支付商家门禁 + 过期补偿”已完成并全部修绿。不要重做 E8H 已完成的门店详情和受控草稿，也不要重做本批强确认事务。

唯一完成度依据仍是 `docs/TRACEABILITY.md`。E8 总项保持部分完成：生产微信支付连接器、套餐支付成功回调后的完整履约推进、核销凭证、取消/退款闭环、分类聚合、比价和完整订单中心仍需后续开发。

## 已完成能力

- `POST /api/v1/consumer/deal-drafts/:draftId/confirm` 要求 SELF 消费者、显式 `confirmed: true`、当前草稿版本与幂等键。
- 草稿创建/确认幂等记录按租户和消费者主体隔离，并在写锁内再次检查，避免并发重复写和跨用户响应重放。
- 强确认事务重新验证城市/家庭上下文、门店营业与展示授权、Catalog/SPU、套餐发布有效期、SKU、价格规则/套餐版本及资源余量。
- 门店详情只下发与套餐星期/时段规则相交的真实预约槽位，包含剩余容量、时段覆盖价和配置版本；消费者 UI 按有效期、本地日期、数量和真实槽位选择，不再猜测时间。
- 预约草稿固化不可变槽位 ID、槽位配置版本、覆盖价、有效单价和服务时间；旧版预约草稿缺快照时返回 `deal_draft_slot_snapshot_missing` 专用重建提示。
- 有限库存使用条件扣减；预约容量按槽位 ID/版本/余量条件递增。占用和释放不修改槽位配置版本，同一槽位 A 到期后不会使 B 的草稿快照失效。
- 强确认原子建立经营宝订单、不可变订单快照与资源占用；毛额取原价和有效价较大值，优惠额为毛额减应付，`paid_amount_fen` 保持 0。
- 非零金额建立 `PENDING_PROVIDER` 支付意图与 `HELD` 占用；期限不晚于当前时间加 15 分钟、套餐有效期或服务时间。零金额不生成支付意图并把占用标为 `CONSUMED`。
- `PENDING_PROVIDER` 订单不进入经营宝接单待办/AI 待处理建议；确认与核销 API 都返回 `409 consumer_deal_payment_pending`，覆盖升级前已被误接单的存量状态。
- 过期扫描在 `BEGIN IMMEDIATE` 内选取并释放；原子恢复有限库存/预约容量、取消支付意图和订单、推进草稿 `EXPIRED`，并追加消费者消息、双方事件、审计、埋点及支付/订单取消 Outbox。重复扫描不会重复释放或重复补偿。
- OpenAPI 与共享契约已同步真实 `reservationSlots`、套餐确认状态、支付状态和商家可确认标志；消费者和经营宝页面均明确“等待支付连接器（未扣款）/待顾客支付 · 不可接单”。

## 主要文件

- `packages/contracts/src/index.ts`
- `apps/api/src/database.ts`
- `apps/api/src/consumer-store-service.ts`
- `apps/api/src/consumer-store-service.test.ts`
- `apps/api/src/merchant-operations-service.ts`
- `apps/api/src/merchant-operations-service.test.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages/store/index.vue`
- `apps/consumer-miniapp/vite.config.ts`
- `apps/merchant-miniapp/src/pages/index/index.vue`
- `apps/merchant-miniapp/src/pages/orders/index.vue`
- `apps/merchant-miniapp/vite.config.ts`
- `docs/TRACEABILITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`

## 最终验证

- `npm.cmd run check`：退出码 0，耗时约 729.5 秒。
- 类型检查：9 个工作区全部通过。
- 自动化测试：190 项全部通过，其中认证包 8 项、产品目录包 5 项、API 174 项、管理端 3 项。
- 本批定向：消费者套餐 15 项、经营宝订单 6 项通过。
- OpenAPI 3.1：131 条路径、143 个 Schema、875 个 `$ref`、0 个悬空引用。
- 全仓 API、通用 H5、四端 H5 与管理端正式构建：通过。
- 四个独立微信小程序正式构建：通过；消费者最终补丁后的 H5/微信产物已单独复验。
- 构建只输出 DCloud/Dart Sass `legacy-js-api` 弃用提示、Node SQLite 实验提示及 Windows `os - Alias not found` 噪声，所有相关命令退出码均为 0。
- 最终只读审计：无 blocker、无 major；审计提出的两个 minor（OpenAPI nullable 必填字段与中国本地日期边界）已继续修复并通过最终门禁。

## 浏览器验收

- 消费者在云和里·静安店真实选择 2026-08-06 20:00–21:30 槽位；页面显示“时段价 ¥1088、剩余 5、草稿金额 ¥1088”。
- 点击建立草稿后显示 `WAITING_CONFIRMATION`，明确尚未创建订单、占用资源、生成凭证或发起扣款。
- 再次强确认后显示 `CONFIRMED / PENDING_PROVIDER / HELD`、“等待支付连接器（未扣款）”，槽位剩余容量从 5 收敛为 4。
- 数据库订单 `LQD26080215550512A5`：应付/毛额/支付意图均为 108800 分，优惠 0，已付 0；槽位 `slot-e5-thu-2000` v1、覆盖价 108800 分，容量 8、已占 4；订单仍为 `PENDING_CONFIRMATION`，支付为 `PENDING_PROVIDER`。
- 经营宝最新订单卡和详情均显示“待顾客支付 · 不可接单”，实付 ¥0，不出现商家确认动作。
- 390px 视口消费者文档宽度 375px、无横向溢出；1280px 视口文档宽度 1265px、页头 640px、主内容 604px 同轴居中。经营宝 1280px 同样无横向溢出。
- 消费者与经营宝最终新标签控制台均为 0 error/warning。

## 当前运行环境提示

验收结束时 API 开发服务位于 `127.0.0.1:8787`，消费者 H5 位于 `127.0.0.1:43216`，经营宝 H5 位于 `127.0.0.1:43217`。消费者与经营宝 H5 分别由本任务的长生命周期执行单元 118/119 承载；不要盲目终止，下次先检查端口和进程归属。演示订单的 `HELD` 占用会由 60 秒扫描器在支付期限后自动取消并释放，这是预期行为。

当前工作区没有 Git 仓库元数据，不能以提交号作为证据；以上仓库文档、代码、数据库事实和门禁输出是本批持久化事实源。

## 未完成边界

- 套餐专用生产支付连接器、签名成功/失败回调，以及支付成功后允许商家接单的状态推进。
- 支付成功后的占用消费、核销凭证签发、实际履约完成与容量生命周期。
- 套餐订单取消、退款、迟到支付回调和异常恢复的完整闭环。
- 本地生活分类聚合、比价解释、更多真实商家套餐和完整订单中心。
- 真实 ASR、图片识别/OCR、生产地图/导航，以及电商购物车、结算、物流和售后。

## 下一批建议

推荐 E8J 做“套餐支付连接器回调 + 支付成功状态机 + 商家可接单解锁 + 核销凭证 + 取消/退款补偿”。必须继续复用本批不可变订单/槽位快照和资源占用，不得由客户端直接把 `PENDING_PROVIDER` 改成已支付；只有验签、金额/币种/意图状态一致且事件幂等的服务端回调可以写入支付成功事实。

开始下一批前先运行：

```powershell
npm.cmd test --workspace @lequ/api -- consumer-store-service.test.ts merchant-operations-service.test.ts consumer-payment-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
npm.cmd run typecheck --workspace @lequ/merchant-miniapp
```
