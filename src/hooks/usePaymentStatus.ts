'use client';

import { useEffect, useState } from 'react';
import type { Payment } from '@/lib/types';

/**
 * Polling do estado da cobrança.
 *
 * Polling e não websocket, de propósito: rede de shopping cai o tempo
 * todo, e reconectar socket em quiosque desassistido dá mais problema
 * do que resolve. Uma requisição a cada 1,5s é barata.
 */
export function usePaymentStatus(paymentId?: string) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    if (!paymentId) return;
    let alive = true;
    let failures = 0;

    async function poll() {
      try {
        const res = await fetch(`/api/kiosk/payments/${paymentId}`);
        if (!res.ok) throw new Error(String(res.status));
        const { payment: p } = await res.json();
        if (!alive) return;
        failures = 0;
        setUnreachable(false);
        setPayment(p);
      } catch {
        failures += 1;
        // Um piscar de rede não deve assustar o passageiro.
        if (alive && failures >= 4) setUnreachable(true);
      }
    }

    poll();
    const id = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [paymentId]);

  return { payment, unreachable };
}
