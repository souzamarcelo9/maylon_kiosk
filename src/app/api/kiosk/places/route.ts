import { NextResponse } from 'next/server';
import { kioskConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Autocomplete de endereços.
 *
 * AJUSTE: ligue no MESMO provedor que o app mobile usa (Google Places,
 * HERE, o que for), com viés de localização no totem para priorizar
 * destinos próximos. Enquanto isso, devolve uma lista fixa para você
 * conseguir percorrer o fluxo inteiro.
 */
const MOCK = [
  { label: 'Novotel Santos Gonzaga - Av. Ana Costa, Santos - SP', lat: -23.9662, lng: -46.3336 },
  { label: 'Shopping Praiamar - Santos - SP', lat: -23.9527, lng: -46.3129 },
  { label: 'Aeroporto de Guarulhos (GRU) - Terminal 2', lat: -23.4356, lng: -46.4731 },
  { label: 'Rodoviária de Santos - Praça dos Andradas', lat: -23.9333, lng: -46.3283 },
  { label: 'Hospital Santa Casa de Santos', lat: -23.9414, lng: -46.3312 },
];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.toLowerCase().trim() ?? '';
  if (q.length < 3) return NextResponse.json({ places: [] });

  const places = MOCK.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 6);

  // Fallback: deixa a pessoa seguir com o que digitou, sem coordenada.
  if (places.length === 0) {
    return NextResponse.json({
      places: [{ label: q, lat: kioskConfig.origin.lat, lng: kioskConfig.origin.lng }],
    });
  }

  return NextResponse.json({ places });
}
