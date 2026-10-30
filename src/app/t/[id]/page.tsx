import { TrackingView } from './TrackingView';

export const dynamic = 'force-dynamic';

/**
 * Acompanhamento da corrida, no celular do passageiro.
 *
 * Aberta pelo QR Code do totem ou pelo link do SMS. Fica fora de
 * /kiosk de propósito: layout de celular, sem reset por inatividade e
 * sem trava de quiosque.
 */
export default async function TrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TrackingView tripId={id} />;
}
