import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createQuote, LegacyApiError } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

const place = z.object({
  label: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  zoneId: z.string().optional(),
});

const schema = z.object({ origin: place, destination: place });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 422 });
  }

  try {
    const quote = await createQuote(parsed.data);
    return NextResponse.json({ quote });
  } catch (err) {
    console.error('[kiosk/quote]', err);
    if (err instanceof LegacyApiError && err.status === 422) {
      return NextResponse.json({ error: 'no_categories' }, { status: 422 });
    }
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
