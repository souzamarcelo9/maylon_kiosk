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
  params: Promise<{ id: string }>;
}) {
  const { id: tripId } = use(params);
  const router = useRouter();
  const { reset } = useKioskSession();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [qr, setQr] = useState<string>('');

  const trackingUrl = `${kioskConfig.trackingBase}/${tripId}`;

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/kiosk/trips/${tripId}`);
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
  }, [tripId]);

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
    <div className="flex h-screen-safe flex-col">
      <header className="flex shrink-0 items-center justify-center gap-4 bg-brand-700 px-4 py-3 text-white sm:px-8 sm:py-5">
        <MaylonMark
          className="h-[clamp(28px,4.5vmin,48px)] w-auto [--logo-knockout:#1e6450]"
        />
        <h1 className="t-title font-bold">Detalhes da corrida</h1>
      </header>

      <div className="flex flex-1 items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-8">
        <Card className="w-full max-w-4xl overflow-hidden">
          <div className="flex items-center gap-4 bg-brand-800 px-5 py-4 text-white sm:px-8 sm:py-6">
            <CheckIcon />
            <div>
              <p className="t-lead font-bold">Corrida confirmada!</p>
              <p className="t-hint mt-0.5 text-white/85">
                Código {trip?.code ?? '…'} — mostre ao motorista
              </p>
            </div>
          </div>

          <div className="pad-tight space-y-4"><div className="space-y-4">
            <div className="flex items-center gap-4 sm:gap-6">
              {trip?.driver?.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={trip.driver.photoUrl}
                  alt=""
                  className="h-[clamp(64px,12vmin,128px)] w-[clamp(64px,12vmin,128px)] shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="h-[clamp(64px,12vmin,128px)] w-[clamp(64px,12vmin,128px)] shrink-0 rounded-full bg-brand-100" />
              )}
              <div className="flex-1">
                <p className="t-lead font-bold">
                  {trip?.driver?.name ?? 'Confirmando motorista…'}
                </p>
                {trip?.driver?.rating != null && (
                  <p className="t-hint mt-1 text-muted">
                    ★ {trip.driver.rating.toLocaleString('pt-BR')}{' '}
                    {trip.driver.ratingCount != null &&
                      `(${trip.driver.ratingCount} avaliações)`}
                  </p>
                )}
              </div>
              {trip?.etaMinutes != null && (
                <div className="shrink-0 rounded-2xl bg-brand-50 px-4 py-3 text-center sm:px-6"><div>
                  <p className="t-hint text-muted">Chega em</p>
                  <p className="t-lead font-bold text-brand-700">
                    {trip.etaMinutes} min
                  </p>
                </div></div>
              )}
            </div>

            {trip?.vehicle && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <div>
                  <p className="t-lead font-semibold">{trip.vehicle.model}</p>
                  <p className="t-hint mt-0.5 text-muted">{trip.vehicle.color}</p>
                </div>
                <span className="t-lead rounded-xl border-4 border-brand-800 bg-white px-4 py-2 font-mono font-bold tracking-widest sm:px-6 sm:py-3">
                  {trip.vehicle.plate}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 items-center gap-4 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:gap-8">
              <div className="space-y-3">
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
                  <img
                    src={qr}
                    alt="QR Code para acompanhar a corrida"
                    className="mx-auto h-auto w-[clamp(120px,18vmin,240px)]"
                  />
                )}
                <p className="t-hint mx-auto mt-2 max-w-[240px] leading-snug text-muted">
                  Aponte a câmera para acompanhar no seu celular
                </p>
              </div>
            </div>

            <Button variant="outline" onClick={() => router.replace('/kiosk')}>
              Concluir
            </Button>
          </div></div>
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
      <p className="t-hint font-semibold text-brand-700">{label}</p>
      <p className={emphasis ? 't-lead font-bold' : 't-label mt-0.5'}>{value}</p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[clamp(36px,6vmin,64px)] w-[clamp(36px,6vmin,64px)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="m7.5 12.5 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
