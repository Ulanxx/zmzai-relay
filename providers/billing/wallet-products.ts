import { cnyFenLabel, cnyMicrosLabel } from "./currency";

export interface WalletProduct {
  id: string;
  name: string;
  creditMicros: number;
  paymentAmountFen: number;
}

const fallbackProducts: WalletProduct[] = [
  { id: "starter", name: "入门额度 · ¥8", creditMicros: 1_000_000, paymentAmountFen: 800 },
  { id: "builder", name: "开发额度 · ¥40", creditMicros: 5_000_000, paymentAmountFen: 4_000 },
  { id: "power", name: "长期额度 · ¥160", creditMicros: 20_000_000, paymentAmountFen: 16_000 },
];

export function getWalletProducts(): WalletProduct[] {
  const raw = process.env.RELAY_WALLET_PRODUCTS_JSON;
  if (!raw) return fallbackProducts;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallbackProducts;
    const products = parsed.filter((item): item is WalletProduct => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<WalletProduct>;
      return typeof value.id === "string" && typeof value.name === "string" && typeof value.creditMicros === "number" && Number.isInteger(value.creditMicros) && value.creditMicros > 0 && typeof value.paymentAmountFen === "number" && Number.isInteger(value.paymentAmountFen) && value.paymentAmountFen > 0;
    });
    return products.length ? products : fallbackProducts;
  } catch {
    return fallbackProducts;
  }
}

export { cnyFenLabel, cnyMicrosLabel };
