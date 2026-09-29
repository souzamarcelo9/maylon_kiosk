import { serverConfig } from './config';
import type {
  Driver,
  GuestPassenger,
  Place,
  Quote,
  Trip,
  TripStatus,
  Vehicle,
  VehicleCategory,
} from './types';

/**
 * Cliente do módulo KioskManagement.
 *
 * Todas as chamadas vão para /api/kiosk/*, autenticadas por
 * `X-Kiosk-Token`. O totem não usa mais Bearer de cliente: estimativa,
 * autocomplete e categorias passaram a ser proxy dentro do módulo, e a
 * origem da corrida vem do cadastro do totem, não do tablet.
 *
 * Isso importa mais do que parece. Antes, um token extraído do
 * equipamento dava acesso a listar corridas de terceiros, alterar perfil
 * e mexer em carteira. Agora abre só este módulo, e revogar é desativar
 * uma linha em `kiosks`.
 *
 * Respostas do módulo vêm como { data: ... }, sem envelope de
 * response_code — confirmado contra o /api/kiosk/config real.
 */

export class LegacyApiError extends Error {
  /** `response_code` do backend, quando houver. Ex.: zone_404. */
  code?: string;

  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'LegacyApiError';
  }
}

interface CallOptions extends RequestInit {
  timeoutMs?: number;
  idempotencyKey?: string;
}

async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const { timeoutMs = 12_000, idempotencyKey, ...init } = options;

  if (!serverConfig.apiBase) {
    throw new LegacyApiError('MAYLON_API_BASE não configurado', 500);
  }
  if (!serverConfig.kioskToken) {
    throw new LegacyApiError('MAYLON_KIOSK_TOKEN não configurado', 500);
  }

  // Totem em rede de shopping: sem timeout a tela trava para sempre.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    Accept: 'application/json',
    'X-Kiosk-Token': serverConfig.kioskToken,
    'X-Kiosk-Version': serverConfig.appVersion,
    ...(init.headers as Record<string, string>),
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

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
      const err = new LegacyApiError(
        `${path} devolveu ${res.status}: ${text.slice(0, 400)}`,
        res.status,
        body,
      );
      // O backend identifica o motivo em `response_code` (zone_404,
      // trip_request_404...). Sem propagar isso, toda falha vira a
      // mesma mensagem genérica na tela e o passageiro não sabe se
      // tenta de novo ou muda o destino.
      err.code = (body as any)?.response_code;
      throw err;
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

/** O backend espera coordenada como STRING "[lat,lng]", não array. */
function coord(lat: number, lng: number): string {
  return `[${lat},${lng}]`;
}

/** Laravel às vezes devolve caminho relativo, às vezes URL completa. */
function absoluteUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  if (value.startsWith('http')) return value;
  return `${serverConfig.apiBase}/storage/${value.replace(/^\/+/, '')}`;
}

// ── Configuração do totem ───────────────────────────────────────

export interface KioskConfig {
  code: string;
  label: string;
  zoneId?: string;
  terminalCode?: string;
  origin: Place;
}

let configCache: { value: KioskConfig; at: number } | null = null;
const CONFIG_TTL_MS = 10 * 60_000;

/**
 * GET /api/kiosk/config
 *
 * Origem, zona e rótulo vêm do banco. Mudar o totem de porta é um UPDATE,
 * não uma reconfiguração do equipamento em campo.
 */
export async function getKioskConfig(): Promise<KioskConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_TTL_MS) {
    return configCache.value;
  }

  const raw = await call<{ data: Record<string, any> }>('/api/kiosk/config');
  const d = raw.data;

  const value: KioskConfig = {
    code: d.code,
    label: d.label,
    zoneId: d.zone_id ?? undefined,
    terminalCode: d.terminal_code ?? undefined,
    origin: {
      label: d.origin?.address ?? '',
      lat: num(d.origin?.lat),
      lng: num(d.origin?.lng),
      zoneId: d.zone_id ?? undefined,
    },
  };

  configCache = { value, at: Date.now() };
  return value;
}

// ── Passageiro convidado ────────────────────────────────────────

/** POST /api/kiosk/guests — não cria usuário na tabela `users`. */
export async function createGuest(input: {
  name: string;
  phone?: string;
  document?: string;
}): Promise<GuestPassenger> {
  const raw = await call<{ data: Record<string, any> }>('/api/kiosk/guests', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return {
    guestId: raw.data.id,
    guestCode: raw.data.guest_code,
    name: raw.data.name,
    phone: raw.data.phone ?? undefined,
    document: input.document,
  };
}

// ── Endereços ───────────────────────────────────────────────────

/**
 * Encontra a lista dentro da resposta.
 *
 * As rotas de catálogo são proxy do controller do app, então vêm
 * envelopadas em `{response_code, message, data}` — ao contrário do
 * `/api/kiosk/config`, que o módulo devolve direto. Esta função acha a
 * lista independentemente do envelope.
 */
function firstArray(raw: any, keys: string[]): any[] {
  if (Array.isArray(raw)) return raw;

  for (const key of keys) {
    const direct = raw?.[key];
    if (Array.isArray(direct)) return direct;

    const nested = raw?.data?.[key];
    if (Array.isArray(nested)) return nested;
  }

  if (Array.isArray(raw?.data)) return raw.data;

  return [];
}

/**
 * GET /api/kiosk/places?q=
 *
 * O backend usa a Places API (New) do Google, cujo formato é bem
 * diferente do legado:
 *
 *   data.suggestions[].placePrediction.placeId
 *                                     .text.text
 *                                     .structuredFormat.mainText.text
 *                                                      .secondaryText.text
 *
 * Nenhuma coordenada vem aqui — só o placeId. A coordenada é uma segunda
 * chamada, em place details, quando o passageiro escolhe.
 */
export async function searchPlaces(query: string): Promise<Place[]> {
  const raw = await call<any>(`/api/kiosk/places?q=${encodeURIComponent(query)}`);

  const suggestions = firstArray(raw, [
    'suggestions',
    'predictions',
    'results',
    'places',
  ]);

  if (suggestions.length === 0 && raw?.data && !Array.isArray(raw.data)) {
    console.warn('[places] sem sugestões:', JSON.stringify(raw).slice(0, 300));
  }

  return suggestions
    .map((s: any): Place => {
      // Places API (New)
      const pred = s.placePrediction ?? s;
      const main = pred.structuredFormat?.mainText?.text;
      const secondary = pred.structuredFormat?.secondaryText?.text;

      const label =
        // Preferência pelo texto estruturado: "Rua X" + "Bairro, Cidade"
        // lê melhor num totem do que a linha única do Google, que às
        // vezes repete o país.
        (main && secondary ? `${main} — ${secondary}` : main) ??
        pred.text?.text ??
        // Formato legado, caso o backend volte atrás
        pred.description ??
        pred.formatted_address ??
        '';

      return {
        label,
        lat: 0,
        lng: 0,
        placeId: pred.placeId ?? pred.place_id ?? pred.id,
      };
    })
    .filter((p) => p.label && p.placeId);
}

/**
 * GET /api/kiosk/places/{placeId}
 *
 * Também Places API (New): `location.latitude` e `location.longitude`,
 * não `geometry.location.lat`. Os nomes legados ficam como reserva.
 */
export async function getPlaceDetails(placeId: string): Promise<Place> {
  const raw = await call<Record<string, any>>(
    `/api/kiosk/places/${encodeURIComponent(placeId)}`,
  );

  const d = raw.data?.result ?? raw.result ?? raw.data ?? raw;
  const loc = d.location ?? d.geometry?.location ?? d;

  const lat = num(loc.latitude ?? loc.lat);
  const lng = num(loc.longitude ?? loc.lng);

  if (!lat || !lng) {
    throw new LegacyApiError(
      `place details sem coordenada: ${JSON.stringify(raw).slice(0, 300)}`,
      502,
      raw,
    );
  }

  return {
    label:
      d.formattedAddress ??
      d.formatted_address ??
      d.displayName?.text ??
      d.name ??
      '',
    lat,
    lng,
    placeId,
  };
}

// ── Categorias ──────────────────────────────────────────────────

interface CategoryMeta {
  id: string;
  name: string;
  type?: string;
  imageUrl?: string;
}

let categoryCache: { map: Map<string, CategoryMeta>; at: number } | null = null;
const CATEGORY_TTL_MS = 30 * 60_000;

/**
 * GET /api/kiosk/vehicle-categories
 *
 * A estimativa devolve só `vehicle_category_id`. Nome e imagem da tela 4
 * vêm daqui. Cacheado porque muda muito pouco.
 */
async function getVehicleCategories(): Promise<Map<string, CategoryMeta>> {
  if (categoryCache && Date.now() - categoryCache.at < CATEGORY_TTL_MS) {
    return categoryCache.map;
  }

  const raw = await call<any>('/api/kiosk/vehicle-categories');
  const list = firstArray(raw, ['categories', 'vehicle_categories', 'items']);
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

// ── Estimativa ──────────────────────────────────────────────────

interface FareRaw {
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
  extra_estimated_fare?: number | string;
  extra_discount_fare?: number | string;
  extra_discount_amount?: number | string;
  extra_return_fee?: number | string;
  extra_cancellation_fee?: number | string;
  extra_fare_amount?: number | string;
  extra_fare_fee?: number | string;
}

/** undefined em vez de 0, para não sobrescrever tarifa ausente. */
function optNum(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * POST /api/kiosk/estimate
 *
 * A ORIGEM NÃO É ENVIADA. O módulo usa a do cadastro do totem. Além de
 * evitar erro de GPS dentro de prédio, fecha a porta para manipular
 * tarifa mandando uma origem distante.
 */
export async function createQuote(input: {
  destination: Place;
}): Promise<Quote> {
  const config = await getKioskConfig();

  const [raw, categories] = await Promise.all([
    call<any>('/api/kiosk/estimate', {
      method: 'POST',
      body: JSON.stringify({
        destination_coordinates: coord(input.destination.lat, input.destination.lng),
        destination_address: input.destination.label,
      }),
    }),
    // Se as categorias falharem, o fluxo segue com nome genérico em vez
    // de derrubar a tela por causa de um rótulo.
    getVehicleCategories().catch(() => new Map<string, CategoryMeta>()),
  ]);

  const fares: FareRaw[] = firstArray(raw, ['fares', 'estimates', 'items']);
  if (fares.length === 0) {
    throw new LegacyApiError('Nenhuma categoria disponível para esta rota', 422, raw);
  }

  const options: VehicleCategory[] = fares.map((f) => {
    const catId = String(f.vehicle_category_id ?? '');
    const meta = categories.get(catId);
    const discountCents = toCents(f.discount_amount ?? 0);

    /*
     * QUAL VALOR O PASSAGEIRO REALMENTE PAGA.
     *
     * Quando a zona tem taxa extra ou surge, o backend ignora
     * `estimated_fare` e usa `extra_estimated_fare` ao criar a corrida:
     *
     *   elseif (!empty($extraFare) || !empty($surgePrice)) {
     *       $estimatedFare = $request['extra_estimated_fare'];
     *
     * Mostrar `estimated_fare` na tela nesse caso é anunciar um preço e
     * cobrar outro. Aqui a regra do backend é replicada, para a tarifa
     * exibida, o expected_amount e o que é gravado no banco serem o
     * mesmo número.
     */
    const extraFare = optNum(f.extra_estimated_fare);
    const hasExtraFare = extraFare != null && extraFare > 0;

    const effectiveFare = hasExtraFare
      ? extraFare
      : num(f.discount_fare ?? f.estimated_fare ?? 0);

    return {
      id: catId,
      name: meta?.name ?? f.vehicle_category_type ?? 'Categoria',
      categoryType: f.vehicle_category_type ?? meta?.type,
      imageUrl: meta?.imageUrl,
      priceCents: toCents(effectiveFare),
      discountCents,
      discount: discountCents > 0,
      etaMinutes: Math.round(num(f.estimated_duration)),
      zoneId: String(f.zone_id ?? config.zoneId ?? ''),
      areaId: f.area_id,
      encodedPolyline: f.encoded_polyline,
      estimatedDistanceKm: num(f.estimated_distance),
      estimatedDurationMin: num(f.estimated_duration),
      surgeMultiplier: f.surge_multiplier != null ? num(f.surge_multiplier) : undefined,
      couponApplicable: f.coupon_applicable,
      rawEstimatedFare: num(f.estimated_fare),
      rawDiscountFare: num(f.discount_fare ?? f.estimated_fare),

      extraEstimatedFare: optNum(f.extra_estimated_fare),
      extraDiscountFare: optNum(f.extra_discount_fare),
      extraDiscountAmount: optNum(f.extra_discount_amount),
      extraReturnFee: optNum(f.extra_return_fee),
      extraCancellationFee: optNum(f.extra_cancellation_fee),
      extraFareAmount: optNum(f.extra_fare_amount),
      extraFareFee: optNum(f.extra_fare_fee),
    };
  });

  const first = options[0];

  return {
    quoteId: `q_${crypto.randomUUID()}`,
    origin: config.origin,
    destination: input.destination,
    distanceKm: first.estimatedDistanceKm,
    durationMinutes: first.estimatedDurationMin,
    categories: options,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

// ── Corrida ─────────────────────────────────────────────────────

/**
 * POST /api/kiosk/trips
 *
 * A corrida nasce com `is_dispatch_blocked = true`. Nenhum motorista a
 * enxerga até o pagamento ser capturado. Foi isso que resolveu a inversão
 * de ordem: o PIX exige trip_id, mas agora a corrida existir não
 * significa que alguém foi acionado.
 */
export async function createTrip(input: {
  guestId: string;
  category: VehicleCategory;
  destination: Place;
}): Promise<{ tripId: string; refId?: string }> {
  const config = await getKioskConfig();

  const raw = await call<{ data: Record<string, any> }>('/api/kiosk/trips', {
    method: 'POST',
    // A origem não é enviada: o módulo usa a do cadastro do totem.
    body: JSON.stringify({
      guest_id: input.guestId,
      vehicle_category_id: input.category.id,
      destination_coordinates: coord(input.destination.lat, input.destination.lng),
      destination_address: input.destination.label,
      estimated_fare: input.category.rawEstimatedFare,
      estimated_distance: String(input.category.estimatedDistanceKm),
      estimated_time: String(input.category.estimatedDurationMin),
      encoded_polyline: input.category.encodedPolyline,
      area_id: input.category.areaId,
      surge_multiplier: input.category.surgeMultiplier,

      // Havendo tarifa extra, é ela que o backend usa como valor.
      extra_estimated_fare: input.category.extraEstimatedFare,
      extra_fare_amount: input.category.extraFareAmount,
      extra_fare_fee: input.category.extraFareFee,
    }),
  });

  return { tripId: String(raw.data.id), refId: raw.data.ref_id };
}

/** GET /api/kiosk/trips/{id} — um totem não lê corrida de outro. */
export async function getTrip(tripId: string): Promise<Trip> {
  const raw = await call<{ data: Record<string, any> }>(
    `/api/kiosk/trips/${encodeURIComponent(tripId)}`,
  );
  return mapTrip(raw.data);
}

/**
 * Previsão de chegada.
 *
 * O detalhe da corrida não traz: `estimated_time` é a duração da viagem,
 * não o tempo até o motorista chegar. Falha aqui não é fatal — a tela
 * simplesmente não mostra o "chega em".
 */
export async function getArrivalMinutes(tripId: string): Promise<number | undefined> {
  try {
    const raw = await call<Record<string, any>>(
      `/api/kiosk/trips/${encodeURIComponent(tripId)}/arrival`,
    );
    const d = raw.data ?? raw;
    const minutes = num(d.arrival_time ?? d.duration ?? d.eta ?? d.time, -1);
    return minutes >= 0 ? Math.round(minutes) : undefined;
  } catch {
    return undefined;
  }
}

/** GeoJSON do backend: coordinates = [lng, lat]. Nessa ordem. */
function geoPoint(value: unknown): { lat: number; lng: number } {
  const c = (value as { coordinates?: unknown[] })?.coordinates;
  if (Array.isArray(c) && c.length >= 2) {
    return { lng: num(c[0]), lat: num(c[1]) };
  }
  return { lat: 0, lng: 0 };
}

function mapTrip(d: Record<string, any>): Trip {
  const rawStatus = String(d.current_status ?? 'pending');

  const driverRaw = d.driver ?? null;
  const vehicleRaw = d.vehicle ?? driverRaw?.vehicle ?? null;

  const driver: Driver | undefined = driverRaw
    ? {
        name:
          [driverRaw.first_name, driverRaw.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || 'Motorista',
        photoUrl: absoluteUrl(driverRaw.profile_image),
        // Nota é da corrida, não do motorista. E vem como string.
        rating: d.driver_avg_rating != null ? num(d.driver_avg_rating) : undefined,
        phone: driverRaw.phone,
      }
    : undefined;

  const vehicle: Vehicle | undefined = vehicleRaw
    ? {
        model: vehicleRaw.model?.name ?? 'Veículo',
        plate: vehicleRaw.licence_plate_number ?? '',
        imageUrl: absoluteUrl(vehicleRaw.model?.image),
        seatCapacity: vehicleRaw.model?.seat_capacity,
      }
    : undefined;

  const pickup = geoPoint(d.pickup_coordinates);
  const dropoff = geoPoint(d.destination_coordinates);

  return {
    id: String(d.id ?? ''),
    code: d.ref_id ? String(d.ref_id) : String(d.id ?? '').slice(-6).toUpperCase(),
    status: mapTripStatus(rawStatus),
    rawStatus,
    paymentStatus: d.payment_status === 'paid' ? 'paid' : 'unpaid',
    // Preferência: o que foi pago, depois com desconto, depois real,
    // e só por último a estimativa.
    amountCents: toCents(
      d.paid_fare ?? d.discount_actual_fare ?? d.actual_fare ?? d.estimated_fare ?? 0,
    ),
    origin: { label: d.pickup_address ?? '', ...pickup },
    destination: { label: d.destination_address ?? '', ...dropoff },
    encodedPolyline: d.encoded_polyline,
    otp: d.otp ? String(d.otp) : undefined,
    categoryName: d.vehicle_category?.name,
    driver,
    vehicle,
  };
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

// ── Pagamento ───────────────────────────────────────────────────

export interface RemotePayment {
  id: string;
  status: string;
  method: string;
  amountCents: number;
  tripId?: string;
  pixEmv?: string;
  pixTxId?: string;
  nsu?: string;
  declineReason?: string;
}

function mapPayment(d: Record<string, any>): RemotePayment {
  return {
    id: String(d.id),
    status: String(d.status),
    method: String(d.method),
    amountCents: toCents(d.amount),
    tripId: d.trip_request_id ?? undefined,
    pixEmv: d.pix_emv ?? undefined,
    pixTxId: d.pix_txid ?? undefined,
    nsu: d.nsu ?? undefined,
    declineReason: d.decline_reason ?? undefined,
  };
}

/**
 * POST /api/kiosk/payments
 *
 * O VALOR NÃO É ENVIADO como cobrança. O módulo lê da corrida no banco.
 * O `expected_amount` vai só como conferência: se divergir, o backend
 * recusa com 422 em vez de aceitar em silêncio.
 *
 * É a correção estrutural da falha do /api/v1/pix/generate, onde o valor
 * vinha do cliente numa rota sem autenticação.
 */
export async function openPayment(input: {
  tripId: string;
  guestId: string;
  method: 'card' | 'pix' | 'cash';
  expectedAmountCents: number;
  idempotencyKey: string;
}): Promise<RemotePayment> {
  const raw = await call<{ data: Record<string, any> }>('/api/kiosk/payments', {
    method: 'POST',
    body: JSON.stringify({
      trip_request_id: input.tripId,
      kiosk_guest_id: input.guestId,
      method: input.method,
      idempotency_key: input.idempotencyKey,
      expected_amount: (input.expectedAmountCents / 100).toFixed(2),
    }),
  });

  return mapPayment(raw.data);
}

/** GET /api/kiosk/payments/{id} — para PIX, o módulo consulta o provedor. */
export async function readRemotePayment(id: string): Promise<RemotePayment> {
  const raw = await call<{ data: Record<string, any> }>(
    `/api/kiosk/payments/${encodeURIComponent(id)}`,
  );
  return mapPayment(raw.data);
}

/**
 * POST /api/kiosk/payments/{id}/capture
 *
 * Resultado do deeplink do Get Smart. É aqui que o NSU finalmente tem
 * onde ser gravado, e é esta chamada que libera `is_dispatch_blocked`.
 *
 * Idempotente no backend: rechamada devolve 200 com `duplicate: true`.
 * Por isso o terminal pode insistir até receber resposta.
 */
export async function capturePayment(
  id: string,
  input: {
    status: 'approved' | 'declined' | 'failed';
    nsu?: string;
    authorizationCode?: string;
    terminalCode?: string;
    acquirerPayload?: Record<string, unknown>;
    declineReason?: string;
  },
): Promise<RemotePayment> {
  const raw = await call<{ data: Record<string, any> }>(
    `/api/kiosk/payments/${encodeURIComponent(id)}/capture`,
    {
      method: 'POST',
      body: JSON.stringify({
        status: input.status,
        nsu: input.nsu,
        authorization_code: input.authorizationCode,
        terminal_code: input.terminalCode,
        acquirer_payload: input.acquirerPayload,
        decline_reason: input.declineReason,
      }),
    },
  );

  return mapPayment(raw.data);
}

/** POST /api/kiosk/payments/{id}/refund */
export async function refundPayment(
  id: string,
  reason: string,
): Promise<{ refunded: boolean; manual: boolean }> {
  const raw = await call<Record<string, any>>(
    `/api/kiosk/payments/${encodeURIComponent(id)}/refund`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );

  return { refunded: Boolean(raw.refunded), manual: Boolean(raw.manual) };
}
