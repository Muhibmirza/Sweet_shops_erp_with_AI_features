const baseUnits: Record<string, { family: string; factor: number; base: string }> = {
  KG: { family: 'weight', factor: 1, base: 'KG' },
  GRAM: { family: 'weight', factor: 0.001, base: 'KG' },
  LITRE: { family: 'volume', factor: 1, base: 'LITRE' },
  ML: { family: 'volume', factor: 0.001, base: 'LITRE' }
};

export function convertToBaseUnit(quantity: number, unit: string): number {
  return quantity * (baseUnits[String(unit || '').toUpperCase()]?.factor || 1);
}

export function convertFromBase(quantity: number, toUnit: string): number {
  return quantity / (baseUnits[String(toUnit || '').toUpperCase()]?.factor || 1);
}

export function convertUnit(quantity: number, fromUnit: string, toUnit: string): number {
  const from = String(fromUnit || '').toUpperCase();
  const to = String(toUnit || '').toUpperCase();
  if (from === to) return quantity;
  const source = baseUnits[from];
  const target = baseUnits[to];
  // Preserve legacy non-convertible units (piece, box, dozen) as-is.
  if (!source || !target || source.family !== target.family) return quantity;
  return convertFromBase(convertToBaseUnit(quantity, from), to);
}

export function displayQty(quantity: number, unit: string): string {
  const normalized = String(unit || '').toUpperCase();
  const value = Number(quantity.toFixed(3));
  if (normalized === 'GRAM') return `${value} g`;
  if (normalized === 'ML') return `${value} ml`;
  return `${value} ${normalized}`;
}
