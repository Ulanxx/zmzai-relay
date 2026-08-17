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
  const [models, channels] = await Promise.all([ModelPriceModel.find({ model: { $in: supportedModels } }).sort({ model: 1 }).lean(), ChannelModel.find().lean()]);
  return (
    <RelayShell role="admin" userName={user.name}>
      <p className="eyebrow">模型目录</p>
      <h1 className="headline mt-2 text-4xl">公开模型</h1>
      <p className="mt-3 text-ink/70">价格和推理强度在这里管理；上游映射只在渠道页维护。</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {models.map((model) => {
          const mappings = channels.filter((channel) => channel.models.some((mapping) => mapping.public === model.model));
          const costReady = mappings.length > 0 && mappings.every((channel) => channel.inputCostPer1kTokensMicros !== null && channel.outputCostPer1kTokensMicros !== null);
          return (
            <CardSpotlight key={model.model} radius={240} color="rgba(196, 42, 36, 0.10)">
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="flex items-center gap-2 font-mono text-base"><Icon name="bolt" size={14} className="text-accent" />{model.model}</h2>
                  <Badge variant={model.enabled ? "success" : "outline"} size="sm">{model.enabled ? "已开放" : "已停用"}</Badge>
                  <Badge variant={costReady ? "success" : "warning"} size="sm">{costReady ? "成本已配置" : "成本待配置"}</Badge>
                </div>
                <p className="mt-3 text-sm text-muted">推理：{model.allowedReasoningEfforts.join(" · ")} · {mappings.map((channel) => channel.name).join(" · ") || "未映射渠道"}</p>
                <p className="mt-3 font-mono text-xs text-muted">in {money(model.inputPricePer1kMicros)} / 1k · out {money(model.outputPricePer1kMicros)} / 1k</p>
              </div>
            </CardSpotlight>
          );
        })}
      </div>
    </RelayShell>
  );
}
