import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dispatchTrip } from '@/lib/legacy-api';
import { paymentStore } from '@/lib/payments';

export const dynamic = 'force-dynamic';

const schema = z.object({
  quoteId: z.string().min(1),
  categoryId: z.string().min(1),
  guestId: z.string().min(1),
  paymentId: z.string().min(1),
  kioskId: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 422 });
  }

  // O despacho é decidido AQUI pelo estado da cobrança no servidor,
  // nunca por um "aprovado" que o navegador afirma ter recebido.
  const payment = paymentStore.get(parsed.data.paymentId);
  if (!payment || payment.status !== 'approved') {
    return NextResponse.json({ error: 'payment_not_approved' }, { status: 402 });
  }

  try {
    const trip = await dispatchTrip(parsed.data);
    return NextResponse.json({ trip });
  } catch (err) {
    console.error('[kiosk/trips]', err);
    // Pagou e não despachou. Registre para estorno manual.
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 502 });
  }
}
