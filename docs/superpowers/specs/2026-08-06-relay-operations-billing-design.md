# 中转驿运营、用户与计费设计

**状态：** 已确认，待实施计划  
**日期：** 2026-08-06  
**范围：** `zmzai-relay` 自建 Next.js 网关

## 目标

将中转驿从渠道配置与管理员发 key 的演示版，扩展为可运营的 API 网关：

- 用户自助创建、轮换、吊销多个 API Token；
- 管理员管理渠道、公开模型价目、用户余额与所有 Token；
- 调用按模型输入/输出售价从预付余额结算；
- 每次调用记录实际渠道成本、收入和毛利；
- 上游渠道失败时，按优先级自动尝试下一个候选渠道。

第一版不接在线支付。余额由管理员手动调整；支付申请和自动入账属于后续阶段。

## 已有系统与修正点

系统已使用 MongoDB，与 `muzhi` / `zmzai-auth` 共享 `users`、`sessions`。
现有 `ApiKey`、`Channel` 和 `UsageRecord` 应保留可兼容字段并迁移扩展。

当前 API key 调用错误地将 `UsageRecord.userId` 写为 key id。实施后，key 调用必须写入 key 的真实 `userId`；未归属用户的历史或管理员 key 不进入普通用户的账单。新建用户 key 必须带 userId。

## 金额、价格与成本

所有货币值使用整数 `micros`，其中 `$1.00 = 1,000,000 micros`，禁止浮点结算。

### 模型公开价格

新增 `ModelPrice`：

| 字段 | 含义 |
| --- | --- |
| `model` | 对外公开模型名，唯一 |
| `inputPricePer1kMicros` | 输入 token 售价 |
| `outputPricePer1kMicros` | 输出 token 售价 |
| `maxInputTokens` / `maxOutputTokens` | 此模型单次可计费的硬上限 |
| `enabled` | 普通用户是否可调用 |
| `createdAt` / `updatedAt` | 时间戳 |

无启用价格的模型不可由普通用户调用。管理员可以配置渠道，但仅启用价目表的模型才可对外售卖。

### 渠道成本

`Channel` 的单一 `costPer1kTokensMicros` 废弃，改为：

- `inputCostPer1kTokensMicros`
- `outputCostPer1kTokensMicros`

保留渠道的模型映射、优先级、启用状态和超时。每个映射的公开模型可有独立成本；如果第一版模型级成本尚未填入，则使用渠道默认输入/输出成本。上游 key 仅写入，不可通过任何 API 读回。

### 用量快照

`UsageRecord` 代表一个用户请求，增加 `apiKeyId` 和不可回写的结算快照：

- `chargedMicros`：向用户扣除的金额；
- `costMicros`：实际命中渠道的成本；
- `grossProfitMicros`：`chargedMicros - costMicros`；
- 输入/输出售价快照；
- 输入/输出渠道成本快照；
- 请求的用户、Token、公开模型、上游模型和渠道。

历史记录不会因日后改价或渠道成本变化而变化。

新增 `ChannelAttempt`，一条记录代表一个请求对一个候选渠道的一次尝试：关联
`usageId`、渠道、上游模型、状态、延迟和脱敏错误摘要，以及 `costStatus`
（`known`、`unknown`、`not_charged`）。一个请求只有一条 `UsageRecord`，可以有多条
`ChannelAttempt`；最终成功或失败不会覆盖先前的尝试。

第一版的 `UsageRecord.costMicros` 仅统计最终成功渠道已返回 usage 的确定成本。超时、
连接中断等结果不确定的尝试必须标记 `costStatus=unknown`，不以零成本计入毛利；Admin
运营台单独展示「待核查上游成本」，不将其混入已确认毛利。

## 余额与账本

新增 `BalanceAccount`，每用户一条：`userId`（唯一）、`balanceMicros`、时间戳。

新增不可变 `BalanceLedger`：

| 字段 | 含义 |
| --- | --- |
| `userId` | 账户归属 |
| `kind` | `admin_credit`、`admin_debit`、`usage_charge`、`refund` |
| `amountMicros` | 正数入账，负数扣款 |
| `balanceBeforeMicros` / `balanceAfterMicros` | 审计快照 |
| `usageId` | 调用扣费时关联的用量记录 |
| `operatorUserId` | 管理员人工操作时的操作者 |
| `note` | 管理员调整原因，必填 |
| `createdAt` | 时间戳 |

管理员加减余额、调用扣费和退款必须在 MongoDB transaction 中同时更新余额、写流水和更新关联记录。账本与成功调用都不提供删除接口。

新增 `BalanceReservation`，用于调用前的临时预授权：关联用户、Token、请求和预留
金额，状态为 `held`、`settled` 或 `released`。账户额外保存 `reservedMicros`；可用余额
为 `balanceMicros - reservedMicros`。

## API 网关结算流程

1. 解析 Bearer Token，验证状态、归属用户、模型权限和速率限制。
2. 读取用户账户及公开模型价格。每个模型由 Admin 配置 `maxInputTokens` 与 `maxOutputTokens`；请求的消息 UTF-8 总字节数不得超过 128 KiB，`max_tokens` 不得超过该模型的 `maxOutputTokens`。
3. 按模型完整 `maxInputTokens + maxOutputTokens` 计算单次可计费最高售价，作为预授权金额；不以字符或 tokenizer 估算替代该硬上限。金额计算对输入、输出分别向上取整：`ceil(tokens * pricePer1kMicros / 1000)`。
4. 在 transaction 中创建 `UsageRecord`（状态 `processing`）和 `BalanceReservation`，并增加账户 `reservedMicros`。可用余额或 Token 当月可用额度不足完整最高售价时，返回 `402 INSUFFICIENT_BALANCE`，不访问上游。
5. 取支持模型且已启用的渠道，按优先级升序依次尝试。主 `UsageRecord` 在全部候选结束前保持 `processing`。每次尝试先创建 `ChannelAttempt`，结束时写入该次状态、延迟、错误摘要和成本状态。每个渠道将公开模型名映射为上游模型名。
6. 上游成功后取得输入与输出 usage，基于调用时价目计算 `chargedMicros`、`costMicros` 与 `grossProfitMicros`。
7. 在 transaction 中将预留转为实际扣费：减少账户 `balanceMicros` 与 `reservedMicros`，将预留标记 `settled`，写 `BalanceLedger` 和结算快照，并更新 Token 的调用/token/消费统计。未使用的预留金额随事务释放。
8. 上游失败时，释放全部预留，写失败调用与 `ChannelAttempt`；然后继续尝试下一个候选渠道，全部失败时返回 `502 UPSTREAM_ERROR`。
9. 流式调用仅在上游结束并带 usage 时结算。如上游未提供 usage，则释放全部预留，记录 `unsettled` 状态和原因，供管理员核查。系统不得猜测 token 数并收费。

预留和结算均使用 transaction 加余额与额度条件更新，任何并发调用均不得令账户余额或 Token 可用额度小于零。

### 请求幂等性

客户端可提交 `requestId`（最多 128 字符）。`UsageRecord` 保存 `callerKind`（`apikey`
或 `session`）与 `callerId`（API key id 或 session user id）；唯一索引为
`(callerKind, callerId, requestId)`。幂等键正是这三项；未提供时由网关生成 UUID，客户端重试不能依赖自动生成的 id。
同一幂等键已有 `processing` 请求时返回 `409 REQUEST_IN_PROGRESS`；已有终态请求时返回
`409 REQUEST_ALREADY_PROCESSED`。第一版不重放上游响应，以确保流式调用不会重复连接或重复收费。

## Token 与限流

`ApiKey` 必须归属一个用户，明文仅在创建或轮换响应中返回，持久化只存 hash。

用户可创建多个 Token，设置：名称、允许模型、每分钟请求数和可选独立消费上限。独立消费上限以 `micros` 计，按 Asia/Shanghai 自然月累计，并在每月第一天归零；预留金额也计入当月可用额度。调用必须同时满足用户账户可用余额与 Token 当月可用额度。用户可吊销或轮换自己名下的 Token；轮换立即吊销旧 Token。

管理员可跨用户查看、创建、吊销 Token。普通用户的请求只能以 session 用户作为查询条件，禁止使用任意 `userId` 参数读取他人资源。

第一版限流使用 MongoDB 固定时间窗原子计数。超过限制返回 `429 RATE_LIMITED`。用户暂停、Token 吊销、模型未授权、模型无公开价格、余额不足与无候选渠道均返回稳定机器码与中文错误消息。

## Admin 运营台

Admin 与 User 使用独立信息架构。Admin 导航：

1. **运营概览**：今日/本月请求、成功率、tokens、收入、成本、毛利、余额负债；渠道健康和异常待处理项。
2. **渠道**：新增、编辑、启停、测试，管理映射、双向成本、优先级与超时。
3. **价目表**：管理公开模型、输入/输出售价和启用状态。
4. **用户与余额**：搜索用户，查看余额、消费、Token，手动加减余额并填写原因。
5. **全量 Token 与调用**：按用户、Token、模型、渠道、状态和时间筛选；可强制吊销 Token。

新增不可变 `AdminAuditLog`。Admin 的渠道、价目、用户状态、Token 与余额写入操作记录操作者、资源类型与 ID、变更前后值、时间与理由。金额、成本、毛利全部来自服务端快照，不在浏览器计算。

## User 使用端

用户登录后进入「我的中转驿」：

- 首页展示当前余额、本月消费、最近 30 天 tokens、成功率、低余额提示及最近调用；
- 「我的 Token」支持创建、轮换、吊销和查看每个 Token 的本月消费、调用数、最后使用时间；
- 「账单与用量」展示自己的余额流水和调用记录，可按时间、模型、Token、状态筛选；
- 页面提供可用模型和调用示例。

用户只能看到公开售价与自己的实际扣费，永不展示渠道名称、渠道成本、毛利或其他用户数据。

## 交付顺序

1. 数据模型迁移、余额账本服务、公开模型价目、渠道双向成本。
2. 网关鉴权、限流、余额预检、结算与按优先级故障切换。
3. Admin API 与运营台。
4. User API 与 Token、余额、账单、用量页面。
5. 端到端验证：人工加余额、创建 Token、实际转发、正确扣费、渠道切换和权限隔离。

## 验收标准

- 并发调用不能使余额小于零；
- 每笔已结算调用可追溯到唯一账本流水，收入、成本、毛利一致；
- 用户只能管理自己的 Token 和读取自己的账务数据；管理员拥有完整运营视图；
- 改价仅影响之后的新调用；
- Token 吊销、余额不足、限流、无价目模型、渠道故障切换都可自动验证；
- 所有未结算调用可由管理员筛选，且不发生隐性收费。
