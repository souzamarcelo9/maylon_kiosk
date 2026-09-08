import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { GuestPassenger } from '@/lib/types';
import { serverConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(20).optional(),
  document: z.string().trim().min(11).max(14).optional(),
  kioskId: z.string().min(1),
});

/**
 * Passageiro convidado.
 *
 * O backend Maylon NÃO tem cadastro de convidado — confirmado. As rotas
 * /api/customer/ride/* exigem um customer autenticado.
 *
 * Solução provisória: as corridas do totem saem na conta de totem
 * configurada em MAYLON_API_TOKEN, e o nome do passageiro real vai em
 * `sender_name` / `sender_phone` na criação da corrida. O identificador
 * GUEST-... é local, serve para rastrear no log do totem e para vincular
 * depois, quando o convidado existir de verdade no PHP.
 *
 * Nada disto vai para o banco do Maylon como usuário. É deliberado:
 * criar customer de verdade a cada passageiro polui a base e ainda
 * precisaria de rota nova no backend.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, phone, document } = parsed.data;
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');

  const guest: GuestPassenger = {
    guestId: `GUEST-${stamp}-${seq}`,
    name,
    phone,
    document,
    customerId: serverConfig.kioskCustomerId || undefined,
  };

  return NextResponse.json({ guest });
}
