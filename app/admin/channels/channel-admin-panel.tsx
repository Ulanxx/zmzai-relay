"use client";

import { useState } from "react";

interface ModelMapping {
  public: string;
  upstream: string;
}

interface Channel {
  _id: string;
  name: string;
  baseUrl: string;
  protocol: string;
  models: ModelMapping[];
  priority: number;
  inputCostPer1kTokensMicros: number;
  outputCostPer1kTokensMicros: number;
  enabled: boolean;
  timeoutMs: number;
}

export function ChannelAdminPanel({
  initialChannels,
}: {
  initialChannels: Channel[];
}) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [form, setForm] = useState({
    name: "",
    baseUrl: "",
    apiKey: "",
    modelsText: "gpt-4o=gpt-4o",
    priority: 10,
    inputCostPer1kTokensMicros: 0,
    outputCostPer1kTokensMicros: 0,
  });
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const models = form.modelsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [pub, up] = pair.split("=").map((x) => x.trim());
        return { public: pub, upstream: up || pub };
      });
    const res = await fetch("/api/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        models,
        priority: form.priority,
        inputCostPer1kTokensMicros: form.inputCostPer1kTokensMicros,
        outputCostPer1kTokensMicros: form.outputCostPer1kTokensMicros,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "添加失败");
      return;
    }
    const j = await res.json();
    setChannels((prev) => [...prev, j.channel]);
    setForm({ name: "", baseUrl: "", apiKey: "", modelsText: "gpt-4o=gpt-4o", priority: 10, inputCostPer1kTokensMicros: 0, outputCostPer1kTokensMicros: 0 });
  }

  async function testChannel(id: string) {
    setTestResult((prev) => ({ ...prev, [id]: "测试中…" }));
    const res = await fetch(`/api/admin/channels/${id}/test`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setTestResult((prev) => ({
      ...prev,
      [id]: j.ok ? `✓ 通 (${j.latencyMs}ms)` : `✗ ${j.status || j.error}`,
    }));
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
      {/* 渠道列表 */}
      <section className="flex flex-col gap-4">
        <h2 className="headline text-xl">已配置渠道（{channels.length}）</h2>
        {channels.length === 0 ? (
          <p className="text-sm text-muted">还没有渠道。右侧添加第一个便宜中转站。</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {channels.map((c) => (
              <li key={c._id} className="flex flex-col gap-2 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="font-bold text-ink">{c.name}</span>
                    <span className="font-mono text-[0.625rem] uppercase tracking-widest text-muted">
                      P{c.priority}
                    </span>
                    <span className={`font-mono text-[0.625rem] uppercase tracking-widest ${c.enabled ? "text-success" : "text-muted"}`}>
                      {c.enabled ? "启用" : "停用"}
                    </span>
                  </div>
                  <button
                    onClick={() => testChannel(c._id)}
                    className="font-mono text-xs text-accent-readable underline underline-offset-2 hover:text-accent"
                  >
                    测试
                  </button>
                </div>
                <p className="font-mono text-xs text-muted">{c.baseUrl}</p>
                <p className="font-mono text-xs text-ink/60">
                  {c.models.map((m) => `${m.public}→${m.upstream}`).join(" · ")}
                </p>
                {testResult[c._id] ? (
                  <p className="font-mono text-xs text-accent-readable">{testResult[c._id]}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 添加表单 */}
      <section className="flex flex-col gap-4">
        <h2 className="headline text-xl">添加渠道</h2>
        <form onSubmit={addChannel} className="flex flex-col gap-4 border border-line bg-surface p-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">名称</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border border-line bg-paper px-3 py-2" placeholder="cheap-a" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Base URL</span>
            <input required type="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              className="border border-line bg-paper px-3 py-2" placeholder="https://api.cheap-a.com/v1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">上游 Key</span>
            <input required value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              className="border border-line bg-paper px-3 py-2" placeholder="sk-..." />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">模型映射（逗号分隔，对外名=上游名）</span>
            <input value={form.modelsText} onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
              className="border border-line bg-paper px-3 py-2 font-mono text-xs" placeholder="gpt-4o=gpt-4o, smart=gpt-4o-mini" />
          </label>
          <div className="grid grid-cols-3 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">优先级（小=先试）</span>
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="border border-line bg-paper px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">输入成本（微美元/1k）</span>
              <input type="number" value={form.inputCostPer1kTokensMicros} onChange={(e) => setForm({ ...form, inputCostPer1kTokensMicros: Number(e.target.value) })}
                className="border border-line bg-paper px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">输出成本（微美元/1k）</span>
              <input type="number" value={form.outputCostPer1kTokensMicros} onChange={(e) => setForm({ ...form, outputCostPer1kTokensMicros: Number(e.target.value) })}
                className="border border-line bg-paper px-3 py-2" />
            </label>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button type="submit" disabled={busy} className="btn-primary self-start disabled:opacity-50">
            {busy ? "添加中…" : "添加渠道"}
          </button>
        </form>
      </section>
    </div>
  );
}
