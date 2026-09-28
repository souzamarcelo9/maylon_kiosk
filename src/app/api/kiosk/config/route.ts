import { NextResponse } from 'next/server';
import { getKioskConfig } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

/**
 * Identidade do totem, vinda do banco.
 *
 * O tablet não guarda mais origem nem zona no .env: pede aqui ao
 * carregar. Mudar um totem de porta virou UPDATE, não reprovisionamento
 * de equipamento em campo.
 */
export async function GET() {
  try {
    return NextResponse.json({ config: await getKioskConfig() });
  } catch (err) {
    console.error('[kiosk/config]', err);
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
