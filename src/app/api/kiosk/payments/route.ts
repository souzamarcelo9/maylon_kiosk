import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createCharge } from '@/lib/payments';

export const dynamic = 'force-dynamic';

const schema = z.object({
  kioskId: z.string().min(1),
  tripDraftId: z.string().min(1),
  amountCents: z.number().int().positive(),
  method: z.enum(['credit', 'debit', 'pix', 'cash', 'maylon_pass']),
});

export async function POST(req: Request) {
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    // Sem chave, um retry de rede vira cobrança dupla. Recusa e pronto.
    return NextResponse.json(
      { error: 'missing_idempotency_key' },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 422 });
  }

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
}
