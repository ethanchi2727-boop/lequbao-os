# 开发期模拟网关

这套配置只解决本地开发阶段尚未取得微信、支付、对象存储、企业微信、模型、隐私处理等正式供应商配置的问题。所有响应都带 `x-lequ-data-source: development-mock`，不构成真实联调、合规审批、财务审批、受控验收或上线证据。

## 启动

1. 将 `.env.development-mock.example` 复制为 `.env.development-mock.local`；该文件已被 Git 忽略。
2. 把其中的 `DATABASE_URL` 改为开发 PostgreSQL 15+。数据库、RLS 和迁移属于平台核心边界，不使用内存 mock 替代。
3. 启动统一模拟网关：

   ```powershell
   corepack pnpm dev:mock-gateways
   ```

4. 另开终端，以同一个环境文件启动 API：

   ```powershell
   node --env-file=.env.development-mock.local --import tsx apps/api/src/server.ts
   ```

5. 需要执行一次 Worker 时：

   ```powershell
   node --env-file=.env.development-mock.local --import tsx apps/worker/src/main.ts
   ```

默认模拟网关为 `http://127.0.0.1:3399`，健康检查为 `/health`。它覆盖身份交换、对象存储、支付/退款/对账、客服知识/模型/工具、企业微信通知与回调配置、GEO/插件、微信小程序构建与生命周期、Outbox、隐私删除和隐私导出边界。

## 安全边界

- 必须显式设置 `LEQU_DEVELOPMENT_MOCKS=1`，否则模拟网关拒绝启动。
- `NODE_ENV=production` 时模拟网关、API 和 Worker 都会拒绝该配置。
- `.env.development-mock.example` 中的值是公开的开发常量，不得放入任何服务器或密钥管理系统。
- 受控预检仍要求 HTTPS、非回环地址、真实独立审批和真实证据；本模拟配置不能让阶段 47–50 变成 PASS。
