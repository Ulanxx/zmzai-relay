# 中转驿 — 技术设计文档

> zmzai cloud 产品矩阵子产品（字母 **M**）。一个自托管的 LLM API 网关：
> 一处接入、多家模型、统一鉴权、按 token 计费。serverless 部署于 Vercel。
>
> 状态：设计稿 v1，2026-08-06。本文是 zmzai-relay 仓的事实来源，
> 实现前必读。复用模式大量借鉴 `mdldm-knowledge-kit`（下称 muzhi 仓）。

---

## 0. 一句话

`m.zmzai.cloud` 接收统一格式的模型调用请求，鉴权后流式转发到上游模型
厂商，并按 token 记账扣额度。它让"调模型"从"每个产品各自接厂商 SDK"
变成"所有产品走一个网关、用牧之发的 key"。

## 1. 为什么是它，为什么 serverless

**定位**：产品矩阵的地基。沙箱场、Agent 使、工作台、 muzhi 知识体系
未来所有 AI 功能都调模型——它们不该各自重写 API 调用，而该走中转驿。

**serverless 成立的理由**：
- 请求转发无状态，每调用独立，不需要常驻进程；
- 模型 API 自身响应数秒到数十秒（尤其流式），serverless 冷启动无感；
- 转发逻辑几乎不耗 CPU，成本接近零。

**serverless 的三个约束与对策**：

| 约束 | 对策 |
|---|---|
| 流式响应（SSE）必须透传 | 用 **Vercel Edge Runtime**（流式友好），不用 Node serverless 缓冲 |
| 长回答超时（Hobby 60s / Pro 300s） | Edge Runtime 无 60s 硬限；超时上限写进文档，调用方需知 |
| 流式中途写库丢数据 | **流结束后统一记账**，不在流式过程中写库 |

## 2. 架构

```
调用方（你的产品 / 用户）
  │  Authorization: Bearer zmzai-key-xxx        ← 牧之发的 key
  │  POST /v1/chat/completions  { model, messages, stream }
  ▼
┌─ m.zmzai.cloud  (Vercel Edge Function) ────────────────┐
│ 1. 限流      Mongo 原子桶（按 key）                      │
│ 2. 鉴权      zmzai-key → hash 查 ApiKey，校验状态/额度    │
│ 3. 路由      model 名/别名 → 选上游 Provider + 厂商 key   │
│ 4. 转发      换厂商 key，流式转发请求体                    │
│ 5. 透传      SSE 流式回传（不缓冲）                       │
│ 6. 记账      流结束后记 UsageRecord + 扣 ApiKey 额度      │
└─────────────────────────────────────────────────────────┘
  ▼
上游：OpenAI / Anthropic / Gemini / 国内模型（可扩展）
```

## 3. 复用 muzhi 仓的模式（不另起炉灶）

以下模式/代码从 muzhi 仓借鉴或直接照抄（改 env key 与 global 变量名）：

| 模块 | 借鉴自 | 用法 |
|---|---|---|
| MongoDB 连接 | `providers/database/mongodb/connection.ts` | 全文照抄：global cache 连接 + `bufferCommands:false` + 失败重置 promise |
| Provider 抽象 | `providers/*/port.ts + index.ts` | 上游 LLM Provider 用同构的 port + 工厂模式 |
| env 校验 | `config/env.ts` | 骨架照抄：zod + `superRefine` 做 "选某 Provider 必须配其密钥" + `getConfigWarnings()` |
| 幂等留痕 | `models/commerce.ts` PaymentEvent + `commerce-service.ts` | UsageRecord 用 `apiKey+requestId` 唯一索引 + payloadDigest + 状态机 |
| 限流 | `providers/rate-limit/mongodb.ts` + `request-security.ts` | Mongo 原子桶按 key 限流 |
| 错误约定 | `app/api/checkout/route.ts` | `{ error, code }` JSON + zod `.strict()` safeParse |
| 观测 | `operations-service.ts` | `reportOperationalFailure` fingerprint 聚合 + HMAC webhook + `structuredLog` 单行 JSON |
| Mongoose 规范 | AGENTS.md | `strict:"throw"`、enum 从域常量导入、防重复注册、敏感字段 `select:false` |

## 4. 数据模型（Mongoose，`strict:"throw"`）

### ApiKey — 牧之发给调用方的 key

```ts
{
  keyHash: string;        // sha256，select:false，唯一索引
  prefix: string;         // "zmzai-key-ab12" 前 8 位，用于展示/检索
  name: string;           // 用途备注 "muzhi 后端" / "张三试用"
  status: "active" | "revoked";
  quotaTotalTokens: number;    // 总额度
  quotaUsedTokens: number;     // 已用（原子 $inc）
  rateLimitPerMinute: number;  // 限流
  allowedModels: string[];     // 允许的模型/别名，空=全部
  createdAt / updatedAt: Date;
}
```

### UsageRecord — 每次调用留痕（幂等 + 审计）

```ts
{
  requestId: string;      // 调用方传入或服务端生成，apiKey+requestId 唯一索引
  apiKeyId: ObjectId;
  provider: "openai" | "anthropic" | "gemini" | ...;
  model: string;              // 实际调用的上游模型
  modelAlias: string | null;  // 若用了别名
  status: "received" | "streaming" | "completed" | "failed";
  promptTokens / completionTokens / totalTokens: number;
  payloadDigest: string;      // sha256 请求体，match /^[a-f0-9]{64}$/
  latencyMs: number;
  lastError: string | null;
  createdAt / updatedAt: Date;
}
```

**幂等**：`apiKey + requestId` 唯一索引；重复 requestId 命中 duplicate key
(11000) 则返回已有记录，不重复计费（同 muzhi PaymentEvent 模式）。

### ProviderAccount（可选，v1 先用 env）— 上游厂商 key

v1 厂商 key 直接放 Vercel env（`OPENAI_API_KEY` 等），不落库。多账号
轮询/加权是 v2。

## 5. API 设计

### `POST /v1/chat/completions`（Edge Runtime）

请求（OpenAI 兼容 + 别名扩展）：

```json
{
  "model": "gpt-4o" | "claude-sonnet-4" | "smart" | "fast",
  "messages": [{ "role": "user", "content": "..." }],
  "stream": true,
  "requestId": "client-uuid-可选"
}
```

处理流程（对应架构图 6 步）：

1. **限流**：`ApiKey.rateLimitPerMinute` 的 Mongo 原子桶，超限 429；
2. **鉴权**：`Authorization: Bearer <key>` → sha256 查 ApiKey；无效 401、
   revoked 403、额度不足 402、`allowedModels` 不含该模型 403；
3. **路由**：`model` 命中别名表则映射到具体上游模型 + Provider，否则按
   模型名前缀路由（`gpt-*`→openai、`claude-*`→anthropic、`gemini-*`→gemini）；
4. **转发**：构造上游请求，换厂商 key，`fetch` 流式 POST；
5. **透传**：`stream:true` 时 `new ReadableStream` 透传 SSE，逐 chunk 转发
   并累计 token（从上游 usage chunk 或流尾估算）；
6. **记账**：流结束（done/error）后 `UsageRecord` upsert + `ApiKey.quotaUsedTokens`
   `$inc`，失败记 `lastError` 并 `reportOperationalFailure`。

响应：成功透传上游 SSE 流或 JSON；错误统一 `{ error, code }`：

| code | status | 含义 |
|---|---|---|
| `INVALID_KEY` | 401 | key 无效 |
| `KEY_REVOKED` | 403 | key 已吊销 |
| `QUOTA_EXCEEDED` | 402 | 额度用完 |
| `MODEL_NOT_ALLOWED` | 403 | 该 key 不允许此模型 |
| `MODEL_UNKNOWN` | 400 | 模型名/别名无法路由 |
| `RATE_LIMITED` | 429 | 超限 |
| `UPSTREAM_ERROR` | 502 | 上游失败 |

### `GET /v1/models`

返回该 key 可用的模型/别名清单（读 ApiKey.allowedModels + 别名表）。

### `GET /v1/usage`（管理端，需 admin key）

返回某 key 的用量聚合。v1 简化：只在 muzhi 后台或直接查库，不开放公开端点。

## 6. Provider 适配（port + 工厂）

```
providers/llm/
  port.ts            # LlmProvider 接口：chat(req) => Stream/JSON，normalizeUsage()
  index.ts           # 工厂：按 model 名/别名选 provider，缺密钥抛可操作错误
  openai/index.ts
  anthropic/index.ts
  gemini/index.ts
```

接口（v1 最小）：

```ts
interface LlmProvider {
  name: string;
  supports(model: string): boolean;
  chat(req: ChatRequest, apiKey: string): Promise<Response>; // 流式 Response
}
```

**别名单独一张表**（`config/models.config.ts`），不放 Provider 里：

```ts
{ "smart": { provider: "anthropic", model: "claude-sonnet-4-..." },
  "fast":  { provider: "openai",    model: "gpt-4o-mini" } }
```

这样换底层模型只改配置，调用方不动。

## 7. 安全

- **key 存 hash**：ApiKey 只存 sha256，明文只在创建时返回一次（同 muzhi 邀请码）；
- **厂商 key 只在 env**：绝不落库、绝不进日志、绝不返回给调用方；
- **脱敏**：`structuredLog` 上下文过 `sanitizeLogContext`，不带 messages 内容（v1 不记录 prompt 内容，只记 token 数——隐私 + 合规）；
- **限流**：每 key 每分钟桶 + 全局兜底；
- **同源/CSRF**：网关是 Bearer 鉴权的 API，不走 cookie，天然免 CSRF；仍加 `rejectCrossOriginMutation` 防误用；
- **生产强制 HTTPS**：env `superRefine` 校验（同 muzhi）。

## 8. 观测

- **每次上游失败** `reportOperationalFailure`：fingerprint = provider+model+errorType 聚合，超阈值 webhook 告警（HMAC 签名，同 muzhi）；
- **结构化日志**：每调用一行 JSON（key prefix、provider、model、tokens、latencyMs、status），不含 prompt 内容；
- **慢调用**：latencyMs 超阈值记 warn，用于发现某上游变慢。

## 9. 部署

- **Vercel 项目**：`zmzai-relay`（已建，绑 `m.zmzai.cloud`）；
- **运行时**：`/v1/chat/completions` 用 Edge Runtime（`export const runtime = "edge"`），管理/usage 可 Node；
- **env**（Vercel Production）：

```dotenv
MONGODB_URI=mongodb+srv://...           # 与 muzhi 同 Atlas，独立 database
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
RELAY_ADMIN_KEY=...                     # 管理端鉴权
OBSERVABILITY_PROVIDER=webhook
OBSERVABILITY_WEBHOOK_URL=...
OBSERVABILITY_WEBHOOK_SECRET=...
```

- **启动校验**：`getServerEnv()` 启动即失败 + `getConfigWarnings()` 降级提示；
- **MongoDB**：与 muzhi 同 Atlas 集群，独立 database（如 `zmzai_relay`），
  独立数据库账号、最小权限（同 muzhi DEPLOYMENT.md 的 Atlas 建议）。

## 10. v1 范围（别做全）

**做**：
- `POST /v1/chat/completions`（流式 + 非流式）
- 3 个 Provider：OpenAI / Anthropic / Gemini
- key 鉴权 + 额度 + 限流 + UsageRecord 留痕
- 别名路由（smart/fast）
- 结构化日志 + 失败告警

**不做（v2+）**：
- 多厂商账号轮询/加权/故障自动切换（v1 单账号，切换手动改 env）
- 缓存（相同请求命中缓存省 token）
- 用量计费金额（v1 只记 token 数，定价你线下定）
- 管理后台 UI（v1 用脚本/直查库管理 key）
- function calling / 工具调用的特殊处理（透传即可，上游处理）
- 图片/音频/embedding 等非 chat 端点

## 11. 不做这件事的备选

如果只要"快速有个能卖 key 的网关"而不要 serverless/品牌/可控，部署
[one-api](https://github.com/songquanpeng/one-api)（或活跃 fork new-api）
到 Railway/Render，开箱即用 key 分发 + 计费 + 多模型 + 管理后台。代价：
非 serverless（需常驻）、UI/品牌不是你的、与你的 Vercel+MongoDB 基础设施
不融合。本文按自建精简版设计；若改走 one-api，本文仅鉴权/计费/模型部分
有参考价值。

## 12. 里程碑

| 阶段 | 交付 |
|---|---|
| M1 骨架 | env 校验 + MongoDB 连接 + ApiKey/UsageRecord 模型 + 单 Provider（OpenAI）透传 |
| M2 核心 | 鉴权 + 限流 + 记账 + 流式透传 + 错误约定 |
| M3 多模型 | Anthropic + Gemini + 别名路由 |
| M4 观测 | 结构化日志 + 失败告警 + 管理脚本 |
| M5 上线 | 绑 m.zmzai.cloud + 生产 env + 接入 muzhi 自用验证一周 |

---

## 附：serverless 流式透传的关键代码形态（Edge）

```ts
export const runtime = "edge";

export async function POST(req: Request) {
  // 1-3. 限流/鉴权/路由（读 MongoDB，Edge 可用 MongoDB Data API 或
  //      把鉴权放 Node 子路由——见「已知约束」）
  const upstream = await fetch(providerUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${providerKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // 4-5. 透传 SSE：直接返回上游 body 流
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
```

**已知约束（要在 M1 验证）**：Edge Runtime 不能直接用 Mongoose（无 TCP）。
两条路：
- (a) 鉴权/记账放 **Node Runtime 子路由**，Edge 只做转发——但那样鉴权和
  转发分两段，流式记账难；
- (b) Edge 用 **MongoDB Atlas Data API**（HTTPS）读写，或把鉴权缓存到
  **Upstash Redis**（Edge 原生支持 HTTP 访问）。
- **推荐 (b) 的变体**：鉴权/额度/记账用 Upstash Redis（Edge 友好、计数原子），
  UsageRecord 审计日志异步写 MongoDB。M1 第一件事就是验证这条链路，
  验证不过就退化为全 Node Runtime（接受 60s 超时上限）。
