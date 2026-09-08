// Tipos compartilhados entre telas, rotas de API e o adaptador do PHP.

export type PaymentMethod = 'credit' | 'debit' | 'pix' | 'cash' | 'maylon_pass';

export type PaymentStatus =
  | 'pending'
  | 'claimed'
  | 'processing'
  | 'approved'
  | 'declined'
  | 'failed'
  | 'expired';

export interface GuestPassenger {
  /** GUEST-20260908-000123 — identificador local do totem. */
  guestId: string;
  name: string;
  phone?: string;
  document?: string;
  /**
   * Id do customer no backend Maylon. Enquanto não existir cadastro de
   * convidado no PHP, é o id da conta de totem configurada no .env.
   */
  customerId?: string;
}

export interface Place {
  label: string;
  lat: number;
  lng: number;
  /** place_id do provedor, quando vem do autocomplete. */
  placeId?: string;
  /** Zona Maylon. Obrigatória para criar a corrida. */
  zoneId?: string;
}

/**
 * Uma opção de veículo com o preço já calculado.
 *
 * Guarda TUDO que o /ride/create vai exigir depois. O backend não emite
 * uma cotação com identificador: quem escolhe a categoria precisa levar
 * adiante o zone_id, o area_id, o polyline e os valores que vieram na
 * estimativa. Se qualquer um se perder, a criação da corrida falha.
 */
export interface VehicleCategory {
  /** vehicle_category_id */
  id: string;
  /** Nome de exibição, vindo de /vehicle/category (a estimativa não traz). */
  name: string;
  categoryType?: string;
  imageUrl?: string;

  priceCents: number;
  discountCents: number;
  etaMinutes?: number;
  discount?: boolean;

  // ── Campos que o /ride/create exige de volta ──
  zoneId: string;
  areaId?: string;
  encodedPolyline?: string;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  surgeMultiplier?: number;
  couponApplicable?: boolean;
  /** estimated_fare cru, em reais, como o backend devolveu. */
  rawEstimatedFare: number;
  rawDiscountFare: number;
}

export interface Quote {
  /** Gerado pelo totem. Serve de chave de idempotência e de trava. */
  quoteId: string;
  origin: Place;
  destination: Place;
  distanceKm: number;
  durationMinutes: number;
  categories: VehicleCategory[];
  /** Cotação de totem vence rápido. */
  expiresAt: string;
}

export interface Payment {
  id: string;
  kioskId: string;
  tripDraftId: string;
  amountCents: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: string;
  expiresAt: string;
  /** PIX: payload EMV copia-e-cola, vindo de /api/v1/pix/generate. */
  pixPayload?: string;
  /** PIX: txid, usado para consultar status e para estorno. */
  pixTxId?: string;
  /** Corrida criada no backend antes do pagamento (fluxo do PHP exige). */
  tripId?: string;
  claimedBy?: string;
  acquirerNsu?: string;
  acquirerAuthCode?: string;
  declineReason?: string;
}

export interface Driver {
  name: string;
  photoUrl?: string;
  rating?: number;
  ratingCount?: number;
  phone?: string;
}

export interface Vehicle {
  model: string;
  color: string;
  plate: string;
  imageUrl?: string;
}

/**
 * Status normalizados para o totem.
 *
 * O backend usa: pending, accepted, out_for_pickup, picked_up, ongoing,
 * completed, cancelled, returning, returned, failed. O totem só precisa
 * saber se ainda procura motorista, se já tem um, ou se deu errado.
 */
export type TripStatus =
  | 'searching'
  | 'assigned'
  | 'arriving'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_drivers';

export interface Trip {
  /** Id da corrida no backend (trip_request_id). */
  id: string;
  /** Código curto mostrado ao passageiro. Derivado do id. */
  code: string;
  status: TripStatus;
  /** Status cru do backend, para log e depuração. */
  rawStatus?: string;
  paymentStatus?: 'paid' | 'unpaid';
  amountCents: number;
  origin: Place;
  destination: Place;
  driver?: Driver;
  vehicle?: Vehicle;
  etaMinutes?: number;
  encodedPolyline?: string;
}
