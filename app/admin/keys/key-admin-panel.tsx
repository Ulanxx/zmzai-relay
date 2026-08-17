"use client";

import { useState } from "react";
import { Button, Input } from "@zmzai/theme";

interface KeyItem {
  _id: string;
  prefix: string;
  name: string;
  status: string;
  quotaTotalTokens: number;
  quotaUsedTokens: number;
  rateLimitPerMinute: number;
  allowedModels: string[];
}

export function KeyAdminPanel({ initialKeys }: { initialKeys: KeyItem[] }) {
  const [keys, setKeys] = useState<KeyItem[]>(initialKeys);
  const [name, setName] = useState("");
  const [quota, setQuota] = useState(0);
  const [rpm, setRpm] = useState(60);
  const [models, setModels] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNewKey(null);
    const res = await fetch("/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        quotaTotalTokens: quota,
        rateLimitPerMinute: rpm,
        allowedModels: models.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "创建失败");
      return;
    }
    const j = await res.json();
    setNewKey(j.key);
    setKeys((prev) => [{ ...j.record, quotaUsedTokens: 0 }, ...prev]);
    setName("");
    setQuota(0);
    setModels("");
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((prev) => prev.map((k) => (k._id === id ? { ...k, status: "revoked" } : k)));
    }
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col gap-4">
        <h2 className="headline text-xl">已分发（{keys.length}）</h2>
        {keys.length === 0 ? (
          <p className="text-sm text-muted">还没有 key。右侧创建第一个。</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {keys.map((k) => (
              <li key={k._id} className="flex flex-col gap-1.5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="font-bold text-ink">{k.name}</span>
                    <span className="font-mono text-xs text-muted">{k.prefix}…</span>
                    <span className={`font-mono text-[0.625rem] uppercase tracking-widest ${k.status === "active" ? "text-success" : "text-red-700"}`}>
                      {k.status}
                    </span>
                  </div>
                  {k.status === "active" ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => revoke(k._id)} className="font-mono text-xs text-red-700 underline underline-offset-2">
                      吊销
                    </Button>
                  ) : null}
                </div>
                <p className="font-mono text-xs text-muted">
                  {k.quotaTotalTokens > 0 ? `${k.quotaUsedTokens.toLocaleString()} / ${k.quotaTotalTokens.toLocaleString()} tok` : "不限额度"}
                  {" · "}{k.rateLimitPerMinute}/min
                  {k.allowedModels.length > 0 ? ` · ${k.allowedModels.join(",")}` : " · 全部模型"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="headline text-xl">创建 Key</h2>
        <form onSubmit={createKey} className="flex flex-col gap-4 border border-line bg-surface p-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">名称（备注用途）</span>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              className="border border-line bg-paper px-3 py-2" placeholder="muzhi 后端 / 张三" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">额度（tokens，0=不限）</span>
              <input type="number" value={quota} onChange={(e) => setQuota(Number(e.target.value))}
                className="border border-line bg-paper px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">限流（次/分钟）</span>
              <input type="number" value={rpm} onChange={(e) => setRpm(Number(e.target.value))}
                className="border border-line bg-paper px-3 py-2" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">允许模型（逗号分隔，空=全部）</span>
            <input value={models} onChange={(e) => setModels(e.target.value)}
              className="border border-line bg-paper px-3 py-2 font-mono text-xs" placeholder="gpt-5.6-sol, gpt-5.6-terra" />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" disabled={busy} className="bg-accent text-accent-ink hover:bg-accent-strong self-start disabled:opacity-50">
            {busy ? "创建中…" : "创建 Key"}
          </Button>
        </form>

        {newKey ? (
          <div className="border border-accent bg-surface p-6">
            <p className="eyebrow mb-2">新 Key（只显示这一次，立刻复制保存）</p>
            <code className="block break-all font-mono text-sm text-accent-readable">{newKey}</code>
            <p className="mt-3 text-xs text-muted">调用方式：</p>
            <pre className="mt-1 overflow-x-auto font-mono text-xs text-ink/80">{`curl https://m.zmzai.cloud/api/v1/chat/completions \\
  -H "Authorization: Bearer ${newKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.6-terra","reasoning_effort":"high","messages":[{"role":"user","content":"你好"}]}'`}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
