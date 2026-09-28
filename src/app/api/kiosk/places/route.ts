import { NextResponse } from 'next/server';
import { getPlaceDetails, searchPlaces } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

/**
 * Busca de destino.
 *
 * Passa pelo módulo, que faz proxy do provedor. O totem não carrega
 * chave do Google nem Bearer de cliente.
 *
 * Fluxo em dois passos: o autocomplete devolve só place_id, e a
 * coordenada vem no details quando o passageiro escolhe.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get('placeId');
  const q = searchParams.get('q')?.trim() ?? '';

  try {
    if (placeId) {
      const place = await getPlaceDetails(placeId);
      return NextResponse.json({ place });
    }

    if (q.length < 3) return NextResponse.json({ places: [] });

    return NextResponse.json({ places: await searchPlaces(q) });
  } catch (err) {
    console.error('[kiosk/places]', err);
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
