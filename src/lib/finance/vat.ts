export function calcVAT(amount: number, vatRate: number): number {
  if (!vatRate || vatRate <= 0) return 0;
  return Math.round(amount * vatRate / 100 * 100) / 100;
}

export function addVAT(amountExcl: number, vatRate: number): number {
  if (!vatRate || vatRate <= 0) return amountExcl;
  return Math.round((amountExcl * (1 + vatRate / 100)) * 100) / 100;
}

export function removeVAT(amountIncl: number, vatRate: number): number {
  if (!vatRate || vatRate <= 0) return amountIncl;
  return Math.round(amountIncl / (1 + vatRate / 100) * 100) / 100;
}
