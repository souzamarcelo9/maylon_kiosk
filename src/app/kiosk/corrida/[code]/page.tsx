'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { Card } from '@/components/kiosk/Card';
import { MaylonMark } from '@/components/kiosk/Logo';
import { Button } from '@/components/kiosk/Button';
import { useKioskSession } from '@/contexts/KioskSessionContext';
import { formatBRL } from '@/lib/money';
import { kioskConfig } from '@/lib/config';
import type { Trip } from '@/lib/types';

/** Tela 8 — motorista encontrado. Última tela antes do totem liberar. */
export default function CorridaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const { reset } = useKioskSession();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [qr, setQr] = useState<string>('');

  const trackingUrl = `${kioskConfig.trackingBase}/${code}`;

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/kiosk/trips/${code}`);
        if (!res.ok) return;
        const { trip: t } = await res.json();
        if (alive) setTrip(t);
      } catch {}
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [code]);

  // O passageiro leva o acompanhamento no celular dele.
  useEffect(() => {
    QRCode.toDataURL(trackingUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#0b5e5a', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => {});
  }, [trackingUrl]);

  // Libera o totem sozinho: ninguém se lembra de tocar em "concluir".
  useEffect(() => {
    const id = setTimeout(() => reset(), 60_000);
    return () => clearTimeout(id);
  }, [reset]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-center gap-5 bg-brand-700 px-10 py-7 text-white">
        <MaylonMark
          className="h-12 w-auto [--logo-knockout:#1e6450]"
        />
        <h1 className="text-4xl font-bold">Detalhes da corrida</h1>
      </header>

      <div className="flex flex-1 items-center justify-center p-10">
        <Card className="w-full max-w-4xl overflow-hidden">
          <div className="flex items-center gap-6 bg-brand-800 px-10 py-8 text-white">
            <CheckIcon />
            <div>
              <p className="text-3xl font-bold">Corrida confirmada!</p>
              <p className="mt-1 text-xl text-white/80">
                Código {code} — mostre ao motorista
              </p>
            </div>
          </div>

          <div className="space-y-8 p-10">
            <div className="flex items-center gap-8">
              {trip?.driver?.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={trip.driver.photoUrl}
                  alt=""
                  className="h-32 w-32 rounded-full object-cover"
                />
              ) : (
                <div className="h-32 w-32 rounded-full bg-brand-100" />
              )}
              <div className="flex-1">
                <p className="text-4xl font-bold">
                  {trip?.driver?.name ?? 'Confirmando motorista…'}
                </p>
                {trip?.driver?.rating != null && (
                  <p className="mt-2 text-2xl text-muted">
                    ★ {trip.driver.rating.toLocaleString('pt-BR')}{' '}
                    {trip.driver.ratingCount != null &&
                      `(${trip.driver.ratingCount} avaliações)`}
                  </p>
                )}
              </div>
              {trip?.etaMinutes != null && (
                <div className="rounded-2xl bg-brand-50 px-8 py-6 text-center">
                  <p className="text-lg text-muted">Chega em</p>
                  <p className="text-4xl font-bold text-brand-700">
                    {trip.etaMinutes} min
                  </p>
                </div>
              )}
            </div>

            {trip?.vehicle && (
              <div className="flex items-center justify-between border-t border-line pt-8">
                <div>
                  <p className="text-3xl font-semibold">{trip.vehicle.model}</p>
                  <p className="mt-1 text-2xl text-muted">{trip.vehicle.color}</p>
                </div>
                <span className="rounded-xl border-4 border-brand-800 bg-white px-8 py-4 font-mono text-4xl font-bold tracking-widest">
                  {trip.vehicle.plate}
                </span>
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto] items-center gap-10 border-t border-line pt-8">
              <div className="space-y-5">
                <Row label="Origem" value={trip?.origin.label ?? kioskConfig.label} />
                <Row label="Destino" value={trip?.destination.label ?? '—'} />
                <Row
                  label="Valor da corrida"
                  value={trip ? formatBRL(trip.amountCents) : '—'}
                  emphasis
                />
              </div>

              <div className="text-center">
                {qr && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={qr} alt="QR Code para acompanhar a corrida" className="mx-auto" />
                )}
                <p className="mt-3 max-w-[240px] text-lg leading-snug text-muted">
                  Aponte a câmera para acompanhar no seu celular
                </p>
              </div>
            </div>

            <Button variant="outline" onClick={() => router.replace('/kiosk')}>
              Concluir
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-xl font-semibold text-brand-700">{label}</p>
      <p className={emphasis ? 'text-4xl font-bold' : 'mt-1 text-2xl'}>{value}</p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-16 w-16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="m7.5 12.5 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
