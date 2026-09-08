import { NextResponse } from 'next/server';
import { readPayment } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/**
 * Polling do tablet.
 *
 * Para PIX, consulta o /api/v1/pix/status no backend a cada chamada. O
 * navegador nunca declara que pagou — quem decide é o servidor.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payment = await readPayment(id);
  if (!payment) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ payment });
}
