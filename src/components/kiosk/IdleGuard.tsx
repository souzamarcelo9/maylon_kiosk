'use client';

import { useIdleReset } from '@/hooks/useIdleReset';
import { Button } from './Button';

/** Aviso antes do reset automático. Montado no layout do /kiosk. */
export function IdleGuard() {
  const { warningLeftMs, keepAlive } = useIdleReset();
  if (warningLeftMs === null) return null;

  const seconds = Math.ceil(warningLeftMs / 1000);

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/60 p-10"
    >
      <div className="w-full max-w-xl rounded-[var(--radius-card)] bg-white p-12 text-center">
        <h2 className="text-4xl font-bold">Ainda está aí?</h2>
        <p className="mt-4 text-2xl text-muted">
          O pedido será cancelado em {seconds}s.
        </p>
        <Button className="mt-10" onClick={keepAlive}>
          Continuar pedido
        </Button>
      </div>
    </div>
  );
}
