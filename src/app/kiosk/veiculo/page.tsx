'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/kiosk/Button';
import { Card } from '@/components/kiosk/Card';
import { useKioskSession } from '@/contexts/KioskSessionContext';
import { formatBRL, formatKm } from '@/lib/money';
import { kioskConfig } from '@/lib/config';
import type { PaymentMethod } from '@/lib/types';

/**
 * Tela 4 — categorias e preços vêm do backend, iguais aos do app mobile.
 * Nenhum cálculo de tarifa acontece no navegador.
 */
export default function VeiculoPage() {
  const router = useRouter();
  const { session, hydrated, patch } = useKioskSession();
  const quote = session.quote;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hydrated) return;
    if (!quote) router.replace('/kiosk');
    else setCategoryId((id) => id ?? quote.categories[0]?.id ?? null);
  }, [hydrated, quote, router]);

  if (!quote) return null;

  const category = quote.categories.find((c) => c.id === categoryId);

  async function handlePay() {
    if (!category || !method || !session.guest || !quote) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/kiosk/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Uma chave por tentativa. Retry de rede não cobra duas vezes.
          'Idempotency-Key': `${quote.quoteId}:${category.id}:${method}`,
        },
        body: JSON.stringify({
          kioskId: kioskConfig.id,
          tripDraftId: quote.quoteId,
          amountCents: category.priceCents,
          method,
        }),
      });

      if (res.status === 409) {
        setError('Este totem já tem um pedido em andamento. Aguarde um instante.');
        return;
      }
      if (!res.ok) {
        setError('Não foi possível iniciar o pagamento. Tente novamente.');
        return;
      }

      const { payment } = await res.json();
      patch({ category, paymentId: payment.id });

      if (method === 'pix') router.push('/kiosk/pagamento/pix');
      else if (method === 'cash') router.push('/kiosk/buscando');
      else router.push('/kiosk/pagamento/cartao');
    } catch {
      setError('Sem conexão. Chame um atendente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-6 bg-brand-700 px-10 py-7 text-white">
        <button
          onClick={() => router.back()}
          aria-label="Voltar"
          className="rounded-xl p-3 text-4xl leading-none hover:bg-white/10"
        >
          ‹
        </button>
        <h1 className="flex-1 text-center text-4xl font-bold">Escolher veículo</h1>
        <span className="w-14" />
      </header>

      <div className="flex-1 space-y-8 overflow-y-auto p-10">
        <Card className="p-10">
          <h2 className="mb-8 text-3xl font-semibold">Categoria</h2>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {quote.categories.map((c) => {
              const active = c.id === categoryId;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={active}
                  className={`relative rounded-3xl border-2 p-6 text-center transition ${
                    active
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-line bg-white hover:border-brand-300'
                  }`}
                >
                  {c.discount && (
                    <span className="absolute left-4 top-4 rounded-full bg-brand-600 px-3 py-1 text-sm font-bold text-white">
                      %
                    </span>
                  )}
                  {c.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={c.imageUrl} alt="" className="mx-auto h-28 object-contain" />
                  ) : (
                    <div className="mx-auto flex h-28 items-center justify-center text-6xl">🚗</div>
                  )}
                  <p className="mt-4 text-2xl font-semibold">{c.name}</p>
                  <p className="mt-1 text-2xl font-bold text-brand-700">
                    {formatBRL(c.priceCents)}
                  </p>
                  {c.etaMinutes != null && (
                    <p className="mt-1 text-lg text-muted">{c.etaMinutes} min</p>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-6 p-10">
          <Route label="Origem" value={quote.origin.label} />
          <Route label="Destino" value={quote.destination.label} />
          <div className="flex items-baseline justify-between border-t border-line pt-6">
            <span className="text-2xl font-semibold text-brand-700">Distância</span>
            <span className="text-2xl">{formatKm(quote.distanceKm)}</span>
          </div>
        </Card>

        <Card className="p-10">
          <h2 className="mb-6 text-3xl font-semibold">Forma de pagamento</h2>
          <div className="grid grid-cols-2 gap-6">
            <MethodButton
              active={method === 'credit'}
              onClick={() => setMethod('credit')}
              label="Cartão"
              hint="Na maquininha ao lado"
            />
            <MethodButton
              active={method === 'pix'}
              onClick={() => setMethod('pix')}
              label="PIX"
              hint="QR Code na tela"
            />
          </div>
        </Card>

        {error && (
          <p role="alert" className="text-center text-2xl text-danger">
            {error}
          </p>
        )}
      </div>

      <footer className="flex items-center gap-10 border-t border-line bg-white px-10 py-8">
        <div>
          <p className="text-xl text-muted">Tarifa</p>
          <p className="text-5xl font-bold text-brand-800">
            {category ? formatBRL(category.priceCents) : '—'}
          </p>
        </div>
        <Button
          className="flex-1"
          onClick={handlePay}
          disabled={!category || !method || submitting}
        >
          {submitting ? 'Aguarde…' : 'Pagar'}
        </Button>
      </footer>
    </div>
  );
}

function Route({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xl font-semibold text-brand-700">{label}</p>
      <p className="mt-1 text-2xl">{value}</p>
    </div>
  );
}

function MethodButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`touch-target rounded-2xl border-2 px-8 py-6 text-left transition ${
        active ? 'border-brand-600 bg-brand-50' : 'border-line bg-white'
      }`}
    >
      <span className="block text-2xl font-semibold">{label}</span>
      <span className="mt-1 block text-lg text-muted">{hint}</span>
    </button>
  );
}
