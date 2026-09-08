import { NextResponse } from 'next/server';
import { getPlaceDetails, searchPlaces } from '@/lib/legacy-api';
import { kioskConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Autocomplete e resolução de endereço, via PHP.
 *
 * O backend já expõe place-api-autocomplete e place-api-details, então
 * o totem não precisa de chave do Google.
 *
 * Atenção ao fluxo em dois passos: o autocomplete devolve só place_id,
 * sem coordenada. A coordenada vem no details, quando o passageiro
 * escolhe — por isso o `?placeId=` neste mesmo endpoint.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get('placeId');
  const q = searchParams.get('q')?.trim() ?? '';

  try {
    if (placeId) {
      const place = await getPlaceDetails(placeId, kioskConfig.zoneId);
      return NextResponse.json({ place });
    }

    if (q.length < 3) return NextResponse.json({ places: [] });

    const places = await searchPlaces(q, kioskConfig.zoneId);
    return NextResponse.json({ places });
  } catch (err) {
    console.error('[kiosk/places]', err);
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
