'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/kiosk/Card';
import { Button } from '@/components/kiosk/Button';
import { useKioskSession } from '@/contexts/KioskSessionContext';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { formatBRL } from '@/lib/money';

/**
 * Tela 6 — o valor já foi enviado ao Get Smart pelo backend. Esta tela
 * só espelha o que está acontecendo na maquininha ao lado.
 */
export default function CartaoPage() {
  const router = useRouter();
  const { session, hydrated } = useKioskSession();
  const { payment, unreachable } = usePaymentStatus(session.paymentId);

  useEffect(() => {
    if (hydrated && !session.paymentId) router.replace('/kiosk');
  }, [hydrated, session.paymentId, router]);

  useEffect(() => {
    if (payment?.status === 'approved') router.replace('/kiosk/buscando');
  }, [payment?.status, router]);

  const failed =
    payment?.status === 'declined' ||
    payment?.status === 'failed' ||
    payment?.status === 'expired';

  return (
    <div className="flex flex-1 items-center justify-center px-12 py-10">
      <Card className="w-full max-w-2xl p-14 text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand-700 text-white">
          <CardIcon />
        </div>

        <h1 className="mt-8 text-4xl font-bold">
          {failed ? 'Pagamento não aprovado' : 'Pagamento na maquininha'}
        </h1>
        <span className="mx-auto mt-4 block h-1 w-16 rounded bg-brand-300" />

        {failed ? (
          <>
            <p className="mt-8 text-2xl text-muted">
              {payment?.declineReason ??
                'A transação não foi concluída. Você pode tentar de novo ou escolher PIX.'}
            </p>
            <div className="mt-12 space-y-5">
              <Button onClick={() => router.replace('/kiosk/veiculo')}>
                Tentar novamente
              </Button>
              <Button variant="outline" onClick={() => router.replace('/kiosk')}>
                Cancelar pedido
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-6 text-2xl text-muted">
              Insira ou aproxime o cartão na maquininha ao lado da tela
            </p>

            <div className="relative mx-auto mt-10 flex h-72 w-72 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-brand-100 animate-pulse-ring" />
              <PinpadIllustration />
            </div>

            <p className="mt-8 text-xl text-muted">Valor da corrida</p>
            <p className="text-6xl font-bold text-brand-800">
              {payment ? formatBRL(payment.amountCents) : '—'}
            </p>

            <div className="mt-10 flex items-center justify-center gap-4 rounded-2xl bg-brand-50 py-6 text-2xl">
              {unreachable ? (
                <span className="text-warn">Reconectando…</span>
              ) : (
                <span>{statusLabel(payment?.status)}</span>
              )}
            </div>

            <p className="mt-8 text-xl text-muted">
              Não retire o cartão até a maquininha avisar.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function statusLabel(status?: string) {
  if (status === 'claimed') return 'Enviando valor para a maquininha…';
  if (status === 'processing') return 'Processando com o banco…';
  return 'Aguardando o cartão…';
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
    </svg>
  );
}

function PinpadIllustration() {
  return (
    <svg viewBox="0 0 120 180" className="relative h-64" aria-hidden="true">
      <rect x="12" y="6" width="96" height="168" rx="14" fill="#16302e" />
      <rect x="22" y="18" width="76" height="66" rx="6" fill="#0b5e5a" />
      <path
        d="M50 44a14 14 0 0 1 0 16M58 40a20 20 0 0 1 0 24M66 36a26 26 0 0 1 0 32"
        fill="none" stroke="#d9ecea" strokeWidth="3" strokeLinecap="round"
      />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={26 + c * 24} y={96 + r * 19}
            width="19" height="14" rx="4" fill="#3d5250"
          />
        )),
      )}
      <rect x="96" y="96" width="14" height="14" rx="4" fill="#b3261e" />
      <rect x="96" y="153" width="14" height="14" rx="4" fill="#1f8a4c" />
    </svg>
  );
}
