// src/lib/format.ts
const MINUS_SIGN = '−';
const HAIR_SPACE = ' ';

export function formatSigned(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS_SIGN : '';
  return `${sign}${Math.abs(rounded).toFixed(decimals)}`;
}

export function formatMass(grams: number): string {
  return `${grams.toFixed(1)}${HAIR_SPACE}g`;
}

export function formatTime(seconds: number): string {
  return `${Math.round(seconds)}s`;
}

export function formatRoastAge(days: number): string {
  return `${days} d`;
}
