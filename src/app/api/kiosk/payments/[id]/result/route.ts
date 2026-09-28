import { NextResponse } from 'next/server';
import { z } from 'zod';
import { submitTerminalResult } from '@/lib/payments';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['approved', 'declined', 'failed']),
  acquirerPayload: z.record(z.unknown()).optional(),
  acquirerNsu: z.string().optional(),
  acquirerAuthCode: z.string().optional(),
  terminalCode: z.string().optional(),
  declineReason: z.string().optional(),
});

/**
 * O Get Smart chama isto depois do retorno do deeplink App2App.
 *
 * Precisa ser idempotente: o terminal grava o resultado em disco e
 * insiste até receber 200. Se o cartão aprovou e esta chamada se
 * perdeu, o passageiro pagou e não tem corrida.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 422 });
  }

  try {
    // Repassa ao módulo, que grava o NSU, marca a corrida como paga e
    // libera `is_dispatch_blocked`. A idempotência é do backend: uma
    // segunda chamada devolve o estado atual em vez de reprocessar.
    const payment = await submitTerminalResult(id, {
      status: parsed.data.status,
      nsu: parsed.data.acquirerNsu,
      authorizationCode: parsed.data.acquirerAuthCode,
      terminalCode: parsed.data.terminalCode,
      acquirerPayload: parsed.data.acquirerPayload,
      declineReason: parsed.data.declineReason,
    });

    return NextResponse.json({ payment });
  } catch (err) {
    // O dinheiro pode já ter saído. O terminal DEVE insistir até um 200.
    console.error('[payments/result] falha ao capturar', { id, err });
    return NextResponse.json({ error: 'capture_failed' }, { status: 502 });
  }
}
