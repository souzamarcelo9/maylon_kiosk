import { NextResponse } from 'next/server';
import { refundPayment } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/**
 * Estorno quando nenhum motorista aceita.
 *
 * Repassado ao módulo. PIX resolve lá; cartão presencial exige estorno
 * na Getnet e volta `manual: true`, para a tela não prometer ao
 * passageiro algo que o sistema não fez.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reason =
    new URL(req.url).searchParams.get('reason') ?? 'Nenhum motorista disponível';

  const result = await refundPayment(id, reason);
  return NextResponse.json(result);
}
