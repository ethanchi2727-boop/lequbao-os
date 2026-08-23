# ADR-0011：前端产品化拓扑

## 状态

Superseded by ADR-0012. The native-ESM H5 slice remains temporary migration evidence only.

## 决策

- `https://bao.lequ.com/` 和 `/life/*`：乐趣生活响应式 H5。开发预览可以通过明确的 `demo=1` 使用标记清楚的 Mock；生产环境必须使用消费者会话和权威 API。
- `/bao/*`：乐趣宝 PC/H5 工作台。开发模拟员工登录只服务此入口。
- `apps/consumer-miniapp`：乐趣生活微信小程序，复用业务契约、设计 Token 和 API 语义，不把 WXML 当作 H5。
- `apps/merchant-miniapp`：商家独立小程序模板实例，与乐趣宝商户后台保持产品边界。
- 第一阶段不引入新运行时框架依赖，先在现有 Web 包中建立模块化原生 ESM 壳和测试边界，降低部署切换风险。页面规模扩展前再以测量结果决定是否引入 Vue；不能同时保留两套活跃实现。

## 原因

现有服务器已经提供同源 API 代理、安全响应头和稳定容器入口。先纠正 URL、应用壳、视觉资产和页面完成标准，可以最快恢复一个可访问、可回滚的产品入口，同时不扰动已验证的后端交易边界。

## 影响

- 开发预览根路径从员工模拟登录改为乐趣生活 H5。
- 员工模拟登录保留在 `/__development/login`，只由 `/bao` 路由触发。
- Web 构建同时产出乐趣生活 H5 和乐趣宝工作台资源。
- 生产 Web 服务按 `/life` 与 `/bao` 分别回退到各自入口文件。

## 回滚

恢复 Web 服务器根路径重定向和构建文件列表即可；API、数据库、Worker 和微信小程序不受影响。
