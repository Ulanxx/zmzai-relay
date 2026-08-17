import { redirect } from "next/navigation";
import { Badge, CardSpotlight, Icon, Terminal } from "@zmzai/theme";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ModelPriceModel, supportedModels } from "@/providers/database/mongodb/models/model-price";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";
export default async function DocsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/docs")}`);
  await connectMongo();
  const [models, channels] = await Promise.all([
    ModelPriceModel.find({ enabled: true, model: { $in: supportedModels } }).sort({ model: 1 }).lean(),
    ChannelModel.find({ enabled: true }).sort({ priority: 1 }).lean(),
  ]);
  return (
    <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}>
      <p className="eyebrow">调用文档</p>
      <h1 className="headline mt-2 text-4xl">可用模型</h1>
      <p className="mt-3 text-ink/70">模型名称与上游一致。调用时可指定 <code className="font-mono text-accent-readable">channel</code> 精确路由，不指定则自动选择最优渠道。推理强度使用 <code className="font-mono text-accent-readable">reasoning_effort</code> 传入；DeepSeek 的思考开关可随请求体透传。</p>

      <div className="mt-8">
        {channels.map((channel) => {
          const channelModels = models.filter((m) => channel.models.some((mapping) => mapping.public === m.model));
          if (channelModels.length === 0) return null;
          return (
            <section key={channel.name} className="mb-8">
              <h2 className="headline text-xl mb-4">{channel.name} <span className="font-mono text-xs text-muted">P{channel.priority}</span></h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {channelModels.map((model) => (
                  <CardSpotlight key={model.model} radius={240} color="rgba(196, 42, 36, 0.10)">
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex items-center gap-2 font-mono text-sm text-ink"><Icon name="bolt" size={13} className="text-accent" />{model.model}</p>
                        <Badge variant="outline" size="sm">{model.allowedReasoningEfforts.join(" · ")}</Badge>
                      </div>
                      <p className="mt-3 font-mono text-xs text-muted">{model.maxInputTokens.toLocaleString()} in / {model.maxOutputTokens.toLocaleString()} out</p>
                    </div>
                  </CardSpotlight>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-9">
        <h2 className="headline text-xl">快速开始</h2>
        <div className="mt-3">
          <Terminal title="curl — chat completions">
            <span>{`curl https://m.zmzai.cloud/api/v1/chat/completions \\
  -H "Authorization: Bearer zrk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"channel":"渠道名","model":"deepseek-v4-flash","reasoning_effort":"high","messages":[{"role":"user","content":"你好"}]}'`}</span>
          </Terminal>
        </div>
      </div>
    </RelayShell>
  );
}
