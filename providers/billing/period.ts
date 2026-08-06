/** Return the current billing month in the product's accounting time zone. */
export function currentPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month") =>
    parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}`;
}
