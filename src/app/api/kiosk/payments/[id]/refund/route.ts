import { NextResponse } from 'next/server';
import { refundPayment } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/**
 * Estorno quando nenhum motorista aceita.
 *
 * Chamado pela tela 7 ao detectar `failed` ou `cancelled`. Para PIX
 * resolve sozinho pelo /api/v1/pix/refund. Cartão no Get Smart precisa
 * de estorno na Getnet e devolve `manual: true`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reason =
    new URL(req.url).searchParams.get('reason') ?? 'Nenhum motorista disponível';

  const done = await refundPayment(id, reason);
  return NextResponse.json({ refunded: done, manual: !done });
}
