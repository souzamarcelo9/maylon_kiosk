import type { Payment } from '../types';

/**
 * Armazenamento das cobranças + trava de "uma corrida por totem".
 *
 * ATENÇÃO: esta implementação é em memória e serve para desenvolvimento
 * e para um totem que roda o Next localmente. Em produção com mais de
 * uma instância, troque por Redis ou por uma tabela no MySQL — a
 * interface abaixo foi desenhada para isso.
 */

const payments = new Map<string, Payment>();
const kioskLocks = new Map<string, { paymentId: string; expiresAt: number }>();

export const paymentStore = {
  get(id: string): Payment | undefined {
    const p = payments.get(id);
    if (!p) return undefined;
    if (isExpired(p)) {
      const expiredPayment: Payment = { ...p, status: 'expired' };
      payments.set(id, expiredPayment);
      releaseLock(p.kioskId, p.id);
      return expiredPayment;
    }
    return p;
  },

  save(p: Payment): Payment {
    payments.set(p.id, p);
    return p;
  },

  update(id: string, patch: Partial<Payment>): Payment | undefined {
    const current = payments.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    payments.set(id, next);

    // Terminou de um jeito ou de outro? Libera o totem.
    if (['approved', 'declined', 'failed', 'expired'].includes(next.status)) {
      releaseLock(next.kioskId, next.id);
    }
    return next;
  },

  /**
   * Claim atômico: o primeiro terminal que pedir leva. Sem isto, dois
   * Get Smart no mesmo saguão disparam a mesma cobrança duas vezes.
   */
  claimNext(terminalId: string, kioskId: string): Payment | null {
    for (const p of payments.values()) {
      if (p.kioskId !== kioskId) continue;
      if (p.status !== 'pending') continue;
      if (isExpired(p)) continue;
      if (p.method === 'cash' || p.method === 'maylon_pass') continue;

      const claimed: Payment = {
        ...p,
        status: 'claimed',
        claimedBy: terminalId,
      };
      payments.set(p.id, claimed);
      return claimed;
    }
    return null;
  },

  /** Retorna a cobrança em andamento do totem, se houver. */
  activeForKiosk(kioskId: string): Payment | null {
    const lock = kioskLocks.get(kioskId);
    if (!lock) return null;
    if (lock.expiresAt < Date.now()) {
      kioskLocks.delete(kioskId);
      return null;
    }
    return payments.get(lock.paymentId) ?? null;
  },

  acquireLock(kioskId: string, paymentId: string, ttlMs: number): boolean {
    const existing = kioskLocks.get(kioskId);
    if (existing && existing.expiresAt > Date.now()) return false;
    kioskLocks.set(kioskId, { paymentId, expiresAt: Date.now() + ttlMs });
    return true;
  },
};

function releaseLock(kioskId: string, paymentId: string) {
  const lock = kioskLocks.get(kioskId);
  if (lock?.paymentId === paymentId) kioskLocks.delete(kioskId);
}

function isExpired(p: Payment): boolean {
  if (['approved', 'declined', 'failed', 'expired'].includes(p.status)) {
    return false;
  }
  return new Date(p.expiresAt).getTime() < Date.now();
}
