# Harness Adapter接口契约

## 1. 为什么必须有 Adapter

DeepSeek Harness 仍在开发预览阶段。乐趣宝业务层不能依赖上游内部类、数据库或插件实现，只依赖稳定的 Adapter。

上游升级、替换或回滚时，前台会话 ID、任务 ID、事件语义、成果格式和审计记录不能改变。

## 2. 稳定接口

### createSession

输入：租户、用户、角色、空间、模型策略、预算、可用工具。

输出：乐趣宝会话 ID、Harness 运行 ID、创建时间。

### run

输入：会话 ID、消息、附件、执行模式、幂等键。

输出：任务 ID，并通过事件流返回消息、工具、步骤、成果和确认请求。

### resume

输入：任务 ID、检查点、补充资料或人工确认、幂等键。

输出：恢复后的任务状态。

### cancel

输入：任务 ID、取消原因、操作人。

输出：已取消或无法取消的原因。取消不删除历史和审计。

### subscribe

输入：会话或任务 ID、最后事件序号。

输出：按顺序重放事件，支持断线续传。

### health

输出：版本、提交、运行状态、队列、插件、模型路由和依赖健康。

## 3. 标准事件

- session.created
- message.started
- message.delta
- message.completed
- tool.requested
- tool.started
- tool.completed
- tool.failed
- approval.requested
- approval.resolved
- artifact.created
- task.paused
- task.resumed
- task.completed
- task.failed
- task.cancelled

事件信封必须带 tenant_id、actor_id、session_id、task_id、sequence、trace_id、occurred_at、schema_version。

## 4. 工具边界

- Harness 和模型不能直连生产数据库。
- 所有工具调用先进入乐趣宝 Tool Gateway。
- Tool Gateway 根据服务端身份重新检查租户、角色、对象状态、金额、套餐和审批。
- 读工具返回最少必要数据。
- 写工具必须有幂等键、确认、审计和补偿。
- 顾客消息、网页内容和插件输出都属于不可信输入。

## 5. 预算与失败

- 每次 run 写入预估预算。
- 调用前预占额度，完成后按实际结算，失败后返还可返部分。
- 模型或插件超时采用有限重试，超过次数进入异常中心。
- Adapter 不可用时，普通业务后台、支付、核销和人工客服仍可运行。
- 长任务保存检查点，上游恢复后从最近安全点继续。

## 6. 版本规则

生产配置同时记录：

- 乐趣宝版本。
- Adapter 版本。
- Harness 提交。
- 插件版本。
- 模型路由版本。
- 提示词和知识版本。

任何一个版本变化都能追到评测结果和发布批次。
