import { redirect } from "next/navigation";
import { Badge, CardSpotlight } from "@zmzai/theme";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";
import { UsageModel } from "@/providers/database/mongodb/models/usage";
import { cnyMicrosLabel } from "@/providers/billing/currency";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
const money = (value: number) => cnyMicrosLabel(value, 2);
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/admin")}`);
  if (user.role !== "admin") redirect("/dashboard");
  await connectMongo();
  const since = new Date(Date.now() - 86400000);
  const [totals, channels, failed] = await Promise.all([
    UsageModel.aggregate([{ $match: { createdAt: { $gte: since }, status: "completed" } }, { $group: { _id: null, requests: { $sum: 1 }, revenue: { $sum: "$chargedMicros" }, cost: { $sum: "$costMicros" } } }]),
    ChannelModel.find().lean(),
    UsageModel.countDocuments({ createdAt: { $gte: since }, status: { $in: ["failed", "unsettled"] } }),
  ]);
  const today = totals[0] ?? { requests: 0, revenue: 0, cost: 0 };
  const stats: Array<[string, string, string]> = [
    ["请求", today.requests.toLocaleString(), "过去 24 小时"],
    ["收入", money(today.revenue), "按调用计费"],
    ["确认成本", money(today.cost), "上游已确认"],
    ["异常", String(failed), "失败 + 待结算"],
  ];
  return (
    <RelayShell role="admin" userName={user.name}>
      <p className="eyebrow">中转驿 · 运营概览</p>
      <h1 className="headline mt-2 text-4xl">今天的运行情况</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, hint]) => (
          <CardSpotlight key={label} radius={220} color="rgba(196, 42, 36, 0.10)">
            <div className="p-5">
              <p className="eyebrow">{label}</p>
              <p className="mt-2 font-mono text-2xl">{value}</p>
              <p className="mt-1 text-xs text-muted">{hint}</p>
            </div>
          </CardSpotlight>
        ))}
      </div>
      <div className="mt-9">
        <h2 className="headline text-xl">渠道健康</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {channels.map((channel) => (
            <li key={String(channel._id)} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <span>{channel.name}</span>
              <span className="flex items-center gap-3 font-mono text-xs text-muted">
                <Badge variant={channel.enabled ? "success" : "outline"} size="sm">{channel.enabled ? "启用" : "停用"}</Badge>
                <span>P{channel.priority}</span>
                <span>{channel.models.map((mapping) => mapping.public).join(" · ")}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </RelayShell>
  );
}
