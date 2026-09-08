'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { GuestPassenger, Place, Quote, VehicleCategory } from '@/lib/types';

/**
 * Estado da sessão do passageiro.
 *
 * Vive em sessionStorage para sobreviver a um F5 acidental, mas é
 * apagado por completo no reset. Nenhum dado de um passageiro pode
 * vazar para o próximo — é a regra mais importante do totem.
 */
interface KioskSession {
  guest?: GuestPassenger;
  origin?: Place;
  destination?: Place;
  quote?: Quote;
  category?: VehicleCategory;
  paymentId?: string;
  /** Id da corrida no backend. Criada junto com a cobrança. */
  tripId?: string;
  tripCode?: string;
}

interface KioskSessionValue {
  session: KioskSession;
  /**
   * false até o sessionStorage ser lido.
   *
   * Sem isto, o guard de cada tela ("não tem passageiro? volta pro
   * início") roda no primeiro render, quando a sessão ainda está vazia,
   * e expulsa quem só deu um F5 no meio do pedido.
   */
  hydrated: boolean;
  patch: (partial: Partial<KioskSession>) => void;
  reset: () => void;
}

const STORAGE_KEY = 'maylon.kiosk.session';
const Ctx = createContext<KioskSessionValue | null>(null);

export function KioskSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<KioskSession>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {
      // Storage indisponível ou corrompido: começa limpo. Sem drama.
    } finally {
      setHydrated(true);
    }
  }, []);

  const patch = useCallback((partial: Partial<KioskSession>) => {
    setSession((prev) => {
      const next = { ...prev, ...partial };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    setSession({});
    router.push('/kiosk');
  }, [router]);

  return (
    <Ctx.Provider value={{ session, hydrated, patch, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useKioskSession() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useKioskSession precisa estar dentro de KioskSessionProvider');
  }
  return ctx;
}
