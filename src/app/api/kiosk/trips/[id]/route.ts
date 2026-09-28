import { NextResponse } from 'next/server';
import { getArrivalMinutes, getTrip } from '@/lib/legacy-api';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const trip = await getTrip(id);

    // A previsão de chegada é uma rota separada — o `estimated_time` do
    // detalhe é a duração da viagem, não o tempo até o carro chegar.
    // Só vale a pena consultar quando já existe motorista.
    // A confirmação de pagamento deixou de morar aqui: quem marca a
    // corrida como paga e libera o despacho é a captura no módulo.
    if (trip.status === 'assigned' || trip.status === 'arriving') {
      trip.etaMinutes = await getArrivalMinutes(id);
    }

    return NextResponse.json({ trip });
  } catch (err) {
    console.error('[kiosk/trips/:id]', err);
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
