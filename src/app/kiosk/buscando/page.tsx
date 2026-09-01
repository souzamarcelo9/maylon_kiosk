'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/kiosk/Button';
import { useKioskSession } from '@/contexts/KioskSessionContext';
import { kioskConfig } from '@/lib/config';

/** Tela 7 — despacha a corrida e espera um motorista aceitar. */
export default function BuscandoPage() {
  const router = useRouter();
  const { session, hydrated, patch } = useKioskSession();
  const [code, setCode] = useState<string | null>(session.tripCode ?? null);
  const [error, setError] = useState('');
  const dispatched = useRef(false);

  // Despacha uma vez só. Sem o ref, o StrictMode em dev cria duas corridas.
  useEffect(() => {
    if (!hydrated || dispatched.current || code) return;
    if (!session.quote || !session.category || !session.guest || !session.paymentId) {
      router.replace('/kiosk');
      return;
    }
    dispatched.current = true;

    (async () => {
      try {
        const res = await fetch('/api/kiosk/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteId: session.quote!.quoteId,
            categoryId: session.category!.id,
            guestId: session.guest!.guestId,
            paymentId: session.paymentId,
            kioskId: kioskConfig.id,
          }),
        });

        if (!res.ok) {
          setError(
            'O pagamento foi feito, mas não conseguimos chamar o motorista. Procure um atendente com este totem.',
          );
          return;
        }

        const { trip } = await res.json();
        setCode(trip.code);
        patch({ tripCode: trip.code });
      } catch {
        setError('Sem conexão com a central. Procure um atendente.');
      }
    })();
  }, [hydrated, session, code, patch, router]);

  // Acompanha até o motorista aceitar.
  useEffect(() => {
    if (!code) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/kiosk/trips/${code}`);
        if (!res.ok) return;
        const { trip } = await res.json();
        if (trip.status === 'assigned' || trip.status === 'arriving') {
          router.replace(`/kiosk/corrida/${code}`);
        }
        if (trip.status === 'no_drivers' || trip.status === 'cancelled') {
          setError('Nenhum motorista disponível agora. O valor será estornado.');
        }
      } catch {}
    }, 2500);
    return () => clearInterval(id);
  }, [code, router]);

  return (
    <div className="grid flex-1 grid-cols-1 items-center gap-16 px-16 py-12 lg:grid-cols-[1fr_460px]">
      <div className="text-center">
        <Radar />
        <h1 className="mt-16 text-5xl font-bold leading-tight">
          {error ? 'Precisamos de ajuda' : 'Procurando o melhor motorista'}
        </h1>
        <p className="mt-6 text-3xl text-muted">
          {error || 'Isso leva alguns instantes.'}
        </p>

        {code && !error && (
          <p className="mt-10 text-2xl">
            Código da corrida{' '}
            <strong className="tracking-wider text-brand-700">{code}</strong>
          </p>
        )}

        {error && (
          <Button className="mx-auto mt-12 max-w-md" onClick={() => router.replace('/kiosk')}>
            Voltar ao início
          </Button>
        )}
      </div>

      <aside className="hidden overflow-hidden rounded-[var(--radius-card)] bg-white shadow-xl lg:block">
        <div className="p-10 text-center">
          <span className="inline-block rounded-full bg-brand-700 px-6 py-2 text-lg font-semibold text-white">
            Anúncio
          </span>
          <h2 className="mt-8 text-4xl font-bold leading-snug text-brand-800">
            Viaje com a Maylon e vá mais longe
          </h2>
          <p className="mt-4 text-2xl text-muted">
            Conforto, segurança e pontualidade em cada corrida.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-brand-700 px-6 py-10 text-center text-white">
          <Perk label="Segurança em primeiro lugar" />
          <Perk label="Motoristas pontuais" />
          <Perk label="Melhor experiência" />
        </div>
      </aside>
    </div>
  );
}

function Perk({ label }: { label: string }) {
  return <p className="px-2 text-lg leading-snug">{label}</p>;
}

/** Radar do protótipo: anéis que pulsam de dentro para fora. */
function Radar() {
  return (
    <div className="relative mx-auto flex h-[380px] w-[380px] items-center justify-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute h-full w-full rounded-full bg-brand-300/35 animate-pulse-ring"
          style={{ animationDelay: `${i * 0.7}s` }}
        />
      ))}
      <span className="relative flex h-32 w-32 items-center justify-center rounded-full bg-brand-700 text-white">
        <svg viewBox="0 0 24 24" className="h-16 w-16" fill="currentColor" aria-hidden="true">
          <path d="M5 16v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2a3 3 0 0 0-.7-1.9l-1.2-4A2 2 0 0 0 15.2 8H8.8a2 2 0 0 0-1.9 1.4l-1.2 4A3 3 0 0 0 5 16Zm3-1.5a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm8 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z" />
        </svg>
      </span>
    </div>
  );
}
