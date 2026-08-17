import { redirect } from "next/navigation";
import { Badge, CardSpotlight, Icon } from "@zmzai/theme";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";
import { ModelPriceModel, supportedModels } from "@/providers/database/mongodb/models/model-price";
import { cnyMicrosLabel } from "@/providers/billing/currency";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
const money = (value: number) => cnyMicrosLabel(value);
export const dynamic = "force-dynamic";
export default async function ModelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/admin/models")}`);
  if (user.role !== "admin") redirect("/dashboard");
  await connectMongo();
  const [models, channels] = await Promise.all([ModelPriceModel.find({ model: { $in: supportedModels } }).sort({ model: 1 }).lean(), ChannelModel.find().sort({ priority: 1 }).lean()]);
  const priceMap = new Map(models.map((m) => [m.model, m]));
  return (
    <RelayShell role="admin" userName={user.name}>
      <p className="eyebrow">渠道目录</p>
      <h1 className="headline mt-2 text-4xl">按渠道查看模型</h1>
      <p className="mt-3 text-ink/70">价格和推理强度在这里管理；上游映射只在渠道页维护。</p>
      <div className="mt-8 flex flex-col gap-8">
        {channels.map((channel) => {
          const channelModels = channel.models.filter((mapping) => priceMap.has(mapping.public));
          if (channelModels.length === 0) return null;
          const costReady = channel.inputCostPer1kTokensMicros !== null && channel.outputCostPer1kTokensMicros !== null;
          return (
            <section key={String(channel._id)}>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="headline text-xl">{channel.name}</h2>
                <span className="font-mono text-xs text-muted">P{channel.priority}</span>
                <Badge variant={channel.enabled ? "success" : "outline"} size="sm">{channel.enabled ? "启用" : "停用"}</Badge>
                <Badge variant={costReady ? "success" : "warning"} size="sm">{costReady ? "成本已配置" : "成本待配置"}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {channelModels.map((mapping) => {
                  const model = priceMap.get(mapping.public)!;
                  return (
                    <CardSpotlight key={`${channel.name}-${mapping.public}`} radius={240} color="rgba(196, 42, 36, 0.10)">
                      <div className="p-5">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="flex items-center gap-2 font-mono text-base"><Icon name="bolt" size={14} className="text-accent" />{mapping.public}</h3>
                          <Badge variant={model.enabled ? "success" : "outline"} size="sm">{model.enabled ? "已开放" : "已停用"}</Badge>
                        </div>
                        <p className="mt-2 font-mono text-xs text-muted">→ {mapping.upstream}</p>
                        <p className="mt-2 text-sm text-muted">推理：{model.allowedReasoningEfforts.join(" · ")}</p>
                        <p className="mt-2 font-mono text-xs text-muted">入 {money(model.inputPricePer1kMicros)} / 1k · 出 {money(model.outputPricePer1kMicros)} / 1k</p>
                      </div>
                    </CardSpotlight>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </RelayShell>
  );
}
