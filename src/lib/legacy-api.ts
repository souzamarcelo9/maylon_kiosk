import { serverConfig } from './config';
import type {
  Driver,
  Place,
  Quote,
  Trip,
  TripStatus,
  Vehicle,
  VehicleCategory,
} from './types';

/**
 * Adaptador do backend Maylon (Laravel/PHP + MySQL).
 *
 * Toda a tradução entre o formato do backend e os tipos do totem mora
 * aqui. Nenhuma tela conhece `vehicle_category_id`, `zone_id` ou
 * `pickup_coordinates`. Quando o backend mudar, muda só este arquivo.
 *
 * Base: https://auth.maylon.com.br
 * Auth: Bearer token + header `zoneId` + header `X-Localization`
 */

export class LegacyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'LegacyApiError';
  }
}

// ── Cliente HTTP ────────────────────────────────────────────────

interface CallOptions extends RequestInit {
  timeoutMs?: number;
  /** O backend exige este header em várias rotas de corrida. */
  zoneId?: string;
  /** Rotas /api/v1/pix/* não usam Bearer no app mobile. */
  skipAuth?: boolean;
}

async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const { timeoutMs = 12_000, zoneId, skipAuth, ...init } = options;

  if (!serverConfig.apiBase) {
    throw new LegacyApiError('MAYLON_API_BASE não configurado', 500);
  }

  // Totem em rede de shopping: sem timeout a tela trava para sempre.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    Accept: 'application/json',
    'X-Localization': 'pt',
    ...(init.headers as Record<string, string>),
  };
  if (zoneId) headers.zoneId = zoneId;
  if (!skipAuth && serverConfig.apiToken) {
    headers.Authorization = `Bearer ${serverConfig.apiToken}`;
  }

  try {
    const res = await fetch(`${serverConfig.apiBase}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    if (!res.ok) {
      throw new LegacyApiError(
        `${path} devolveu ${res.status}: ${text.slice(0, 400)}`,
        res.status,
        body,
      );
    }
    return body as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LegacyApiError(`Timeout em ${path}`, 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** O backend manda reais como número ou string. Vira centavos e fica. */
function toCents(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

/** O /ride/create espera coordenada como STRING "[lat,lng]", não array. */
function coord(lat: number, lng: number): string {
  return `[${lat},${lng}]`;
}

// ── Zona ────────────────────────────────────────────────────────

/**
 * GET /api/customer/config/get-zone-id
 *
 * A zona é obrigatória para estimar e criar corrida, e vai também no
 * header `zoneId`. Num totem a origem é fixa, então isso é resolvido
 * uma vez e cacheado — não faz sentido consultar a cada passageiro.
 */
let zoneCache: { key: string; zoneId: string; at: number } | null = null;
const ZONE_TTL_MS = 6 * 60 * 60_000;

export async function getZoneId(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (zoneCache?.key === key && Date.now() - zoneCache.at < ZONE_TTL_MS) {
    return zoneCache.zoneId;
  }

  const raw = await call<Record<string, unknown>>(
    `/api/customer/config/get-zone-id?lat=${lat}&lng=${lng}`,
  );

  // O modelo Dart é um wrapper local, não o JSON cru. O backend Laravel
  // costuma responder { data: { zone_id } } ou { zone_id } direto —
  // aceita as duas formas em vez de apostar numa.
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const zoneId = String(data.zone_id ?? data.id ?? '');

  if (!zoneId) {
    throw new LegacyApiError(
      `get-zone-id não devolveu zone_id: ${JSON.stringify(raw).slice(0, 200)}`,
      502,
      raw,
    );
  }

  zoneCache = { key, zoneId, at: Date.now() };
  return zoneId;
}

// ── Endereços ───────────────────────────────────────────────────

interface AutocompleteRaw {
  data?: Array<{
    place_id?: string;
    description?: string;
    structured_formatting?: { main_text?: string; secondary_text?: string };
  }>;
}

/**
 * GET /api/customer/config/place-api-autocomplete
 *
 * Passa pelo PHP, não pelo Google direto. Melhor assim: a chave do
 * provedor não precisa existir no totem.
 */
export async function searchPlaces(
  query: string,
  zoneId?: string,
): Promise<Place[]> {
  const raw = await call<AutocompleteRaw>(
    `/api/customer/config/place-api-autocomplete?search_text=${encodeURIComponent(query)}`,
    { zoneId },
  );

  // O autocomplete não devolve coordenada — só place_id. As coordenadas
  // vêm depois, em place-api-details, quando o passageiro escolher.
  return (raw.data ?? []).map((p) => ({
    label: p.description ?? p.structured_formatting?.main_text ?? '',
    lat: 0,
    lng: 0,
    placeId: p.place_id,
  }));
}

/** GET /api/customer/config/place-api-details — resolve a coordenada. */
export async function getPlaceDetails(
  placeId: string,
  zoneId?: string,
): Promise<Place> {
  const raw = await call<Record<string, any>>(
    `/api/customer/config/place-api-details?placeid=${encodeURIComponent(placeId)}`,
    { zoneId },
  );

  const d = raw.data ?? raw;
  const loc = d.geometry?.location ?? d.location ?? d;
  const lat = num(loc.lat ?? loc.latitude);
  const lng = num(loc.lng ?? loc.longitude);

  if (!lat || !lng) {
    throw new LegacyApiError(
      `place-api-details sem coordenada: ${JSON.stringify(raw).slice(0, 200)}`,
      502,
      raw,
    );
  }

  return {
    label: d.formatted_address ?? d.name ?? '',
    lat,
    lng,
    placeId,
  };
}

// ── Categorias de veículo ───────────────────────────────────────

/**
 * GET /api/customer/vehicle/category
 *
 * A estimativa devolve só `vehicle_category_id`. O nome e a imagem que
 * a tela 4 mostra vêm daqui. Cacheado porque muda muito pouco.
 */
interface CategoryMeta {
  id: string;
  name: string;
  type?: string;
  imageUrl?: string;
}

let categoryCache: { map: Map<string, CategoryMeta>; at: number } | null = null;
const CATEGORY_TTL_MS = 30 * 60_000;

export async function getVehicleCategories(): Promise<Map<string, CategoryMeta>> {
  if (categoryCache && Date.now() - categoryCache.at < CATEGORY_TTL_MS) {
    return categoryCache.map;
  }

  const raw = await call<Record<string, any>>(
    '/api/customer/vehicle/category?limit=100&offset=1',
  );

  const list: any[] = raw.data ?? raw.categories ?? [];
  const map = new Map<string, CategoryMeta>();

  for (const c of list) {
    const id = String(c.id ?? c.vehicle_category_id ?? '');
    if (!id) continue;
    map.set(id, {
      id,
      name: c.name ?? c.type ?? 'Categoria',
      type: c.type,
      imageUrl: absoluteUrl(c.image_full_url?.path ?? c.image_full_url ?? c.image),
    });
  }

  categoryCache = { map, at: Date.now() };
  return map;
}

/** Laravel às vezes devolve caminho relativo, às vezes URL completa. */
function absoluteUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  if (value.startsWith('http')) return value;
  return `${serverConfig.apiBase}/storage/${value.replace(/^\/+/, '')}`;
}

// ── Estimativa ──────────────────────────────────────────────────

interface FareRaw {
  id?: string;
  zone_id?: string;
  vehicle_category_id?: string;
  vehicle_category_type?: string;
  estimated_distance?: string | number;
  estimated_duration?: string | number;
  estimated_fare?: number | string;
  discount_fare?: number | string;
  discount_amount?: number | string;
  coupon_applicable?: boolean;
  encoded_polyline?: string;
  area_id?: string;
  surge_multiplier?: number | string;
}

/**
 * POST /api/customer/ride/get-estimated-fare
 *
 * Mesma rota que o app mobile chama. É isso que garante que o preço do
 * totem seja idêntico ao do aplicativo — nenhum cálculo acontece aqui.
 */
export async function createQuote(input: {
  origin: Place;
  destination: Place;
}): Promise<Quote> {
  const zoneId = input.origin.zoneId ?? (await getZoneId(input.origin.lat, input.origin.lng));

  const [raw, categories] = await Promise.all([
    call<{ data?: FareRaw[] }>('/api/customer/ride/get-estimated-fare', {
      method: 'POST',
      zoneId,
      body: JSON.stringify({
        pickup_coordinates: coord(input.origin.lat, input.origin.lng),
        destination_coordinates: coord(input.destination.lat, input.destination.lng),
        customer_coordinates: coord(input.origin.lat, input.origin.lng),
        pickup_address: input.origin.label,
        destination_address: input.destination.label,
        type: 'ride_request',
        ride_request_type: 'regular',
        zone_id: zoneId,
      }),
    }),
    // Se as categorias falharem, o fluxo continua com nome genérico em
    // vez de derrubar a tela inteira por causa de um rótulo.
    getVehicleCategories().catch(() => new Map<string, CategoryMeta>()),
  ]);

  const fares = raw.data ?? [];
  if (fares.length === 0) {
    throw new LegacyApiError('Nenhuma categoria disponível para esta rota', 422, raw);
  }

  const options: VehicleCategory[] = fares.map((f) => {
    const catId = String(f.vehicle_category_id ?? '');
    const meta = categories.get(catId);
    const discountCents = toCents(f.discount_amount ?? 0);

    return {
      id: catId,
      name: meta?.name ?? f.vehicle_category_type ?? 'Categoria',
      categoryType: f.vehicle_category_type ?? meta?.type,
      imageUrl: meta?.imageUrl,

      // O que o passageiro paga é a tarifa com desconto aplicado.
      priceCents: toCents(f.discount_fare ?? f.estimated_fare ?? 0),
      discountCents,
      discount: discountCents > 0,
      etaMinutes: Math.round(num(f.estimated_duration)),

      zoneId: String(f.zone_id ?? zoneId),
      areaId: f.area_id,
      encodedPolyline: f.encoded_polyline,
      estimatedDistanceKm: num(f.estimated_distance),
      estimatedDurationMin: num(f.estimated_duration),
      surgeMultiplier: f.surge_multiplier != null ? num(f.surge_multiplier) : undefined,
      couponApplicable: f.coupon_applicable,
      rawEstimatedFare: num(f.estimated_fare),
      rawDiscountFare: num(f.discount_fare ?? f.estimated_fare),
    };
  });

  const first = options[0];

  return {
    quoteId: `q_${crypto.randomUUID()}`,
    origin: { ...input.origin, zoneId },
    destination: input.destination,
    distanceKm: first.estimatedDistanceKm,
    durationMinutes: first.estimatedDurationMin,
    categories: options,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

// ── Criação da corrida ──────────────────────────────────────────

/**
 * POST /api/customer/ride/create
 *
 * ATENÇÃO AO FLUXO. No app mobile a corrida é criada e o pagamento vem
 * depois — o `generatePix` recebe `trip_id`, o que prova isso. No totem
 * é o inverso: ninguém despacha motorista para um anônimo que não pagou.
 *
 * Enquanto o backend não tiver um estado que segure o despacho, esta
 * função é chamada ANTES do pagamento só para obter o `trip_id` que o
 * PIX exige, e a corrida entra com `payment_method` já definido.
 *
 * >>> RISCO CONHECIDO: se o backend despachar imediatamente, existe uma
 * janela em que o motorista é acionado sem pagamento confirmado. A
 * correção definitiva é um estado `awaiting_payment` no PHP. <<<
 */
export async function createTrip(input: {
  category: VehicleCategory;
  origin: Place;
  destination: Place;
  paymentMethod: string;
  note?: string;
  senderName?: string;
  senderPhone?: string;
}): Promise<{ tripId: string }> {
  const zoneId = input.category.zoneId;

  const raw = await call<Record<string, any>>('/api/customer/ride/create', {
    method: 'POST',
    zoneId,
    body: JSON.stringify({
      pickup_coordinates: coord(input.origin.lat, input.origin.lng),
      destination_coordinates: coord(input.destination.lat, input.destination.lng),
      customer_coordinates: coord(input.origin.lat, input.origin.lng),
      customer_request_coordinates: coord(input.origin.lat, input.origin.lng),

      vehicle_category_id: input.category.id,
      estimated_distance: String(input.category.estimatedDistanceKm),
      estimated_time: String(input.category.estimatedDurationMin),
      estimated_fare: input.category.rawEstimatedFare,
      actual_fare: input.category.rawDiscountFare,

      pickup_address: input.origin.label,
      destination_address: input.destination.label,
      encoded_polyline: input.category.encodedPolyline,

      payment_method: input.paymentMethod,
      type: 'ride_request',
      ride_request_type: 'regular',

      zone_id: zoneId,
      area_id: input.category.areaId,
      surge_multiplier: input.category.surgeMultiplier,

      note: input.note ?? 'Solicitado no totem Maylon',
      sender_name: input.senderName,
      sender_phone: input.senderPhone,

      intermediate_addresses: JSON.stringify([]),
    }),
  });

  const d = raw.data ?? raw;
  const tripId = String(d.id ?? d.trip_request_id ?? d.trip_id ?? '');

  if (!tripId) {
    throw new LegacyApiError(
      `ride/create não devolveu id: ${JSON.stringify(raw).slice(0, 300)}`,
      502,
      raw,
    );
  }

  return { tripId };
}

// ── Detalhe da corrida ──────────────────────────────────────────

/**
 * GET /api/customer/ride/details/{tripId}
 *
 * >>> ESTE MAPEAMENTO É O ÚNICO AINDA NÃO CONFIRMADO. <<<
 * Recebi `trip_model.dart` (a lista) no lugar de `trip_details_model.dart`,
 * então os nomes de campo de motorista e veículo abaixo são inferência a
 * partir da convenção do resto da API. As telas 7 e 8 dependem disto.
 *
 * A leitura é defensiva de propósito: aceita várias grafias e, se um
 * campo faltar, a tela mostra o que tem em vez de quebrar.
 */
export async function getTrip(tripId: string): Promise<Trip> {
  const raw = await call<Record<string, any>>(
    `/api/customer/ride/details/${encodeURIComponent(tripId)}`,
  );

  const d = raw.data ?? raw;
  return mapTrip(d);
}

function mapTrip(d: Record<string, any>): Trip {
  const rawStatus = String(d.current_status ?? d.trip_status ?? d.status ?? 'pending');

  const driverRaw = d.driver ?? d.driver_details ?? null;
  const vehicleRaw = d.vehicle ?? d.vehicle_details ?? driverRaw?.vehicle ?? null;

  const driver: Driver | undefined = driverRaw
    ? {
        name: [driverRaw.first_name, driverRaw.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || driverRaw.name || 'Motorista',
        photoUrl: absoluteUrl(
          driverRaw.profile_image_full_url?.path ??
            driverRaw.profile_image_full_url ??
            driverRaw.profile_image,
        ),
        rating: driverRaw.rating != null ? num(driverRaw.rating) : undefined,
        ratingCount:
          driverRaw.total_reviews != null
            ? num(driverRaw.total_reviews)
            : driverRaw.received_reviews_count != null
              ? num(driverRaw.received_reviews_count)
              : undefined,
        phone: driverRaw.phone,
      }
    : undefined;

  const vehicle: Vehicle | undefined = vehicleRaw
    ? {
        model:
          [vehicleRaw.brand?.name ?? vehicleRaw.brand, vehicleRaw.model]
            .filter(Boolean)
            .join(' ')
            .trim() || vehicleRaw.model_name || 'Veículo',
        color: vehicleRaw.colour ?? vehicleRaw.color ?? '',
        plate: vehicleRaw.licence_plate_number ?? vehicleRaw.license_plate ?? '',
        imageUrl: absoluteUrl(vehicleRaw.image_full_url ?? vehicleRaw.image),
      }
    : undefined;

  const id = String(d.id ?? d.trip_request_id ?? '');

  return {
    id,
    code: shortCode(id),
    status: mapTripStatus(rawStatus),
    rawStatus,
    paymentStatus: d.payment_status === 'paid' ? 'paid' : 'unpaid',
    amountCents: toCents(d.actual_fare ?? d.paid_fare ?? d.estimated_fare ?? 0),
    origin: {
      label: d.pickup_address ?? '',
      lat: num(d.pickup_coordinates?.[1] ?? d.pickup_coordinates?.latitude),
      lng: num(d.pickup_coordinates?.[0] ?? d.pickup_coordinates?.longitude),
    },
    destination: {
      label: d.destination_address ?? '',
      lat: num(d.destination_coordinates?.[1] ?? d.destination_coordinates?.latitude),
      lng: num(d.destination_coordinates?.[0] ?? d.destination_coordinates?.longitude),
    },
    etaMinutes: d.eta != null ? Math.round(num(d.eta)) : undefined,
    encodedPolyline: d.encoded_polyline,
    driver,
    vehicle,
  };
}

/**
 * O id da corrida é longo e o passageiro precisa ditar isso ao motorista.
 * Os 4 últimos caracteres bastam para conferência visual no totem.
 */
function shortCode(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return `MYL-${tail || '0000'}`;
}

/** Valores reais do backend, confirmados no model TripStatus. */
function mapTripStatus(legacy: string): TripStatus {
  const table: Record<string, TripStatus> = {
    pending: 'searching',
    accepted: 'assigned',
    out_for_pickup: 'arriving',
    picked_up: 'in_progress',
    ongoing: 'in_progress',
    completed: 'completed',
    cancelled: 'cancelled',
    returning: 'in_progress',
    returned: 'completed',
    failed: 'no_drivers',
  };
  return table[legacy] ?? 'searching';
}

// ── PIX ─────────────────────────────────────────────────────────

/**
 * POST /api/v1/pix/generate
 *
 * O app mobile chama esta rota SEM Authorization e mandando o `amount`
 * do cliente. Num totem, com a URL exposta, isso é um problema sério:
 * se o PHP confiar no valor recebido em vez de reler a corrida no banco,
 * dá para gerar PIX de um centavo para uma corrida de cem reais.
 *
 * Aqui a chamada sai do servidor do totem, não do navegador, e o valor
 * usado é o que o backend devolveu na estimativa — o navegador nunca
 * escolhe quanto pagar. Isso reduz o risco, mas não elimina: a correção
 * está no PHP, validando o amount contra o trip_id.
 */
export async function generatePix(input: {
  tripId: string;
  amountCents: number;
  document: string;
  name: string;
}): Promise<{ emv: string; txId: string; qrCodeBase64?: string }> {
  const digits = input.document.replace(/\D/g, '');

  const raw = await call<Record<string, any>>('/api/v1/pix/generate', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      trip_id: input.tripId,
      amount: (input.amountCents / 100).toFixed(2),
      document: digits.length >= 11 ? digits : '00000000000',
      name: input.name,
    }),
  });

  if (!raw.emv) {
    throw new LegacyApiError(
      `pix/generate sem emv: ${JSON.stringify(raw).slice(0, 200)}`,
      502,
      raw,
    );
  }

  return { emv: raw.emv, txId: raw.txid, qrCodeBase64: raw.qr_code_base64 };
}

/** GET /api/v1/pix/status — polling da confirmação. */
export async function getPixStatus(
  txId: string,
): Promise<'pending' | 'paid' | 'expired' | 'failed'> {
  const raw = await call<Record<string, any>>(
    `/api/v1/pix/status?txid=${encodeURIComponent(txId)}`,
    { skipAuth: true },
  );

  const s = String(raw.status ?? raw.data?.status ?? '').toLowerCase();
  if (['paid', 'concluida', 'concluída', 'approved'].includes(s)) return 'paid';
  if (['expired', 'expirada'].includes(s)) return 'expired';
  if (['failed', 'error'].includes(s)) return 'failed';
  return 'pending';
}

/**
 * POST /api/v1/pix/refund
 *
 * Resolve o pior cenário do totem: o passageiro pagou e nenhum
 * motorista aceitou. Sem estorno automático isso vira reclamação no
 * balcão do shopping.
 */
export async function refundPix(input: {
  txId: string;
  amountCents: number;
  reason?: string;
}): Promise<void> {
  await call('/api/v1/pix/refund', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      txid: input.txId,
      amount: (input.amountCents / 100).toFixed(2),
      reason: input.reason ?? 'Nenhum motorista disponível',
    }),
  });
}

// ── Pagamento de corrida (cartão no Get Smart, dinheiro) ────────

/**
 * POST /api/customer/ride/payment
 *
 * >>> A CONFIRMAR: preciso ver a assinatura desta rota. É por aqui que
 * o totem informa ao backend que a corrida foi paga no Get Smart, com o
 * NSU e o código de autorização da Getnet para conciliação. O corpo
 * abaixo é a forma mais provável, não a confirmada. <<<
 */
export async function markTripPaid(input: {
  tripId: string;
  method: string;
  amountCents: number;
  reference?: string;
}): Promise<void> {
  await call('/api/customer/ride/payment', {
    method: 'POST',
    body: JSON.stringify({
      trip_request_id: input.tripId,
      payment_method: input.method,
      amount: (input.amountCents / 100).toFixed(2),
      transaction_reference: input.reference,
    }),
  });
}
