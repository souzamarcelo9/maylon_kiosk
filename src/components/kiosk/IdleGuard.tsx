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
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/60 p-4 sm:p-10"
    >
      <div className="pad-card w-full max-w-xl rounded-[var(--radius-card)] bg-white text-center">
        <h2 className="t-title font-bold">Ainda está aí?</h2>
        <p className="t-body mt-3 text-muted">
          O pedido será cancelado em {seconds}s.
        </p>
        <Button className="mt-[3vmin]" onClick={keepAlive}>
          Continuar pedido
        </Button>
      </div>
    </div>
  );
}
