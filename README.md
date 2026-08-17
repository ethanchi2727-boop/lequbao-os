# 乐趣宝与乐趣生活 V6.1

这是依据 V6.1 正式开发总包重建的新平台。V5 代码保留在 `main` 分支和 Git 历史中，当前升级在
`upgrade/v6.1-rebuild` 分支推进，不在新架构中复制旧实现。

## 当前阶段

- 已固化唯一开发基线、总包校验结果、冲突裁决和 V5→V6 迁移矩阵。
- 已引入 PostgreSQL 15+ 的 73 表基线、租户 RLS、不可变台账、审计与 Outbox。
- 正在构建模块化单体 API、异步 Worker、共享契约与全仓质量门。

权威状态见 [PROJECT_STATE.md](PROJECT_STATE.md)，架构决策见
[docs/adr/0001-v6-1-rebuild.md](docs/adr/0001-v6-1-rebuild.md)。

## 本地命令

要求 Node.js 22.23.1+ 与 Corepack。

```powershell
corepack pnpm install
corepack pnpm check
```

数据库需要 PostgreSQL 15+：

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/schema.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/tests/rls.sql
```

本地没有 PostgreSQL 时，推送分支后由 GitHub Actions 的真实 PostgreSQL 服务执行这两项。
