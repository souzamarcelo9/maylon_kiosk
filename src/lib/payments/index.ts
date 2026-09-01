import { randomUUID } from 'node:crypto';
import { serverConfig } from '../config';
import { paymentStore } from './store';
import type { Payment, PaymentMethod } from '../types';

/** Cobrança de totem vence rápido: ninguém fica 15 min parado ali. */
const PAYMENT_TTL_MS = 3 * 60_000;

export interface CreateChargeInput {
  kioskId: string;
  tripDraftId: string;
  amountCents: number;
  method: PaymentMethod;
  idempotencyKey: string;
}

const idempotencyIndex = new Map<string, string>();

export async function createCharge(
  input: CreateChargeInput,
): Promise<{ payment: Payment; reused: boolean } | { conflict: Payment }> {
  // 1. Idempotência. Se a rede caiu no meio, o tablet reenvia e recebe
  //    a MESMA cobrança em vez de criar uma segunda.
  const known = idempotencyIndex.get(input.idempotencyKey);
  if (known) {
    const existing = paymentStore.get(known);
    if (existing) return { payment: existing, reused: true };
  }

  // 2. Uma corrida por vez neste totem.
  const active = paymentStore.activeForKiosk(input.kioskId);
  if (active) return { conflict: active };

  const now = Date.now();
  const payment: Payment = {
    id: `pay_${randomUUID()}`,
    kioskId: input.kioskId,
    tripDraftId: input.tripDraftId,
    amountCents: input.amountCents,
    method: input.method,
    // Dinheiro e Maylon Pass não passam por adquirente.
    status:
      input.method === 'cash' || input.method === 'maylon_pass'
        ? 'approved'
        : 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PAYMENT_TTL_MS).toISOString(),
  };

  if (input.method === 'pix') {
    payment.pixPayload = await generatePixPayload(payment);
  }

  paymentStore.acquireLock(input.kioskId, payment.id, PAYMENT_TTL_MS);
  paymentStore.save(payment);
  idempotencyIndex.set(input.idempotencyKey, payment.id);

  if (serverConfig.paymentDriver === 'mock' && payment.status === 'pending') {
    scheduleMockApproval(payment);
  }

  return { payment, reused: false };
}

/**
 * Driver mock: aprova em 3s. Se o valor terminar em 13 centavos, recusa —
 * é assim que você testa o caminho triste sem precisar de cartão sem limite.
 */
function scheduleMockApproval(payment: Payment) {
  setTimeout(() => {
    const current = paymentStore.get(payment.id);
    if (!current || current.status === 'expired') return;

    const shouldDecline = payment.amountCents % 100 === 13;
    paymentStore.update(payment.id, {
      status: shouldDecline ? 'declined' : 'approved',
      declineReason: shouldDecline ? 'Cartão recusado pelo emissor' : undefined,
      acquirerNsu: shouldDecline ? undefined : '000123456',
      acquirerAuthCode: shouldDecline ? undefined : 'A1B2C3',
    });
  }, 3000);
}

/**
 * AJUSTE: gere o payload EMV de verdade no backend PHP ou pela API PIX
 * da Getnet. O QR Code em si é desenhado no navegador a partir desta
 * string — não precisa de imagem vinda do servidor.
 */
async function generatePixPayload(payment: Payment): Promise<string> {
  return `00020126BR.GOV.BCB.PIX-MOCK-${payment.id}-${payment.amountCents}`;
}

export { paymentStore };
