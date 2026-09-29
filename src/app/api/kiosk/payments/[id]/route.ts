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
  extraEstimatedFare: z.number().optional(),
  extraDiscountFare: z.number().optional(),
  extraDiscountAmount: z.number().optional(),
  extraReturnFee: z.number().optional(),
  extraCancellationFee: z.number().optional(),
  extraFareAmount: z.number().optional(),
  extraFareFee: z.number().optional(),
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
    const { payment } = await createCharge({ ...parsed.data, idempotencyKey });
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
