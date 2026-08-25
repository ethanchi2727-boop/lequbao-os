# 乐趣宝 V6.2 真实仓库视觉迁移证据

日期：2026-08-25

## 范围

本轮只迁移正式升级包锁定的 Theme、共享布局、组件层级、五张视觉母版和 Mobile 五栏图片图标。V6.1 的业务、资金、权限、数据库和接口口径不变。

PC 母版路由：

- `/bao/page-004?demo=1`：`PC_CANONICAL_AI_WORKSPACE`；
- `/bao/page-026?demo=1`：`PC_CANONICAL_BUSINESS_CENTER`；
- `/bao/page-053?demo=1`：`PC_CANONICAL_DELIVERY_TOWER`。

这三个母版只在显式本地演示模式展示升级包示例数据。去掉 `demo=1` 后，页面继续读取服务端权威数据，或者在无权威数据时显示受保护空态，不把母版示例记录带入生产。

Mobile 母版落点：

- `pages/workbench/index`：AI 对话、服务端今日经营结果、待办推进和关键动作确认；
- `pages/merchants/index`：商户范围、收益汇总、实收/退款/直接成本和门店列表；
- Tab 固定为“对话、工作、任务、消息、我的”，每栏分别使用升级包中的选中态和未选中态图片。

## 实际验证

- `pnpm --filter @lequ/workbench-web test`：34 个测试文件、298 条测试通过；
- `pnpm --filter @lequ/workbench-web build`：通过；
- `pnpm --filter @lequ/bao-uniapp test`：3 个测试文件、9 条测试通过；
- `pnpm --filter @lequ/bao-uniapp typecheck`：结构门禁通过；
- `pnpm --filter @lequ/bao-uniapp build`：H5 与 `mp-weixin` 均构建通过；
- `git diff --check`：通过。

工作台全量测试第一次执行时，生产服务器测试随机取得浏览器禁止端口并报 `bad port`；该用例单独复跑 5/5 通过，随后全量复跑 298/298 通过，因此没有降低断言或绕过门禁。

## 未声明证据

应用内浏览器连续两次无法附着本地页面，当前会话也没有第二个可用浏览器，因此本轮没有把源码或静态检查冒充为截图证据。以下项目仍未声明完成：

- 三张 PC 母版的本轮浏览器截图对比；
- 两张 Mobile 母版的本轮 H5 截图对比；
- 微信开发者工具截图和真实设备验收；
- 受控身份、真实商户、支付/provider 或 PostgreSQL 运行时验收。

## 回退边界

回退本轮前端提交即可恢复上一版视觉；API、数据库迁移、金额规则和历史账本不需要回滚。
