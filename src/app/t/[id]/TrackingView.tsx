'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Acompanhamento em tempo real.
 *
 * O mapa usa Leaflet com tiles do OpenStreetMap, carregados por CDN.
 * É a opção sem chave de API: a página é pública e pode ser aberta por
 * qualquer passageiro, então uma chave do Google aqui ficaria exposta
 * e sujeita a abuso.
 */

interface Location {
  lat: number;
  lng: number;
  updated_at: string | null;
  age_seconds: number | null;
}

interface Trip {
  id: string;
  ref_id: string;
  status: string;
  otp?: string | null;
  driver?: { name: string; phone?: string; photo?: string; rating?: string | number } | null;
  vehicle?: { model?: string; plate?: string; category?: string } | null;
  location?: Location | null;
  pickup?: { address?: string; lat: number | null; lng: number | null };
  destination?: { address?: string; lat: number | null; lng: number | null };
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

/** Estados em que não faz mais sentido ficar consultando. */
const FINAIS = ['completed', 'cancelled', 'returned', 'failed'];

const ROTULOS: Record<string, string> = {
  pending: 'Procurando motorista',
  accepted: 'Motorista a caminho',
  out_for_pickup: 'Motorista a caminho',
  picked_up: 'Em viagem',
  ongoing: 'Em viagem',
  completed: 'Corrida finalizada',
  cancelled: 'Corrida cancelada',
  returning: 'Em retorno',
  returned: 'Finalizada',
  failed: 'Não foi possível concluir',
};

export function TrackingView({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const leafletPronto = useRef(false);

  // ── Dados, a cada 8 segundos ──
  //
  // Mais rápido que isso não adianta: o app do motorista envia a
  // posição em intervalos próprios, então consultar de 2 em 2 segundos
  // só gastaria bateria do celular do passageiro sem trazer novidade.
  const buscar = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/trips/${tripId}/tracking`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setErro('Corrida não encontrada.');
        return null;
      }
      const { trip: t } = await res.json();
      setTrip(t);
      setErro('');
      return t as Trip;
    } catch {
      // Falha de rede não apaga o que já está na tela: o passageiro
      // pode estar entrando no elevador do shopping.
      return null;
    } finally {
      setCarregando(false);
    }
  }, [tripId]);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const primeiro = await buscar();
      if (!vivo) return;
      if (primeiro && FINAIS.includes(primeiro.status)) return;

      timer = setInterval(async () => {
        const t = await buscar();
        if (t && FINAIS.includes(t.status) && timer) clearInterval(timer);
      }, 8000);
    })();

    return () => {
      vivo = false;
      if (timer) clearInterval(timer);
    };
  }, [buscar]);

  // ── Mapa ──
  useEffect(() => {
    if (leafletPronto.current || !divRef.current) return;

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);

    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.async = true;
    js.onload = () => {
      const L = (window as any).L;
      if (!L || !divRef.current) return;

      const map = L.map(divRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([-23.95, -46.33], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      mapRef.current = map;
      leafletPronto.current = true;
    };
    document.head.appendChild(js);
  }, []);

  // Move o marcador quando a posição muda.
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    const loc = trip?.location;
    if (!L || !map || !loc) return;

    const pos: [number, number] = [loc.lat, loc.lng];

    if (!markerRef.current) {
      const icone = L.divIcon({
        className: '',
        html:
          '<div style="width:34px;height:34px;border-radius:50%;' +
          'background:#1e6450;border:3px solid #fff;' +
          'box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;' +
          'align-items:center;justify-content:center;font-size:17px">🚗</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      markerRef.current = L.marker(pos, { icon: icone }).addTo(map);

      if (trip?.destination?.lat) {
        L.circleMarker([trip.destination.lat, trip.destination.lng!], {
          radius: 7, color: '#b3261e', fillColor: '#b3261e', fillOpacity: 1,
        }).addTo(map).bindTooltip('Destino');
      }
    } else {
      markerRef.current.setLatLng(pos);
    }

    map.setView(pos, Math.max(map.getZoom(), 15), { animate: true });
  }, [trip?.location, trip?.destination]);

  if (carregando) {
    return <Casca><p style={{ color: '#5b7a72' }}>Carregando…</p></Casca>;
  }

  if (erro || !trip) {
    return (
      <Casca>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Corrida não encontrada</h1>
        <p style={{ color: '#5b7a72' }}>{erro || 'Confira o link recebido.'}</p>
      </Casca>
    );
  }

  const finalizada = FINAIS.includes(trip.status);
  const loc = trip.location;
  const defasada = loc?.age_seconds != null && loc.age_seconds > 90;

  return (
    <div style={{ minHeight: '100dvh', background: '#f1f6f5' }}>
      <header style={{ background: '#1e6450', color: '#fff', padding: '14px 16px' }}>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>Maylon</p>
        <h1 style={{ margin: '2px 0 0', fontSize: 19 }}>
          {ROTULOS[trip.status] ?? 'Acompanhe sua corrida'}
        </h1>
        <p style={{ margin: '3px 0 0', fontSize: 12, opacity: 0.85 }}>
          Corrida {trip.ref_id}
        </p>
      </header>

      {/* O mapa fica montado mesmo sem posição: assim ele não "pisca"
          ao aparecer, e o espaço não muda de tamanho na tela. */}
      <div
        ref={divRef}
        style={{
          height: '45vh', minHeight: 240, width: '100%',
          background: '#dde8e5',
        }}
      />

      {!loc && !finalizada && (
        <p style={{ margin: 0, padding: '8px 16px', fontSize: 13, color: '#5b7a72' }}>
          Aguardando a localização do motorista.
        </p>
      )}

      {defasada && (
        <p style={{
          margin: 0, padding: '8px 16px', fontSize: 13,
          color: '#b26a00', background: '#fdf6e8',
        }}>
          Última posição há {Math.round((loc!.age_seconds ?? 0) / 60)} min.
          O sinal do motorista pode estar fraco.
        </p>
      )}

      <main style={{ padding: 16, display: 'grid', gap: 12 }}>
        {trip.otp && !finalizada && (
          <Cartao>
            <p style={{ margin: 0, fontSize: 12, color: '#5b7a72' }}>
              Informe ao motorista
            </p>
            <p style={{
              margin: '2px 0 0', fontSize: 30, fontWeight: 700,
              letterSpacing: 6, color: '#11392d',
            }}>
              {trip.otp}
            </p>
          </Cartao>
        )}

        {trip.driver && (
          <Cartao>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
              {trip.driver.name}
            </p>
            {trip.vehicle && (
              <p style={{ margin: '3px 0 0', color: '#5b7a72', fontSize: 14 }}>
                {[trip.vehicle.model, trip.vehicle.category]
                  .filter(Boolean).join(' · ')}
              </p>
            )}
            {trip.vehicle?.plate && (
              <p style={{
                margin: '8px 0 0', display: 'inline-block',
                border: '2px solid #11392d', borderRadius: 6,
                padding: '4px 10px', fontFamily: 'monospace',
                fontSize: 17, fontWeight: 700, letterSpacing: 2,
              }}>
                {trip.vehicle.plate}
              </p>
            )}
            {trip.driver.phone && !finalizada && (
              <p style={{ margin: '10px 0 0' }}>
                <a
                  href={`tel:${trip.driver.phone}`}
                  style={{
                    display: 'inline-block', background: '#1e6450',
                    color: '#fff', textDecoration: 'none',
                    padding: '9px 16px', borderRadius: 8, fontSize: 15,
                  }}
                >
                  Ligar para o motorista
                </a>
              </p>
            )}
          </Cartao>
        )}

        <Cartao>
          <Linha rotulo="Destino" valor={trip.destination?.address ?? '—'} />
        </Cartao>
      </main>
    </div>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh', background: '#f1f6f5',
      padding: 24, fontFamily: 'system-ui, sans-serif',
    }}>
      {children}
    </div>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return (
    <section style={{
      background: '#fff', borderRadius: 12, padding: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,.08)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <p style={{ margin: 0, fontSize: 12, color: '#5b7a72' }}>{rotulo}</p>
      <p style={{ margin: '2px 0 0', fontSize: 15 }}>{valor}</p>
    </>
  );
}
