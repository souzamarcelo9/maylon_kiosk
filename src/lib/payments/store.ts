import type { Payment } from '../types';

/**
 * Fila de cobranças à espera do Get Smart.
 *
 * ATENÇÃO AO ESCOPO: isto NÃO é mais a fonte de verdade do pagamento.
 * Quem manda é o módulo KioskManagement — valor, status, NSU e a trava
 * de despacho vivem no MySQL, com idempotência garantida por índice
 * unique. O que sobra aqui é só a fila local que o terminal consulta,
 * porque o backend não tem esse conceito de "claim".
 *
 * Em memória é aceitável para esta função: se o Next reiniciar, perde-se
 * no máximo um claim pendente, e o tablet reabre a cobrança. Nenhum
 * dinheiro depende disto.
 */
const claimQueue = new Map<string, Payment>();

export const paymentStore = {
  get(id: string): Payment | undefined {
    return claimQueue.get(id);
  },

  save(p: Payment): Payment {
    claimQueue.set(p.id, p);
    return p;
  },

  update(id: string, patch: Partial<Payment>): Payment | undefined {
    const current = claimQueue.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    claimQueue.set(id, next);
    return next;
  },

  /**
   * Claim atômico: o primeiro terminal que pedir leva. Sem isto, dois
   * Get Smart no mesmo saguão disparam a mesma cobrança duas vezes.
   */
  claimNext(terminalId: string, kioskId: string): Payment | null {
    for (const p of claimQueue.values()) {
      if (p.kioskId !== kioskId) continue;
      if (p.status !== 'pending') continue;
      if (p.method !== 'credit' && p.method !== 'debit') continue;
      if (new Date(p.expiresAt).getTime() < Date.now()) continue;

      const claimed: Payment = { ...p, status: 'claimed', claimedBy: terminalId };
      claimQueue.set(p.id, claimed);
      return claimed;
    }
    return null;
  },

  /** Limpeza: cobrança encerrada sai da fila. */
  release(id: string): void {
    claimQueue.delete(id);
  },
};
