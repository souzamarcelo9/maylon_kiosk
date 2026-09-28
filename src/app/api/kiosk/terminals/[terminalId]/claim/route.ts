import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/**
 * Polling do Get Smart, a cada ~2s.
 *
 * 204 = nada a fazer. 200 = tem cobrança, dispare o deeplink
 * getnet://pagamento/v2/payment com o amountCents devolvido aqui.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ terminalId: string }> },
) {
  const { terminalId } = await params;
  const { searchParams } = new URL(req.url);
  const kioskId = searchParams.get('kioskId');

  if (!kioskId) {
    return NextResponse.json({ error: 'missing_kiosk_id' }, { status: 400 });
  }

  const payment = paymentStore.claimNext(terminalId, kioskId);
  if (!payment) return new NextResponse(null, { status: 204 });

  return NextResponse.json({ payment });
}
