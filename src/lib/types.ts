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
  /** GUEST-20260830-000123 */
  guestId: string;
  name: string;
  phone?: string;
  document?: string;
}

export interface Place {
  label: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface VehicleCategory {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  /** Já calculado pelo backend para esta origem/destino. */
  priceCents: number;
  etaMinutes?: number;
  discount?: boolean;
}

export interface Quote {
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
  /** Só para PIX: payload EMV copia-e-cola. */
  pixPayload?: string;
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

export type TripStatus =
  | 'searching'
  | 'assigned'
  | 'arriving'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_drivers';

export interface Trip {
  /** Código curto mostrado ao passageiro: MYL-4821 */
  code: string;
  status: TripStatus;
  amountCents: number;
  origin: Place;
  destination: Place;
  driver?: Driver;
  vehicle?: Vehicle;
  etaMinutes?: number;
  trackingUrl?: string;
}
