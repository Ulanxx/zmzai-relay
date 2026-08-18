import { redirect } from "next/navigation";
import { Badge } from "@zmzai/theme";
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
    ChannelModel.find().sort({ priority: 1 }).lean(),
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
      <h1 className="text-2xl font-semibold tracking-tight">运营概览</h1>
      <p className="mt-2 text-sm text-ink-2">过去 24 小时的运行情况与渠道状态。</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="rounded-lg border border-line bg-bg p-5">
            <p className="font-mono text-xs text-muted">{label}</p>
            <p className="mt-2 font-mono text-2xl">{value}</p>
            <p className="mt-1 text-xs text-muted">{hint}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-10 text-lg font-semibold">渠道状态</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
              <th className="px-4 py-2.5 font-normal">渠道</th>
              <th className="px-4 py-2.5 font-normal">状态</th>
              <th className="px-4 py-2.5 font-normal">优先级</th>
              <th className="px-4 py-2.5 font-normal">模型</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {channels.map((channel) => (
              <tr key={String(channel._id)}>
                <td className="px-4 py-3 font-medium">{channel.name}</td>
                <td className="px-4 py-3"><Badge variant={channel.enabled ? "success" : "outline"} size="sm">{channel.enabled ? "启用" : "停用"}</Badge></td>
                <td className="px-4 py-3 font-mono text-xs text-muted">P{channel.priority}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{channel.models.map((mapping) => mapping.public).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RelayShell>
  );
}
