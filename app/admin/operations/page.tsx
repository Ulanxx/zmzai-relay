import { redirect } from "next/navigation";

import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { OperationsPanel } from "../operations-panel";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/admin/operations")}`);
  if (user.role !== "admin") redirect("/dashboard");
  return <RelayShell role="admin" userName={user.name}><p className="eyebrow">运营调整</p><h1 className="headline mt-2 text-4xl">人工管理额度与价目</h1><p className="mt-3 text-ink/70">用户通过微信联系后，在这里按人民币增加其个人余额。每次调整都会写入账本。</p><div className="mt-8"><OperationsPanel /></div></RelayShell>;
}
