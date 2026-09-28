import { randomUUID } from 'node:crypto';
import { paymentStore } from './store';
import {
  capturePayment,
  createTrip,
  openPayment,
  readRemotePayment,
  refundPayment as refundRemote,
} from '../legacy-api';
import type { Payment, PaymentMethod, Place, VehicleCategory } from '../types';

/**
 * Orquestração do pagamento no totem.
 *
 * Camada fina de propósito. Desde o módulo KioskManagement, tudo o que
 * é dinheiro vive no Laravel: o valor sai do banco, a idempotência é um
 * índice unique, o NSU tem coluna e a captura libera o despacho.
 *
 * O que sobrou aqui é o que só o totem sabe: qual método a pessoa tocou
 * na tela, e a fila que o Get Smart consulta.
 */

const PAYMENT_TTL_MS = 5 * 60_000;

export interface CreateChargeInput {
  kioskId: string;
  quoteId: string;
  guestId: string;
  category: VehicleCategory;
  destination: Place;
  method: PaymentMethod;
  idempotencyKey: string;
}

/** Método do totem → o que o módulo aceita. */
function remoteMethod(method: PaymentMethod): 'card' | 'pix' | 'cash' {
  if (method === 'pix') return 'pix';
  if (method === 'cash' || method === 'maylon_pass') return 'cash';
  return 'card';
}

/**
 * Cria a corrida e abre a cobrança.
 *
 * A corrida nasce com `is_dispatch_blocked = true`, então existir não
 * significa que algum motorista foi acionado. Foi isso que desfez a
 * inversão de ordem: o PIX exige trip_id, mas ninguém é chamado antes
 * do pagamento ser capturado.
 */
export async function createCharge(
  input: CreateChargeInput,
): Promise<{ payment: Payment }> {
  const { tripId } = await createTrip({
    guestId: input.guestId,
    category: input.category,
    destination: input.destination,
  });

  const remote = await openPayment({
    tripId,
    guestId: input.guestId,
    method: remoteMethod(input.method),
    expectedAmountCents: input.category.priceCents,
    idempotencyKey: input.idempotencyKey,
  });

  const payment: Payment = {
    id: remote.id,
    kioskId: input.kioskId,
    tripDraftId: input.quoteId,
    tripId,
    amountCents: remote.amountCents,
    method: input.method,
    status: remote.status === 'approved' ? 'approved' : 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + PAYMENT_TTL_MS).toISOString(),
    pixPayload: remote.pixEmv,
    pixTxId: remote.pixTxId,
  };

  // Só cartão entra na fila do terminal. PIX e dinheiro não passam pelo
  // Get Smart.
  if (payment.method === 'credit' || payment.method === 'debit') {
    paymentStore.save(payment);
  }

  return { payment };
}

/**
 * Estado atual da cobrança, lido do backend.
 *
 * Para PIX o módulo consulta o provedor antes de responder. O navegador
 * nunca declara que pagou — nem este servidor.
 */
export async function readPayment(
  id: string,
  local?: Payment,
): Promise<Payment | undefined> {
  const cached = local ?? paymentStore.get(id);

  try {
    const remote = await readRemotePayment(id);

    const status: Payment['status'] =
      remote.status === 'approved'
        ? 'approved'
        : remote.status === 'declined'
          ? 'declined'
          : remote.status === 'failed'
            ? 'failed'
            : remote.status === 'expired'
              ? 'expired'
              : remote.status === 'refunded'
                ? 'failed'
                : (cached?.status ?? 'pending');

    const merged: Payment = {
      ...(cached ?? {
        id,
        kioskId: '',
        tripDraftId: '',
        method: 'credit',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + PAYMENT_TTL_MS).toISOString(),
      }),
      id,
      tripId: remote.tripId ?? cached?.tripId,
      amountCents: remote.amountCents,
      status,
      pixPayload: remote.pixEmv ?? cached?.pixPayload,
      pixTxId: remote.pixTxId ?? cached?.pixTxId,
      acquirerNsu: remote.nsu ?? cached?.acquirerNsu,
      declineReason: remote.declineReason ?? cached?.declineReason,
    } as Payment;

    if (cached) paymentStore.update(id, merged);
    if (['approved', 'declined', 'failed', 'expired'].includes(status)) {
      paymentStore.release(id);
    }

    return merged;
  } catch {
    // Piscada de rede não muda o estado. A tela mostra "reconectando".
    return cached;
  }
}

/** Resultado do deeplink, repassado ao módulo, que grava o NSU. */
export async function submitTerminalResult(
  id: string,
  input: {
    status: 'approved' | 'declined' | 'failed';
    nsu?: string;
    authorizationCode?: string;
    terminalCode?: string;
    acquirerPayload?: Record<string, unknown>;
    declineReason?: string;
  },
): Promise<Payment | undefined> {
  const remote = await capturePayment(id, input);
  paymentStore.update(id, {
    status: input.status,
    acquirerNsu: remote.nsu,
    acquirerAuthCode: input.authorizationCode,
    declineReason: remote.declineReason,
  });

  return readPayment(id);
}

/**
 * Estorno quando ninguém aceita a corrida.
 *
 * PIX resolve no módulo. Cartão presencial exige a Getnet e devolve
 * `manual`, para a tela não prometer o que o sistema não fez.
 */
export async function refundPayment(
  id: string,
  reason: string,
): Promise<{ refunded: boolean; manual: boolean }> {
  try {
    const result = await refundRemote(id, reason);
    paymentStore.release(id);
    return result;
  } catch {
    return { refunded: false, manual: true };
  }
}

export { paymentStore };
