import { NextResponse } from 'next/server';
import { getTrip } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  try {
    const trip = await getTrip(code);
    return NextResponse.json({ trip });
  } catch (err) {
    console.error('[kiosk/trips/:code]', err);
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
