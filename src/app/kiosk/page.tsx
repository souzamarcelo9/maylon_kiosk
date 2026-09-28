'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Logo } from '@/components/kiosk/Logo';
import { kioskConfig } from '@/lib/config';
import { useKioskSession } from '@/contexts/KioskSessionContext';

/** Tela 1 — atrair o toque. É a única tela que fica horas ligada. */
export default function KioskHome() {
  const { hydrated } = useKioskSession();

  // Chegou aqui = sessão anterior acabou. Limpa antes do próximo passageiro.
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.removeItem('maylon.kiosk.session');
    } catch {}
  }, [hydrated]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[3vmin] px-6 py-8 text-center">
      <Logo className="h-[clamp(56px,11vmin,120px)] w-auto" priority />

      <h1 className="t-display max-w-3xl font-bold text-brand-900">
        Táxi na porta, sem instalar aplicativo.
      </h1>
      <p className="t-lead text-brand-800">{kioskConfig.label}</p>

      <Link
        href="/kiosk/dados"
        className="group relative flex aspect-[7/3] w-[min(88vw,560px)] max-h-[26vh] items-center justify-center rounded-full bg-brand-700 text-white shadow-[0_30px_70px_-25px_rgba(7,61,59,0.7)] transition active:scale-[0.98]"
      >
        <span className="absolute inset-0 rounded-full bg-brand-600 animate-pulse-ring" />
        <span className="relative flex items-center gap-[2vmin]">
          <TapHand />
          <span className="t-title font-bold">Iniciar viagem</span>
        </span>
      </Link>

      <p className="t-body font-medium text-brand-800">
        Toque na tela para começar
      </p>
    </div>
  );
}

/** A mão que pisca, pedida no protótipo. */
function TapHand() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-[clamp(32px,6vmin,72px)] w-[clamp(32px,6vmin,72px)] animate-tap-hand"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 24V10a3 3 0 1 1 6 0v11" />
      <path d="M26 21v-3a3 3 0 1 1 6 0v3" />
      <path d="M32 21v-1a3 3 0 1 1 6 0v12a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10v-8a3 3 0 1 1 6 0" />
    </svg>
  );
}
