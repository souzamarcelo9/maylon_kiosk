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
    <div className="flex flex-1 flex-col items-center justify-center px-12 text-center">
      <Logo height={120} priority />

      <h1 className="mt-16 max-w-3xl text-6xl font-bold leading-tight text-brand-900">
        Táxi na porta, sem instalar aplicativo.
      </h1>
      <p className="mt-6 text-3xl text-brand-800">{kioskConfig.label}</p>

      <Link
        href="/kiosk/dados"
        className="group relative mt-20 flex h-[240px] w-[560px] items-center justify-center rounded-full bg-brand-700 text-white shadow-[0_30px_70px_-25px_rgba(7,61,59,0.7)] transition active:scale-[0.98]"
      >
        <span className="absolute inset-0 rounded-full bg-brand-600 animate-pulse-ring" />
        <span className="relative flex items-center gap-6">
          <TapHand />
          <span className="text-5xl font-bold">Iniciar viagem</span>
        </span>
      </Link>

      <p className="mt-14 text-2xl font-medium text-brand-800">
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
      className="h-24 w-24 animate-tap-hand"
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
