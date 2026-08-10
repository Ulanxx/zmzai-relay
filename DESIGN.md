# 中转驿 - 技术设计文档

> zmzai cloud 产品矩阵子产品（字母 **M**）。一个自建的 LLM API
> 中转站：统一模型目录、用户 Key、余额账本、多渠道故障转移与运营控制面。
>
> 状态：事实源 v4，2026-08-10。
>
> v4 变更：此前的 `new-api` Docker 方案没有成为生产实现。当前生产服务是
> `zmzai-relay` 仓中的 Next.js 应用，常驻香港服务器，由 PM2 管理；本文件以
> 当前实现及已明确的边界为准。

---

## 0. 一句话

`m.zmzai.cloud` 向个人开发者提供三个公开的 GPT 5.6 模型和一个
OpenAI 兼容入口。用户先登录、获得账户额度、创建受限制的 `zrk_...` Key，
再由中转驿按模型和渠道策略把调用转发到上游；每次请求都留下用量、成本、
渠道尝试与余额变动记录。

它不是上游模型厂商，也不承诺替代官方 API。它负责把用户看到的模型名、
鉴权、配额、计费和故障信息稳定下来。

## 1. 当前产品边界

### 面向用户

- 公开模型目录、模型能力和人民币价格；
- OpenAI 兼容的 `POST /api/v1/chat/completions`，支持普通与 SSE 流式响应；
- `POST /api/responses` 的 Responses 兼容层；
- `GET /api/v1/models`，按调用者权限返回可用模型；
- 个人控制台：余额、调用记录、API Key、账单与接入文档；
- 新用户欢迎额度；余额耗尽后显示联系牧之增加额度的人工流程。

### 面向运营者

- 渠道增删改、连通性测试、启停、优先级和模型映射；
- 用户余额增减、API Key 查看与撤销；
- 模型价格和推理强度配置；
- 调用、失败、渠道健康和订单审核视图；
- 管理操作审计。

普通用户不显示运营入口；服务端仍以共享会话中的 `admin` 角色为准。

### 当前不做

- 不接入用户自带上游 Key；
- 不向浏览器暴露渠道密钥；
- 不提供自动化支付确认或承诺即时充值；
- 不支持任意模型名：开放目录严格限定为当前三个模型；
- 不把上游返回的无用量流式请求计费。此类调用记为 `unsettled`，释放预留余额。

## 2. 模型与调用契约

当前公开模型：

| 模型 | 推理强度 |
| --- | --- |
| `gpt-5.6-sol` | `low` / `medium` / `high` / `xhigh`，以运营配置为准 |
| `gpt-5.6-terra` | 同上 |
| `gpt-5.6-luna` | 同上 |

模型最大上下文、最大输出、人民币单价和可用推理强度存于 `ModelPrice`，不是写死
在页面或 Key 中。请求超过该模型的输出上限时，服务返回
`MAX_TOKENS_EXCEEDED`，并记录被拒绝的调用。

调用方使用：

```text
Authorization: Bearer zrk_...
Content-Type: application/json
POST https://m.zmzai.cloud/api/v1/chat/completions
```

请求体采用 OpenAI Chat Completions 形状，接受 `max_tokens`、
`max_output_tokens`、`max_completion_tokens` 之一和可选
`reasoning_effort`。服务统一为上游使用 `max_tokens`。`stream: true` 会原样
转发 SSE，并在流结束时根据用量结算。

`/api/responses` 把 Responses 的 `input` / `instructions` 转换为同一个内部
Chat 调用，再返回 Responses 形状的数据或事件流。它是兼容层，不是另一套计费
或鉴权系统。

## 3. 运行架构

```text
调用方 / Relay 控制台 / Sandbox / Agent
                |
                | API Key、登录 Cookie 或内部服务鉴权
                v
      m.zmzai.cloud (Caddy TLS 反代)
                |
                v
      zmzai-relay (Next.js / PM2 / :3002)
        |       |          |
        |       |          +-- 安全上游请求与渠道尝试记录
        |       +------------- 余额预留、结算与账本
        +--------------------- MongoDB: 用户、会话、Key、用量、渠道、价格
                |
                v
       OpenAI 兼容上游渠道（按优先级尝试）
```

生产运行在香港服务器。Caddy 处理 TLS 并反代到本机 `:3002`；PM2 以 `runner`
用户常驻应用。MongoDB 只监听本机，Relay 与 auth、muzhi 共享
`muzhi_production` 中的 `users`、`sessions`，其余 Relay 集合由 Relay 自己管理。

会话使用同一 `AUTH_SECRET` 和父域 Cookie；未登录用户统一跳到
`auth.zmzai.cloud/login`，而非任意子产品自己的登录页。

## 4. 请求、计费与故障转移

1. 解析调用方：优先识别 Agent 服务、Sandbox 服务、`zrk_...` Key，最后识别
   登录会话。
2. 校验模型目录、Key 允许模型、推理强度、请求大小、输出上限与速率限制。
3. 创建唯一 `UsageRecord`，以调用方和 `requestId` 防止重复处理。
4. 按该模型最大可能输出预留余额；余额不足返回 `402`，不访问上游。
5. 查询启用且支持该模型的渠道，按 `priority` 从小到大依次尝试。
6. 每次尝试写入 `ChannelAttempt`，包括渠道、映射后的上游模型、耗时和失败原因。
7. 第一个成功响应使用上游 `usage` 结算：写入实际 token、对用户的人民币扣费、
   渠道成本和毛利，同时释放多余预留。
8. 所有符合条件的渠道失败时，释放预留，将用量标为 `failed` 并返回
   `UPSTREAM_ERROR`。

渠道成本可以为空；为空时调用仍可按用户价格结算，但成本记录为未知，运营端不能
把它当作已确认毛利。流式响应若上游未带 `usage`，服务不扣费并标为 `unsettled`，
以免把无法核算的请求计入用户余额。

## 5. 渠道模型

一个渠道有以下运营字段：

- `baseUrl` 与仅服务端可读的上游 API Key；
- 一个或多个“公开模型名 -> 上游实际模型名”的映射；
- 启停状态、优先级、超时；
- 每千 token 的输入/输出成本，可同时留空但不能只配置一边。

“故障转移”在当前实现中是顺序尝试符合条件的渠道，并记录每次结果；它还不是
独立熔断器或加权负载均衡器。新增复杂路由前应先基于 `ChannelAttempt` 的失败率
和延迟确认需要，而不是在没有运行数据时预建 Redis 或队列。

上游是外部服务，可能记录请求、限流或返回与声明不一致的模型。涉密信息不应交给
不受牧之控制的渠道；渠道设置和模型目录都应明确告知用户实际可验证的能力，不把
上游能力当成平台保证。

## 6. 数据与权限

### 共享身份

`@zmzai/db` 是 User、Session、Account 的共享模型来源。Relay 只接受 active
用户，未验证邮箱的普通用户不能建立正常调用会话。所有用户资源都以 `userId`
过滤；管理员权限不能只依赖前端导航隐藏。

### Relay 资源

- `ApiKey`：哈希保存的 `zrk_...` Key、模型限制、RPM、月度消费上限和状态；
- `BalanceAccount` / `BalanceLedger`：人民币微分单位的余额、预留与不可篡改式
  变动记录；
- `Usage`：请求、用户、调用方、模型、token、价格、成本、渠道、错误与状态；
- `Channel` / `ChannelAttempt`：上游配置和每次路由尝试；
- `ModelPrice`：公开模型的能力与价格；
- `WalletOrder` / `PaymentReconciliation`：人工收款申请与核销事实；
- `AdminAudit`：运营管理动作。

API Key 明文只在创建时展示一次。渠道密钥与 Key 哈希不出现在用户 API 或页面中。

## 7. 与 Sandbox、Agent 的关系

Sandbox 不向用户索要模型厂商 Key。它用范围受限的 `sandbox_key` 通过 Relay 获取
可用模型，模型费用仍结算到该用户的余额。Agent 以内部服务鉴权调用 Relay，并带上
用户和任务运行 ID；这让 Relay 的用量记录能关联到 Agent Run，而不是形成另一套
余额系统。

这些内部契约必须经过真实登录和失败场景联调后才可标为稳定公开 API。当前用户公开
接口仍以 Relay 的模型目录、Chat Completions、Responses 和个人 Key 管理为准。

## 8. 运维与验收

- 代码只在 Git 仓库修改，香港服务器由部署脚本拉取、构建和 PM2 重启；
- `.env.production` 不进入 Git，`AUTH_SECRET`、Mongo URI 和 Cookie 域必须与
  auth/muzhi 一致；
- 每日 Mongo 备份仅是本机恢复能力，异地备份仍是待办；
- 关键观测来源是 PM2 日志、`Usage`、`ChannelAttempt` 和运营页；
- 每次渠道或路由改动至少验证：授权、模型限制、余额不足、普通响应、流式响应、
  失败切换、最终结算与管理审计。

## 9. 下一步

1. 用真实用户完成 Relay -> Agent -> Sandbox 的余额与运行关联验收；
2. 依据渠道尝试数据决定是否需要熔断、冷却和更复杂的路由；
3. 将 Relay 用量以统一事件契约提供给 `i.zmzai.cloud` 的未来个人控制台；
4. 完成 SSH 加固与 Mongo 异地备份，再扩大任何面向外部用户的额度发放。
