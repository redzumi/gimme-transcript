// Per-minute price with up to 4 decimals, trailing zeros trimmed: 0.0037 → "$0.0037".
export function formatPricePerMinute(price: number): string {
  return `$${price.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}/min`
}
