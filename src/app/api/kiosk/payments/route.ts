import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createCharge } from '@/lib/payments';
import { LegacyApiError } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

const place = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  zoneId: z.string().optional(),
});

const category = z.object({
  id: z.string().min(1),
  name: z.string(),
  categoryType: z.string().optional(),
  imageUrl: z.string().optional(),
  priceCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  etaMinutes: z.number().optional(),
  discount: z.boolean().optional(),
  zoneId: z.string().min(1),
  areaId: z.string().optional(),
  encodedPolyline: z.string().optional(),
  estimatedDistanceKm: z.number(),
  estimatedDurationMin: z.number(),
  surgeMultiplier: z.number().optional(),
  couponApplicable: z.boolean().optional(),
  rawEstimatedFare: z.number(),
  rawDiscountFare: z.number(),
});

const schema = z.object({
  kioskId: z.string().min(1),
  quoteId: z.string().min(1),
  category,
  origin: place,
  destination: place,
  method: z.enum(['credit', 'debit', 'pix', 'cash', 'maylon_pass']),
  passengerName: z.string().min(2),
  passengerPhone: z.string().optional(),
  passengerDocument: z.string().optional(),
});

/**
 * Abre a cobrança — e, por exigência do backend, cria a corrida antes.
 *
 * O corpo carrega a categoria inteira porque o /ride/create precisa de
 * zone_id, area_id, polyline e os valores da estimativa de volta. Tudo
 * é revalidado aqui: o preço que vale é o que veio na cotação, nunca um
 * número que o navegador tenha inventado.
 */
export async function POST(req: Request) {
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'missing_idempotency_key' }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const result = await createCharge({ ...parsed.data, idempotencyKey });

    if ('conflict' in result) {
      return NextResponse.json(
        { error: 'kiosk_busy', payment: result.conflict },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { payment: result.payment },
      { status: result.reused ? 200 : 201 },
    );
  } catch (err) {
    console.error('[kiosk/payments]', err);
    const status = err instanceof LegacyApiError ? 502 : 500;
    return NextResponse.json({ error: 'charge_failed' }, { status });
  }
}
