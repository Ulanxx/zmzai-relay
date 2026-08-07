"use client";

export function LogoutButton() {
  return <button type="button" onClick={async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.assign("/");
  }} className="font-mono text-xs text-muted underline underline-offset-2 transition-colors hover:text-accent">退出登录</button>;
}
