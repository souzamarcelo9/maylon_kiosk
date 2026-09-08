import { randomUUID } from 'node:crypto';
import { serverConfig } from '../config';
import { paymentStore } from './store';
import {
  createTrip,
  generatePix,
  getPixStatus,
  markTripPaid,
  refundPix,
} from '../legacy-api';
import type { Payment, PaymentMethod, Place, VehicleCategory } from '../types';

/** Cobrança de totem vence rápido: ninguém fica 15 min parado ali. */
const PAYMENT_TTL_MS = 5 * 60_000;

export interface CreateChargeInput {
  kioskId: string;
  quoteId: string;
  category: VehicleCategory;
  origin: Place;
  destination: Place;
  method: PaymentMethod;
  passengerName: string;
  passengerPhone?: string;
  passengerDocument?: string;
  idempotencyKey: string;
}

const idempotencyIndex = new Map<string, string>();

/**
 * Cria a corrida no backend e abre a cobrança.
 *
 * A ORDEM AQUI É IMPOSTA PELO BACKEND, não escolhida. O /api/v1/pix/generate
 * exige `trip_id`, então a corrida tem de existir antes do pagamento. No
 * app mobile isso é natural; no totem inverte a lógica de segurança, já
 * que o ideal seria só criar a corrida depois de pagar.
 *
 * Consequência prática: entre createTrip e a confirmação do pagamento
 * existe uma janela em que a corrida existe sem estar paga. Se o
 * despacho do PHP não respeitar `payment_status = unpaid`, um motorista
 * pode ser acionado à toa. É o item mais importante a alinhar no backend.
 */
export async function createCharge(
  input: CreateChargeInput,
): Promise<{ payment: Payment; reused: boolean } | { conflict: Payment }> {
  // 1. Idempotência: se a rede caiu no meio, o tablet reenvia e recebe a
  //    MESMA cobrança em vez de criar uma segunda corrida.
  const known = idempotencyIndex.get(input.idempotencyKey);
  if (known) {
    const existing = paymentStore.get(known);
    if (existing) return { payment: existing, reused: true };
  }

  // 2. Uma corrida por vez neste totem.
  const active = paymentStore.activeForKiosk(input.kioskId);
  if (active) return { conflict: active };

  const method = input.method;
  const amountCents = input.category.priceCents;

  // 3. Corrida no backend, para obter o trip_id.
  const { tripId } = await createTrip({
    category: input.category,
    origin: input.origin,
    destination: input.destination,
    paymentMethod: legacyPaymentMethod(method),
    note: `Totem ${input.kioskId} — ${input.passengerName}`,
    senderName: input.passengerName,
    senderPhone: input.passengerPhone,
  });

  const now = Date.now();
  const payment: Payment = {
    id: `pay_${randomUUID()}`,
    kioskId: input.kioskId,
    tripDraftId: input.quoteId,
    tripId,
    amountCents,
    method,
    // Dinheiro e Maylon Pass não passam por adquirente.
    status: method === 'cash' || method === 'maylon_pass' ? 'approved' : 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PAYMENT_TTL_MS).toISOString(),
  };

  // 4. PIX: o payload EMV sai do PHP.
  if (method === 'pix') {
    if (serverConfig.paymentDriver === 'mock') {
      payment.pixPayload = `00020126BR.GOV.BCB.PIX-MOCK-${payment.id}-${amountCents}`;
      payment.pixTxId = `mock-${payment.id}`;
    } else {
      const pix = await generatePix({
        tripId,
        amountCents,
        document: input.passengerDocument ?? '',
        name: input.passengerName,
      });
      payment.pixPayload = pix.emv;
      payment.pixTxId = pix.txId;
    }
  }

  paymentStore.acquireLock(input.kioskId, payment.id, PAYMENT_TTL_MS);
  paymentStore.save(payment);
  idempotencyIndex.set(input.idempotencyKey, payment.id);

  if (payment.status === 'approved') {
    void confirmWithBackend(payment);
  } else if (serverConfig.paymentDriver === 'mock') {
    scheduleMockApproval(payment);
  }

  return { payment, reused: false };
}

/**
 * Lê o estado atual da cobrança.
 *
 * Para PIX consulta o /api/v1/pix/status no backend — o navegador nunca
 * decide que pagou. Para cartão, quem escreve o resultado é o app do
 * Get Smart, via POST /payments/:id/result.
 */
export async function readPayment(id: string): Promise<Payment | undefined> {
  const payment = paymentStore.get(id);
  if (!payment) return undefined;

  const isOpen = ['pending', 'claimed', 'processing'].includes(payment.status);
  if (!isOpen) return payment;

  if (payment.method === 'pix' && payment.pixTxId && serverConfig.paymentDriver !== 'mock') {
    try {
      const status = await getPixStatus(payment.pixTxId);
      if (status === 'paid') {
        const next = paymentStore.update(payment.id, { status: 'approved' })!;
        void confirmWithBackend(next);
        return next;
      }
      if (status === 'expired') {
        return paymentStore.update(payment.id, { status: 'expired' });
      }
      if (status === 'failed') {
        return paymentStore.update(payment.id, {
          status: 'failed',
          declineReason: 'PIX não concluído',
        });
      }
    } catch (err) {
      // Falha de consulta não muda o estado. A tela mostra "reconectando".
      console.error('[pix/status]', err);
    }
  }

  return payment;
}

/** Avisa o backend que a corrida está paga, para liberar o despacho. */
export async function confirmWithBackend(payment: Payment): Promise<void> {
  if (!payment.tripId) return;
  try {
    await markTripPaid({
      tripId: payment.tripId,
      method: legacyPaymentMethod(payment.method),
      amountCents: payment.amountCents,
      reference: payment.acquirerNsu ?? payment.pixTxId,
    });
  } catch (err) {
    // O dinheiro já saiu. Isto NÃO pode se perder num console.error em
    // produção — precisa de fila com retry ou alerta para o operador.
    console.error('[markTripPaid] FALHOU, corrida paga sem confirmar', {
      tripId: payment.tripId,
      paymentId: payment.id,
      err,
    });
  }
}

/**
 * Estorno automático quando ninguém aceita a corrida.
 *
 * Sem isto, "pagou e não veio motorista" vira reclamação no balcão do
 * shopping. O backend já expõe /api/v1/pix/refund.
 */
export async function refundPayment(id: string, reason: string): Promise<boolean> {
  const payment = paymentStore.get(id);
  if (!payment || payment.status !== 'approved') return false;

  if (payment.method === 'pix' && payment.pixTxId) {
    try {
      await refundPix({ txId: payment.pixTxId, amountCents: payment.amountCents, reason });
      return true;
    } catch (err) {
      console.error('[refundPix]', err);
      return false;
    }
  }

  // Cartão no Get Smart precisa de estorno na adquirente, não aqui.
  console.warn('[refund] cartão exige estorno manual na Getnet', payment.id);
  return false;
}

/**
 * Driver mock: aprova em 3s. Valor terminado em 13 centavos recusa —
 * é assim que se testa o caminho triste sem cartão sem limite.
 */
function scheduleMockApproval(payment: Payment) {
  setTimeout(() => {
    const current = paymentStore.get(payment.id);
    if (!current || current.status === 'expired') return;

    const shouldDecline = payment.amountCents % 100 === 13;
    const next = paymentStore.update(payment.id, {
      status: shouldDecline ? 'declined' : 'approved',
      declineReason: shouldDecline ? 'Cartão recusado pelo emissor' : undefined,
      acquirerNsu: shouldDecline ? undefined : '000123456',
      acquirerAuthCode: shouldDecline ? undefined : 'A1B2C3',
    });
    if (next?.status === 'approved') void confirmWithBackend(next);
  }, 3000);
}

/** Traduz o método do totem para o que o /ride/create aceita. */
function legacyPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case 'pix':
      return serverConfig.paymentMethodPix;
    case 'cash':
      return serverConfig.paymentMethodCash;
    case 'maylon_pass':
      return serverConfig.paymentMethodCash;
    default:
      return serverConfig.paymentMethodCard;
  }
}

export { paymentStore };
