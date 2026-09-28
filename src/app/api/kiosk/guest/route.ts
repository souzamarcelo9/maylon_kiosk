import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createGuest, LegacyApiError } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(20).optional(),
  document: z.string().trim().min(11).max(14).optional(),
});

/**
 * Passageiro convidado.
 *
 * Agora é o módulo KioskManagement que cria, na tabela `kiosk_guests`.
 * Não entra em `users`: criar customer de verdade por passageiro de
 * totem poluiria a base e distorceria as métricas de cadastro.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const guest = await createGuest(parsed.data);
    return NextResponse.json({ guest });
  } catch (err) {
    console.error('[kiosk/guest]', err);
    const status = err instanceof LegacyApiError ? err.status : 500;
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: status === 422 ? 422 : 502 });
  }
}
