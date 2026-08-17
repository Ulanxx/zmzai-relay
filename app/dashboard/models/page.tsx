import { redirect } from "next/navigation";

import { ChannelDirectory } from "@/components/channel-directory";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { getPublicChannels } from "@/providers/catalog/public-models";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";

export default async function DashboardModelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/models")}`);

  await connectMongo();
  const channels = await getPublicChannels();

  return (
    <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}>
      <p className="eyebrow">渠道目录</p>
      <h1 className="headline mt-2 text-4xl">先选渠道，再选模型</h1>
      <p className="mt-3 max-w-2xl text-ink/70">渠道决定上游路径和成本，模型决定能力。指定 channel 调用可精确控制路由。</p>
      <div className="mt-8">
        <ChannelDirectory channels={channels} />
      </div>
    </RelayShell>
  );
}
