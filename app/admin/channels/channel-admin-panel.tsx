"use client";

import { useState } from "react";
import { Badge, Button, Input } from "@zmzai/theme";
import { cnyMicrosLabel, cnyYuanToMicros, microsToCnyYuan } from "@/providers/billing/currency";

interface ModelMapping { public: string; upstream: string; }
interface Channel {
  _id: string; name: string; baseUrl: string; protocol: string; models: ModelMapping[]; priority: number;
  inputCostPer1kTokensMicros: number | null; outputCostPer1kTokensMicros: number | null;
  cacheReadCostPer1kTokensMicros: number | null; cacheWriteCostPer1kTokensMicros: number | null;
  enabled: boolean; timeoutMs: number;
}
interface ChannelForm {
  name: string; baseUrl: string; apiKey: string; modelsText: string; priority: number; inputCost: number; outputCost: number; cacheReadCost: number; cacheWriteCost: number; timeoutMs: number; enabled: boolean; costsPending: boolean;
}

const defaultMappings = "deepseek-v4-flash=deepseek-v4-flash, deepseek-v4-pro=deepseek-v4-pro";
const emptyForm = (): ChannelForm => ({ name: "", baseUrl: "", apiKey: "", modelsText: defaultMappings, priority: 10, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, timeoutMs: 60000, enabled: true, costsPending: true });
const formForChannel = (channel: Channel): ChannelForm => ({ name: channel.name, baseUrl: channel.baseUrl, apiKey: "", modelsText: channel.models.map((mapping) => `${mapping.public}=${mapping.upstream}`).join(", "), priority: channel.priority, inputCost: channel.inputCostPer1kTokensMicros === null ? 0 : microsToCnyYuan(channel.inputCostPer1kTokensMicros), outputCost: channel.outputCostPer1kTokensMicros === null ? 0 : microsToCnyYuan(channel.outputCostPer1kTokensMicros), cacheReadCost: channel.cacheReadCostPer1kTokensMicros === null ? 0 : microsToCnyYuan(channel.cacheReadCostPer1kTokensMicros), cacheWriteCost: channel.cacheWriteCostPer1kTokensMicros === null ? 0 : microsToCnyYuan(channel.cacheWriteCostPer1kTokensMicros), timeoutMs: channel.timeoutMs, enabled: channel.enabled, costsPending: channel.inputCostPer1kTokensMicros === null });

function toPayload(form: ChannelForm, requireKey: boolean) {
  const models = form.modelsText.split(",").map((item) => item.trim()).filter(Boolean).map((pair) => {
    const [publicModel, upstream] = pair.split("=").map((item) => item.trim());
    return { public: publicModel, upstream: upstream || publicModel };
  });
  return {
    name: form.name, baseUrl: form.baseUrl, ...(requireKey ? { apiKey: form.apiKey } : { apiKey: form.apiKey.trim() }), models,
    priority: form.priority, inputCostPer1kTokensMicros: form.costsPending ? null : cnyYuanToMicros(form.inputCost),
    outputCostPer1kTokensMicros: form.costsPending ? null : cnyYuanToMicros(form.outputCost),
    cacheReadCostPer1kTokensMicros: form.costsPending ? null : cnyYuanToMicros(form.cacheReadCost),
    cacheWriteCostPer1kTokensMicros: form.costsPending ? null : cnyYuanToMicros(form.cacheWriteCost),
    enabled: form.enabled, timeoutMs: form.timeoutMs,
  };
}

export function ChannelAdminPanel({ initialChannels }: { initialChannels: Channel[] }) {
  const [channels, setChannels] = useState(initialChannels);
  const [form, setForm] = useState<ChannelForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const editing = channels.find((channel) => channel._id === editingId) ?? null;

  function beginEdit(channel: Channel) { setEditingId(channel._id); setForm(formForChannel(channel)); setError(null); }
  function cancelEdit() { setEditingId(null); setForm(emptyForm()); setError(null); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const requireKey = !editingId;
    if (requireKey && !form.apiKey.trim()) { setBusy(false); setError("请填写上游 Key"); return; }
    const response = await fetch(editingId ? `/api/admin/channels/${editingId}` : "/api/admin/channels", {
      method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toPayload(form, requireKey)),
    });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(json.error ?? "保存失败"); return; }
    setChannels((previous) => (editingId ? previous.map((channel) => channel._id === editingId ? json.channel : channel) : [...previous, json.channel]).sort((a, b) => a.priority - b.priority));
    cancelEdit();
  }
  async function testChannel(id: string) {
    setTestResult((previous) => ({ ...previous, [id]: "测试中..." }));
    const response = await fetch(`/api/admin/channels/${id}/test`, { method: "POST" }); const json = await response.json().catch(() => ({}));
    setTestResult((previous) => ({ ...previous, [id]: json.ok ? `已连通 (${json.latencyMs}ms${json.mode === "completion" ? "，最小调用" : ""})` : `失败：${json.status || json.error}` }));
  }
  const update = <K extends keyof ChannelForm>(key: K, value: ChannelForm[K]) => setForm((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:items-start">
      <section>
        <h2 className="mb-3 text-lg font-semibold">已配置渠道（{channels.length}）</h2>
        {channels.length === 0 ? (
          <p className="rounded-lg border border-line px-4 py-6 text-sm text-muted">还没有渠道，先在右侧添加第一个上游。</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-bg">
            {channels.map((channel) => (
              <li key={channel._id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium">{channel.name}</span>
                    <span className="font-mono text-xs text-muted">P{channel.priority}</span>
                    <Badge variant={channel.enabled ? "success" : "outline"} size="sm">{channel.enabled ? "启用" : "停用"}</Badge>
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => beginEdit(channel)}>编辑</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => testChannel(channel._id)}>测试</Button>
                  </div>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted">{channel.baseUrl}</p>
                <p className="mt-1 font-mono text-xs text-muted">{channel.models.map((mapping) => `${mapping.public} → ${mapping.upstream}`).join(" · ")}</p>
                <p className="mt-1 text-xs text-muted">{channel.inputCostPer1kTokensMicros === null ? "成本待配置" : `成本 ${cnyMicrosLabel(channel.inputCostPer1kTokensMicros, 4)} / ${cnyMicrosLabel(channel.outputCostPer1kTokensMicros ?? 0, 4)} / 1k`}</p>
                {testResult[channel._id] ? <p className="mt-2 font-mono text-xs text-accent-readable">{testResult[channel._id]}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-line bg-bg p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{editing ? `编辑 ${editing.name}` : "添加渠道"}</h2>
          {editing ? <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>取消</Button> : null}
        </div>
        <form onSubmit={save} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">名称</span><Input required value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">Base URL</span><Input required type="url" value={form.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} className="font-mono text-xs" placeholder="https://api.example.com/v1" /></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">上游 Key{editing ? "（留空则保持不变）" : ""}</span><Input required={!editing} value={form.apiKey} onChange={(event) => update("apiKey", event.target.value)} placeholder={editing ? "不回显；仅填写时替换" : "sk-..."} /></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">模型映射（对外名=上游名，逗号分隔）</span><Input required value={form.modelsText} onChange={(event) => update("modelsText", event.target.value)} className="font-mono text-xs" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">优先级（小=先试）</span><Input type="number" min="0" value={form.priority} onChange={(event) => update("priority", Number(event.target.value))} /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">超时（毫秒）</span><Input type="number" min="1000" max="300000" value={form.timeoutMs} onChange={(event) => update("timeoutMs", Number(event.target.value))} /></label>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={(event) => update("enabled", event.target.checked)} /> 启用此渠道</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.costsPending} onChange={(event) => update("costsPending", event.target.checked)} /> 成本待配置</label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">输入成本（元/1k）</span><Input disabled={form.costsPending} type="number" min="0" step="0.0001" value={form.inputCost} onChange={(event) => update("inputCost", Number(event.target.value))} className="disabled:opacity-50" /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">输出成本（元/1k）</span><Input disabled={form.costsPending} type="number" min="0" step="0.0001" value={form.outputCost} onChange={(event) => update("outputCost", Number(event.target.value))} className="disabled:opacity-50" /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">缓存读成本（元/1k）</span><Input disabled={form.costsPending} type="number" min="0" step="0.0001" value={form.cacheReadCost} onChange={(event) => update("cacheReadCost", Number(event.target.value))} className="disabled:opacity-50" /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted">缓存写成本（元/1k）</span><Input disabled={form.costsPending} type="number" min="0" step="0.0001" value={form.cacheWriteCost} onChange={(event) => update("cacheWriteCost", Number(event.target.value))} className="disabled:opacity-50" /></label>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button disabled={busy} className="self-start">{busy ? "保存中..." : editing ? "保存修改" : "添加渠道"}</Button>
        </form>
      </section>
    </div>
  );
}
