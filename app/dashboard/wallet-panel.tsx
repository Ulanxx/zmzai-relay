"use client";

import { useState } from "react";

type Product = { id: string; name: string; creditMicros: number; paymentAmountFen: number };
type Order = { _id: string; orderNo: string; productName: string; creditMicros: number; paymentAmountFen: number; paymentMethod: "wechat" | "alipay"; status: string; expiresAt: string; payerName: string | null; screenshotUrl: string | null; paymentNote: string | null; submittedAt: string | null; completedAt: string | null; reviewNote: string | null };

const cny = (fen: number) => `¥${(fen / 100).toFixed(2)}`;
const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;
const statusLabel: Record<string, string> = { pending: "待支付", submitted: "待审核", completed: "已完成", rejected: "已驳回", expired: "已过期" };

export function WalletPanel({ products, initialOrders, qrUrl, accountName, notice }: { products: Product[]; initialOrders: Order[]; qrUrl: string; accountName: string; notice: string }) {
  const [orders, setOrders] = useState(initialOrders);
  const [selected, setSelected] = useState(products[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<"wechat" | "alipay">("wechat");
  const [active, setActive] = useState<Order | null>(null);
  const [payerName, setPayerName] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedProduct = products.find((product) => product.id === selected) ?? products[0];
  async function createOrder() {
    if (!selectedProduct) return;
    setBusy(true); setMessage(null);
    const response = await fetch("/api/me/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: selectedProduct.id, paymentMethod }) });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setMessage(json.error ?? "订单创建失败"); return; }
    setActive(json.order); setOrders((current) => [json.order, ...current]);
  }
  async function submitPayment() {
    if (!active) return;
    setBusy(true); setMessage(null);
    const response = await fetch(`/api/me/orders/${active._id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentMethod, paidAmountFen: active.paymentAmountFen, payerName, screenshotUrl, paymentNote }) });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setMessage(json.error ?? "提交失败"); return; }
    setActive(json.order); setOrders((current) => current.map((order) => order._id === json.order._id ? json.order : order)); setMessage("已提交付款，等待人工核对。");
  }
  return <div className="grid gap-10 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
    <section>
      <p className="eyebrow">选择额度包</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">{products.map((product) => <button key={product.id} type="button" onClick={() => setSelected(product.id)} className={`border p-4 text-left transition-colors ${selected === product.id ? "border-accent bg-surface" : "border-line bg-paper hover:border-rule"}`}><span className="block font-mono text-sm">{product.name}</span><span className="mt-2 block text-sm text-muted">付款 {cny(product.paymentAmountFen)}</span></button>)}</div>
      <div className="mt-6 flex flex-wrap items-center gap-4 border-y border-line py-4 text-sm"><span className="text-muted">支付方式</span><button type="button" onClick={() => setPaymentMethod("wechat")} className={paymentMethod === "wechat" ? "font-mono text-accent-readable underline" : "font-mono text-muted"}>微信</button><button type="button" onClick={() => setPaymentMethod("alipay")} className={paymentMethod === "alipay" ? "font-mono text-accent-readable underline" : "font-mono text-muted"}>支付宝</button><button type="button" disabled={busy || !selectedProduct} onClick={createOrder} className="btn-primary ml-auto disabled:opacity-50">{busy ? "处理中..." : "创建订单"}</button></div>
      {active ? <div className="mt-8 border border-line bg-surface p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="eyebrow">当前订单</p><p className="mt-2 font-mono text-sm">{active.orderNo}</p></div><p className="font-mono text-lg">{cny(active.paymentAmountFen)}</p></div><p className="mt-3 text-sm text-muted">{active.productName} · 到账额度 {usd(active.creditMicros)} · {statusLabel[active.status] ?? active.status}</p>{active.status === "pending" ? <><div className="mt-5 border border-line bg-paper p-4 text-center">{qrUrl ? <img src={qrUrl} alt="收款二维码" className="mx-auto h-52 w-52 object-contain" /> : <p className="py-20 text-sm text-muted">管理员尚未配置收款二维码</p>}<p className="mt-3 font-mono text-sm">收款账户：{accountName}</p><p className="mt-2 text-xs text-muted">{notice}</p></div><p className="mt-4 text-xs text-muted">付款备注请填写订单号：{active.orderNo}。付款完成后再提交下面的信息。</p><div className="mt-4 grid gap-3"><input value={payerName} onChange={(event) => setPayerName(event.target.value)} className="border border-line bg-paper px-3 py-2 text-sm" placeholder="付款人昵称或姓名（可选）" /><input value={screenshotUrl} onChange={(event) => setScreenshotUrl(event.target.value)} className="border border-line bg-paper px-3 py-2 font-mono text-xs" placeholder="付款截图链接（可选）" /><input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} className="border border-line bg-paper px-3 py-2 text-sm" placeholder="付款备注（可选）" /><button type="button" disabled={busy} onClick={submitPayment} className="btn-primary justify-center disabled:opacity-50">我已完成付款</button></div></> : <p className="mt-5 border-l-2 border-accent px-3 py-2 text-sm text-ink/80">{active.status === "submitted" ? "已提交付款，通常会在 1–10 分钟内完成人工核对。" : active.reviewNote ?? "订单状态已更新。"}</p>}{message ? <p className="mt-4 text-sm text-accent-readable">{message}</p> : null}</div> : null}
    </section>
    <section><p className="eyebrow">订单记录</p><ul className="mt-3 divide-y divide-line border-y border-line">{orders.map((order) => <li key={order._id} className="py-4"><button type="button" className="block w-full text-left" onClick={() => setActive(order)}><div className="flex justify-between gap-3"><span className="font-mono text-sm">{order.orderNo}</span><span className="font-mono text-xs text-muted">{statusLabel[order.status] ?? order.status}</span></div><p className="mt-2 text-sm text-muted">{order.productName} · {cny(order.paymentAmountFen)}</p></button></li>)}{orders.length === 0 ? <li className="py-4 text-sm text-muted">还没有充值订单。</li> : null}</ul></section>
  </div>;
}
