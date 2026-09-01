export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatKm(km: number): string {
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`;
}
