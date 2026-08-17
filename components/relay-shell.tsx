"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Icon, Logo, Wordmark } from "@zmzai/theme";
import type { IconName } from "@zmzai/theme";
import { LogoutButton } from "@/components/logout-button";

const adminLinks: Array<[string, string, IconName]> = [["概览", "/admin", "home"], ["模型目录", "/admin/models", "grid"], ["渠道", "/admin/channels", "link"], ["用户与余额", "/admin/users", "users"], ["运营调整", "/admin/operations", "sliders"], ["充值订单", "/admin/orders", "receipt"], ["调用与账本", "/admin/activity", "activity"], ["Token", "/admin/keys", "key"]] as const;
const userLinks: Array<[string, string, IconName]> = [["概览", "/dashboard", "home"], ["模型", "/dashboard/models", "grid"], ["额度支持", "/dashboard/billing", "wallet"], ["我的 Token", "/dashboard/keys", "key"], ["用量与账单", "/dashboard/activity", "activity"], ["调用文档", "/dashboard/docs", "book"]] as const;

/** 段根（/admin、/dashboard）只在完全相等时高亮，避免子页面全部点亮“概览”。 */
function NavLink({ label, href, icon, pathname }: { label: string; href: string; icon: IconName; pathname: string }) {
  const isSectionRoot = href === "/admin" || href === "/dashboard";
  const active = pathname === href || (!isSectionRoot && pathname.startsWith(`${href}/`));
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-2 transition-colors hover:text-accent ${active ? "font-medium text-accent-readable" : "text-muted"}`}>
      <Icon name={icon} size={13} />
      {label}
    </Link>
  );
}

export function RelayShell({ role, userName, isAdminUser = false, children }: { role: "admin" | "user"; userName: string; isAdminUser?: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const links = role === "admin" ? adminLinks : userLinks;
  return <main className="min-h-dvh bg-paper"><header className="border-b-2 border-rule"><div className="page-shell flex min-h-16 items-center justify-between gap-4 py-4"><span className="inline-flex items-center gap-2"><Logo size={22} /><Wordmark /></span><div className="flex items-center gap-4 font-mono text-xs text-muted"><span>{userName}</span>{role === "admin" ? <Link href="/dashboard" className="flex items-center gap-1.5 hover:text-accent"><Icon name="chevron-right" size={12} />用户端</Link> : isAdminUser ? <Link href="/admin" className="flex items-center gap-1.5 hover:text-accent"><Icon name="settings" size={12} />管理后台</Link> : null}<LogoutButton /></div></div></header><div className="page-shell grid gap-8 py-8 lg:grid-cols-[11rem_minmax(0,1fr)]"><nav className="flex gap-4 overflow-x-auto border-b border-line pb-3 font-mono text-xs text-muted lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">{links.map(([label, href, icon]) => <NavLink key={href} label={label} href={href} icon={icon} pathname={pathname} />)}</nav><section className="min-w-0">{children}</section></div></main>;
}
