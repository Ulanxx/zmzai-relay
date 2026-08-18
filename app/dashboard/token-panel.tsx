"use client";

import { useState } from "react";
import { Badge, Button, Input } from "@zmzai/theme";
import { cnyYuanToMicros } from "@/providers/billing/currency";

interface Key { _id: string; prefix: string; name: string; status: string; rateLimitPerMinute: number; monthlySpendLimitMicros: number; monthlySpendUsedMicros: number; lastUsedAt: string | null; }

export function TokenPanel({ initialKeys, models }: { initialKeys: Key[]; models: string[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [rpm, setRpm] = useState(60);
  const [spendYuan, setSpendYuan] = useState(0);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const monthlySpendLimitMicros = cnyYuanToMicros(spendYuan);
    const res = await fetch("/api/me/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, allowedModels: modelsText.split(",").map((item) => item.trim()).filter(Boolean), rateLimitPerMinute: rpm, monthlySpendLimitMicros }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "创建失败");
    setNewKey(json.key);
    setKeys((prev) => [{ ...json.record, rateLimitPerMinute: rpm, monthlySpendLimitMicros, monthlySpendUsedMicros: 0, lastUsedAt: null }, ...prev]);
    setName("");
    setModelsText("");
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/me/keys/${id}`, { method: "DELETE" });
    if (res.ok) setKeys((prev) => prev.map((key) => (key._id === id ? { ...key, status: "revoked" } : key)));
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
      <div>
        {keys.length ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[30rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
                  <th className="px-4 py-2.5 font-normal">名称</th>
                  <th className="px-4 py-2.5 font-normal">限速</th>
                  <th className="px-4 py-2.5 font-normal">最近使用</th>
                  <th className="px-4 py-2.5 font-normal">状态</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {keys.map((key) => (
                  <tr key={key._id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{key.name}</p>
                      <p className="font-mono text-xs text-muted">{key.prefix}...</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{key.rateLimitPerMinute}/min</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString("zh-CN") : "未使用"}</td>
                    <td className="px-4 py-3">{key.status === "active" ? <Badge variant="success" size="sm">启用</Badge> : <Badge variant="outline" size="sm">已吊销</Badge>}</td>
                    <td className="px-4 py-3 text-right">
                      {key.status === "active" ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => revoke(key._id)} className="text-danger">吊销</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-line px-4 py-6 text-sm text-muted">创建一个 API Key 后即可调用模型。</p>
        )}
      </div>

      <div className="rounded-lg border border-line bg-bg p-5">
        <h2 className="text-base font-semibold">创建 API Key</h2>
        <form onSubmit={create} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">名称</span>
            <Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：本地开发" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">允许模型（逗号分隔，留空=全部）</span>
            <Input value={modelsText} onChange={(event) => setModelsText(event.target.value)} className="font-mono text-xs" placeholder="deepseek-v4-flash, ..." />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">限速（次/分）</span>
              <Input type="number" min="1" value={rpm} onChange={(event) => setRpm(Number(event.target.value))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">月消费上限（元，0=不限）</span>
              <Input type="number" min="0" step="0.01" value={spendYuan} onChange={(event) => setSpendYuan(Number(event.target.value))} />
            </label>
          </div>
          <Button disabled={busy} type="submit" className="self-start">{busy ? "创建中" : "创建"}</Button>
        </form>
        {models.length ? <p className="mt-4 font-mono text-xs leading-5 text-muted">可用模型：{models.join(" · ")}</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {newKey ? (
          <div className="mt-4 rounded-md border border-accent bg-accent/10 p-3">
            <p className="text-xs font-medium">Key 只显示一次，请立即保存</p>
            <code className="mt-1.5 block break-all font-mono text-xs">{newKey}</code>
          </div>
        ) : null}
      </div>
    </section>
  );
}
