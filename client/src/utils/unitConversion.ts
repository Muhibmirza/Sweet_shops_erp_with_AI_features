const units: Record<string, { family: string; factor: number }> = {
  KG: { family: 'weight', factor: 1 }, GRAM: { family: 'weight', factor: 0.001 },
  LITRE: { family: 'volume', factor: 1 }, ML: { family: 'volume', factor: 0.001 }
};

export function convertUnit(quantity: number, from: string, to: string): number {
  if (from === to) return quantity;
  const source = units[from];
  const target = units[to];
  return source && target && source.family === target.family ? quantity * source.factor / target.factor : quantity;
}

export function formatKitchenQuantity(quantity: number, unit: string): string {
  if (unit === 'KG' && Math.abs(quantity) < 1 && quantity !== 0) return `${Number((quantity * 1000).toFixed(2))} g`;
  if (unit === 'LITRE' && Math.abs(quantity) < 1 && quantity !== 0) return `${Number((quantity * 1000).toFixed(2))} ml`;
  return `${Number(quantity.toFixed(3))} ${unit}`;
}
