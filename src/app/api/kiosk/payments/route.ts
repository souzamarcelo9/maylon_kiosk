import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createCharge, type CreateChargeInput } from '@/lib/payments';
import { LegacyApiError } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

/**
 * nullish, não optional.
 *
 * `.optional()` aceita `undefined` mas recusa `null`, e o backend
 * devolve nulo em campo ausente — `area_id`, por exemplo. Com
 * `.optional()` puro o pagamento era recusado por validação antes de
 * qualquer coisa acontecer.
 */
const place = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().nullish(),
  zoneId: z.string().nullish(),
});

const category = z.object({
  id: z.string().min(1),
  name: z.string(),
  categoryType: z.string().nullish(),
  imageUrl: z.string().nullish(),
  priceCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  etaMinutes: z.number().nullish(),
  discount: z.boolean().nullish(),
  zoneId: z.string().min(1),
  areaId: z.string().nullish(),
  encodedPolyline: z.string().nullish(),
  estimatedDistanceKm: z.number(),
  estimatedDurationMin: z.number(),
  surgeMultiplier: z.number().nullish(),
  couponApplicable: z.boolean().nullish(),
  rawEstimatedFare: z.number(),
  rawDiscountFare: z.number(),
  extraEstimatedFare: z.number().nullish(),
  extraDiscountFare: z.number().nullish(),
  extraDiscountAmount: z.number().nullish(),
  extraReturnFee: z.number().nullish(),
  extraCancellationFee: z.number().nullish(),
  extraFareAmount: z.number().nullish(),
  extraFareFee: z.number().nullish(),
});

const schema = z.object({
  kioskId: z.string().min(1),
  quoteId: z.string().min(1),
  guestId: z.string().min(1),
  category,
  destination: place,
  method: z.enum(['credit', 'debit', 'pix', 'cash', 'maylon_pass']),
});

/**
 * Cria a corrida e abre a cobrança.
 *
 * O preço enviado NÃO cobra nada: o módulo lê o valor da corrida no
 * banco e usa o `expected_amount` só para conferir. Divergiu, recusa.
 *
 * A corrida nasce com `is_dispatch_blocked = true`, então existir antes
 * do pagamento não aciona motorista nenhum.
 */
export async function POST(req: Request) {
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'missing_idempotency_key' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    // Loga no servidor: a falha de validação acontece antes do try, e
    // sem isto o 422 chega na tela sem nenhuma pista no terminal.
    console.error('[kiosk/payments] validação falhou', {
      issues: parsed.error.flatten().fieldErrors,
      received: body,
    });

    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    // Normaliza null → undefined. O Zod aceita os dois para ser
    // tolerante com o backend, mas os tipos internos usam undefined.
    const clean = <T extends Record<string, unknown>>(obj: T): T =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, v === null ? undefined : v]),
      ) as T;

    const { payment } = await createCharge({
      ...parsed.data,
      category: clean(parsed.data.category) as CreateChargeInput['category'],
      destination: clean(parsed.data.destination) as CreateChargeInput['destination'],
      idempotencyKey,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    console.error('[kiosk/payments]', err);

    // 409 do módulo = já existe pedido em andamento neste totem. A trava
    // agora é do banco, não de memória: sobrevive a restart do Next.
    if (err instanceof LegacyApiError && err.status === 409) {
      return NextResponse.json({ error: 'kiosk_busy' }, { status: 409 });
    }
    if (err instanceof LegacyApiError && err.status === 422) {
      return NextResponse.json({ error: 'amount_mismatch' }, { status: 422 });
    }
    return NextResponse.json({ error: 'charge_failed' }, { status: 502 });
  }
}
