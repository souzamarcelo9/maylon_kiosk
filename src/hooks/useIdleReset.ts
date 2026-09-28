'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from '@/lib/config';
import { useKioskSession } from '@/contexts/KioskSessionContext';

/**
 * Alguém começa a pedir uma corrida, desiste e vai embora. Se o totem
 * ficar parado na tela de destino com o nome da pessoa, o próximo
 * usuário vê os dados dela. Isso não é aceitável.
 *
 * Depois de IDLE_TIMEOUT_MS sem toque, avisa e volta para o início.
 * A tela inicial e a de corrida confirmada nunca resetam.
 */
export function useIdleReset() {
  const pathname = usePathname();
  const { reset } = useKioskSession();
  const [warningLeftMs, setWarningLeftMs] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());

  const exempt =
    pathname === '/kiosk' || pathname.startsWith('/kiosk/corrida');

  useEffect(() => {
    if (exempt) {
      setWarningLeftMs(null);
      return;
    }

    const bump = () => {
      lastActivity.current = Date.now();
      setWarningLeftMs(null);
    };

    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_TIMEOUT_MS) {
        reset();
      } else if (idle >= IDLE_TIMEOUT_MS - IDLE_WARNING_MS) {
        setWarningLeftMs(IDLE_TIMEOUT_MS - idle);
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(tick);
    };
  }, [exempt, reset]);

  const keepAlive = () => {
    lastActivity.current = Date.now();
    setWarningLeftMs(null);
  };

  return { warningLeftMs, keepAlive };
}
