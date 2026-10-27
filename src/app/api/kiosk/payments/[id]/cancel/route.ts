import { NextResponse } from 'next/server';
import { cancelPayment } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await cancelPayment(id);
    return NextResponse.json({ cancelled: true });
  } catch (err) {
    console.error('[payments/cancel]', err);
    return NextResponse.json({ cancelled: false }, { status: 502 });
  }
}