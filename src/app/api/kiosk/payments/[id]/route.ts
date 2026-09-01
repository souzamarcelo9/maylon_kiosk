import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/** Polling do tablet. Fica de olho até virar approved/declined. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payment = paymentStore.get(id);
  if (!payment) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ payment });
}
