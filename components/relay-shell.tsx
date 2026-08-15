"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/wordmark";
import { LogoutButton } from "@/components/logout-button";

const adminLinks = [["概览", "/admin"], ["模型目录", "/admin/models"], ["渠道", "/admin/channels"], ["用户与余额", "/admin/users"], ["运营调整", "/admin/operations"], ["充值订单", "/admin/orders"], ["调用与账本", "/admin/activity"], ["Token", "/admin/keys"]] as const;
const userLinks = [["概览", "/dashboard"], ["模型", "/dashboard/models"], ["额度支持", "/dashboard/billing"], ["我的 Token", "/dashboard/keys"], ["用量与账单", "/dashboard/activity"], ["调用文档", "/dashboard/docs"]] as const;

/** 段根（/admin、/dashboard）只在完全相等时高亮，避免子页面全部点亮“概览”。 */
function NavLink({ label, href, pathname }: { label: string; href: string; pathname: string }) {
  const isSectionRoot = href === "/admin" || href === "/dashboard";
  const active = pathname === href || (!isSectionRoot && pathname.startsWith(`${href}/`));
  return <Link href={href} aria-current={active ? "page" : undefined} className={`shrink-0 transition-colors hover:text-accent ${active ? "font-medium text-accent-readable" : "text-muted"}`}>{label}</Link>;
}

export function RelayShell({ role, userName, isAdminUser = false, children }: { role: "admin" | "user"; userName: string; isAdminUser?: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const links = role === "admin" ? adminLinks : userLinks;
  return <main className="min-h-dvh bg-paper"><header className="border-b-2 border-rule"><div className="page-shell flex min-h-16 items-center justify-between gap-4 py-4"><Wordmark /><div className="flex items-center gap-4 font-mono text-xs text-muted"><span>{userName}</span>{role === "admin" ? <Link href="/dashboard" className="hover:text-accent">用户端</Link> : isAdminUser ? <Link href="/admin" className="hover:text-accent">管理后台</Link> : null}<LogoutButton /></div></div></header><div className="page-shell grid gap-8 py-8 lg:grid-cols-[11rem_minmax(0,1fr)]"><nav className="flex gap-4 overflow-x-auto border-b border-line pb-3 font-mono text-xs text-muted lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">{links.map(([label, href]) => <NavLink key={href} label={label} href={href} pathname={pathname} />)}</nav><section className="min-w-0">{children}</section></div></main>;
}
