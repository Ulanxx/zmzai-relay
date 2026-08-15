import { redirect } from "next/navigation";

import { PublicModelDirectory } from "@/components/public-model-directory";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { getPublicModels } from "@/providers/catalog/public-models";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";

export default async function DashboardModelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/models")}`);

  await connectMongo();
  const models = await getPublicModels();

  return (
    <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}>
      <p className="eyebrow">模型目录</p>
      <h1 className="headline mt-2 text-4xl">为每次调用选模型</h1>
      <p className="mt-3 max-w-2xl text-ink/70">查看当前价格、上下文上限和推理强度。详情页附带可直接复制的 API 请求示例。</p>
      <div className="mt-8">
        <PublicModelDirectory models={models} />
      </div>
    </RelayShell>
  );
}
