/**
 * 账本仍以整数 micros 保存，避免历史余额与结算精度发生迁移风险。
 * 当前产品的计价基准是 1,000,000 micros = ¥8.00。
 */
export const CNY_FEN_PER_CREDIT_UNIT = 800;
export const MICROS_PER_CREDIT_UNIT = 1_000_000;

export function microsToCnyYuan(value: number): number {
  return (value * CNY_FEN_PER_CREDIT_UNIT) / (MICROS_PER_CREDIT_UNIT * 100);
}

export function cnyYuanToMicros(value: number): number {
  return Math.round((value * 100 * MICROS_PER_CREDIT_UNIT) / CNY_FEN_PER_CREDIT_UNIT);
}

export function cnyMicrosLabel(value: number, fractionDigits = 4): string {
  return `¥${microsToCnyYuan(value).toFixed(fractionDigits)}`;
}

export function cnyFenLabel(value: number): string {
  return `¥${(value / 100).toFixed(2)}`;
}
