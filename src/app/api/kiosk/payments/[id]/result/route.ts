import { NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmWithBackend, paymentStore } from '@/lib/payments';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['approved', 'declined', 'failed']),
  acquirerPayload: z.record(z.unknown()).optional(),
  acquirerNsu: z.string().optional(),
  acquirerAuthCode: z.string().optional(),
  declineReason: z.string().optional(),
});

/**
 * O Get Smart chama isto depois do retorno do deeplink App2App.
 *
 * Precisa ser idempotente: o terminal grava o resultado em disco e
 * insiste até receber 200. Se o cartão aprovou e esta chamada se
 * perdeu, o passageiro pagou e não tem corrida.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 422 });
  }

  const current = paymentStore.get(id);
  if (!current) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Já finalizado: devolve 200 com o estado atual em vez de reprocessar.
  if (['approved', 'declined', 'failed'].includes(current.status)) {
    return NextResponse.json({ payment: current, duplicate: true });
  }

  const payment = paymentStore.update(id, parsed.data)!;
  if (payment.status === 'approved') await confirmWithBackend(payment);

  return NextResponse.json({ payment });
}
