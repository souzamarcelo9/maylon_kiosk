'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { Card } from '@/components/kiosk/Card';
import { Button } from '@/components/kiosk/Button';
import { useKioskSession } from '@/contexts/KioskSessionContext';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { formatBRL } from '@/lib/money';

/** Tela 5 — QR Code do PIX na tela grande. */
export default function PixPage() {
  const router = useRouter();
  const { session, hydrated } = useKioskSession();
  const { payment, unreachable } = usePaymentStatus(session.paymentId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [left, setLeft] = useState<number>(0);

  useEffect(() => {
    if (hydrated && !session.paymentId) router.replace('/kiosk');
  }, [hydrated, session.paymentId, router]);

  // Desenha o QR a partir do payload EMV. Nada de imagem vinda do servidor.
  useEffect(() => {
    if (!payment?.pixPayload || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payment.pixPayload, {
      width: 460,
      margin: 1,
      color: { dark: '#0b5e5a', light: '#ffffff' },
    }).catch(() => {});
  }, [payment?.pixPayload]);

  useEffect(() => {
    if (!payment?.expiresAt) return;
    const id = setInterval(() => {
      setLeft(
        Math.max(0, new Date(payment.expiresAt).getTime() - Date.now()),
      );
    }, 500);
    return () => clearInterval(id);
  }, [payment?.expiresAt]);

  useEffect(() => {
    if (payment?.status === 'approved') router.replace('/kiosk/buscando');
  }, [payment?.status, router]);

  const expired = payment?.status === 'expired' || (payment && left === 0);

  return (
    <div className="flex flex-1 items-center justify-center px-12 py-10">
      <Card className="w-full max-w-2xl p-14 text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand-700 text-white">
          <QrIcon />
        </div>

        <h1 className="mt-8 text-4xl font-bold">Pagamento via PIX</h1>
        <span className="mx-auto mt-4 block h-1 w-16 rounded bg-brand-300" />

        {expired ? (
          <>
            <p className="mt-10 text-2xl text-muted">
              O código expirou. Gere um novo para continuar.
            </p>
            <Button className="mt-10" onClick={() => router.replace('/kiosk/veiculo')}>
              Gerar novo código
            </Button>
          </>
        ) : (
          <>
            <p className="mt-6 text-2xl text-muted">
              Abra o app do seu banco e escaneie o código
            </p>

            <div className="mx-auto mt-10 w-fit rounded-3xl bg-white p-6 shadow-inner">
              <canvas ref={canvasRef} aria-label="QR Code do PIX" />
            </div>

            <p className="mt-10 text-xl text-muted">Valor da corrida</p>
            <p className="text-6xl font-bold text-brand-800">
              {payment ? formatBRL(payment.amountCents) : '—'}
            </p>

            <div className="mt-10 rounded-2xl bg-brand-50 py-6 text-2xl">
              {unreachable ? (
                <span className="text-warn">Reconectando…</span>
              ) : (
                <span>
                  Expira em{' '}
                  <strong className="text-brand-700">{mmss(left)}</strong>
                </span>
              )}
            </div>

            <p className="mt-8 text-xl text-muted">
              A tela avança sozinha quando o pagamento cair.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function mmss(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2v2h-2zM19 14h2v2h-2z" fill="currentColor" stroke="none" />
    </svg>
  );
}
