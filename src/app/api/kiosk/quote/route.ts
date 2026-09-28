import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createQuote, LegacyApiError } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  destination: z.object({
    label: z.string().min(1),
    lat: z.number(),
    lng: z.number(),
    placeId: z.string().optional(),
  }),
});

/**
 * Estimativa.
 *
 * A ORIGEM NÃO É ENVIADA. O módulo usa a do cadastro do totem. Além de
 * evitar erro de GPS dentro de prédio, fecha a porta para manipular
 * tarifa mandando uma origem distante.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 422 });
  }

  try {
    const quote = await createQuote(parsed.data);
    return NextResponse.json({ quote });
  } catch (err) {
    console.error('[kiosk/quote]', err);
    if (err instanceof LegacyApiError) {
      // Destino fora da área atendida. É o erro mais comum do totem,
      // porque o autocomplete devolve o país inteiro: digitar "Júlio"
      // em Cubatão traz cidade do Rio Grande do Sul como primeira
      // opção, e a pessoa clica.
      if (err.code === 'zone_404' || err.status === 403) {
        return NextResponse.json({ error: 'out_of_area' }, { status: 422 });
      }
      if (err.status === 422) {
        return NextResponse.json({ error: 'no_categories' }, { status: 422 });
      }
    }
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
