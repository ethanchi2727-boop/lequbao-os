# DeepSeek Harness官方源码获取

本总包不包含 DeepSeek Harness 源码、源码压缩包、依赖副本或 Git 历史。

截至 2026-08-15，已核对：

- 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- 默认分支：master
- 锁定提交：47f943859bef60e4160492346772ded9b24f765a
- 许可证：MIT，同时必须保留上游版权与第三方通知。
- 上游状态：Developer preview，官方明确提示可能发生不兼容变更。

正式项目不要直接跟随 master。先运行 fetch_harness.sh 拉取锁定提交，再由 Harness Adapter 接入。

## 获取步骤

在总包根目录执行：

    bash 14_Harness官方源码获取/fetch_harness.sh

脚本会：

1. 从官方仓库克隆。
2. 切换到锁定提交。
3. 校验实际提交。
4. 确认 LICENSE、THIRD_PARTY_NOTICES.md 和 package.json 存在。
5. 放到 runtime/deepseek-harness-official。

## 升级步骤

每次升级单独建分支，按下面顺序处理：

1. 记录新提交和许可证变化。
2. 检查上游发布说明与破坏性改动。
3. 跑 Adapter 契约测试。
4. 跑 68 项 Harness UI 门禁。
5. 跑客服、权限、支付和任务恢复回归。
6. 做影子流量验证。
7. 小比例灰度。
8. 保留旧提交和一键回滚开关。

上游 UI 只能作为交互参考，不能直接暴露给生产商户。生产用户看到的是乐趣宝。
