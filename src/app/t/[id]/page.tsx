import { getTrip } from '@/lib/legacy-api';
import { formatBRL } from '@/lib/money';

export const dynamic = 'force-dynamic';

/**
 * Acompanhamento no celular do passageiro. É o destino do QR Code da
 * tela 8 e do link enviado por SMS/WhatsApp.
 *
 * Fica FORA de /kiosk de propósito: layout de celular, sem reset por
 * inatividade, sem trava de quiosque.
 */
export default async function TrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trip;
  try {
    trip = await getTrip(id);
  } catch {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold">Corrida não encontrada</h1>
        <p className="mt-3 text-muted">Confira o código informado.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <header>
        <p className="text-sm uppercase tracking-widest text-muted">Maylon</p>
        <h1 className="mt-1 text-3xl font-bold">Sua corrida está a caminho</h1>
        <p className="mt-2 text-muted">Código {trip.code}</p>
      </header>

      {trip.driver && (
        <section className="rounded-2xl border border-line p-5">
          <p className="text-xl font-semibold">{trip.driver.name}</p>
          {trip.vehicle && (
            <p className="mt-1 text-muted">
              {trip.vehicle.model} · {trip.vehicle.color} · {trip.vehicle.plate}
            </p>
          )}
          {trip.etaMinutes != null && (
            <p className="mt-3 text-2xl font-bold text-brand-700">
              Chega em {trip.etaMinutes} min
            </p>
          )}
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-line p-5">
        <p>
          <strong>Destino</strong>
          <br />
          {trip.destination.label}
        </p>
        <p>
          <strong>Valor</strong>
          <br />
          {formatBRL(trip.amountCents)}
        </p>
      </section>
    </main>
  );
}
