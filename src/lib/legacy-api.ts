import { serverConfig } from './config';
import type { Quote, Trip, GuestPassenger, Place } from './types';

/**
 * Adaptador do backend PHP/MySQL existente.
 *
 * Toda a "tradução" entre o que o PHP devolve e os tipos do totem mora
 * AQUI. Nenhuma tela conhece o formato do legado. Quando o backend for
 * reescrito, você troca este arquivo e mais nada.
 *
 * >>> AJUSTE OS ENDPOINTS E O MAPEAMENTO conforme a sua API real. <<<
 */

class LegacyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'LegacyApiError';
  }
}

async function call<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 8000, ...rest } = init;

  if (!serverConfig.apiBase) {
    throw new LegacyApiError('MAYLON_API_BASE não configurado', 500);
  }

  // Totem em rede de shopping: sem timeout, a tela trava para sempre.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${serverConfig.apiBase}${path}`, {
      ...rest,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${serverConfig.apiToken}`,
        ...rest.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LegacyApiError(
        `PHP ${path} devolveu ${res.status}: ${body.slice(0, 300)}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LegacyApiError(`Timeout em ${path}`, 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Passageiro convidado ────────────────────────────────────────

export async function createGuest(input: {
  name: string;
  phone?: string;
  document?: string;
  kioskId: string;
}): Promise<GuestPassenger> {
  // AJUSTE: endpoint e nomes de campo do seu PHP.
  const raw = await call<{ id: string; guest_code: string }>(
    '/kiosk/guests',
    { method: 'POST', body: JSON.stringify(input) },
  );

  return {
    guestId: raw.guest_code,
    name: input.name,
    phone: input.phone,
    document: input.document,
  };
}

// ── Cotação ─────────────────────────────────────────────────────

export async function createQuote(input: {
  origin: Place;
  destination: Place;
  guestId: string;
}): Promise<Quote> {
  // AJUSTE: aponte para o MESMO endpoint que o app mobile consome.
  // É isso que garante que o preço do totem bate com o do aplicativo.
  const raw = await call<{
    quote_id: string;
    distance_km: number;
    duration_min: number;
    categories: Array<{
      id: string;
      name: string;
      price: number; // reais no legado
      eta_min?: number;
      image_url?: string;
      has_discount?: boolean;
    }>;
  }>('/rides/estimate', {
    method: 'POST',
    body: JSON.stringify({
      origin_lat: input.origin.lat,
      origin_lng: input.origin.lng,
      destination_lat: input.destination.lat,
      destination_lng: input.destination.lng,
      guest_code: input.guestId,
    }),
  });

  return {
    quoteId: raw.quote_id,
    origin: input.origin,
    destination: input.destination,
    distanceKm: raw.distance_km,
    durationMinutes: raw.duration_min,
    categories: raw.categories.map((c) => ({
      id: c.id,
      name: c.name,
      // O legado manda reais. Aqui vira centavos e nunca mais volta a float.
      priceCents: Math.round(c.price * 100),
      etaMinutes: c.eta_min,
      imageUrl: c.image_url,
      discount: c.has_discount,
    })),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

// ── Corrida ─────────────────────────────────────────────────────

export async function dispatchTrip(input: {
  quoteId: string;
  categoryId: string;
  guestId: string;
  paymentId: string;
  kioskId: string;
}): Promise<Trip> {
  const raw = await call<{ trip_code: string; status: string }>(
    '/rides',
    { method: 'POST', body: JSON.stringify(input) },
  );
  return getTrip(raw.trip_code);
}

export async function getTrip(code: string): Promise<Trip> {
  const raw = await call<{
    trip_code: string;
    status: string;
    price: number;
    origin_label: string;
    origin_lat: number;
    origin_lng: number;
    destination_label: string;
    destination_lat: number;
    destination_lng: number;
    eta_min?: number;
    driver?: {
      name: string;
      photo_url?: string;
      rating?: number;
      rating_count?: number;
      phone?: string;
    };
    vehicle?: {
      model: string;
      color: string;
      plate: string;
      image_url?: string;
    };
  }>(`/rides/${encodeURIComponent(code)}`);

  return {
    code: raw.trip_code,
    status: mapTripStatus(raw.status),
    amountCents: Math.round(raw.price * 100),
    origin: {
      label: raw.origin_label,
      lat: raw.origin_lat,
      lng: raw.origin_lng,
    },
    destination: {
      label: raw.destination_label,
      lat: raw.destination_lat,
      lng: raw.destination_lng,
    },
    etaMinutes: raw.eta_min,
    driver: raw.driver && {
      name: raw.driver.name,
      photoUrl: raw.driver.photo_url,
      rating: raw.driver.rating,
      ratingCount: raw.driver.rating_count,
      phone: raw.driver.phone,
    },
    vehicle: raw.vehicle && {
      model: raw.vehicle.model,
      color: raw.vehicle.color,
      plate: raw.vehicle.plate,
      imageUrl: raw.vehicle.image_url,
    },
  };
}

/** AJUSTE: mapeie os status que o seu PHP realmente usa. */
function mapTripStatus(legacy: string): Trip['status'] {
  const table: Record<string, Trip['status']> = {
    pending: 'searching',
    searching: 'searching',
    accepted: 'assigned',
    arriving: 'arriving',
    started: 'in_progress',
    finished: 'completed',
    canceled: 'cancelled',
    cancelled: 'cancelled',
    no_drivers: 'no_drivers',
  };
  return table[legacy] ?? 'searching';
}

export { LegacyApiError };
