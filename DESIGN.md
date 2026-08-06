# 中转驿 — 技术设计文档

> zmzai cloud 产品矩阵子产品（字母 **M**）。一个自托管的 LLM API 网关：
> 一处接入、多个上游、统一鉴权、故障转移、按 token + 成本计费。
> **上游主要是各类第三方中转站（便宜渠道），也兼容官方 API**——
> 中转驿是"中转的中转"，帮下游屏蔽上游的不稳定。
>
> 状态：设计稿 v3，2026-08-06。本文是 zmzai-relay 仓的事实来源。
>
> v3 变更（关键）：**放弃 serverless 自建，改为在香港服务器上 Docker 部署
> [new-api](https://github.com/QuantumNous/new-api)（one-api 活跃 fork）**。
> 它开箱即用：多渠道（含第三方中转站）、故障自动切换、key 分发计费、
> 管理后台。本文从"自建设计"改为"new-api 部署 + 渠道配置方案"。
> 原自建方案存档见文末「附录 B」。

---

## 0. 一句话

`m.zmzai.cloud` 是一个部署在香港服务器上的 new-api 实例。它接收统一格式
的模型调用，按"便宜的优先 + 故障自动切换"路由到配置好的上游中转站，
按 token 计费。调用方用中转驿发的 key，不关心背后是哪个上游。

## 1. 决策：为什么 new-api + 香港服务器，而不是 serverless 自建

有了香港服务器后，"自建 serverless"的必要性大幅降低：

| 维度 | serverless 自建 | new-api + 香港服务器（选定） |
|---|---|---|
| 需求覆盖 | 要自己写鉴权/计费/故障转移/后台 | ✅ 开箱全有：多渠道、key 分发、计费、故障切换、管理后台 |
| 接第三方中转站 | 自己写 openai-compat 适配 | ✅ 原生支持"自定义渠道"（base_url + key） |
| 故障转移 | 自己写熔断 + Redis | ✅ 内置失败重试 + 渠道加权 + 优先级 |
| 工程量 | 约一个周末 MVP | ✅ Docker 一条命令 |
| Mongoose/超时/流式 | Edge 有一堆限制 | ✅ 常驻进程无限制 |
| 品牌/可控 | ✅ 完全可控 | △ 管理后台 UI 是 new-api 的，API 层面是你的域名 |
| 运维 | 零运维 | △ 要管 Docker、备份、安全 |

**结论**：先用 new-api 快速把"中转的中转"模式跑起来验证需求。品牌通过
自定义域名 `m.zmzai.cloud` 承载（调用方只看到你的域名和 key）；管理后台
是内部工具，不需要你的品牌。如果将来量大、需要深度定制或融 zmzai 品牌，
再考虑自建替换（附录 B 保留自建设计）。

**香港服务器的延迟优势**：要接的便宜中转站多在内地/香港，muzhi 用户也偏
国内。香港到这些的延迟都低于 Vercel 美东边缘。对"中转的中转"这种多跳
链路，每跳延迟叠加，香港是甜点位。

## 2. new-api 能力核对（来自官方 README / docs）

- **接入第三方中转站**：支持自定义渠道（Custom upstream），OpenAI 兼容 /
  Claude / Gemini 等格式可互相转换。接便宜中转站 = 添加一个渠道，填它的
  base_url + key + 支持的模型。
- **故障转移**：渠道加权随机 + 失败自动重试（Settings → Operation Settings
  → Failure Retry Count）+ 渠道优先级。一个上游挂了自动切下一个。
- **key 分发计费**：用户 token 分组、模型限制、额度管理、按请求/用量计费、
  内部充值（EPay/Stripe）。
- **数据库**：默认 SQLite（Docker 挂 `/data`），可选 MySQL ≥5.7.8 /
  PostgreSQL ≥9.6。与 one-api 数据库完全兼容。
- **缓存**：可选 Redis（`REDIS_CONN_STRING`）提升性能。
- **端口**：默认 3000。
- **流式超时**：`STREAMING_TIMEOUT` 默认 300s。

> 渠道添加的逐字段界面流程以官方文档 docs.newapi.pro 为准。本文给出
> 部署骨架与渠道配置策略，具体操作在管理后台完成。

## 3. 部署架构（香港服务器）

```
调用方（你的产品 / 用户）
  │  Authorization: Bearer sk-xxx        ← new-api 发的 token
  │  POST https://m.zmzai.cloud/v1/chat/completions
  ▼
┌─ 香港服务器 ─────────────────────────────┐
│  Caddy / Nginx（443，TLS，反代 → :3000）   │
│    ▼                                      │
│  new-api 容器（:3000）                     │
│    ├─ 渠道管理：N 个上游中转站 + 官方兜底    │
│    ├─ 故障转移：失败重试 + 加权 + 优先级     │
│    ├─ key 分发 / 额度 / 计费               │
│    └─ 数据：SQLite(/data) 或 MySQL          │
└───────────────────────────────────────────┘
  ▼  （按优先级/权重选渠道，失败自动切换）
上游：第三方便宜中转站 A / B（OpenAI 兼容）
      官方 OpenAI / Anthropic（兜底）
```

## 4. 部署步骤

### 4.1 服务器准备

- 香港服务器，安装 Docker + docker compose；
- 防火墙只开 80/443（SSH 改非标端口 + key 登录）；
- `m.zmzai.cloud` 的 DNS A 记录指向服务器 IP（阿里云 DNS 控制台加）。

### 4.2 启动 new-api（Docker，SQLite 起步）

```bash
mkdir -p ~/new-api/data && cd ~/new-api

docker run --name new-api -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e STREAMING_TIMEOUT=300 \
  -v ~/new-api/data:/data \
  calciumion/new-api:latest
```

> 量小先用 SQLite（`/data` 挂卷）。量起来或要多节点，再切 MySQL：
> `-e SQL_DSN="user:pass@tcp(mysql-host:3306)/newapi"`。
> `SESSION_SECRET` 保存好（重启/多节点要一致）。建议加 Redis：
> `-e REDIS_CONN_STRING="redis://redis:6379"`。

### 4.3 反向代理 + TLS（Caddy，最简）

```
# Caddyfile
m.zmzai.cloud {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy 自动签 TLS 证书。`m.zmzai.cloud` 的 A 记录指向服务器后，
`https://m.zmzai.cloud` 即达 new-api 管理后台与 API。

### 4.4 初始设置

1. 访问 `https://m.zmzai.cloud`，注册首个账号（自动成为管理员）；
2. 改管理员密码；
3. 按需关掉开放注册（Settings → 关闭公开注册，只留你手工加用户）。

## 5. 渠道配置（接第三方便宜中转站）

在管理后台 **渠道（Channels）→ 添加渠道**，每个便宜中转站建一个：

| 字段 | 填法 |
|---|---|
| 类型 | OpenAI（兼容） |
| 名称 | `cheap-a`（备注哪个站） |
| Base URL | 中转站给的 `https://api.cheap-a.com/v1` |
| 密钥 | 中转站发的 key |
| 模型 | 它支持的模型（填对外统一的 `gpt-4o`/`smart`/`fast`） |
| 模型重定向 | 对外名 → 上游实际名（如果上游改名了） |
| 优先级 / 权重 | 便宜的给高优先级/高权重 |

**配置策略**：
- **便宜优先**：成本低的渠道给更高优先级/权重，new-api 优先路由到它；
- **官方兜底**：加一个官方 OpenAI 渠道，优先级最低——便宜渠道全挂时兜底；
- **失败重试**：Settings → Failure Retry Count 设为 2-3，一个渠道失败自动
  切下一个（这就是故障转移）；
- **降智警觉**：便宜渠道可能用小模型冒充大模型，定期人工抽查输出质量。

## 6. key 分发与计费

- 在 **用户 / 令牌（Tokens）** 给调用方发 key，设额度、限流、可用模型分组；
- 调用方用 `Authorization: Bearer <token>` 调
  `https://m.zmzai.cloud/v1/chat/completions`，格式与 OpenAI 一致；
- new-api 按 token 用量 + 各渠道成本自动计费，你在后台看每个 key / 渠道的
  成本与消耗；
- 定价 = 渠道成本 × (1 + margin)，margin 你在发 key 时定。

## 7. 安全与合规（中转的中转特有）

1. **降智风险**：便宜渠道可能小模型冒充大模型，网关检测不了，定期人工抽查。
2. **数据隐私红线**：prompt 流经"中转驿 → 上游中转站 → 再上层"，便宜渠道
   多半记录请求。**涉密/隐私数据不走这条链**，只用于不敏感的图便宜任务。
3. **上游 ToS**：很多便宜渠道违反官方条款，转发风险你知情接受。敏感/正式
   业务走官方 API（中转驿也配官方渠道兜底）。
4. **服务器安全**：香港服务器 SSH 改非标端口 + 禁密码登录 + fail2ban；
   new-api 管理员密码强随机；`/data` 定期备份（含全部 key 和渠道配置）。

## 8. 运维

- **备份**：`~/new-api/data`（SQLite + 配置 + key）每日打包异地备份；
- **更新**：`docker pull calciumion/new-api:latest && docker rm -f new-api && 重跑`；
- **监控**：Uptime Kuma 或 simple 脚本探活 `https://m.zmzai.cloud/api/status`，
  挂了告警（可接到 muzhi 的 webhook 告警体系）；
- **日志**：`docker logs -f new-api` 查调用与错误。

## 9. 与 zmzai 体系的衔接

- **域名**：`m.zmzai.cloud` 承载品牌，调用方只见你的域名和 key，不见 new-api；
- **muzhi 自用**：muzhi 知识体系未来的 AI 功能（写作辅助、摘要、搜索）调
  中转驿，走 `m.zmzai.cloud`，统一计费；
- **Hub 首页**：`m.zmzai.cloud`（中转驿）落地页指向这个实例，状态 LIVE；
- **告警**：new-api 故障可接 muzhi 的 HMAC webhook 观测体系。

## 10. 里程碑

| 阶段 | 交付 |
|---|---|
| M1 服务器 | 香港服务器装 Docker，防火墙 + SSH 加固 |
| M2 起服务 | Docker 起 new-api（SQLite），Caddy 反代 + TLS |
| M3 域名 | m.zmzai.cloud A 记录指向服务器，验证 HTTPS 可达 |
| M4 渠道 | 接入 2-3 个便宜中转站 + 官方兜底，配优先级 + 失败重试 |
| M5 key | 发第一个 key 给 muzhi，跑通端到端流式调用 |
| M6 验证 | muzhi 自用一周，验证稳定性/成本/降智，再定是否扩渠道或自建 |

---

## 附录 A：快速命令卡

```bash
# 启动
docker run --name new-api -d --restart always -p 3000:3000 \
  -e TZ=Asia/Shanghai -e SESSION_SECRET=$(openssl rand -hex 32) \
  -v ~/new-api/data:/data calciumion/new-api:latest

# 更新
docker pull calciumion/new-api:latest
docker rm -f new-api
# 重跑上面的启动命令

# 备份
tar czf new-api-backup-$(date +%F).tar.gz -C ~ new-api/data

# 日志
docker logs -f new-api
```

## 附录 B：原 serverless 自建方案（存档，暂不采用）

v1/v2 曾设计在 Vercel Edge Runtime 自建中转驿：统一 `/v1/chat/completions`
端点 + ApiKey/UsageRecord 模型（Mongoose）+ openai-compat adapter + Upstash
Redis 熔断 + 按上游成本价记账。因引入香港服务器后 new-api 能以更低成本
覆盖全部需求，自建暂缓。若将来需要深度品牌定制 / 与 zmzai 体系融合 /
摆脱 new-api，再回到该方案，其核心设计（端点抽象、故障转移、成本记账、
复用 muzhi 仓基础设施模式）仍然有效。
