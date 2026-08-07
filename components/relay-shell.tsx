import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/wordmark";

const adminLinks = [["概览", "/admin"], ["模型目录", "/admin/models"], ["渠道", "/admin/channels"], ["用户与余额", "/admin/users"], ["充值订单", "/admin/orders"], ["调用与账本", "/admin/activity"], ["Token", "/admin/keys"]] as const;
const userLinks = [["概览", "/dashboard"], ["模型", "/dashboard/models"], ["额度支持", "/dashboard/billing"], ["我的 Token", "/dashboard/keys"], ["用量与账单", "/dashboard/activity"], ["调用文档", "/dashboard/docs"]] as const;

export function RelayShell({ role, userName, children }: { role: "admin" | "user"; userName: string; children: ReactNode }) {
  const links = role === "admin" ? adminLinks : userLinks;
  return <main className="min-h-dvh bg-paper"><header className="border-b-2 border-rule"><div className="page-shell flex min-h-16 items-center justify-between gap-4 py-4"><Wordmark /><div className="flex items-center gap-4 font-mono text-xs text-muted"><span>{userName}</span>{role === "admin" ? <Link href="/dashboard" className="hover:text-accent">用户端</Link> : <Link href="/admin" className="hover:text-accent">运营管理</Link>}</div></div></header><div className="page-shell grid gap-8 py-8 lg:grid-cols-[11rem_minmax(0,1fr)]"><nav className="flex gap-4 overflow-x-auto border-b border-line pb-3 font-mono text-xs text-muted lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">{links.map(([label, href]) => <Link key={href} href={href} className="shrink-0 transition-colors hover:text-accent">{label}</Link>)}</nav><section className="min-w-0">{children}</section></div></main>;
}
