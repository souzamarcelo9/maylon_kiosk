'use client';

import { usePathname } from 'next/navigation';
import { Backdrop } from './Backdrop';

/**
 * Telas 1 e 3 mostram a foto com força — é o que dá identidade ao totem.
 * As demais têm cartão branco grande por cima, então a foto recua para
 * não competir com a informação.
 */
const VIVID = ['/kiosk', '/kiosk/destino'];

export function BackdropSwitch() {
  const pathname = usePathname();
  const vivid = VIVID.includes(pathname);
  return <Backdrop intensity={vivid ? 'normal' : 'strong'} />;
}
