# 中转驿 — 技术设计文档

> zmzai cloud 产品矩阵子产品（字母 **M**）。一个自托管的 LLM API 网关：
> 一处接入、多个上游、统一鉴权、故障转移、按 token + 成本计费。
> **上游主要是各类第三方中转站（便宜渠道），也兼容官方 API**——
> 中转驿是"中转的中转"，帮下游屏蔽上游的不稳定。serverless 部署于 Vercel。
>
> 状态：设计稿 v2，2026-08-06。本文是 zmzai-relay 仓的事实来源，
> 实现前必读。复用模式大量借鉴 `mdldm-knowledge-kit`（下称 muzhi 仓）。
>
> v2 变更：上游从"3 家官方 Provider"改为"**N 个上游端点**（OpenAI 兼容 +
> 各家原生协议混合）"，新增**多上游冗余 + 故障自动切换**与**按上游成本价
> 记账**，新增 §7 风险与合规。

---

## 0. 一句话

`m.zmzai.cloud` 接收统一格式的模型调用请求，鉴权后按"便宜的优先"路由到
某个上游端点，流式转发，上游挂了自动切下一个，并按 token 和上游成本价
记账。它让"调模型"变成"走牧之的网关、用牧之发的 key、花最少的钱、
不用担心哪个上游跑路"。

## 0.1 关键定位：中转的中转

上游不是官方，是**各种第三方中转站**（聚合站、镜像站、便宜渠道）。这带来
三个必须正视的事实：

1. **上游多为 OpenAI 兼容格式，但不全是**——多数便宜中转站提供
   `POST {base_url}/v1/chat/completions`（OpenAI 兼容），但也有走官方原生
   协议（Anthropic/Gemini 原生）或私有格式的。设计上按"**端点**"抽象，
   每个端点声明自己的协议类型。
2. **上游不稳定**——便宜渠道可能跑路、降智（偷换小模型冒充大模型）、限速、
   涨价、关站。中转驿的核心价值就是**多上游冗余 + 故障转移**，帮下游屏蔽
   这些。这不是可选功能，是这类产品的命门。
3. **数据会经过多层中转**——prompt 会流经"你的中转驿 → 上游中转站 → 可能
   再上层"。便宜渠道多半记录请求内容。**涉密/隐私数据不能走这条链**，
   只适合跑不敏感的、图便宜的任务（写作辅助、翻译、批量处理）。

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

**故障转移在 serverless 下的约束**：故障转移需要"记住哪个上游最近挂了"，
这是跨请求的状态。serverless 实例间不共享内存，所以健康状态必须放外部
存储——用 **Upstash Redis**（Edge 友好的 HTTP 访问）存上游健康/熔断状态，
不用实例内存。详见 §6.3。

## 2. 架构

```
调用方（你的产品 / 用户）
  │  Authorization: Bearer zmzai-key-xxx        ← 牧之发的 key
  │  POST /v1/chat/completions  { model, messages, stream }
  ▼
┌─ m.zmzai.cloud  (Vercel Edge Function) ────────────────────┐
│ 1. 限流      Mongo 原子桶（按 key）                          │
│ 2. 鉴权      zmzai-key → hash 查 ApiKey，校验状态/额度        │
│ 3. 路由      model/别名 → 候选上游列表（按成本+priority 排序） │
│ 4. 熔断选路  跳过熔断中的上游（健康状态读 Upstash Redis）      │
│ 5. 转发      换上游 key，按上游协议构造请求，流式 POST         │
│ 6. 透传      SSE 流式回传（不缓冲），累计 token + 计时         │
│ 7. 故障转移  上游超时/5xx/连接错 → 标记熔断 → 切下一上游重试   │
│ 8. 记账      流结束后记 UsageRecord（含成本）+ 扣 ApiKey 额度  │
└─────────────────────────────────────────────────────────────┘
  ▼  （按 priority/成本选一个，失败自动切下一个）
上游端点：第三方中转站 A（OpenAI 兼容）
          第三方中转站 B（OpenAI 兼容）
          官方 OpenAI / Anthropic（原生协议，兜底）
          …（N 个，配置驱动）
```

**关键**：调用方只看到 `zmzai-key` 和统一模型名，不知道也不关心背后是哪个
上游。中转驿替下游选了最便宜且当前可用的那个，并在它挂掉时无感切换。

## 3. 复用 muzhi 仓的模式（不另起炉灶）

以下模式/代码从 muzhi 仓借鉴或直接照抄（改 env key 与 global 变量名）：

| 模块 | 借鉴自 | 用法 |
|---|---|---|
| MongoDB 连接 | `providers/database/mongodb/connection.ts` | 全文照抄：global cache 连接 + `bufferCommands:false` + 失败重置 promise |
| Provider 抽象 | `providers/*/port.ts + index.ts` | 上游端点适配用同构的 port + 工厂模式（§6） |
| env 校验 | `config/env.ts` | 骨架照抄：zod + `superRefine` 做 "声明某上游必须配其密钥" + `getConfigWarnings()` |
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

### UsageRecord — 每次调用留痕（幂等 + 审计 + 成本）

```ts
{
  requestId: string;      // 调用方传入或服务端生成，apiKey+requestId 唯一索引
  apiKeyId: ObjectId;
  upstreamId: string;         // 实际命中的上游端点 id（"cheap-a" / "official"）
  upstreamProtocol: "openai-compat" | "anthropic" | "gemini";
  model: string;              // 对外统一模型名（"gpt-4o" / "smart"）
  upstreamModel: string;      // 该上游实际用的模型名（可能是别名/改名）
  status: "received" | "streaming" | "completed" | "failed";
  attemptCount: number;       // 故障转移重试次数
  failovers: string[];        // 依次试过哪些上游（审计用）
  promptTokens / completionTokens / totalTokens: number;
  costMicros: number;         // 本次上游成本（微美元，按上游成本价算）
  payloadDigest: string;      // sha256 请求体，match /^[a-f0-9]{64}$/
  latencyMs: number;
  lastError: string | null;
  createdAt / updatedAt: Date;
}
```

**幂等**：`apiKey + requestId` 唯一索引；重复 requestId 命中 duplicate key
(11000) 则返回已有记录，不重复计费（同 muzhi PaymentEvent 模式）。

**成本**：`costMicros = totalTokens/1000 × 上游 costPer1kTokens × 1e6`，用
微美元（micro-USD）整数避免浮点误差。定价 = 成本 × (1 + margin)，margin
在线下或 v2 配置。

### Upstream 配置（不建表，放 config + env）

上游端点是**配置驱动**，不落库（v1）。一个上游 = 一个便宜中转站或官方：

```ts
// config/upstreams.config.ts
{
  id: "cheap-a",
  protocol: "openai-compat",          // 或 "anthropic" / "gemini"
  baseUrl: "https://api.cheap-a.com/v1",
  apiKeyEnv: "UPSTREAM_CHEAP_A_KEY",  // env 变量名，key 不落库
  models: {                            // 对外统一名 → 该上游实际模型名
    "gpt-4o": "gpt-4o",
    "smart":  "gpt-4o-mini",
  },
  priority: 1,                         // 小=先试（通常便宜的排前）
  costPer1kTokensMicros: 300000,       // $0.30 / 1k tokens（微美元）
  timeoutMs: 30000,
}
```

**模型名映射**：上游中转站的模型名可能和对外不统一（叫 `gpt4o`/`gpt-4o-2024`
或干脆改名）。每个上游一张 `models` 映射表，对外永远是统一的
`gpt-4o`/`smart`/`fast`——换上游、上游改名，只改这张表，调用方不动。

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

处理流程（对应架构图 8 步）：

1. **限流**：`ApiKey.rateLimitPerMinute` 的 Mongo 原子桶，超限 429；
2. **鉴权**：`Authorization: Bearer <key>` → sha256 查 ApiKey；无效 401、
   revoked 403、额度不足 402、`allowedModels` 不含该模型 403；
3. **路由**：`model` → 所有支持它的上游端点，按 `priority`（便宜的优先）排序；
4. **熔断选路**：读 Upstash Redis 的上游健康状态，跳过熔断中的上游；
5. **转发**：选中第一个可用上游，按其 `protocol` 构造请求（OpenAI 兼容直接
   透传 body；Anthropic/Gemini 原生做格式转换），换上游 key，流式 POST；
6. **透传**：`stream:true` 时透传 SSE，逐 chunk 转发并累计 token + 计时；
7. **故障转移**：上游超时 / 5xx / 连接错 → 在 Redis 标记该上游熔断
   （`failoverCount++`，超阈值熔断 N 分钟）→ 切下一个候选上游重试；
   `failovers` 数组记录试过的上游。全部失败才报错；
8. **记账**：流结束（done/error）后 `UsageRecord` upsert（含 `costMicros`）
   + `ApiKey.quotaUsedTokens` `$inc`，失败记 `lastError` 并
   `reportOperationalFailure`。

响应：成功透传上游 SSE 流或 JSON；错误统一 `{ error, code }`：

| code | status | 含义 |
|---|---|---|
| `INVALID_KEY` | 401 | key 无效 |
| `KEY_REVOKED` | 403 | key 已吊销 |
| `QUOTA_EXCEEDED` | 402 | 额度用完 |
| `MODEL_NOT_ALLOWED` | 403 | 该 key 不允许此模型 |
| `MODEL_UNKNOWN` | 400 | 模型名/别名无法路由（无任何上游支持） |
| `RATE_LIMITED` | 429 | 超限 |
| `UPSTREAM_EXHAUSTED` | 502 | 所有候选上游都失败 |

### `GET /v1/models`

返回该 key 可用的模型/别名清单（读 ApiKey.allowedModels + 上游 models 表的并集）。

### `GET /v1/usage`（管理端，需 admin key）

返回某 key 的用量 + 成本聚合。v1 简化：只在 muzhi 后台或直接查库，不开放公开端点。

## 6. 上游端点适配 + 故障转移

### 6.1 端点适配（protocol adapter）

```
providers/upstream/
  port.ts                  # UpstreamAdapter 接口
  index.ts                 # 按 upstream.protocol 选 adapter
  openai-compat/index.ts   # OpenAI 兼容：直接透传 body + 换 base_url/key（覆盖 90% 便宜中转站）
  anthropic/index.ts       # Anthropic 原生：messages 格式转换 + SSE 事件映射
  gemini/index.ts          # Gemini 原生：格式转换
```

接口（v1 最小）：

```ts
interface UpstreamAdapter {
  protocol: "openai-compat" | "anthropic" | "gemini";
  buildRequest(upstream: UpstreamConfig, req: ChatRequest): { url: string; init: RequestInit };
  /** 从 SSE chunk 提取增量 token 用量（可选，流尾估算兜底） */
  extractUsage?(chunk: string): { prompt?: number; completion?: number } | null;
}
```

**OpenAI 兼容是主力**：便宜中转站几乎都提供 OpenAI 兼容端点，所以
`openai-compat` adapter 是核心（直接透传请求体，只换 `base_url` 和
`Authorization`），`anthropic`/`gemini` 原生 adapter 是给"直连官方兜底"
用的格式转换。v1 可以先只实现 `openai-compat`，原生协议后补。

### 6.2 路由与选路

```
model → 候选上游 = upstreams.filter(u => u.models[model] !== undefined)
                      .sort(by priority asc, 同 priority 按 costPer1kTokens asc)
      → 跳过熔断中的 → 取第一个
```

### 6.3 故障转移 + 熔断（Upstash Redis）

健康状态放 Redis（Edge 可 HTTP 访问，serverless 实例间共享）：

```
键：upstream:{id}:fails   → 近期连续失败计数（INCR，EX 5min）
键：upstream:{id}:circuit → "open"（熔断中，EX 120s）
```

逻辑：
- 上游调用**成功** → `DEL upstream:{id}:fails`；
- **失败**（超时/5xx/连接错，不含 4xx 业务错）→ `INCR fails`，`fails >= 3`
  则 `SET circuit open EX 120`，并切下一上游重试；
- 选路时跳过 `circuit == open` 的上游；
- 熔断 120s 后自动半开（circuit 过期），下次成功则彻底恢复。

**4xx 不触发熔断**：上游 4xx 多是请求本身的问题（模型不存在、key 无效），
不该切上游，直接透传给调用方。只有超时/5xx/网络错才认为是"上游挂了"。

### 6.4 成本记账

每个上游配 `costPer1kTokensMicros`。记账时：

```
costMicros = (totalTokens / 1000) × costPer1kTokensMicros
```

写入 `UsageRecord.costMicros`。这样你能看到"这次调用实际花了多少钱"，
定价 = 成本 × (1 + margin)。margin v1 线下定，v2 可做成 per-key 配置。

## 7. 风险与合规（中转的中转特有）

这些是转发便宜渠道必须正视的，写进设计不是吓你，是免得踩坑：

1. **上游跑路/降智风险**：便宜中转站可能突然关站，或把小模型冒充大模型
   （你付 GPT-4 的钱拿到 GPT-3.5 的输出）。**对策**：故障转移保证可用性；
   降智无法靠网关检测，只能靠你定期人工抽查输出质量 + 上游成本价异常低
   时保持警惕。
2. **数据隐私**：prompt 流经"中转驿 → 上游中转站 → 可能再上层"，便宜渠道
   多半记录请求。**红线**：涉密、用户隐私、商业敏感数据**不走**这条链。
   中转驿只用于不敏感的、图便宜的任务。这条要写进给下游的使用说明。
3. **上游条款**：很多便宜渠道本身违反官方 ToS（共享账号、逆向接口）。
   你转发它们，法律/封号风险自担。这不是技术问题，是你要知情接受的商业
   决策。**建议**：敏感/正式业务走官方 API（中转驿也能配官方端点做兜底），
   图便宜的非关键任务才走便宜渠道。
4. **上游记录的 key 安全**：上游中转站的 key 也可能泄露或被上游滥用，
   只在这些上游放小额预付费，定期换 key。

## 8. 安全

- **key 存 hash**：ApiKey 只存 sha256，明文只在创建时返回一次（同 muzhi 邀请码）；
- **上游 key 只在 env**：绝不落库、绝不进日志、绝不返回给调用方；
- **脱敏**：`structuredLog` 上下文过 `sanitizeLogContext`，不带 messages 内容（v1 不记录 prompt 内容，只记 token 数——隐私 + 合规，见 §7.2）；
- **限流**：每 key 每分钟桶 + 全局兜底；
- **同源/CSRF**：网关是 Bearer 鉴权的 API，不走 cookie，天然免 CSRF；仍加 `rejectCrossOriginMutation` 防误用；
- **生产强制 HTTPS**：env `superRefine` 校验（同 muzhi）。

## 9. 观测

- **每次上游失败** `reportOperationalFailure`：fingerprint = upstreamId+model+errorType 聚合，超阈值 webhook 告警（HMAC 签名，同 muzhi）；某上游连续失败触发熔断时也告警（告诉你该换渠道了）；
- **结构化日志**：每调用一行 JSON（key prefix、upstreamId、model、tokens、costMicros、attemptCount、latencyMs、status），不含 prompt 内容；
- **成本报表**：按 upstreamId 聚合每日成本，看哪个上游烧钱；
- **慢调用**：latencyMs 超阈值记 warn，发现某上游变慢（降智前兆之一）。

## 10. 部署

- **Vercel 项目**：`zmzai-relay`（已建，绑 `m.zmzai.cloud`）；
- **运行时**：`/v1/chat/completions` 用 Edge Runtime（`export const runtime = "edge"`），管理/usage 可 Node；
- **env**（Vercel Production）：

```dotenv
MONGODB_URI=mongodb+srv://...           # 与 muzhi 同 Atlas，独立 database
UPSTASH_REDIS_REST_URL=...              # 熔断/健康状态（Edge 友好）
UPSTASH_REDIS_REST_TOKEN=...
# 上游 key（每个上游一个，名字对应 config.upstreams 的 apiKeyEnv）
UPSTREAM_CHEAP_A_KEY=...
UPSTREAM_CHEAP_B_KEY=...
OPENAI_API_KEY=...                      # 官方兜底
ANTHROPIC_API_KEY=...
RELAY_ADMIN_KEY=...                     # 管理端鉴权
OBSERVABILITY_PROVIDER=webhook
OBSERVABILITY_WEBHOOK_URL=...
OBSERVABILITY_WEBHOOK_SECRET=...
```

- **启动校验**：`getServerEnv()` 启动即失败 + `getConfigWarnings()` 降级提示；
  `superRefine` 校验"config 里声明的每个上游，其 apiKeyEnv 必须已配置"；
- **MongoDB**：与 muzhi 同 Atlas 集群，独立 database（如 `zmzai_relay`），
  独立数据库账号、最小权限（同 muzhi DEPLOYMENT.md 的 Atlas 建议）；
- **Upstash Redis**：存上游熔断/健康状态 + 可做限流计数（Edge 友好的 HTTP
  访问，serverless 实例间共享，替代实例内存）。

## 11. v1 范围（别做全）

**做**：
- `POST /v1/chat/completions`（流式 + 非流式）
- **openai-compat adapter**（覆盖 90% 便宜中转站）+ 官方 OpenAI 兜底
- **多上游冗余 + 故障自动切换 + Redis 熔断**
- **按上游成本价记账**（costMicros）
- key 鉴权 + 额度 + 限流 + UsageRecord 留痕
- 别名路由（smart/fast）+ 模型名映射
- 结构化日志 + 失败/熔断告警 + 成本报表

**不做（v2+）**：
- anthropic/gemini 原生协议 adapter（v1 先 openai-compat + 官方 OpenAI）
- 缓存（相同请求命中省 token）
- margin 定价配置化（v1 线下定）
- 管理后台 UI（v1 用脚本/直查库管 key 和上游）
- function calling 特殊处理（透传即可）
- 图片/音频/embedding 等非 chat 端点
- 降智自动检测（v1 人工抽查）

## 12. 不做这件事的备选

如果只要"快速有个能卖 key 的网关"而不要 serverless/品牌/可控，部署
[one-api](https://github.com/songquanpeng/one-api)（或活跃 fork new-api）
到 Railway/Render，开箱即用 key 分发 + 计费 + 多渠道 + 故障转移 + 管理
后台——**它本身就支持接入第三方中转站做渠道**，和你的"中转的中转"需求
高度重合。代价：非 serverless（需常驻）、UI/品牌不是你的、与你的
Vercel+MongoDB 基础设施不融合。本文按自建精简版设计；若改走 one-api，
本文仅故障转移/成本/渠道配置部分有参考价值。

## 13. 里程碑

| 阶段 | 交付 |
|---|---|
| M1 链路验证 | **先验证 Edge Runtime 能透传流式 + Upstash Redis 能读写**（这是最大的技术不确定点），跑通一个 openai-compat 上游的端到端流式调用 |
| M2 骨架 | env 校验 + MongoDB 连接 + ApiKey/UsageRecord 模型 + upstreams 配置表 |
| M3 核心 | 鉴权 + 限流 + openai-compat 透传 + 记账（含成本）+ 错误约定 |
| M4 韧性 | 故障转移 + Redis 熔断 + 多上游冗余 + 官方兜底 |
| M5 观测 | 结构化日志 + 失败/熔断告警 + 成本报表 |
| M6 上线 | 绑 m.zmzai.cloud + 生产 env + 接入 muzhi 自用验证一周 |

**M1 先做技术验证**（Edge 流式透传 + Redis 读写），不过就退化为全 Node
Runtime（接受超时上限）+ MongoDB 存熔断状态——功能不变，只是放弃 Edge 的
流式优势。

---

## 附：serverless 流式透传的关键代码形态（Edge）

```ts
export const runtime = "edge";

export async function POST(req: Request) {
  // 1-4. 限流/鉴权/路由/熔断（鉴权读 MongoDB 走 Data API，熔断读 Upstash——见下）
  const upstream = await fetch(selectedUpstreamUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${upstreamKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // 5-6. 透传 SSE：直接返回上游 body 流
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
```

**已知约束（M1 必须先验证）**：Edge Runtime 不能直接用 Mongoose（无 TCP）。
两条路：
- (a) 鉴权/记账放 **Node Runtime 子路由**，Edge 只做转发——但那样鉴权和
  转发分两段，流式记账难；
- (b) Edge 用 **MongoDB Atlas Data API**（HTTPS）读写，或把鉴权缓存到
  **Upstash Redis**（Edge 原生支持 HTTP 访问）。
- **推荐 (b) 的变体**：鉴权/额度/记账 + 上游熔断状态都用 Upstash Redis
  （Edge 友好、计数原子、serverless 实例间共享），UsageRecord 审计日志异步
  写 MongoDB。M1 第一件事就是验证这条链路，验证不过就退化为全 Node
  Runtime（接受超时上限），熔断状态改存 MongoDB。
