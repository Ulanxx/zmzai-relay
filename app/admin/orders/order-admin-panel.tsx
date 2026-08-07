"use client";

import { useState } from "react";

type Order = { _id: string; orderNo: string; productName: string; creditMicros: number; paymentAmountFen: number; paymentMethod: "wechat" | "alipay"; status: string; payerName: string | null; screenshotUrl: string | null; paymentNote: string | null; submittedAt: string | null; user: { name: string; email: string } | null; reviewNote: string | null };
const cny = (fen: number) => `¥${(fen / 100).toFixed(2)}`;
const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

export function OrderAdminPanel({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function review(order: Order, action: "approve" | "reject") {
    const reviewNote = window.prompt(action === "approve" ? "核对备注（可留空）" : "驳回原因（必填）", "");
    if (reviewNote === null || (action === "reject" && !reviewNote.trim())) return;
    setBusy(order._id); setMessage(null);
    const response = await fetch(`/api/admin/orders/${order._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reviewNote }) });
    const json = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) { setMessage(json.error ?? "审核失败"); return; }
    setOrders((current) => current.map((item) => item._id === order._id ? { ...item, status: json.status, reviewNote } : item)); setMessage(`${order.orderNo} 已${action === "approve" ? "确认收款并开通" : "驳回"}`);
  }
  return <div><p className="text-sm text-muted">确认前请以微信/支付宝实际到账记录为准，截图只能作为辅助。确认后会立即增加用户余额，且不能重复确认。</p><ul className="mt-6 divide-y divide-line border-y border-line">{orders.map((order) => <li key={order._id} className="py-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-mono text-sm">{order.orderNo}</p><p className="mt-1 text-sm">{order.user?.name ?? "未知用户"} · {order.user?.email ?? ""}</p></div><span className="font-mono text-xs text-muted">{order.status}</span></div><p className="mt-3 text-sm text-muted">{order.productName} · 收款 {cny(order.paymentAmountFen)} · 充值 {usd(order.creditMicros)} · {order.paymentMethod === "wechat" ? "微信" : "支付宝"}</p><p className="mt-2 text-xs text-muted">付款人：{order.payerName || "未填写"}{order.paymentNote ? ` · ${order.paymentNote}` : ""}</p>{order.screenshotUrl ? <a href={order.screenshotUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-mono text-xs text-accent-readable underline">查看付款截图</a> : null}{order.status === "submitted" ? <div className="mt-4 flex gap-3"><button type="button" disabled={busy === order._id} onClick={() => review(order, "approve")} className="btn-primary disabled:opacity-50">确认收款并开通</button><button type="button" disabled={busy === order._id} onClick={() => review(order, "reject")} className="font-mono text-xs text-accent-readable underline disabled:opacity-50">驳回付款</button></div> : order.reviewNote ? <p className="mt-3 text-xs text-muted">审核备注：{order.reviewNote}</p> : null}</li>)}{orders.length === 0 ? <li className="py-5 text-sm text-muted">暂无待处理订单。</li> : null}</ul>{message ? <p className="mt-4 text-sm text-accent-readable">{message}</p> : null}</div>;
}
