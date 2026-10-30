import { NextResponse } from 'next/server';
import { serverConfig } from '@/lib/server-config';

export const dynamic = 'force-dynamic';

/**
 * Dados de acompanhamento para a página pública /t/{id}.
 *
 * O proxy existe porque a página é aberta por link, sem login, no
 * celular do passageiro. O token do totem não pode sair do servidor.
 *
 * Chamada direta em vez de passar pelo legacy-api porque esta rota é
 * consumida por uma página pública, com cache desligado e sem as
 * tentativas de reconexão do fluxo do totem.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const res = await fetch(
      `${serverConfig.apiBase}/api/kiosk/trips/${encodeURIComponent(id)}/tracking`,
      {
        headers: {
          Accept: 'application/json',
          'X-Kiosk-Token': serverConfig.kioskToken,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const body = await res.json();
    return NextResponse.json({ trip: body.data });
  } catch (err) {
    console.error('[tracking]', err);
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
