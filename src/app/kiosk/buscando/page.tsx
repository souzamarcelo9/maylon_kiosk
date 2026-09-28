'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/kiosk/Button';
import { useKioskSession } from '@/contexts/KioskSessionContext';

/**
 * Tela 7 — espera um motorista aceitar.
 *
 * A corrida já foi criada no backend junto com a cobrança (o PIX exige
 * trip_id), então aqui não se cria nada: só se acompanha o status.
 *
 * Se ninguém aceitar, dispara o estorno. Sem isso, "paguei e não veio
 * carro" vira reclamação no balcão do shopping.
 */
export default function BuscandoPage() {
  const router = useRouter();
  const { session, hydrated } = useKioskSession();
  const [error, setError] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const refunded = useRef(false);

  const tripId = session.tripId;

  useEffect(() => {
    if (hydrated && !tripId) router.replace('/kiosk');
  }, [hydrated, tripId, router]);

  useEffect(() => {
    if (!tripId) return;
    let alive = true;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/kiosk/trips/${tripId}`);
        if (!res.ok || !alive) return;
        const { trip } = await res.json();

        if (trip.status === 'assigned' || trip.status === 'arriving') {
          router.replace(`/kiosk/corrida/${tripId}`);
          return;
        }

        if (trip.status === 'no_drivers' || trip.status === 'cancelled') {
          setError('Nenhum motorista disponível agora.');
          if (!refunded.current && session.paymentId) {
            refunded.current = true;
            await triggerRefund(session.paymentId, setRefundNote);
          }
        }
      } catch {
        // Piscada de rede não muda nada. Continua tentando.
      }
    }, 2500);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tripId, session.paymentId, router]);

  return (
    <div className="grid flex-1 grid-cols-1 items-center gap-6 overflow-y-auto px-4 py-6 sm:px-8 lg:grid-cols-[1fr_460px] lg:gap-16">
      <div className="text-center">
        <Radar />
        <h1 className="t-title mt-[4vmin] font-bold">
          {error ? 'Não encontramos motorista' : 'Procurando o melhor motorista'}
        </h1>
        <p className="t-body mt-3 text-muted">
          {error || 'Isso leva alguns instantes.'}
        </p>

        {refundNote && (
          <p className="t-body mt-3 font-medium text-brand-800">{refundNote}</p>
        )}

        {error && (
          <Button
            className="mx-auto mt-[3vmin] max-w-md"
            onClick={() => router.replace('/kiosk')}
          >
            Voltar ao início
          </Button>
        )}
      </div>

      <aside className="hidden overflow-hidden rounded-[var(--radius-card)] bg-white shadow-xl lg:block">
        <div className="pad-tight text-center">
          <span className="t-hint inline-block rounded-full bg-brand-700 px-5 py-1.5 font-semibold text-white">
            Anúncio
          </span>
          <h2 className="t-lead mt-4 font-bold text-brand-800">
            Viaje com a Maylon e vá mais longe
          </h2>
          <p className="t-hint mt-2 text-muted">
            Conforto, segurança e pontualidade em cada corrida.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-brand-700 px-4 py-5 text-center text-white">
          <Perk label="Segurança em primeiro lugar" />
          <Perk label="Motoristas pontuais" />
          <Perk label="Melhor experiência" />
        </div>
      </aside>
    </div>
  );
}

async function triggerRefund(
  paymentId: string,
  setNote: (v: string) => void,
) {
  try {
    const res = await fetch(`/api/kiosk/payments/${paymentId}/refund`, {
      method: 'POST',
    });
    const { refunded, manual } = await res.json();
    if (refunded) {
      setNote('O valor foi estornado automaticamente.');
    } else if (manual) {
      // Cartão presencial exige estorno na adquirente. Não prometa
      // ao passageiro algo que o sistema não fez.
      setNote('Procure um atendente para o estorno do pagamento.');
    }
  } catch {
    setNote('Procure um atendente para o estorno do pagamento.');
  }
}

function Perk({ label }: { label: string }) {
  return <p className="t-hint px-1 leading-snug">{label}</p>;
}

/** Radar do protótipo: anéis que pulsam de dentro para fora. */
function Radar() {
  return (
    <div className="relative mx-auto flex h-[clamp(180px,34vmin,380px)] w-[clamp(180px,34vmin,380px)] items-center justify-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute h-full w-full rounded-full bg-brand-300/35 animate-pulse-ring"
          style={{ animationDelay: `${i * 0.7}s` }}
        />
      ))}
      <span className="relative flex h-[34%] w-[34%] items-center justify-center rounded-full bg-brand-700 text-white">
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor" aria-hidden="true">
          <path d="M5 16v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2a3 3 0 0 0-.7-1.9l-1.2-4A2 2 0 0 0 15.2 8H8.8a2 2 0 0 0-1.9 1.4l-1.2 4A3 3 0 0 0 5 16Zm3-1.5a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm8 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z" />
        </svg>
      </span>
    </div>
  );
}
