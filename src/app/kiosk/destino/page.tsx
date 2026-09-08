'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/kiosk/Card';
import { Button } from '@/components/kiosk/Button';
import { Stepper } from '@/components/kiosk/Stepper';
import { useKioskSession } from '@/contexts/KioskSessionContext';
import { kioskConfig } from '@/lib/config';
import type { Place } from '@/lib/types';

/**
 * Tela 3 — origem já vem preenchida, o passageiro só digita o destino.
 *
 * A origem usa a localização fixa do totem, não GPS. Dentro de shopping
 * ou hospital o GPS erra centenas de metros e manda o motorista para a
 * porta errada. O endereço cadastrado é sempre mais confiável.
 */
export default function DestinoPage() {
  const router = useRouter();
  const { session, hydrated, patch } = useKioskSession();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const origin = session.origin ?? kioskConfig.origin;

  useEffect(() => {
    if (hydrated && !session.guest) router.replace('/kiosk');
  }, [hydrated, session.guest, router]);

  // Autocomplete com debounce.
  // AJUSTE: troque por /api/kiosk/places ligado ao seu provedor de mapas.
  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/kiosk/places?q=${encodeURIComponent(query)}`,
        );
        if (res.ok) setSuggestions((await res.json()).places ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  async function handleNext() {
    if (!selected || !session.guest) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/kiosk/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination: selected,
          guestId: session.guest.guestId,
        }),
      });

      if (!res.ok) {
        setError('Não conseguimos calcular a rota. Tente outro destino.');
        return;
      }

      const { quote } = await res.json();
      patch({ destination: selected, quote });
      router.push('/kiosk/veiculo');
    } catch {
      setError('Sem conexão. Chame um atendente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-4 sm:px-8">
      <div className="w-full max-w-4xl py-2">
        <Stepper current={1} />

        <Card className="pad-card">
          <div className="flex items-center gap-4">
            <PinIcon />
            <div>
              <h1 className="t-title font-bold text-brand-800">Para onde vamos?</h1>
              <p className="t-hint mt-1 text-muted">
                A saída já está marcada. Digite só o destino.
              </p>
            </div>
          </div>

          <div className="mt-[3vmin] grid grid-cols-[auto_1fr] gap-x-4">
            <div className="flex flex-col items-center pt-[clamp(38px,6.5vmin,56px)]">
              <TargetIcon />
              <span className="my-2 w-px flex-1 border-l-2 border-dashed border-brand-300" />
              <NavIcon />
            </div>

            <div className="space-y-[2.5vmin]">
              <div>
                <span className="t-label mb-2 block font-medium">De</span>
                <div className="field-h t-body flex items-center rounded-2xl border-2 border-line bg-brand-50 px-5 text-brand-800">
                  {origin.label}
                </div>
              </div>

              <div>
                <label
                  htmlFor="destino"
                  className="t-label mb-2 block font-medium"
                >
                  Para
                </label>
                <input
                  id="destino"
                  autoComplete="off"
                  placeholder="Digite o endereço, hotel ou shopping"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                  }}
                  className="field-h t-body w-full rounded-2xl border-2 border-line bg-white px-5 outline-none transition placeholder:text-muted/60 focus:border-brand-600"
                />

                {suggestions.length > 0 && !selected && (
                  <ul className="mt-3 max-h-[32vh] overflow-y-auto rounded-2xl border-2 border-line bg-white">
                    {suggestions.map((place) => (
                      <li key={`${place.label}-${place.lat}`}>
                        <button
                          onClick={() => {
                            setSelected(place);
                            setQuery(place.label);
                            setSuggestions([]);
                          }}
                          className="touch-target t-body w-full border-b border-line px-5 text-left last:border-0 hover:bg-brand-50"
                        >
                          {place.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="t-hint mt-4 text-danger">
              {error}
            </p>
          )}

          <Button
            className="mt-[3.5vmin]"
            onClick={handleNext}
            disabled={!selected || loading}
          >
            {loading ? 'Calculando…' : 'Ver preços'}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[clamp(32px,5vmin,56px)] w-[clamp(32px,5vmin,56px)] shrink-0 text-brand-700" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[clamp(24px,3.6vmin,40px)] w-[clamp(24px,3.6vmin,40px)] text-brand-700" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}
function NavIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[clamp(24px,3.6vmin,40px)] w-[clamp(24px,3.6vmin,40px)] text-brand-700" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12 20 5l-7 16-2-7-7-2Z" strokeLinejoin="round" />
    </svg>
  );
}
