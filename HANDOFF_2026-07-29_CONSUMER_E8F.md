# 2026-07-29 消费者端 E8 第六批交接

## 结论

本批“语音受限上传 + 转写连接器契约/签名回调/幂等 + 用户可编辑明确确认 + 既有文本助手复用”已经完成并修绿。不要重做 E8 首页、城市、消息、家庭身份、搜索、AI 文本会话、订座管理、附近、支付边界，或本批语音确认链路。

唯一完成度依据仍是 `docs/TRACEABILITY.md`。E8 总项保持部分完成：真实语音转写连接器、图片、生产地图/导航、门店详情与团购、真实微信支付连接器仍未实现。

## 已完成能力

- 新增 `consumer.voice.manage`，仅授予消费者角色并维持 `SELF` 数据范围。
- 新增受限二进制语音上传：常见音频 MIME、最大 8MB、0.5–60 秒，并再次校验当前城市和家庭身份。
- 上传只创建 `PENDING_TRANSCRIPTION` 私有输入、暂存原始音频并投递 `consumer.voice.transcription.requested.v1` Outbox；不伪造转写成功。
- 转写回调精确免 Bearer，但强制 HMAC 签名；连接器事件号支持幂等重放并拒绝同事件号的冲突结果。
- 成功回调只生成 `READY_FOR_CONFIRMATION` 草稿，失败回调进入 `FAILED`；两种回调都会立即删除原始音频。
- 转写原文只保存在消费者私有语音输入中；审计、埋点和 Outbox 仅保存 SHA-256 摘要、置信度、文件摘要和状态。
- 消费者可编辑转写稿，但必须提交 `confirmed: true` 和当前乐观版本才能进入 `CONFIRMED`。
- 文本助手写接口新增可选 `sourceVoiceInputId`；只有本人、当前上下文、`CONFIRMED` 且文本完全一致的语音输入才能被原子消费为 `DISPATCHED`，随后复用既有推荐、订座草稿和消息链路。
- 语音事件数据库只追加，禁止更新和删除。
- 消费者页面新增录音按钮、待转写、失败、可编辑确认和已发送状态；首页语音入口进入真实助手。
- 当前 `liveTranscriptionConnectorAvailable=false`，没有宣称接通生产语音识别。

## 主要文件

- `.env.example`
- `packages/auth/src/index.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/database.ts`
- `apps/api/src/consumer-voice-service.ts`
- `apps/api/src/consumer-voice-service.test.ts`
- `apps/api/src/consumer-assistant-service.ts`
- `apps/api/src/consumer-assistant-service.test.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages/index/index.vue`
- `apps/consumer-miniapp/src/pages/assistant/index.vue`
- `docs/TRACEABILITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`

## 最终验证

- OpenAPI：125 条路径、139 个 schema、831 个 `$ref`、0 个悬空引用。
- `npm.cmd run check`：退出码 0。
- 类型检查：9 个工作区全部通过。
- 测试：167 项全部通过，其中认证包 8 项、产品目录包 5 项、API 151 项、管理端 3 项。
- 本批语音 API：7 项通过。
- 语音、消费者助手、支付、经营宝订单与认证兼容复验：31 项通过。
- 全仓 API、通用移动端、四个独立 H5 与管理端正式构建：通过。
- 消费者微信小程序正式构建：通过。
- 构建只有 DCloud/Sass `legacy-js-api` 上游弃用提示。

## 浏览器验收

- 使用本地最小测试音频真实建立 `PENDING_TRANSCRIPTION` 输入，再以开发环境 HMAC 签名回调进入 `READY_FOR_CONFIRMATION`；这不是生产语音识别。
- 页面展示 3.6 秒、94% 置信度，以及“上传成功不等于识别成功、确认前不会发送助手”的明确说明。
- 实际把转写稿中的“两个人”修改为“三个人”，再点击“我已核对，确认并发送给助手”。
- 页面进入 `DISPATCHED`，新增内容完全等于编辑后文本的用户消息，并生成真实授权推荐和待确认订座草稿。
- 1280×720 下文档宽度等于视口宽度，无页面级横向溢出；604px 语音卡和 640px 底部输入区居中。
- 新标签控制台 0 error/warning。
- 麦克风权限与真实设备录音未在桌面浏览器中代用户授权；录音 API 和文件读取由消费者正式构建与类型检查覆盖。

## 当前运行环境提示

验收时 API 开发服务运行于 `127.0.0.1:8787`，消费者 H5 运行于 `127.0.0.1:43216`，且 H5 通过 `VITE_API_BASE_URL=http://127.0.0.1:8787/api/v1` 访问 API。演示数据库保留本次语音元数据、转写确认和消息证据，但签名回调后原始音频已经删除。不要盲目终止进程；下次先检查端口、进程归属和页面是否仍需要。

## 未完成边界

- 真实 ASR/语音转写供应商、生产凭据、重试调度、限流、可用性监控与成本治理。
- 图片上传、恶意内容/类型/尺寸校验、识别与用户明确确认。
- 生产地图、导航和实时路线连接器。
- 门店详情、团购方案、库存、价格和有效期闭环。
- 真实微信支付下单、商户凭据、证书轮换、平台证书验签和渠道对账。

## 下一批建议

推荐先做“图片输入 + 上传安全边界 + 识别结果明确确认 + 复用既有文本助手链路”。真实语音连接器需要外部供应商凭据，本批已经完成所有不依赖外部权限的内部状态机、隐私回收、签名回调和人控确认边界。

开始下一批前先运行：

```powershell
npm.cmd test --workspace @lequ/api -- consumer-voice-service.test.ts consumer-assistant-service.test.ts consumer-payment-service.test.ts merchant-operations-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
```
