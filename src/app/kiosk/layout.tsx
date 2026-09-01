import type { ReactNode } from 'react';
import { KioskSessionProvider } from '@/contexts/KioskSessionContext';
import { Backdrop } from '@/components/kiosk/Backdrop';
import { IdleGuard } from '@/components/kiosk/IdleGuard';
import { BackdropSwitch } from '@/components/kiosk/BackdropSwitch';

export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <KioskSessionProvider>
      <BackdropSwitch />
      <IdleGuard />
      <main className="relative flex min-h-screen flex-col">{children}</main>
    </KioskSessionProvider>
  );
}
